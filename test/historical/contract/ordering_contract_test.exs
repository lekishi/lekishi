defmodule Lekishi.Historical.Contract.OrderingContractTest do
  @moduledoc """
  Runs the partial-ordering vectors and pins the rule that an unordered pair is
  reported as unordered rather than given an arbitrary tie-break.
  """

  use ExUnit.Case, async: true

  alias Lekishi.Historical.Contract.{Time, Vectors}

  for vector <- Vectors.load("ordering") do
    @vector vector

    test "vector #{vector["id"]}" do
      Vectors.run!(@vector)
    end
  end

  defp window(start_year, end_year) do
    %{
      "source_expression" => "example range",
      "calendar" => "julian",
      "precision" => "year",
      "mode" => "occurrence_window",
      "interval" => %{
        "bounds" => "two_sided",
        "boundary" => "inclusive",
        "start" => %{"year" => start_year, "era" => "ce"},
        "end" => %{"year" => end_year, "era" => "ce"}
      }
    }
  end

  test "overlapping intervals stay unordered instead of receiving a tie-break" do
    assert {:ok, :overlaps, _caveats} = Time.relation(window(730, 740), window(735, 745))
    assert {:ok, :before, _caveats} = Time.relation(window(730, 739), window(740, 750))
    assert {:ok, :after, _caveats} = Time.relation(window(740, 750), window(730, 739))
  end

  test "an ordering cycle across three events is detected" do
    edges = [
      %{"from" => "lks:event:a", "to" => "lks:event:b", "relation" => "before"},
      %{"from" => "lks:event:b", "to" => "lks:event:c", "relation" => "before"},
      %{"from" => "lks:event:c", "to" => "lks:event:a", "relation" => "before"}
    ]

    assert cycle = Time.cycle(edges)
    assert "lks:event:a" in cycle
  end
end
