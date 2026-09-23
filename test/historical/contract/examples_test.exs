defmodule Lekishi.Historical.Contract.ExamplesTest do
  @moduledoc """
  Validates the worked examples under `priv/historical/v0/examples` as a whole
  content tree, and checks that every code and caveat the vectors expect is
  documented by the reference semantics.

  The examples are synthetic fixtures: they exercise the contract shape and
  assert nothing about the past.
  """

  use ExUnit.Case, async: true

  alias Lekishi.Historical.Contract.{Canonical, Documents, JSONSchema, Publication, Time, Vectors}

  @examples_dir Path.expand("../../../priv/historical/v0/examples", __DIR__)

  defp load_examples(pattern) do
    @examples_dir
    |> Path.join(pattern)
    |> Path.wildcard()
    |> Enum.sort()
    |> Enum.map(fn path -> path |> File.read!() |> Jason.decode!() end)
  end

  defp example_tree do
    documents = load_examples("records/*.json") ++ load_examples("sources/*.json")
    {documents, load_examples("publication-sets/*.json")}
  end

  test "the worked examples form a valid content tree" do
    {documents, sets} = example_tree()

    assert length(documents) == 11
    assert length(sets) == 1

    case Publication.check_all(documents, sets) do
      {:ok, %{current_published: current}} ->
        assert map_size(current) == 9

      {:error, errors} ->
        flunk("""
        worked examples do not satisfy the contract:

        #{Enum.map_join(errors, "\n", &"  #{&1.code} at #{&1.where}: #{&1.detail}")}
        """)
    end
  end

  test "example revisions are sealed, so an edit is detected" do
    for document <- load_examples("records/*.json") do
      for revision <- document["revisions"] do
        assert Canonical.revision_hash(revision) == revision["revision_hash"],
               "#{document["record_id"]} revision #{revision["revision_id"]} was edited after sealing; " <>
                 "rerun Seal.seal_all!/0 and review the change as a new revision"
      end
    end
  end

  test "example publication sets name the sealed revision hashes" do
    {documents, sets} = example_tree()
    records = Map.new(documents, &{&1["record_id"], &1})

    for set <- sets, member <- set["members"] do
      record = Map.fetch!(records, member["record_id"])
      revision = Enum.find(record["revisions"], &(&1["revision_id"] == member["revision_id"]))

      assert revision, "#{member["revision_id"]} is not a revision of #{member["record_id"]}"
      assert Canonical.revision_hash(revision) == member["revision_hash"]
    end
  end

  test "example publication sets name the sealed source hashes" do
    {documents, sets} = example_tree()
    sources = Map.new(documents, &{&1["source_id"], &1})

    assert Enum.flat_map(sets, & &1["sources"]) != []

    for set <- sets, pin <- set["sources"] do
      source = Map.fetch!(sources, pin["source_id"])
      assert Canonical.source_hash(source) == pin["source_hash"]
    end
  end

  test "an approved example source edit is detected even after resealing" do
    {documents, sets} = example_tree()
    assert {:ok, _result} = Publication.check_all(documents, sets)

    # Rewriting an approved source and resealing it leaves the document's own hash
    # consistent, so the set pin is what preserves the reviewed metadata.
    edited = Enum.map(documents, &edit_approved_source/1)

    assert {:error, errors} = Publication.check_all(edited, sets)
    codes = Enum.map(errors, & &1.code)
    assert "pinned_source_hash_mismatch" in codes
    refute "source_hash_mismatch" in codes
  end

  defp edit_approved_source(%{"document" => "source"} = source) do
    source
    |> Map.update("license", %{}, &Map.put(&1, "attribution_text", "Edited after approval"))
    |> then(&Map.put(&1, "source_hash", Canonical.source_hash(&1)))
  end

  defp edit_approved_source(document), do: document

  test "the example story window is inclusive and its steps reference records" do
    {documents, _sets} = example_tree()
    story = Enum.find(documents, &(&1["record_id"] == "lks:story:example-chapter"))
    content = story["revisions"] |> List.last() |> Map.fetch!("content")

    assert content["window"]["boundary"] == "inclusive"
    assert hd(content["steps"])["role"] == "start"
    assert length(content["steps"]) == 5
  end

  test "every code and caveat used by the vectors is documented" do
    documented = Documents.codes() ++ Time.codes() ++ Publication.codes()
    documented_caveats = Time.caveats()

    for name <- Vectors.names(), vector <- Vectors.load(name) do
      expect = vector["expect"]

      codes =
        List.wrap(expect["error"]) ++ List.wrap(expect["codes"]) ++ List.wrap(expect["code"])

      for code <- codes do
        assert code in documented,
               "vector #{vector["id"]} expects undocumented code #{inspect(code)}"
      end

      for caveat <- List.wrap(expect["caveats"]) do
        assert caveat in documented_caveats,
               "vector #{vector["id"]} expects undocumented caveat #{inspect(caveat)}"
      end
    end
  end

  test "every vector file is loaded by a test and every vector has a distinct id" do
    expected = ["documents", "geometry", "names", "ordering", "publication", "time"]
    assert Vectors.names() == expected

    for name <- Vectors.names() do
      ids = name |> Vectors.load() |> Enum.map(& &1["id"])
      assert length(ids) == length(Enum.uniq(ids)), "duplicate vector ids in #{name}.json"
      assert ids != []
    end
  end

  test "the schemas cover every document kind the contract ships" do
    for name <- [
          "common.schema.json",
          "kinds.schema.json",
          "record.schema.json",
          "source.schema.json",
          "publication-set.schema.json"
        ] do
      assert :ok = JSONSchema.check_schema!(Path.join(Documents.schema_dir(), name))
    end
  end
end
