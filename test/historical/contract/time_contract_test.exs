defmodule Lekishi.Historical.Contract.TimeContractTest do
  @moduledoc """
  Runs the time boundary vectors and pins two rules that no single vector can
  express: an uncertain occurrence has no midpoint coordinate, and the
  chronological key of an occurrence window spans the whole uncertainty range.
  """

  use ExUnit.Case, async: true

  alias Lekishi.Historical.Contract.{Time, Vectors}

  for vector <- Vectors.load("time") do
    @vector vector

    test "vector #{vector["id"]}" do
      Vectors.run!(@vector)
    end
  end

  @occurrence_window %{
    "source_expression" => "sometime between 730 and 760 CE",
    "calendar" => "julian",
    "precision" => "year",
    "mode" => "occurrence_window",
    "interval" => %{
      "bounds" => "two_sided",
      "boundary" => "inclusive",
      "start" => %{"year" => 730, "era" => "ce"},
      "end" => %{"year" => 760, "era" => "ce"}
    }
  }

  test "an uncertain occurrence keeps its whole range as its chronological key" do
    assert {:ok, {730, 760}} = Time.chronological_key(@occurrence_window)
  end

  test "an uncertain occurrence is never reported as continuous activity at any playhead" do
    for year <- [730, 745, 760] do
      assert {:ok, :possible} =
               Time.playback_state(@occurrence_window, %{"year" => year, "era" => "ce"})

      refute {:ok, :active} ==
               Time.playback_state(@occurrence_window, %{"year" => year, "era" => "ce"})
    end
  end

  test "a duration of the same length is distinguishable from the same span of uncertainty" do
    duration = put_in(@occurrence_window, ["mode"], "duration")

    assert {:ok, true} = Time.continuous_activity?(duration)
    assert {:ok, false} = Time.continuous_activity?(@occurrence_window)
    assert {:ok, :overlaps, _caveats} = Time.relation(duration, @occurrence_window)
  end

  defp day_instant(year, month, day) do
    %{
      "source_expression" => "#{day}/#{month}/#{year} CE",
      "calendar" => "julian",
      "precision" => "day",
      "mode" => "instant",
      "interval" => %{
        "bounds" => "two_sided",
        "boundary" => "inclusive",
        "start" => %{"year" => year, "era" => "ce", "month" => month, "day" => day},
        "end" => %{"year" => year, "era" => "ce", "month" => month, "day" => day}
      }
    }
  end

  test "day-precision records inside one year stay unordered at v0 granularity" do
    third_of_march = day_instant(740, 3, 3)
    fourth_of_march = day_instant(740, 3, 4)

    assert {:ok, :overlaps, ["year_granularity_comparison"]} =
             Time.relation(third_of_march, fourth_of_march)

    assert {:error, "declared_order_not_supported"} =
             Time.ordering_consistent?(third_of_march, fourth_of_march, "before")

    assert {:error, "declared_order_not_supported"} =
             Time.ordering_consistent?(fourth_of_march, third_of_march, "after")

    assert :ok = Time.ordering_consistent?(third_of_march, fourth_of_march, "concurrent")
    assert :ok = Time.ordering_consistent?(third_of_march, fourth_of_march, "undetermined")

    # A year boundary still establishes the order, so this is granularity and not
    # a refusal to compare day-precision records at all.
    assert {:ok, :before, ["year_granularity_comparison"]} =
             Time.relation(day_instant(740, 12, 31), day_instant(741, 1, 1))
  end

  test "astro/1 requires an explicit era instead of assuming CE" do
    assert Time.astro(%{"year" => 1, "era" => "bce"}) == 0
    assert Time.astro(%{"year" => 1, "era" => "ce"}) == 1
    assert_raise ArgumentError, fn -> Time.astro(%{"year" => 740}) end
    assert_raise ArgumentError, fn -> Time.astro(%{"year" => 740, "era" => "ad"}) end
  end

  test "playheads must be valid civil era years" do
    assert {:ok, :possible} =
             Time.playback_state(@occurrence_window, %{"year" => 745, "era" => "ce"})

    # A BCE playhead is a valid civil era year; it is simply outside this CE window.
    assert {:ok, :inactive} =
             Time.playback_state(@occurrence_window, %{"year" => 745, "era" => "bce"})

    assert {:error, ["playhead_must_be_era_year"]} =
             Time.playback_state(@occurrence_window, %{"year" => 740})

    assert {:error, ["playhead_must_be_era_year"]} =
             Time.playback_state(@occurrence_window, %{"year" => 740, "era" => "ad"})

    assert {:error, ["playhead_year_must_be_positive"]} =
             Time.playback_state(@occurrence_window, %{"year" => 0, "era" => "ce"})

    assert {:error, ["playhead_year_must_be_positive"]} =
             Time.playback_state(@occurrence_window, %{"year" => 0, "era" => "bce"})
  end
end
