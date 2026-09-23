defmodule Lekishi.Historical.Contract.Time do
  @moduledoc """
  Reference semantics for the v0 time contract.

  Two rules drive everything here. The normalized interval is a *support*
  interval: every value the evidence permits lies inside it and every closed
  boundary is inclusive, so a claim that ends in 740 CE shares the boundary year
  740 with a window that starts there. And `mode` records what the interval
  means: an `occurrence_window` is one occurrence at an unknown point inside the
  interval, never continuous activity and never a midpoint date, while a
  `duration` is activity supported across the interval.

  Civil era years carry no year zero: 1 BCE precedes 1 CE. `astro/1` derives the
  astronomical ordinal used for comparison only; it is never stored, displayed,
  or used to normalize a year-only claim into a January 1 date. Comparisons are
  made at year granularity, so sub-year ordering is out of scope for v0 and is
  reported as a caveat rather than silently resolved.
  """

  @dated_modes ~w(instant occurrence_window duration)
  @era_boundary_codes ~w(bce ce)

  @type normalized :: %{
          mode: :instant | :occurrence_window | :duration | :undated,
          calendar: binary() | nil,
          precision: binary() | nil,
          bounds: :two_sided | :lower_only | :upper_only | nil,
          start: map() | nil,
          end: map() | nil,
          continuous?: boolean(),
          source_expression: binary() | nil
        }

  @doc """
  Derives the astronomical ordinal for comparison. 1 BCE is 0; there is no civil year zero.

  An era year must state its era. There is no default, because assuming CE for a
  missing or unrecognized era would silently shift a BCE date by two thousand
  years.
  """
  @spec astro(map()) :: integer()
  def astro(%{"year" => year, "era" => "bce"}) when is_integer(year), do: 1 - year
  def astro(%{"year" => year, "era" => "ce"}) when is_integer(year), do: year

  def astro(other) do
    raise ArgumentError,
          "astro/1 requires an era year with an integer year and an explicit bce or ce era, got: #{inspect(other)}"
  end

  @doc "Codes this module can report, for documentation and vector expectations."
  @spec codes() :: [binary()]
  def codes do
    ~w(
      civil_year_zero year_must_be_positive year_must_be_integer era_must_be_bce_or_ce
      month_out_of_range day_out_of_range day_precision_requires_month_and_day
      month_precision_requires_month month_precision_forbids_day year_precision_has_month_or_day
      unknown_mode_requires_unspecified_precision unknown_mode_has_interval missing_interval
      time_must_be_object_or_null dated_mode_requires_precision boundary_not_inclusive unknown_bounds
      bounds_mismatch interval_without_endpoint decade_span_mismatch century_span_mismatch
      interval_start_after_end instant_start_end_mismatch instant_requires_two_sided
      endpoint_must_be_era_year window_must_have_start_and_end playhead_must_be_era_year
      playhead_year_must_be_positive order_with_undated_record declared_order_not_supported
      unknown_ordering_relation
    )
  end

  @doc "Caveat names this module can report alongside a comparison result."
  @spec caveats() :: [binary()]
  def caveats do
    ~w(cross_calendar_approximation year_granularity_comparison undated_record)
  end

  @doc """
  Normalizes a `time` object (or nil) into a support interval.

  Returns `{:error, codes}` with every rule violation found, so an editor sees
  all problems in one pass rather than one at a time.
  """
  @spec normalize(term()) :: {:ok, normalized()} | {:error, [binary()]}
  def normalize(nil) do
    {:ok, undated(nil)}
  end

  def normalize(%{"mode" => "unknown"} = time) do
    errors =
      []
      |> add(time["precision"] != "unspecified", "unknown_mode_requires_unspecified_precision")
      |> add(not is_nil(time["interval"]), "unknown_mode_has_interval")

    if errors == [], do: {:ok, undated(time["source_expression"])}, else: {:error, errors}
  end

  def normalize(%{"mode" => mode} = time) when mode in @dated_modes do
    normalize_dated(time, time["interval"])
  end

  def normalize(_other), do: {:error, ["time_must_be_object_or_null"]}

  defp normalize_dated(time, interval) do
    interval_map? = is_map(interval)
    interval = if interval_map?, do: interval, else: %{}
    bounds = interval["bounds"]
    start_endpoint = interval["start"]
    end_endpoint = interval["end"]
    precision = time["precision"]

    errors =
      []
      |> add(time["precision"] == "unspecified", "dated_mode_requires_precision")
      |> add(not interval_map?, "missing_interval")

    errors =
      if interval_map? do
        errors
        |> add(interval["boundary"] != "inclusive", "boundary_not_inclusive")
        |> add(bounds not in ["two_sided", "lower_only", "upper_only"], "unknown_bounds")
        |> add(bounds_mismatch(bounds, start_endpoint, end_endpoint), "bounds_mismatch")
        |> add(is_nil(start_endpoint) and is_nil(end_endpoint), "interval_without_endpoint")
        |> concat(endpoint_errors(start_endpoint, precision))
        |> concat(endpoint_errors(end_endpoint, precision))
        |> concat(alignment_errors(interval, precision))
        |> concat(order_errors(interval, bounds))
        |> concat(instant_errors(time["mode"], bounds, start_endpoint, end_endpoint))
      else
        errors
      end

    if errors == [] do
      {:ok, build(time, interval)}
    else
      {:error, errors}
    end
  end

  @doc "Normalizes an inclusive year window into the comparison form used by matching."
  @spec window(term()) :: {:ok, %{start: integer(), end: integer()}} | {:error, [binary()]}
  def window(%{"start" => start_endpoint, "end" => end_endpoint}) do
    errors =
      []
      |> concat(endpoint_errors(start_endpoint, "year"))
      |> concat(endpoint_errors(end_endpoint, "year"))

    errors =
      if errors == [] and astro(start_endpoint) > astro(end_endpoint) do
        errors ++ ["interval_start_after_end"]
      else
        errors
      end

    if errors == [] do
      {:ok, %{start: astro(start_endpoint), end: astro(end_endpoint)}}
    else
      {:error, errors}
    end
  end

  def window(_other), do: {:error, ["window_must_have_start_and_end"]}

  @doc """
  Classifies a record against an inclusive window.

  `:definite` means the whole support interval lies inside the window, so the
  occurrence is certainly within it even when the exact year is unknown.
  `:possible` means the intervals intersect without containment, which is the
  default inclusion policy for bounded uncertain occurrences. `:undated` means
  the record has no usable date and must not match any window.
  """
  @spec temporal_match(term(), term(), keyword()) ::
          {:ok, :definite | :possible | :outside | :undated, [binary()]} | {:error, [binary()]}
  def temporal_match(time, window, opts \\ []) do
    with {:ok, normalized} <- normalize(time),
         {:ok, normalized_window} <- window(window) do
      {:ok, match(normalized, normalized_window), caveats(normalized, opts)}
    end
  end

  defp match(%{mode: :undated}, _window), do: :undated

  defp match(%{bounds: :two_sided, start: start_endpoint, end: end_endpoint}, window) do
    cond do
      window.start <= start_endpoint.astro and end_endpoint.astro <= window.end -> :definite
      start_endpoint.astro <= window.end and end_endpoint.astro >= window.start -> :possible
      true -> :outside
    end
  end

  defp match(%{bounds: :lower_only, start: start_endpoint}, window) do
    if start_endpoint.astro <= window.end, do: :possible, else: :outside
  end

  defp match(%{bounds: :upper_only, end: end_endpoint}, window) do
    if end_endpoint.astro >= window.start, do: :possible, else: :outside
  end

  @doc """
  Playback state at a playhead position.

  A duration is `:active` while the playhead is inside its support. An uncertain
  occurrence is only ever `:possible`: it must not be animated as continuous
  activity, and no midpoint playhead is derived for it. `:inactive` is the
  contextual state for a record that stays visible in the window but is not
  supported at the playhead.
  """
  @spec playback_state(term(), term()) ::
          {:ok, :active | :possible | :inactive | :undated} | {:error, [binary()]}
  def playback_state(time, playhead) do
    with {:ok, normalized} <- normalize(time),
         {:ok, position} <- playhead_position(playhead) do
      {:ok, playback(normalized, position)}
    end
  end

  defp playhead_position(%{"year" => year} = playhead) when is_integer(year) do
    cond do
      year < 1 -> {:error, ["playhead_year_must_be_positive"]}
      playhead["era"] not in @era_boundary_codes -> {:error, ["playhead_must_be_era_year"]}
      true -> {:ok, astro(%{"year" => year, "era" => playhead["era"]})}
    end
  end

  defp playhead_position(_other), do: {:error, ["playhead_must_be_era_year"]}

  defp playback(%{mode: :undated}, _position), do: :undated

  defp playback(%{mode: :instant, start: start_endpoint}, position),
    do: active_if(position == start_endpoint.astro)

  defp playback(%{mode: :duration} = time, position), do: active_if(within?(time, position))

  defp playback(%{mode: :occurrence_window} = time, position) do
    if within?(time, position), do: :possible, else: :inactive
  end

  defp active_if(true), do: :active
  defp active_if(false), do: :inactive

  defp within?(%{bounds: :two_sided, start: start_endpoint, end: end_endpoint}, position) do
    start_endpoint.astro <= position and position <= end_endpoint.astro
  end

  defp within?(%{bounds: :lower_only, start: start_endpoint}, position),
    do: position >= start_endpoint.astro

  defp within?(%{bounds: :upper_only, end: end_endpoint}, position),
    do: position <= end_endpoint.astro

  @doc "True when continuous activity is supported. Never true for an occurrence window."
  @spec continuous_activity?(term()) :: {:ok, boolean()} | {:error, [binary()]}
  def continuous_activity?(time) do
    with {:ok, normalized} <- normalize(time), do: {:ok, normalized.continuous?}
  end

  @doc "True when a record may appear in chronological stepping. Undated records are excluded."
  @spec steppable?(term()) :: {:ok, boolean()} | {:error, [binary()]}
  def steppable?(time) do
    with {:ok, normalized} <- normalize(time), do: {:ok, normalized.mode != :undated}
  end

  @doc """
  Partial ordering between two records.

  `:before` and `:after` require the evidence to establish the order, so they are
  never derived from overlapping or open-ended supports. `:overlaps` reports
  intersecting supports whose order is not established; `:undetermined` reports
  that the evidence does not order the two at all. `:same` reports identical
  supports. Consumers must not present `:overlaps` or `:undetermined` as
  established historical order.

  Ordering is compared at year granularity: two records whose supports share a
  year are never ordered, even when their day-precision dates differ. The
  comparison reports a `year_granularity_comparison` caveat instead of implying
  day-level ordering.
  """
  @spec relation(term(), term()) ::
          {:ok, :before | :after | :overlaps | :same | :undetermined, [binary()]}
          | {:error, [binary()]}
  def relation(a, b) do
    with {:ok, normalized_a} <- normalize(a),
         {:ok, normalized_b} <- normalize(b) do
      {:ok, relation_of(normalized_a, normalized_b), relation_caveats(normalized_a, normalized_b)}
    end
  end

  defp relation_of(%{mode: :undated}, _b), do: :undetermined
  defp relation_of(_a, %{mode: :undated}), do: :undetermined

  defp relation_of(a, b) do
    cond do
      same_support?(a, b) -> :same
      must_precede?(a, b) -> :before
      must_precede?(b, a) -> :after
      can_overlap?(a, b) -> :overlaps
      true -> :undetermined
    end
  end

  @doc """
  Checks a declared ordering relation against the intervals.

  A declared `before`/`after`/`concurrent` is only consistent when the supports
  actually establish it; an editor cannot declare an order the evidence does not
  support. `undetermined` is always consistent.
  """
  @spec ordering_consistent?(term(), term(), binary()) :: :ok | {:error, binary()}
  def ordering_consistent?(a, b, declared) do
    with {:ok, normalized_a} <- normalize(a),
         {:ok, normalized_b} <- normalize(b) do
      check_declared_order(normalized_a, normalized_b, declared)
    end
  end

  defp check_declared_order(_a, _b, "undetermined"), do: :ok

  defp check_declared_order(%{mode: :undated}, _b, _declared),
    do: {:error, "order_with_undated_record"}

  defp check_declared_order(_a, %{mode: :undated}, _declared),
    do: {:error, "order_with_undated_record"}

  defp check_declared_order(a, b, "before") do
    if must_precede?(a, b), do: :ok, else: {:error, "declared_order_not_supported"}
  end

  defp check_declared_order(a, b, "after") do
    if must_precede?(b, a), do: :ok, else: {:error, "declared_order_not_supported"}
  end

  defp check_declared_order(a, b, "concurrent") do
    if can_overlap?(a, b), do: :ok, else: {:error, "declared_order_not_supported"}
  end

  defp check_declared_order(_a, _b, _declared), do: {:error, "unknown_ordering_relation"}

  @doc "Sort key for chronological stepping. Undated records have no key."
  @spec chronological_key(term()) ::
          {:ok, {integer(), integer() | nil} | nil} | {:error, [binary()]}
  def chronological_key(time) do
    with {:ok, normalized} <- normalize(time) do
      case normalized do
        %{mode: :undated} ->
          {:ok, nil}

        %{start: start_endpoint, end: end_endpoint} ->
          {:ok, {start_endpoint.astro, end_endpoint && end_endpoint.astro}}
      end
    end
  end

  @doc "Returns one ordering cycle over `before`/`after` edges, or nil when the graph is acyclic."
  @spec cycle([map()]) :: [binary()] | nil
  def cycle(edges) when is_list(edges) do
    graph =
      edges
      |> Enum.flat_map(&directed_edge/1)
      |> Enum.reduce(%{}, fn {from, to}, acc -> Map.update(acc, from, [to], &[to | &1]) end)

    find_cycle(graph)
  end

  defp directed_edge(%{"from" => from, "to" => to, "relation" => "before"}), do: [{from, to}]
  defp directed_edge(%{"from" => from, "to" => to, "relation" => "after"}), do: [{to, from}]
  defp directed_edge(_edge), do: []

  defp find_cycle(graph) do
    graph
    |> Map.keys()
    |> Enum.sort()
    |> Enum.reduce_while(MapSet.new(), fn node, visited ->
      case visit(node, graph, visited, MapSet.new(), []) do
        {:ok, visited} -> {:cont, visited}
        {:cycle, path} -> {:halt, {:cycle, path}}
      end
    end)
    |> case do
      {:cycle, path} -> path
      %MapSet{} -> nil
    end
  end

  defp visit(node, graph, visited, stack, path) do
    cond do
      MapSet.member?(visited, node) ->
        {:ok, visited}

      MapSet.member?(stack, node) ->
        {:cycle, Enum.reverse([node | path])}

      true ->
        descend(node, graph, visited, MapSet.put(stack, node), [node | path])
    end
  end

  defp descend(node, graph, visited, stack, path) do
    graph
    |> Map.get(node, [])
    |> Enum.reduce_while({:ok, visited}, fn neighbour, {:ok, visited} ->
      case visit(neighbour, graph, visited, stack, path) do
        {:ok, visited} -> {:cont, {:ok, visited}}
        {:cycle, cycle} -> {:halt, {:cycle, cycle}}
      end
    end)
    |> case do
      {:ok, visited} -> {:ok, MapSet.put(visited, node)}
      {:cycle, cycle} -> {:cycle, cycle}
    end
  end

  # Ordering is compared at year granularity in v0, so month and day never
  # establish an order between two records: two day-precision records inside the
  # same year stay unordered even when their dates differ. A single interval's
  # own endpoints are still checked at day precision (see order_errors/2), which
  # is internal consistency rather than a cross-record ordering claim.
  defp must_precede?(a, b) do
    a.end != nil and b.start != nil and a.end.astro < b.start.astro
  end

  defp can_overlap?(a, b) do
    (a.start == nil or b.end == nil or a.start.astro <= b.end.astro) and
      (b.start == nil or a.end == nil or b.start.astro <= a.end.astro)
  end

  defp same_support?(a, b) do
    a.mode == b.mode and a.bounds == b.bounds and a.calendar == b.calendar and
      support(a.start) == support(b.start) and support(a.end) == support(b.end)
  end

  defp support(nil), do: nil
  defp support(endpoint), do: {endpoint.astro, endpoint.month, endpoint.day}

  defp caveats(%{mode: :undated}, _opts), do: []

  defp caveats(normalized, opts) do
    display_calendar = Keyword.get(opts, :calendar, "gregorian")

    []
    |> add(normalized.calendar != display_calendar, "cross_calendar_approximation")
    |> add(normalized.precision in ["day", "month"], "year_granularity_comparison")
  end

  defp relation_caveats(a, b) do
    []
    |> add(a.mode == :undated or b.mode == :undated, "undated_record")
    |> add(cross_calendar?(a, b), "cross_calendar_approximation")
    |> add(
      a.precision in ["day", "month"] or b.precision in ["day", "month"],
      "year_granularity_comparison"
    )
  end

  defp cross_calendar?(%{mode: :undated}, _b), do: false
  defp cross_calendar?(_a, %{mode: :undated}), do: false
  defp cross_calendar?(a, b), do: a.calendar != b.calendar

  defp bounds_mismatch("two_sided", start_endpoint, end_endpoint),
    do: is_nil(start_endpoint) or is_nil(end_endpoint)

  defp bounds_mismatch("lower_only", start_endpoint, end_endpoint),
    do: is_nil(start_endpoint) or not is_nil(end_endpoint)

  defp bounds_mismatch("upper_only", start_endpoint, end_endpoint),
    do: is_nil(end_endpoint) or not is_nil(start_endpoint)

  defp bounds_mismatch(_bounds, _start_endpoint, _end_endpoint), do: false

  defp endpoint_errors(nil, _precision), do: []

  defp endpoint_errors(%{} = endpoint, precision) do
    year = endpoint["year"]
    era = endpoint["era"]
    month = endpoint["month"]
    day = endpoint["day"]

    []
    |> add(not is_integer(year), "year_must_be_integer")
    |> add(is_integer(year) and year == 0, "civil_year_zero")
    |> add(is_integer(year) and year < 0, "year_must_be_positive")
    |> add(era not in @era_boundary_codes, "era_must_be_bce_or_ce")
    |> add(is_integer(month) and month not in 1..12, "month_out_of_range")
    |> add(is_integer(day) and day not in 1..31, "day_out_of_range")
    |> precision_errors(precision, month, day)
  end

  defp endpoint_errors(_other, _precision), do: ["endpoint_must_be_era_year"]

  defp precision_errors(errors, "day", month, day) do
    errors
    |> add(not is_integer(month), "day_precision_requires_month_and_day")
    |> add(not is_integer(day), "day_precision_requires_month_and_day")
  end

  defp precision_errors(errors, "month", month, day) do
    errors
    |> add(not is_integer(month), "month_precision_requires_month")
    |> add(is_integer(day), "month_precision_forbids_day")
  end

  defp precision_errors(errors, _precision, month, day) do
    add(errors, not is_nil(month) or not is_nil(day), "year_precision_has_month_or_day")
  end

  defp alignment_errors(interval, "decade"),
    do: span_errors(interval, 10, 0, "decade_span_mismatch")

  defp alignment_errors(interval, "century"),
    do: span_errors(interval, 100, 1, "century_span_mismatch")

  defp alignment_errors(_interval, _precision), do: []

  defp span_errors(interval, span, residue, code) do
    case span_endpoints(interval) do
      {start_endpoint, end_endpoint} ->
        case span_eras(start_endpoint, end_endpoint) do
          :same_era -> aligned_span_errors(start_endpoint, end_endpoint, span, residue, code)
          :different_era -> [code]
          :unknown -> []
        end

      :unknown ->
        []
    end
  end

  defp span_endpoints(%{"start" => start_endpoint, "end" => end_endpoint})
       when is_map(start_endpoint) and is_map(end_endpoint) do
    if is_integer(start_endpoint["year"]) and is_integer(end_endpoint["year"]) do
      {start_endpoint, end_endpoint}
    else
      :unknown
    end
  end

  defp span_endpoints(_interval), do: :unknown

  defp span_eras(start_endpoint, end_endpoint) do
    cond do
      start_endpoint["era"] not in @era_boundary_codes -> :unknown
      end_endpoint["era"] not in @era_boundary_codes -> :unknown
      start_endpoint["era"] != end_endpoint["era"] -> :different_era
      true -> :same_era
    end
  end

  defp aligned_span_errors(start_endpoint, end_endpoint, span, residue, code) do
    {anchor, other} =
      if start_endpoint["era"] == "ce",
        do: {start_endpoint, end_endpoint},
        else: {end_endpoint, start_endpoint}

    if rem(anchor["year"], span) == residue and other["year"] == anchor["year"] + span - 1,
      do: [],
      else: [code]
  end

  defp order_errors(%{"start" => start_endpoint, "end" => end_endpoint}, "two_sided") do
    with start_ordinal when not is_nil(start_ordinal) <- raw_ordinal(start_endpoint),
         end_ordinal when not is_nil(end_ordinal) <- raw_ordinal(end_endpoint) do
      if start_ordinal > end_ordinal, do: ["interval_start_after_end"], else: []
    else
      _other -> []
    end
  end

  defp order_errors(_interval, _bounds), do: []

  # Raw era years arrive from a source document, so the ordering check reads
  # string keys and skips endpoints that endpoint_errors already rejected.
  defp raw_ordinal(%{"year" => year, "era" => era} = endpoint)
       when is_integer(year) and era in @era_boundary_codes do
    {astro(endpoint), endpoint["month"] || 0, endpoint["day"] || 0}
  end

  defp raw_ordinal(_endpoint), do: nil

  defp instant_errors("instant", "two_sided", start_endpoint, end_endpoint) do
    if raw_ordinal(start_endpoint) == raw_ordinal(end_endpoint),
      do: [],
      else: ["instant_start_end_mismatch"]
  end

  defp instant_errors("instant", _bounds, _start_endpoint, _end_endpoint),
    do: ["instant_requires_two_sided"]

  defp instant_errors(_mode, _bounds, _start_endpoint, _end_endpoint), do: []

  defp build(time, interval) do
    %{
      mode: String.to_atom(time["mode"]),
      calendar: time["calendar"],
      precision: time["precision"],
      bounds: String.to_atom(interval["bounds"]),
      start: endpoint(interval["start"]),
      end: endpoint(interval["end"]),
      continuous?: time["mode"] == "duration",
      source_expression: time["source_expression"]
    }
  end

  defp endpoint(nil), do: nil

  defp endpoint(%{} = endpoint) do
    %{
      astro: astro(endpoint),
      year: endpoint["year"],
      era: endpoint["era"],
      month: endpoint["month"],
      day: endpoint["day"],
      certainty: endpoint["endpoint_certainty"]
    }
  end

  defp undated(source_expression) do
    %{
      mode: :undated,
      calendar: nil,
      precision: nil,
      bounds: nil,
      start: nil,
      end: nil,
      continuous?: false,
      source_expression: source_expression
    }
  end

  defp add(errors, true, code), do: errors ++ [code]
  defp add(errors, false, _code), do: errors
  defp concat(errors, more), do: errors ++ more
end
