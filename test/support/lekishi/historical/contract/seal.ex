defmodule Lekishi.Historical.Contract.Seal do
  @moduledoc """
  Maintenance utility for the worked examples.

  Rewrites the hash fields under `priv/historical/v0/examples` with the hashes of
  the current content: each source document's `source_hash`, each revision's
  `revision_hash`, the record's publication mirror, and the publication set's
  member and source pins. Replacement is positional and textual, so it works
  whether a file still carries an author's placeholder (`sha256:000...001`) or a
  stale hash from an earlier seal, and it preserves the hand-written formatting
  and key order of the example files.

  Run after editing example content:

      MIX_ENV=test mix run --no-start -e 'Lekishi.Historical.Contract.Seal.seal_all!()'

  Resealing rewrites a source document or a record, not the publication set that
  pinned it earlier: the contract tests compare set pins with the current content,
  so an edited approved source or revision fails until the examples are resealed
  and the change is reviewed as a new source document or a new revision.
  """

  alias Lekishi.Historical.Contract.Canonical

  @examples_dir Path.expand("../../../../../priv/historical/v0/examples", __DIR__)
  @hash_literal ~r/"sha256:[0-9a-f]{64}"/

  @spec seal_all!(Path.t()) :: :ok
  def seal_all!(dir \\ @examples_dir) do
    source_hashes = seal_sources!(dir)
    record_hashes = seal_records!(dir)
    seal_sets!(dir, record_hashes, source_hashes)
  end

  defp seal_sources!(dir) do
    dir
    |> Path.join("sources/*.json")
    |> Path.wildcard()
    |> Enum.sort()
    |> Map.new(&seal_source!/1)
  end

  defp seal_source!(path) do
    document = path |> File.read!() |> Jason.decode!()
    hash = Canonical.source_hash(document)
    seal_hashes!(path, [hash])
    {document["source_id"], hash}
  end

  defp seal_records!(dir) do
    dir
    |> Path.join("records/*.json")
    |> Path.wildcard()
    |> Enum.sort()
    |> Enum.map(&seal_record!/1)
    |> Enum.reduce(%{}, &Map.merge/2)
  end

  defp seal_record!(path) do
    document = path |> File.read!() |> Jason.decode!()
    revisions = document["revisions"]
    revision_hashes = Enum.map(revisions, &Canonical.revision_hash/1)

    # Hash fields appear in file order: one revision_hash per revision, then the
    # publication mirror's published_revision_hash.
    mirror_hashes =
      case document["publication"] do
        %{"published_revision_id" => revision_id} ->
          [
            Enum.at(
              revision_hashes,
              Enum.find_index(revisions, &(&1["revision_id"] == revision_id))
            )
          ]

        _other ->
          []
      end

    seal_hashes!(path, revision_hashes ++ mirror_hashes)

    hashes = Map.new(Enum.zip(Enum.map(revisions, & &1["revision_id"]), revision_hashes))
    %{document["record_id"] => hashes}
  end

  defp seal_sets!(dir, record_hashes, source_hashes) do
    dir
    |> Path.join("publication-sets/*.json")
    |> Path.wildcard()
    |> Enum.sort()
    |> Enum.each(&seal_set!(&1, record_hashes, source_hashes))
  end

  defp seal_set!(path, record_hashes, source_hashes) do
    document = path |> File.read!() |> Jason.decode!()

    member_hashes =
      Enum.flat_map(document["members"] || [], fn member ->
        case get_in(record_hashes, [member["record_id"], member["revision_id"]]) do
          nil -> []
          hash -> [hash]
        end
      end)

    source_hashes =
      Enum.flat_map(document["sources"] || [], fn source ->
        case source_hashes[source["source_id"]] do
          nil -> []
          hash -> [hash]
        end
      end)

    seal_hashes!(path, member_hashes ++ source_hashes)
  end

  defp seal_hashes!(path, hashes) do
    text = File.read!(path)
    spans = Regex.scan(@hash_literal, text, return: :index)

    if length(spans) != length(hashes) do
      raise ArgumentError,
            "#{path} contains #{length(spans)} hash fields but #{length(hashes)} hashes were computed; " <>
              "add or remove the missing field instead of editing a hash by hand"
    end

    # A hash literal and its replacement are both 73 bytes, so replacing by byte
    # offset in order cannot shift the later spans.
    text =
      hashes
      |> Enum.with_index()
      |> Enum.reduce(text, fn {hash, index}, acc ->
        [{start, length}] = Enum.at(spans, index)
        replace_span(acc, start, length, ~s("#{hash}"))
      end)

    File.write!(path, text)
  end

  defp replace_span(text, start, length, replacement) do
    binary_part(text, 0, start) <>
      replacement <> binary_part(text, start + length, byte_size(text) - start - length)
  end

  @doc """
  The all-zeros placeholder an author can write before sealing a file.

  Sealing does not require it: any hash literal in the expected position is
  replaced. It only makes an unsealed value obvious while editing.
  """
  @spec placeholder(pos_integer()) :: binary()
  def placeholder(index) when is_integer(index) and index > 0 do
    "sha256:" <> String.pad_leading(Integer.to_string(index), 64, "0")
  end
end
