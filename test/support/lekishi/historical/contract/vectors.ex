defmodule Lekishi.Historical.Contract.Vectors do
  @moduledoc """
  Loads and runs the machine-readable contract vectors under
  `priv/historical/v0/vectors`.

  A vector states one boundary case: an operation, an input, and the expected
  result. Document vectors carry record stubs that are expanded into complete
  documents here (revision hashes, publication mirrors, and an auto-generated
  publication set for stubs marked `published`), so a vector can test one rule
  without restating a whole content tree. A stub that sets `publication`
  explicitly keeps that value, which is how mirror mismatches are tested.

  Expectations are matched as a containment: every expected key must match, a
  list expectation must be contained in the actual list, and a string
  expectation matches a list containing it. Extra reported codes never fail a
  vector, so a vector keeps asserting the code it is about.
  """

  alias Lekishi.Historical.Contract.{Canonical, Names, Publication, Time}

  @vectors_dir Path.expand("../../../../../priv/historical/v0/vectors", __DIR__)
  @contract "lekishi-historical-contract/v0"

  @default_author %{"name" => "Vector Author"}
  @default_reviewer %{"name" => "Vector Author"}

  defmodule MismatchError do
    defexception [:message]
  end

  @doc "All vectors in a named vector file, for example `load(\"time\")`."
  @spec load(binary()) :: [map()]
  def load(name) do
    @vectors_dir
    |> Path.join("#{name}.json")
    |> File.read!()
    |> Jason.decode!()
    |> Map.fetch!("vectors")
  end

  @doc "Names of the vector files shipped with the contract."
  @spec names() :: [binary()]
  def names do
    @vectors_dir |> File.ls!() |> Enum.map(&Path.rootname/1) |> Enum.sort()
  end

  @doc "Runs a vector and raises when the result does not match its expectation."
  @spec run!(map()) :: :ok
  def run!(vector) do
    actual = run(vector)

    if matches?(vector["expect"], actual) do
      :ok
    else
      raise MismatchError,
        message: """
        contract vector #{vector["id"]} did not match its expectation

        why: #{vector["why"]}
        expect: #{inspect(vector["expect"], pretty: true)}
        actual: #{inspect(actual, pretty: true)}
        """
    end
  end

  @spec run(map()) :: map()
  def run(%{"op" => "normalize_interval", "input" => input}) do
    case Time.normalize(input["time"]) do
      {:ok, normalized} -> %{"interval" => interval_view(normalized)}
      {:error, codes} -> %{"error" => codes}
    end
  end

  def run(%{"op" => "temporal_match", "input" => input}) do
    case Time.temporal_match(input["time"], input["window"],
           calendar: input["calendar"] || "gregorian"
         ) do
      {:ok, result, caveats} -> %{"result" => Atom.to_string(result), "caveats" => caveats}
      {:error, codes} -> %{"error" => codes}
    end
  end

  def run(%{"op" => "playback_state", "input" => input}) do
    case Time.playback_state(input["time"], input["playhead"]) do
      {:ok, state} -> %{"result" => Atom.to_string(state)}
      {:error, codes} -> %{"error" => codes}
    end
  end

  def run(%{"op" => "continuous_activity", "input" => input}) do
    case Time.continuous_activity?(input["time"]) do
      {:ok, result} -> %{"result" => result}
      {:error, codes} -> %{"error" => codes}
    end
  end

  def run(%{"op" => "steppable", "input" => input}) do
    case Time.steppable?(input["time"]) do
      {:ok, result} -> %{"result" => result}
      {:error, codes} -> %{"error" => codes}
    end
  end

  def run(%{"op" => "chronological_key", "input" => input}) do
    case Time.chronological_key(input["time"]) do
      {:ok, key} -> %{"key" => key}
      {:error, codes} -> %{"error" => codes}
    end
  end

  def run(%{"op" => "relation", "input" => input}) do
    case Time.relation(input["a"], input["b"]) do
      {:ok, result, caveats} -> %{"result" => Atom.to_string(result), "caveats" => caveats}
      {:error, codes} -> %{"error" => codes}
    end
  end

  def run(%{"op" => "ordering_check", "input" => input}) do
    case Time.ordering_consistent?(input["a"], input["b"], input["declared"]) do
      :ok -> %{"consistent" => true}
      {:error, code} -> %{"consistent" => false, "error" => code}
    end
  end

  def run(%{"op" => "ordering_graph", "input" => input}) do
    cycle = Time.cycle(input["edges"])

    %{"has_cycle" => not is_nil(cycle), "cycle" => cycle}
  end

  def run(%{"op" => "map_label", "input" => input}) do
    %{"label" => Names.map_label(input["names"])}
  end

  def run(%{"op" => "validate", "input" => input}) do
    {documents, sets} = build_tree(input)

    case Publication.check_all(documents, sets) do
      {:ok, %{current_published: current}} ->
        %{"valid" => true, "codes" => [], "current_published" => current_view(current)}

      {:error, errors} ->
        %{
          "valid" => false,
          "codes" => errors |> Enum.map(& &1.code) |> Enum.uniq() |> Enum.sort()
        }
    end
  end

  def run(%{"op" => "publication_state", "input" => input}) do
    {documents, sets} = build_tree(input)
    records = Enum.filter(documents, &(&1["document"] == "record"))
    history = Publication.history(records, sets)

    %{
      "current_published" => current_view(Publication.current_published(records, sets)),
      "published_revisions" =>
        Map.new(history, fn {record_id, entries} ->
          {record_id, Enum.map(entries, & &1["revision_id"])}
        end),
      "history" => history
    }
  end

  def run(%{"op" => op}),
    do: raise(MismatchError, message: "unknown contract vector op #{inspect(op)}")

  @doc "Expands vector document stubs into documents plus publication sets."
  @spec build_tree(map()) :: {[map()], [map()]}
  def build_tree(input) do
    expanded = Enum.map(input["documents"] || [], &expand_document/1)
    documents = Enum.map(expanded, &elem(&1, 0))
    auto_publish = for {document, true} <- expanded, do: document["record_id"]

    sets =
      cond do
        Map.has_key?(input, "sets") -> Enum.map(input["sets"], &complete_set(&1, documents))
        auto_publish != [] -> [auto_set(documents, auto_publish)]
        true -> []
      end

    {Enum.map(documents, &resolve_mirror(&1, sets)), sets}
  end

  defp expand_document(%{"document" => _type} = document), do: {document, false}

  defp expand_document(%{"source_id" => _source_id} = stub) do
    document =
      stub
      |> Map.put_new("title", "Vector source")
      |> Map.put_new("license", complete_license())
      |> Map.merge(%{"contract" => @contract, "document" => "source"})

    # A source stub may pin its own hash explicitly to test tamper detection;
    # otherwise the hash of the stub as written is used.
    {Map.put_new_lazy(document, "source_hash", fn -> Canonical.source_hash(document) end), false}
  end

  defp expand_document(stub) do
    kind = stub["kind"]
    record_id = stub["record_id"] || "lks:#{kind}:vector-example"
    revision_stubs = stub["revisions"] || [stub]

    revisions =
      revision_stubs
      |> Enum.with_index()
      |> Enum.map(fn {revision_stub, index} -> build_revision(revision_stub, index) end)

    publication =
      if Map.has_key?(stub, "publication"), do: {:explicit, stub["publication"]}, else: :derive

    document = %{
      "contract" => @contract,
      "document" => "record",
      "kind" => kind,
      "record_id" => record_id,
      "created_at" => stub["created_at"] || "2026-01-01T00:00:00Z",
      "revisions" => revisions,
      "publication" => publication
    }

    {document, stub["published"] == true}
  end

  defp build_revision(stub, index) do
    revision =
      %{
        "revision_id" => stub["revision_id"] || "lks:rev:vector-#{index + 1}",
        "created_at" => stub["created_at"] || "2026-01-0#{index + 1}T00:00:00Z",
        "author" => stub["author"] || @default_author,
        "change_explanation" => stub["change_explanation"] || "vector revision #{index + 1}",
        "content" => stub["content"] || %{},
        "claims" => stub["claims"] || []
      }
      |> put_optional("dispute", stub["dispute"])
      |> put_optional("research_notes", stub["research_notes"])

    Map.put(revision, "revision_hash", stub["revision_hash"] || Canonical.revision_hash(revision))
  end

  defp complete_set(set, documents) do
    set
    |> Map.put_new("title", "Vector publication set")
    |> Map.put_new("change_explanation", "vector publication")
    |> Map.put_new("review", complete_review())
    |> Map.put_new("published_at", "2026-01-06T00:00:00Z")
    |> Map.put_new("published_by", @default_author)
    |> Map.merge(%{"contract" => @contract, "document" => "publication_set"})
    |> fill_member_hashes(documents)
    |> fill_source_pins(documents)
  end

  # Vectors that are about something else should not have to restate source pins,
  # so the pin list is derived from the sources cited by the set's members when it
  # is absent, and a pin that omits its hash is completed from the source document.
  # A vector that tests pinning supplies its own `sources` array, including an
  # empty one, or an explicit wrong hash.
  defp fill_source_pins(set, documents) do
    pins =
      if Map.has_key?(set, "sources") do
        set["sources"]
      else
        derived_source_pins(set, documents)
      end

    Map.put(set, "sources", fill_pin_hashes(pins, documents))
  end

  defp fill_pin_hashes(pins, documents) do
    sources_by_id = Map.new(documents, fn document -> {document["source_id"], document} end)

    Enum.map(pins, fn pin ->
      case pin["source_hash"] do
        hash when is_binary(hash) ->
          pin

        _missing ->
          Map.put(pin, "source_hash", get_in(sources_by_id, [pin["source_id"], "source_hash"]))
      end
    end)
  end

  defp derived_source_pins(set, documents) do
    sources_by_id = Map.new(documents, fn document -> {document["source_id"], document} end)
    records_by_id = Map.new(documents, fn document -> {document["record_id"], document} end)

    set
    |> Map.get("members", [])
    |> Enum.flat_map(fn member ->
      record = records_by_id[member["record_id"]]

      revision =
        record && Enum.find(record["revisions"], &(&1["revision_id"] == member["revision_id"]))

      cited_source_ids(revision)
    end)
    |> Enum.uniq()
    |> Enum.flat_map(fn source_id ->
      case sources_by_id[source_id] do
        nil -> []
        source -> [%{"source_id" => source_id, "source_hash" => source["source_hash"]}]
      end
    end)
  end

  defp cited_source_ids(nil), do: []

  defp cited_source_ids(revision) do
    revision
    |> Map.get("claims", [])
    |> Enum.flat_map(fn claim -> Enum.map(claim["citations"] || [], & &1["source_id"]) end)
    |> Enum.uniq()
  end

  defp fill_member_hashes(set, documents) do
    members =
      Enum.map(set["members"] || [], fn member ->
        case member["revision_hash"] do
          hash when is_binary(hash) ->
            member

          _missing ->
            record = Enum.find(documents, &(&1["record_id"] == member["record_id"]))

            revision =
              record &&
                Enum.find(record["revisions"], &(&1["revision_id"] == member["revision_id"]))

            Map.put(member, "revision_hash", revision && revision["revision_hash"])
        end
      end)

    Map.put(set, "members", members)
  end

  defp complete_review do
    %{
      "reviewed_at" => "2026-01-05T00:00:00Z",
      "reviewer" => @default_reviewer,
      "independence" => "self_review",
      "checklist" => %{
        "source_support" => true,
        "attribution" => true,
        "date_location_uncertainty" => true,
        "attestation_vs_interpretation" => true,
        "reuse_rights" => true
      }
    }
  end

  defp complete_license do
    %{
      "status" => "recorded",
      "license_id" => "public-domain",
      "attribution_text" => "Vector source",
      "redistribution" => "permitted",
      "quotation_permitted" => true
    }
  end

  defp auto_set(documents, record_ids) do
    members =
      Enum.map(record_ids, fn record_id ->
        document = Enum.find(documents, &(&1["record_id"] == record_id))
        revision = List.last(document["revisions"])

        %{
          "record_id" => record_id,
          "revision_id" => revision["revision_id"],
          "revision_hash" => revision["revision_hash"]
        }
      end)

    complete_set(%{"set_id" => "lks:set:vector-auto", "members" => members}, documents)
  end

  defp resolve_mirror(%{"publication" => {:explicit, publication}} = document, _sets) do
    Map.put(document, "publication", publication)
  end

  defp resolve_mirror(%{"document" => "record"} = document, sets) do
    current = Publication.current_published([document], sets)

    mirror =
      case Map.fetch(current, document["record_id"]) do
        {:ok, entry} ->
          %{
            "published_revision_id" => entry["revision_id"],
            "published_revision_hash" => entry["revision_hash"],
            "set_id" => entry["set_id"],
            "published_at" => entry["published_at"],
            "published_by" => @default_author
          }

        :error ->
          nil
      end

    Map.put(document, "publication", mirror)
  end

  defp resolve_mirror(document, _sets), do: document

  defp current_view(current) do
    Map.new(current, fn {record_id, entry} -> {record_id, entry["revision_id"]} end)
  end

  defp interval_view(normalized) do
    %{
      "mode" => Atom.to_string(normalized.mode),
      "bounds" => normalized.bounds && Atom.to_string(normalized.bounds),
      "start_astro" => normalized.start && normalized.start.astro,
      "end_astro" => normalized.end && normalized.end.astro,
      "start_month" => normalized.start && normalized.start.month,
      "start_day" => normalized.start && normalized.start.day,
      "continuous_activity" => normalized.continuous?
    }
  end

  defp put_optional(map, _key, nil), do: map
  defp put_optional(map, key, value), do: Map.put(map, key, value)

  @doc "Containment matcher used for vector expectations."
  @spec matches?(term(), term()) :: boolean()
  def matches?(expect, actual) when is_map(expect) and is_map(actual) do
    Enum.all?(expect, fn {key, value} ->
      Map.has_key?(actual, key) and matches?(value, actual[key])
    end)
  end

  def matches?(expect, actual) when is_list(expect) and is_list(actual) do
    Enum.all?(expect, fn expected -> Enum.any?(actual, &matches?(expected, &1)) end)
  end

  def matches?(expect, actual) when is_binary(expect) and is_list(actual) do
    Enum.any?(actual, &matches?(expect, &1))
  end

  def matches?(expect, actual), do: expect == actual
end
