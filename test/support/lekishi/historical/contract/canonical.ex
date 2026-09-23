defmodule Lekishi.Historical.Contract.Canonical do
  @moduledoc """
  Canonical JSON encoding and revision hashing for the v0 historical contract.

  The hash is what makes "the exact revision approved" checkable in a file-based
  workflow: publication sets store `sha256:` hashes over the canonical encoding
  of a revision body without its own `revision_hash` field. A later edit to a
  published revision changes the hash and fails validation, so published history
  cannot be rewritten silently.

  Canonical encoding sorts object keys recursively and emits no insignificant
  whitespace, so the hash does not depend on key order or formatting. Keys are
  expected to be strings, as produced by decoding JSON.
  """

  @spec encode(term()) :: binary()
  def encode(value), do: value |> canonical() |> Jason.encode!()

  @spec canonical(term()) :: term()
  def canonical(value) when is_map(value) do
    value
    |> Enum.map(fn {key, nested} -> {to_string(key), canonical(nested)} end)
    |> Enum.sort_by(&elem(&1, 0))
    |> Jason.OrderedObject.new()
  end

  def canonical(value) when is_list(value), do: Enum.map(value, &canonical/1)
  def canonical(value), do: value

  @spec sha256(binary()) :: binary()
  def sha256(binary),
    do: binary |> then(&:crypto.hash(:sha256, &1)) |> Base.encode16(case: :lower)

  @spec revision_hash(map()) :: binary()
  def revision_hash(revision) when is_map(revision) do
    hash_without(revision, "revision_hash")
  end

  @doc """
  Hashes a source document without its own `source_hash`.

  Source metadata is what publication review approves: a publication set pins the
  `source_hash` of every source cited by a published revision, so editing a title
  or a license attribution after approval is detected even if the source document
  is resealed.
  """
  @spec source_hash(map()) :: binary()
  def source_hash(source) when is_map(source) do
    hash_without(source, "source_hash")
  end

  defp hash_without(document, key) do
    "sha256:" <> sha256(encode(Map.delete(document, key)))
  end

  @spec hash?(term()) :: boolean()
  def hash?(value) when is_binary(value), do: Regex.match?(~r/^sha256:[0-9a-f]{64}$/, value)
  def hash?(_value), do: false
end
