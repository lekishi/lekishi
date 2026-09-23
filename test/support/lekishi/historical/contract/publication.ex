defmodule Lekishi.Historical.Contract.Publication do
  @moduledoc """
  Publication semantics for the v0 contract: what is published, in what order,
  and with which evidence and reuse rights.

  A publication set is the atomic visibility unit. Related record revisions
  become visible together, so an event never appears updated while the
  relationships it participates in are stale. A record's `publication` block is a
  mirror of the newest published set that contains it; it is verified against the
  sets rather than trusted, which is how a hand-edited file is caught.

  Correction history is derived, never stored twice: published revisions are the
  set members in publication order, each with its change explanation and the
  review that approved it. A draft correction therefore leaves the previous
  published revision current until a set publishes the new one.

  Source metadata is part of what review approves. Each set also pins the
  `source_hash` of every source cited by a published member revision, and the
  coverage is complete: a cited source that is not pinned fails validation. A
  source document is immutable once pinned, so correcting a title or a license
  attribution means publishing a new source document and republishing the citing
  records, which preserves the previously approved metadata instead of
  overwriting it.
  """

  alias Lekishi.Historical.Contract.{Canonical, Documents, Time, Timestamps}

  @reference_fields %{
    "place_id" => "place",
    "actor_id" => "actor",
    "event_id" => "event",
    "record_id" => :any,
    "source_id" => "source",
    "from" => :any,
    "to" => :any
  }

  @doc "Codes this module can report, for documentation and vector expectations."
  @spec codes() :: [binary()]
  def codes do
    ~w(
      member_record_unknown member_revision_unknown member_hash_mismatch publication_without_mirror
      publication_without_set publication_mirror_mismatch ambiguous_publication_order
      unrecorded_source_license quotation_not_permitted published_before_revision_created
      review_before_revision_created self_review_mislabelled self_review_without_matching_author
      unresolved_reference reference_kind_mismatch ordering_cycle part_of_cycle
      pinned_source_unknown pinned_source_hash_mismatch source_not_pinned
    )
  end

  @doc """
  Validates a content tree: every document, every publication set, and every
  rule that spans documents.
  """
  @spec check_all([map()], [map()]) :: {:ok, map()} | {:error, [map()]}
  def check_all(documents, sets) do
    errors =
      Enum.flat_map(documents, &document_errors/1) ++
        Enum.flat_map(sets, &set_errors(&1, documents))

    records = Enum.filter(documents, &(&1["document"] == "record"))
    sources = Enum.filter(documents, &(&1["document"] == "source"))

    errors =
      errors
      |> concat(reference_errors(records, sources))
      |> concat(publication_errors(records, sets))
      |> concat(source_pin_errors(records, sources, sets))
      |> concat(license_errors(records, sources, sets))
      |> concat(ordering_errors(records, sets))
      |> concat(part_of_errors(records, sets))

    case errors do
      [] -> {:ok, %{current_published: current_published(records, sets), warnings: []}}
      errors -> {:error, errors}
    end
  end

  @doc "Maps each published record id to its newest published revision."
  @spec current_published([map()], [map()]) :: %{binary() => map()}
  def current_published(records, sets) do
    sets
    |> publication_events()
    |> Enum.reduce(%{}, fn event, acc ->
      case Map.fetch(acc, event.record_id) do
        {:ok, existing} -> Map.put(acc, event.record_id, newer(existing, event))
        :error -> Map.put(acc, event.record_id, event)
      end
    end)
    |> Map.new(fn {record_id, event} ->
      {record_id,
       %{
         "revision_id" => event.revision_id,
         "revision_hash" => event.revision_hash,
         "set_id" => event.set_id,
         "published_at" => event.published_at
       }}
    end)
    |> Map.filter(fn {record_id, _entry} ->
      Enum.any?(records, &(&1["record_id"] == record_id))
    end)
  end

  @doc """
  Published revisions per record in publication order, oldest first.

  Each entry carries the change explanation and the review that approved it, so a
  reader-facing correction history does not require reading Git history.
  """
  @spec history([map()], [map()]) :: %{binary() => [map()]}
  def history(records, sets) do
    records_by_id = Map.new(records, &{&1["record_id"], &1})

    sets
    |> publication_events()
    |> Enum.sort_by(&Timestamps.sort_key(&1.published_at))
    |> Enum.group_by(& &1.record_id)
    |> Enum.filter(fn {record_id, _events} -> Map.has_key?(records_by_id, record_id) end)
    |> Map.new(fn {record_id, events} ->
      record = Map.fetch!(records_by_id, record_id)

      entries =
        Enum.map(events, fn event ->
          revision =
            Enum.find(record["revisions"], &(&1["revision_id"] == event.revision_id)) || %{}

          %{
            "revision_id" => event.revision_id,
            "set_id" => event.set_id,
            "published_at" => event.published_at,
            "change_explanation" => revision["change_explanation"],
            "author" => revision["author"],
            "dispute_status" => get_in(revision, ["dispute", "status"]) || "undisputed",
            "independence" => event.independence,
            "reviewer" => event.reviewer
          }
        end)

      {record_id, entries}
    end)
  end

  defp publication_events(sets) do
    Enum.flat_map(sets, fn set ->
      Enum.map(set["members"] || [], fn member ->
        %{
          record_id: member["record_id"],
          revision_id: member["revision_id"],
          revision_hash: member["revision_hash"],
          set_id: set["set_id"],
          published_at: set["published_at"],
          independence: get_in(set, ["review", "independence"]),
          reviewer: get_in(set, ["review", "reviewer", "name"])
        }
      end)
    end)
  end

  defp newer(existing, candidate) do
    case Timestamps.compare(candidate.published_at, existing.published_at) do
      # A timestamp that is not a real UTC instant never becomes the newest set.
      :unknown -> existing
      :lt -> existing
      _newer_or_equal -> candidate
    end
  end

  defp document_errors(document) do
    case Documents.validate(document) do
      {:ok, _result} -> []
      {:error, errors} -> errors
    end
  end

  defp set_errors(set, documents) do
    records = Enum.filter(documents, &(&1["document"] == "record"))
    reviewer = get_in(set, ["review", "reviewer", "name"])
    independence = get_in(set, ["review", "independence"])
    reviewed_at = get_in(set, ["review", "reviewed_at"])

    member_errors =
      set
      |> Map.get("members", [])
      |> Enum.flat_map(fn member ->
        record = Enum.find(records, &(&1["record_id"] == member["record_id"]))

        revision =
          record && Enum.find(record["revisions"], &(&1["revision_id"] == member["revision_id"]))

        []
        |> flag(
          is_nil(record),
          "member_record_unknown",
          "/members",
          "#{member["record_id"]} is not in the content tree"
        )
        |> flag(
          not is_nil(record) and is_nil(revision),
          "member_revision_unknown",
          "/members",
          "#{member["revision_id"]} is not a revision of #{member["record_id"]}"
        )
        |> flag(
          not is_nil(revision) and Canonical.revision_hash(revision) != member["revision_hash"],
          "member_hash_mismatch",
          "/members",
          "the approved revision of #{member["record_id"]} changed after approval"
        )
      end)

    authors = member_authors(set, records)
    self_authored? = is_binary(reviewer) and reviewer in authors

    document_errors(set)
    |> concat(member_errors)
    |> concat(timestamp_errors(set, documents, reviewed_at))
    |> flag(
      self_authored? and independence != "self_review",
      "self_review_mislabelled",
      "/review/independence",
      "the reviewer authored a member revision and must be recorded as self_review"
    )
    |> flag(
      not self_authored? and independence == "self_review" and authors != [],
      "self_review_without_matching_author",
      "/review/independence",
      "self_review requires the reviewer to be an author of a member revision"
    )
  end

  defp member_authors(set, records) do
    set
    |> Map.get("members", [])
    |> Enum.flat_map(fn member ->
      case Enum.find(records, &(&1["record_id"] == member["record_id"])) do
        nil -> []
        record -> Enum.filter(record["revisions"], &(&1["revision_id"] == member["revision_id"]))
      end
    end)
    |> Enum.map(&get_in(&1, ["author", "name"]))
    |> Enum.filter(&is_binary/1)
    |> Enum.uniq()
  end

  defp timestamp_errors(set, documents, reviewed_at) do
    created_ats = member_created_ats(set, documents)

    # Comparisons use parsed UTC instants: an invalid timestamp is reported by the
    # document checks and must not be able to win an ordering comparison.
    []
    |> flag(
      Enum.any?(created_ats, &(Timestamps.compare(&1, set["published_at"]) == :gt)),
      "published_before_revision_created",
      "/published_at",
      "publication cannot precede the creation of the revision it publishes"
    )
    |> flag(
      Enum.any?(created_ats, &(Timestamps.compare(&1, reviewed_at) == :gt)),
      "review_before_revision_created",
      "/review/reviewed_at",
      "review cannot precede the creation of the revision it approves"
    )
  end

  defp member_created_ats(set, documents) do
    records = Enum.filter(documents, &(&1["document"] == "record"))

    set
    |> Map.get("members", [])
    |> Enum.flat_map(fn member ->
      case Enum.find(records, &(&1["record_id"] == member["record_id"])) do
        nil -> []
        record -> Enum.filter(record["revisions"], &(&1["revision_id"] == member["revision_id"]))
      end
    end)
    |> Enum.map(& &1["created_at"])
    |> Enum.filter(&is_binary/1)
  end

  defp reference_errors(records, sources) do
    known = known_references(records, sources)

    Enum.flat_map(records, fn record ->
      Enum.flat_map(record["revisions"], &revision_reference_errors(&1, known))
    end)
  end

  defp revision_reference_errors(revision, known) do
    revision
    |> collect_references("/revisions/#{revision["revision_id"]}")
    |> Enum.flat_map(&reference_error(&1, known))
  end

  defp reference_error({id, expected, path}, known) do
    case Map.fetch(known, id) do
      :error ->
        [%{code: "unresolved_reference", where: path, detail: "#{id} is not in the content tree"}]

      {:ok, kind} when expected != :any and kind != expected ->
        [
          %{
            code: "reference_kind_mismatch",
            where: path,
            detail: "#{id} is a #{kind}, not a #{expected}"
          }
        ]

      {:ok, _kind} ->
        []
    end
  end

  defp known_references(records, sources) do
    records
    |> Enum.map(&{&1["record_id"], &1["kind"]})
    |> Map.new()
    |> Map.merge(Map.new(sources, &{&1["source_id"], "source"}))
  end

  # Source metadata is part of what review approves. A set pins the source_hash of
  # every source cited by a published member revision, so editing a title or a
  # license attribution afterwards fails validation even if the source document is
  # resealed. Correcting approved metadata means publishing a new source document
  # (new source_id, optional supersedes_source_id) and a set that pins it, which
  # preserves the previously approved metadata instead of overwriting it.
  defp source_pin_errors(records, sources, sets) do
    sources_by_id = Map.new(sources, &{&1["source_id"], &1})

    Enum.flat_map(sets, fn set ->
      pinned = set["sources"] || []

      Enum.flat_map(pinned, &pin_errors(&1, sources_by_id)) ++
        coverage_errors(set, records, pinned)
    end)
  end

  defp pin_errors(%{"source_id" => source_id, "source_hash" => source_hash}, sources_by_id) do
    case sources_by_id[source_id] do
      nil ->
        [
          %{
            code: "pinned_source_unknown",
            where: "/sources",
            detail: "#{source_id} is not in the content tree"
          }
        ]

      source ->
        flag(
          [],
          source["source_hash"] != source_hash,
          "pinned_source_hash_mismatch",
          "/sources",
          "the approved metadata of #{source_id} changed after approval"
        )
    end
  end

  defp coverage_errors(set, records, pinned) do
    pinned_ids = Enum.map(pinned, & &1["source_id"])

    set
    |> cited_source_ids(records)
    |> Enum.reject(&(&1 in pinned_ids))
    |> Enum.map(fn source_id ->
      %{
        code: "source_not_pinned",
        where: "/sources",
        detail:
          "#{source_id} is cited by a published revision of #{set["set_id"]} but is not pinned"
      }
    end)
  end

  defp cited_source_ids(set, records) do
    records_by_id = Map.new(records, &{&1["record_id"], &1})

    set
    |> Map.get("members", [])
    |> Enum.flat_map(fn member ->
      record = records_by_id[member["record_id"]]

      revision =
        record && Enum.find(record["revisions"], &(&1["revision_id"] == member["revision_id"]))

      revision_source_ids(revision)
    end)
    |> Enum.uniq()
  end

  defp revision_source_ids(nil), do: []

  defp revision_source_ids(revision) do
    revision
    |> Map.get("claims", [])
    |> Enum.flat_map(fn claim -> Enum.map(claim["citations"] || [], & &1["source_id"]) end)
    |> Enum.uniq()
  end

  defp collect_references(value, path) when is_map(value) do
    direct =
      Enum.flat_map(@reference_fields, fn {key, expected} ->
        case value[key] do
          id when is_binary(id) -> [{id, expected, path <> "/" <> key}]
          _other -> []
        end
      end)

    direct ++
      Enum.flat_map(value, fn {nested_key, nested} ->
        collect_references(nested, path <> "/" <> nested_key)
      end)
  end

  defp collect_references(value, path) when is_list(value) do
    value
    |> Enum.with_index()
    |> Enum.flat_map(fn {nested, index} -> collect_references(nested, "#{path}/#{index}") end)
  end

  defp collect_references(_value, _path), do: []

  defp publication_errors(records, sets) do
    derived = current_published(records, sets)

    ambiguity_errors =
      sets
      |> pairs_sharing_record_and_time()
      |> Enum.map(fn {record_id, published_at} ->
        %{
          code: "ambiguous_publication_order",
          where: "/published_at",
          detail: "#{record_id} at #{published_at}"
        }
      end)

    ambiguity_errors ++ Enum.flat_map(records, &mirror_errors(&1, derived))
  end

  defp pairs_sharing_record_and_time(sets) do
    sets
    |> Enum.flat_map(fn set ->
      Enum.map(set["members"] || [], fn member ->
        {member["record_id"], set["published_at"], set["set_id"]}
      end)
    end)
    |> Enum.group_by(fn {record_id, _published_at, _set_id} -> record_id end)
    |> Enum.flat_map(fn {record_id, entries} ->
      entries
      |> Enum.group_by(fn {_record_id, published_at, _set_id} -> published_at end)
      |> Enum.filter(fn {_published_at, grouped} ->
        length(Enum.uniq_by(grouped, &elem(&1, 2))) > 1
      end)
      |> Enum.map(fn {published_at, _grouped} -> {record_id, published_at} end)
    end)
  end

  defp mirror_errors(record, derived) do
    case {record["publication"], Map.get(derived, record["record_id"])} do
      {nil, nil} ->
        []

      {nil, _current} ->
        [
          %{
            code: "publication_without_mirror",
            where: "/publication",
            detail: record["record_id"]
          }
        ]

      {_mirror, nil} ->
        [%{code: "publication_without_set", where: "/publication", detail: record["record_id"]}]

      {mirror, current} ->
        if mirror_matches?(mirror, current) do
          []
        else
          [
            %{
              code: "publication_mirror_mismatch",
              where: "/publication",
              detail: record["record_id"]
            }
          ]
        end
    end
  end

  defp mirror_matches?(mirror, current) do
    mirror["published_revision_id"] == current["revision_id"] and
      mirror["published_revision_hash"] == current["revision_hash"] and
      mirror["set_id"] == current["set_id"] and mirror["published_at"] == current["published_at"]
  end

  defp license_errors(records, sources, sets) do
    sources_by_id = Map.new(sources, &{&1["source_id"], &1})

    Enum.flat_map(published(records, sets), fn {record, revision} ->
      Enum.flat_map(
        revision["claims"] || [],
        &claim_license_errors(&1, revision, record, sources_by_id)
      )
    end)
  end

  defp claim_license_errors(claim, revision, record, sources_by_id) do
    path = "/revisions/#{revision["revision_id"]}/claims/#{claim["claim_id"]}"

    Enum.flat_map(claim["citations"] || [], fn citation ->
      citation_license_errors(
        citation,
        path,
        record["record_id"],
        sources_by_id[citation["source_id"]]
      )
    end)
  end

  defp citation_license_errors(citation, path, record_id, source) do
    []
    |> flag(
      not is_nil(source) and get_in(source, ["license", "status"]) != "recorded",
      "unrecorded_source_license",
      path,
      "every cited source needs recorded reuse terms before publication (#{record_id})"
    )
    |> flag(
      not is_nil(source) and not is_nil(citation["quoted_text"]) and
        get_in(source, ["license", "quotation_permitted"]) != true,
      "quotation_not_permitted",
      path,
      "quoted text requires recorded permission to quote (#{record_id})"
    )
  end

  defp ordering_errors(records, sets) do
    records_by_id = Map.new(records, &{&1["record_id"], &1})
    published = published(records, sets)

    consistency_errors =
      Enum.flat_map(published, &ordering_consistency_errors(&1, records_by_id, sets))

    consistency_errors ++ ordering_cycle_errors(published)
  end

  defp ordering_edges(published) do
    Enum.flat_map(published, fn {record, revision} ->
      (get_in(revision, ["content", "time", "ordering"]) || [])
      |> Enum.map(fn entry ->
        %{
          "from" => record["record_id"],
          "to" => entry["record_id"],
          "relation" => entry["relation"]
        }
      end)
    end)
  end

  defp ordering_consistency_errors({record, revision}, records_by_id, sets) do
    ordering = get_in(revision, ["content", "time", "ordering"]) || []

    Enum.flat_map(ordering, &ordering_entry_errors(&1, record, revision, records_by_id, sets))
  end

  defp ordering_entry_errors(entry, record, revision, records_by_id, sets) do
    target = records_by_id[entry["record_id"]]
    target_revision = target && published_revision(target, sets)

    if target_revision do
      ordering_relation_errors(entry, record, revision, target_revision)
    else
      []
    end
  end

  defp ordering_relation_errors(entry, record, revision, target_revision) do
    case Time.ordering_consistent?(
           get_in(revision, ["content", "time"]),
           get_in(target_revision, ["content", "time"]),
           entry["relation"]
         ) do
      :ok ->
        []

      {:error, code} ->
        [
          %{
            code: code,
            where: "/revisions/#{revision["revision_id"]}/content/time/ordering",
            detail: "#{record["record_id"]} #{entry["relation"]}"
          }
        ]
    end
  end

  defp ordering_cycle_errors(published) do
    case Time.cycle(ordering_edges(published)) do
      nil ->
        []

      cycle ->
        [
          %{
            code: "ordering_cycle",
            where: "/content/time/ordering",
            detail: Enum.join(cycle, " -> ")
          }
        ]
    end
  end

  defp part_of_errors(records, sets) do
    edges =
      published(records, sets)
      |> Enum.flat_map(fn {record, revision} ->
        (get_in(revision, ["content", "part_of"]) || [])
        |> Enum.map(fn entry ->
          %{"from" => record["record_id"], "to" => entry["event_id"], "relation" => "before"}
        end)
      end)

    case Time.cycle(edges) do
      nil ->
        []

      cycle ->
        [%{code: "part_of_cycle", where: "/content/part_of", detail: Enum.join(cycle, " -> ")}]
    end
  end

  defp published(records, sets) do
    Enum.flat_map(records, fn record ->
      case published_revision(record, sets) do
        nil -> []
        revision -> [{record, revision}]
      end
    end)
  end

  defp published_revision(record, sets) do
    case Map.fetch(current_published([record], sets), record["record_id"]) do
      {:ok, %{"revision_id" => revision_id}} ->
        Enum.find(record["revisions"], &(&1["revision_id"] == revision_id))

      :error ->
        nil
    end
  end

  defp flag(errors, true, code, path, detail),
    do: errors ++ [%{code: code, where: path, detail: detail}]

  defp flag(errors, false, _code, _path, _detail), do: errors
  defp concat(errors, more), do: errors ++ more
end
