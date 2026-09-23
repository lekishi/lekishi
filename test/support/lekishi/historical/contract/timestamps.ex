defmodule Lekishi.Historical.Contract.Timestamps do
  @moduledoc """
  Editorial metadata timestamps are real-world UTC instants, not historical
  dates.

  The schema pattern only fixes their shape, so ordering comparisons must parse
  them first: a value such as `2026-99-99T99:99:99Z` matches the shape but is not
  a timestamp, and it must not be able to win a publication ordering comparison.
  `compare/2` therefore reports `:unknown` when either side is not a real UTC
  instant, and the document checks report `invalid_timestamp` separately.
  """

  @spec valid?(term()) :: boolean()
  def valid?(value) do
    match?({:ok, _datetime}, parse(value))
  end

  @doc """
  Compares two timestamps, or reports `:unknown` when either is not a UTC instant.

  Callers must not treat `:unknown` as ordering information; the invalid value is
  already reported by the document checks.
  """
  @spec compare(term(), term()) :: :lt | :gt | :eq | :unknown
  def compare(first, second) do
    case {parse(first), parse(second)} do
      {{:ok, first_datetime}, {:ok, second_datetime}} ->
        DateTime.compare(first_datetime, second_datetime)

      _other ->
        :unknown
    end
  end

  @doc """
  Sort key for editorial timestamps: real instants sort first, oldest to newest.

  A value that is not a UTC instant sorts after every real one, so an impossible
  timestamp cannot displace a real one in a history listing.
  """
  @spec sort_key(term()) :: {0 | 1, integer()}
  def sort_key(value) do
    case parse(value) do
      {:ok, datetime} -> {0, DateTime.to_unix(datetime, :microsecond)}
      :error -> {1, 0}
    end
  end

  defp parse(value) when is_binary(value) do
    case DateTime.from_iso8601(value) do
      # The offset must be zero: an editorial timestamp is recorded in UTC.
      {:ok, datetime, 0} -> {:ok, datetime}
      _other -> :error
    end
  end

  defp parse(_value), do: :error
end
