defmodule Lekishi.Historical.Contract.Names do
  @moduledoc """
  Derives the reader-facing label from a revision's names.

  The label leads with the primary period-appropriate form and pairs a
  local-script form with its romanization when one exists, following RFD 2's
  "Chang'an · 長安" pairing. Modern equivalents are never used as the label, and a
  romanization is never presented as evidence of historical pronunciation.
  """

  @doc "Returns the map label for a names list, or nil when no primary form is supported."
  @spec map_label(term()) :: binary() | nil
  def map_label(names) when is_list(names) do
    case Enum.find(names, &(&1["role"] == "primary")) do
      nil -> nil
      primary -> label_for(primary)
    end
  end

  def map_label(_names), do: nil

  defp label_for(%{"form" => form, "romanization" => %{"value" => romanization}})
       when is_binary(form) and is_binary(romanization) do
    form <> " · " <> romanization
  end

  defp label_for(%{"form" => form}) when is_binary(form), do: form
  defp label_for(_name), do: nil
end
