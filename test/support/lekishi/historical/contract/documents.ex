defmodule Lekishi.Historical.Contract.Documents do
  @moduledoc """
  Per-document validation for the v0 historical contract: JSON Schema plus the
  semantic rules a schema cannot express.

  The split is deliberate. The schema constrains structure and vocabulary, and
  the semantics here decide combinations: which endpoints a precision requires,
  what an interpretation may assert, when a claim needs attribution, and which
  fields may never carry presentation or invented precision. Semantic checks run
  only on schema-valid documents, so they can report precise codes instead of
  defensive type errors.

  Two denylists are part of the contract, not style preferences. Renderer or
  presentation keys (`color`, `camera`, playhead state, and similar) must never
  enter the historical source of truth, and invented-precision keys (`radius`,
  `confidence`, `probability`, and similar) must never be generated where the
  evidence supplies none. Both are rejected wherever they appear.
  """

  alias Lekishi.Historical.Contract.{Canonical, JSONSchema, Time, Timestamps}

  @schema_dir Path.expand("../../../../../priv/historical/v0/schema", __DIR__)

  @presentation_keys ~w(
    color colour colors fill fill_color stroke stroke_color stroke_width line_width line_style
    dash opacity camera viewport zoom cesium czm renderer tileset sprite icon marker marker_style
    symbol symbol_style imagery terrain terrain_provider model_url animation playhead layer layers
    map_style style css_class html tooltip label_color highlight_color
  )

  @invented_precision_keys ~w(
    radius uncertainty_radius buffer_m confidence confidence_percentage probability
    probability_distribution likelihood weight score
  )

  # Scripts whose forms cannot be written with ASCII alone. Used only as a sanity
  # check that a romanization is not recorded as a local-script form.
  @non_latin_scripts ~w(Hani Hira Kana Hang Arab Hebr Cyrl Grek Deva Taml Thai Khmr Copt Armn Geor Ethi Mymr Mong Tibt Java Kawi)

  @evidence_kinds ~w(place actor event relationship)
  @asserted_geometry ~w(approximate_point source_supported_area attested_itinerary reconstructed_route schematic_link)
  @route_geometry ~w(attested_itinerary reconstructed_route schematic_link)

  @type violation :: %{code: binary(), where: binary(), detail: binary()}

  @spec validate(map()) :: {:ok, %{warnings: [binary()]}} | {:error, [violation()]}
  def validate(%{"document" => type} = document) when type in ~w(record source publication_set) do
    errors =
      scan_reserved_keys(document) ++
        timestamp_errors(document) ++
        case JSONSchema.validate(schema_path(type), document) do
          {:ok, []} -> semantic_errors(document)
          {:error, violations} -> Enum.map(violations, &schema_violation(&1, document))
        end

    if errors == [], do: {:ok, %{warnings: []}}, else: {:error, errors}
  end

  def validate(_document) do
    {:error,
     [error("unknown_document_type", "", "document must be record, source, or publication_set")]}
  end

  @spec schema_path(binary()) :: Path.t()
  def schema_path(type),
    do: Path.join(@schema_dir, "#{String.replace(type, "_", "-")}.schema.json")

  @spec schema_dir() :: Path.t()
  def schema_dir, do: @schema_dir

  @doc "Codes reported by the semantic checks, for documentation and vector expectations."
  @spec codes() :: [binary()]
  def codes do
    ~w(
      record_id_kind_mismatch duplicate_revision_id revision_order_not_increasing revision_hash_mismatch
      research_notes_in_published_revision duplicate_claim_id claim_pointer_unresolved
      interpretation_missing_attribution claim_without_dispute multiple_main_claims_for_pointer
      unresolved_claim_reference dispute_summary_missing dispute_without_alternative_claim
      undisputed_with_alternative_claim no_primary_name multiple_primary_names translation_as_primary
      primary_name_without_claim script_form_mismatch romanization_on_latin_script
      attested_romanization_without_claim editorial_romanization_has_claim romanization_pronunciation_claim
      geometry_missing_geojson geometry_unknown_has_geojson geometry_unknown_without_notes
      geometry_unknown_with_precision display_anchor_without_notes display_anchor_with_precision
      geometry_missing_precision geometry_wrong_type geometry_claim_pointer_mismatch
      attested_itinerary_not_attested
      reconstructed_route_not_interpretation waypoints_not_route route_without_notes
      uncertainty_none_has_extent uncertainty_extent_missing uncertainty_without_source_expression
      geojson_invalid_structure geojson_coordinate_out_of_range geojson_ring_not_closed
      geojson_too_few_positions ordering_without_evidence ordering_self_reference
      part_of_self_reference relationship_self_reference causality_without_interpretation
      influence_without_interpretation story_window_start_after_end story_first_step_not_start
      boundary_not_inclusive other_type_without_note published_record_without_citation
      license_incomplete duplicate_set_member checklist_incomplete published_before_approved
      set_supersedes_itself presentation_field_in_content invented_precision_field schema_violation
      invalid_timestamp source_hash_mismatch unknown_document_type
    )
  end

  defp schema_violation(violation, document) do
    error(
      "schema_violation",
      violation.path,
      "#{violation.keyword} #{violation.detail} (#{where(document)})"
    )
  end

  defp semantic_errors(%{"document" => "record"} = document), do: record_errors(document)
  defp semantic_errors(%{"document" => "source"} = document), do: source_errors(document)
  defp semantic_errors(%{"document" => "publication_set"} = document), do: set_errors(document)

  # --- record documents -------------------------------------------------------

  defp record_errors(document) do
    kind = document["kind"]
    record_id = document["record_id"]
    revisions = if is_list(document["revisions"]), do: document["revisions"], else: []
    published_revision_id = get_in(document, ["publication", "published_revision_id"])

    []
    |> flag(
      not String.starts_with?(record_id || "", "lks:#{kind}:"),
      "record_id_kind_mismatch",
      "/record_id",
      "a stable record id carries its kind segment and never changes with renames or date revisions"
    )
    |> concat(duplicate_revision_errors(revisions))
    |> concat(revision_order_errors(revisions))
    |> then(fn errors ->
      revisions
      |> Enum.with_index()
      |> Enum.reduce(errors, fn {revision, index}, acc ->
        acc ++ revision_errors(revision, index, kind, record_id, published_revision_id)
      end)
    end)
  end

  defp duplicate_revision_errors(revisions) do
    revisions
    |> Enum.map(& &1["revision_id"])
    |> duplicates()
    |> Enum.map(&error("duplicate_revision_id", "/revisions", to_string(&1)))
  end

  defp revision_order_errors(revisions) do
    revisions
    |> Enum.chunk_every(2, 1, :discard)
    |> Enum.flat_map(fn [previous, current] ->
      # Only real UTC timestamps order revisions; an invalid value is reported by
      # timestamp_errors/1 rather than silently winning the comparison.
      flag(
        [],
        Timestamps.compare(current["created_at"], previous["created_at"]) == :lt,
        "revision_order_not_increasing",
        "/revisions",
        "revisions are appended oldest first; #{current["revision_id"]} precedes its predecessor"
      )
    end)
  end

  # Editorial metadata timestamps are real-world UTC instants, so they must parse
  # before they take part in any ordering. The schema pattern only fixes their
  # shape: a value such as 2026-99-99T99:99:99Z has to be rejected instead of
  # winning a publication ordering comparison by string comparison.
  defp timestamp_errors(document) do
    document
    |> timestamp_fields()
    |> Enum.flat_map(fn {value, path} ->
      flag(
        [],
        not is_nil(value) and not Timestamps.valid?(value),
        "invalid_timestamp",
        path,
        "#{inspect(value)} is not a UTC timestamp"
      )
    end)
  end

  defp timestamp_fields(%{"document" => "record"} = document) do
    [{document["created_at"], "/created_at"} | revision_timestamp_fields(document["revisions"])]
  end

  defp timestamp_fields(%{"document" => "source"} = document) do
    [{get_in(document, ["license", "reviewed_at"]), "/license/reviewed_at"}]
  end

  defp timestamp_fields(%{"document" => "publication_set"} = document) do
    [
      {document["published_at"], "/published_at"},
      {get_in(document, ["review", "reviewed_at"]), "/review/reviewed_at"}
    ]
  end

  defp timestamp_fields(_document), do: []

  defp revision_timestamp_fields(revisions) when is_list(revisions) do
    revisions
    |> Enum.filter(&is_map/1)
    |> Enum.with_index()
    |> Enum.map(fn {revision, index} ->
      {revision["created_at"], "/revisions/#{index}/created_at"}
    end)
  end

  defp revision_timestamp_fields(_revisions), do: []

  defp revision_errors(revision, index, kind, record_id, published_revision_id) do
    path = "/revisions/#{index}"
    content = revision["content"] || %{}
    claims = revision["claims"] || []
    published? = revision["revision_id"] == published_revision_id

    context = %{kind: kind, record_id: record_id, path: path, published?: published?}

    []
    |> flag(
      Canonical.revision_hash(revision) != revision["revision_hash"],
      "revision_hash_mismatch",
      path,
      "a revision body was edited after it was sealed"
    )
    |> flag(
      published? and not is_nil(revision["research_notes"]),
      "research_notes_in_published_revision",
      path,
      "contributor hypotheses are never public content"
    )
    |> concat(claim_errors(claims, content, revision, path))
    |> concat(dispute_errors(revision, claims, path))
    |> concat(content_errors(content, claims, context))
    |> concat(published_evidence_errors(kind, claims, published?, path))
  end

  defp claim_errors(claims, content, revision, path) do
    claim_ids = Enum.map(claims, & &1["claim_id"])

    errors =
      claim_ids
      |> duplicates()
      |> Enum.map(&error("duplicate_claim_id", "#{path}/claims", to_string(&1)))

    errors =
      (errors ++
         claims)
      |> Enum.filter(&(&1["role"] == "main"))
      |> Enum.group_by(& &1["asserts"])
      |> Enum.filter(fn {_asserts, grouped} -> length(grouped) > 1 end)
      |> Enum.map(fn {asserts, _grouped} ->
        error("multiple_main_claims_for_pointer", "#{path}/claims", inspect(asserts))
      end)

    errors =
      claims
      |> Enum.with_index()
      |> Enum.reduce(errors, fn {claim, index}, acc ->
        claim_path = "#{path}/claims/#{index}"

        acc
        |> flag(
          not pointer_resolves?(content, claim["asserts"]),
          "claim_pointer_unresolved",
          claim_path,
          "asserts #{inspect(claim["asserts"])} does not resolve in the revision content"
        )
        |> flag(
          claim["basis"] == "cited_interpretation" and blank?(claim["attributed_to"]),
          "interpretation_missing_attribution",
          claim_path,
          "a cited scholarly interpretation must name who advances it"
        )
        |> flag(
          claim["role"] in ["alternative", "conflicting"] and
            get_in(revision, ["dispute", "status"]) != "disputed",
          "claim_without_dispute",
          claim_path,
          "an alternative or conflicting claim requires a visible dispute"
        )
      end)

    errors ++ claim_reference_errors(content, claim_ids, path)
  end

  defp claim_reference_errors(content, claim_ids, path) do
    content
    |> collect_references("#{path}/content", "claim_id")
    |> Enum.flat_map(fn {claim_id, reference_path} ->
      flag(
        [],
        claim_id not in claim_ids,
        "unresolved_claim_reference",
        reference_path,
        "claim #{inspect(claim_id)} is not defined in this revision"
      )
    end)
  end

  defp collect_references(value, path, key) when is_map(value) do
    direct =
      case value do
        %{^key => reference} when is_binary(reference) -> [{reference, "#{path}/#{key}"}]
        _other -> []
      end

    direct ++
      Enum.flat_map(value, fn {nested_key, nested} ->
        collect_references(nested, "#{path}/#{nested_key}", key)
      end)
  end

  defp collect_references(value, path, key) when is_list(value) do
    value
    |> Enum.with_index()
    |> Enum.flat_map(fn {nested, index} ->
      collect_references(nested, "#{path}/#{index}", key)
    end)
  end

  defp collect_references(_value, _path, _key), do: []

  defp dispute_errors(revision, claims, path) do
    dispute = revision["dispute"] || %{}
    status = dispute["status"] || "undisputed"
    challenging = Enum.count(claims, &(&1["role"] in ["alternative", "conflicting"]))

    []
    |> flag(
      status == "disputed" and blank?(dispute["summary"]),
      "dispute_summary_missing",
      "#{path}/dispute",
      "a disputed account needs a summary of what differs"
    )
    |> flag(
      status == "disputed" and challenging == 0,
      "dispute_without_alternative_claim",
      "#{path}/dispute",
      "a dispute needs at least one cited alternative or conflicting claim"
    )
    |> flag(
      status == "undisputed" and challenging > 0,
      "undisputed_with_alternative_claim",
      "#{path}/dispute",
      "alternative or conflicting claims must not be recorded as undisputed"
    )
  end

  defp content_errors(content, claims, context) do
    content_path = "#{context.path}/content"
    claims_by_id = Map.new(claims, &{&1["claim_id"], &1})

    []
    |> concat(time_errors(content["time"], "#{content_path}/time"))
    |> concat(time_errors(content["existence"], "#{content_path}/existence"))
    |> concat(time_errors(content["validity"], "#{content_path}/validity"))
    |> concat(
      name_errors(content["names"], claims_by_id, "#{content_path}/names", context.published?)
    )
    |> concat(
      geometry_errors(content["geometry"], claims_by_id, "#{content_path}/geometry", "/geometry")
    )
    |> concat(
      ordering_errors(content["time"], claims_by_id, "#{content_path}/time", context.published?)
    )
    |> concat(type_note_errors(content, content_path))
    |> concat(kind_errors(content, claims_by_id, context, content_path))
  end

  defp time_errors(nil, _path), do: []

  defp time_errors(time, path) do
    case Time.normalize(time) do
      {:ok, _normalized} -> []
      {:error, codes} -> Enum.map(codes, &error(&1, path, "invalid time expression"))
    end
  end

  defp name_errors(nil, _claims_by_id, _path, _published?), do: []
  defp name_errors([], _claims_by_id, _path, _published?), do: []

  defp name_errors(names, claims_by_id, path, published?) when is_list(names) do
    primaries = Enum.filter(names, &(&1["role"] == "primary"))

    errors =
      case length(primaries) do
        0 ->
          [error("no_primary_name", path, "names are present without a primary historical form")]

        1 ->
          []

        _count ->
          [error("multiple_primary_names", path, "only one name form may be primary")]
      end

    names
    |> Enum.with_index()
    |> Enum.reduce(errors, fn {name, index}, acc ->
      name_path = "#{path}/#{index}"
      primary? = name["role"] == "primary"

      acc
      |> flag(
        primary? and not is_nil(name["translation"]),
        "translation_as_primary",
        name_path,
        "a translation is not a period-appropriate primary label"
      )
      |> flag(
        primary? and published? and is_nil(name["claim_id"]),
        "primary_name_without_claim",
        name_path,
        "a published primary label needs cited support for the period-appropriate form"
      )
      |> flag(
        name["script"] in @non_latin_scripts and ascii_only?(name["form"]),
        "script_form_mismatch",
        name_path,
        "a romanized form must not be recorded as a local-script form"
      )
      |> concat(romanization_errors(name["romanization"], name, name_path))
      |> flag(
        is_binary(name["claim_id"]) and not Map.has_key?(claims_by_id, name["claim_id"]),
        "unresolved_claim_reference",
        name_path,
        "name evidence must reference a claim in this revision"
      )
      |> concat(time_errors(name["validity"], "#{name_path}/validity"))
    end)
  end

  defp romanization_errors(nil, _name, _path), do: []

  defp romanization_errors(romanization, name, path) do
    path = "#{path}/romanization"

    []
    |> flag(
      name["script"] == "Latn",
      "romanization_on_latin_script",
      path,
      "a Latin-script form needs no separate romanization"
    )
    |> flag(
      romanization["origin"] == "source_attested" and is_nil(romanization["claim_id"]),
      "attested_romanization_without_claim",
      path,
      "a source-attested romanization must cite the form it comes from"
    )
    |> flag(
      romanization["origin"] == "editorial" and not is_nil(romanization["claim_id"]),
      "editorial_romanization_has_claim",
      path,
      "an editorial reading aid must not be presented as source evidence"
    )
    |> flag(
      romanization["pronunciation_claim"] != false,
      "romanization_pronunciation_claim",
      path,
      "a romanization is a modern reading aid, never evidence of historical pronunciation"
    )
  end

  defp geometry_errors(nil, _claims_by_id, _path, _content_base), do: []
  defp geometry_errors([], _claims_by_id, _path, _content_base), do: []

  defp geometry_errors(geometry, claims_by_id, path, content_base) when is_list(geometry) do
    geometry
    |> Enum.with_index()
    |> Enum.flat_map(fn {entry, index} ->
      entry_path = "#{path}/#{index}"
      entry_pointer = "#{content_base}/#{index}"
      claim = claims_by_id[entry["claim_id"]]

      []
      |> flag(
        is_nil(claim),
        "unresolved_claim_reference",
        entry_path,
        "geometry must reference a claim in this revision"
      )
      |> concat(geometry_pointer_errors(claim, entry_path, entry_pointer, content_base))
      |> concat(interpretation_errors(entry, claim, entry_path))
      |> concat(geojson_errors(entry["geojson"], "#{entry_path}/geojson"))
      |> concat(uncertainty_errors(entry, entry_path))
      |> concat(time_errors(entry["validity"], "#{entry_path}/validity"))
      |> concat(waypoint_errors(entry, entry_path))
    end)
  end

  defp geometry_pointer_errors(nil, _entry_path, _entry_pointer, _content_base), do: []

  defp geometry_pointer_errors(claim, entry_path, entry_pointer, content_base) do
    # asserts pointers are relative to the revision content, so a claim supports a
    # geometry entry by asserting that entry, its list, or the whole content.
    accepted = [entry_pointer, content_base, ""]

    flag(
      [],
      claim["asserts"] not in accepted,
      "geometry_claim_pointer_mismatch",
      entry_path,
      "the linked claim must assert this geometry entry or the geometry list to support it"
    )
  end

  defp interpretation_errors(entry, claim, path) do
    []
    |> concat(geometry_presence_errors(entry, path))
    |> concat(geometry_label_errors(entry, path))
    |> concat(geometry_shape_errors(entry, path))
    |> concat(geometry_basis_errors(entry, claim, path))
  end

  defp geometry_presence_errors(entry, path) do
    interpretation = entry["interpretation"]
    asserted? = interpretation in @asserted_geometry
    unknown? = interpretation == "unknown"

    []
    |> flag(
      asserted? and is_nil(entry["geojson"]),
      "geometry_missing_geojson",
      path,
      "an asserted location needs geometry"
    )
    |> flag(
      unknown? and not is_nil(entry["geojson"]),
      "geometry_unknown_has_geojson",
      path,
      "an unknown location must not carry coordinates"
    )
    |> flag(
      asserted? and entry["precision"] == "unspecified",
      "geometry_missing_precision",
      path,
      "an asserted location needs its precision recorded"
    )
  end

  defp geometry_label_errors(entry, path) do
    interpretation = entry["interpretation"]
    precision = entry["precision"]
    notes = entry["notes"]
    unknown? = interpretation == "unknown"
    anchor? = interpretation == "display_anchor"
    route? = interpretation in ["reconstructed_route", "schematic_link"]

    []
    |> flag(
      unknown? and blank?(notes),
      "geometry_unknown_without_notes",
      path,
      "explain why no placement is supported"
    )
    |> flag(
      unknown? and precision != "unspecified",
      "geometry_unknown_with_precision",
      path,
      "an unknown location must not imply locational precision"
    )
    |> flag(
      anchor? and blank?(notes),
      "display_anchor_without_notes",
      path,
      "a display anchor is not an asserted coordinate and needs an explanation"
    )
    |> flag(
      anchor? and precision != "unspecified",
      "display_anchor_with_precision",
      path,
      "a display anchor must not imply locational precision"
    )
    |> flag(
      route? and blank?(notes),
      "route_without_notes",
      path,
      "a reconstructed or schematic route must be labelled as such"
    )
  end

  defp geometry_shape_errors(entry, path) do
    interpretation = entry["interpretation"]
    type = geojson_type(entry["geojson"])

    []
    |> flag(
      interpretation == "approximate_point" and type != "Point",
      "geometry_wrong_type",
      path,
      "an approximate point must be a Point"
    )
    |> flag(
      interpretation == "source_supported_area" and type not in ["Polygon", "MultiPolygon"],
      "geometry_wrong_type",
      path,
      "a source-supported area must be a Polygon or MultiPolygon"
    )
    |> flag(
      interpretation in @route_geometry and type not in ["LineString", "MultiLineString"],
      "geometry_wrong_type",
      path,
      "a route must be a LineString or MultiLineString"
    )
  end

  defp geometry_basis_errors(entry, claim, path) do
    interpretation = entry["interpretation"]
    basis = claim && claim["basis"]

    []
    |> flag(
      interpretation == "attested_itinerary" and basis != "attested",
      "attested_itinerary_not_attested",
      path,
      "an attested itinerary must rest on attestation, not on a reconstruction"
    )
    |> flag(
      interpretation == "reconstructed_route" and basis != "cited_interpretation",
      "reconstructed_route_not_interpretation",
      path,
      "a reconstructed route is a cited scholarly interpretation"
    )
    |> flag(
      not is_nil(entry["waypoints"]) and interpretation not in @route_geometry,
      "waypoints_not_route",
      path,
      "waypoints belong to a route interpretation"
    )
  end

  defp geojson_type(nil), do: nil
  defp geojson_type(%{"type" => type}), do: type
  defp geojson_type(_other), do: nil

  # GeoJSON structure is checked here rather than in the schema so the contract
  # can report precise codes: positions are WGS84 longitude/latitude, lines need
  # two positions, and polygon rings must close.
  defp geojson_errors(nil, _path), do: []

  defp geojson_errors(%{"type" => "Point", "coordinates" => coordinates}, path) do
    position_errors(coordinates, path)
  end

  defp geojson_errors(%{"type" => "MultiPoint", "coordinates" => coordinates}, path)
       when is_list(coordinates) do
    coordinates
    |> Enum.with_index()
    |> Enum.flat_map(fn {position, index} -> position_errors(position, "#{path}/#{index}") end)
  end

  defp geojson_errors(%{"type" => "LineString", "coordinates" => coordinates}, path) do
    line_errors(coordinates, path)
  end

  defp geojson_errors(%{"type" => "MultiLineString", "coordinates" => coordinates}, path)
       when is_list(coordinates) do
    coordinates
    |> Enum.with_index()
    |> Enum.flat_map(fn {line, index} -> line_errors(line, "#{path}/#{index}") end)
  end

  defp geojson_errors(%{"type" => "Polygon", "coordinates" => coordinates}, path) do
    polygon_errors(coordinates, path)
  end

  defp geojson_errors(%{"type" => "MultiPolygon", "coordinates" => coordinates}, path)
       when is_list(coordinates) do
    coordinates
    |> Enum.with_index()
    |> Enum.flat_map(fn {polygon, index} -> polygon_errors(polygon, "#{path}/#{index}") end)
  end

  defp geojson_errors(_geojson, path) do
    [error("geojson_invalid_structure", path, "expected a GeoJSON geometry with coordinates")]
  end

  defp position_errors([longitude, latitude | _rest] = position, path)
       when is_number(longitude) and is_number(latitude) do
    if longitude >= -180 and longitude <= 180 and latitude >= -90 and latitude <= 90 do
      []
    else
      [error("geojson_coordinate_out_of_range", path, inspect(position))]
    end
  end

  defp position_errors(_position, path) do
    [error("geojson_invalid_structure", path, "a position must be [longitude, latitude]")]
  end

  defp line_errors(coordinates, path) when is_list(coordinates) and length(coordinates) >= 2 do
    coordinates
    |> Enum.with_index()
    |> Enum.flat_map(fn {position, index} -> position_errors(position, "#{path}/#{index}") end)
  end

  defp line_errors(_coordinates, path) do
    [error("geojson_too_few_positions", path, "a line needs at least two positions")]
  end

  defp polygon_errors(rings, path) when is_list(rings) and rings != [] do
    rings
    |> Enum.with_index()
    |> Enum.flat_map(fn {ring, index} -> ring_errors(ring, "#{path}/#{index}") end)
  end

  defp polygon_errors(_rings, path) do
    [error("geojson_invalid_structure", path, "a polygon needs at least one ring")]
  end

  defp ring_errors(ring, path) when is_list(ring) and length(ring) >= 4 do
    if hd(ring) == List.last(ring) do
      ring
      |> Enum.with_index()
      |> Enum.flat_map(fn {position, index} -> position_errors(position, "#{path}/#{index}") end)
    else
      [
        error(
          "geojson_ring_not_closed",
          path,
          "the first and last positions of a ring must match"
        )
      ]
    end
  end

  defp ring_errors(_ring, path) do
    [error("geojson_too_few_positions", path, "a ring needs at least four positions")]
  end

  defp uncertainty_errors(entry, path) do
    case entry["uncertainty"] do
      nil ->
        []

      %{"kind" => "none"} = uncertainty ->
        flag(
          [],
          not is_nil(uncertainty["extent_m"]) or not is_nil(uncertainty["source_expression"]),
          "uncertainty_none_has_extent",
          path,
          "an extent must not be recorded when none is claimed"
        )

      %{"kind" => "source_stated_extent"} = uncertainty ->
        []
        |> flag(
          not (is_number(uncertainty["extent_m"]) and uncertainty["extent_m"] > 0),
          "uncertainty_extent_missing",
          path,
          "a source-stated extent needs the extent the source states"
        )
        |> flag(
          blank?(uncertainty["source_expression"]),
          "uncertainty_without_source_expression",
          path,
          "a source-stated extent must quote the source's own statement"
        )

      _other ->
        []
    end
  end

  defp waypoint_errors(%{"waypoints" => waypoints}, path) when is_list(waypoints) do
    waypoints
    |> Enum.with_index()
    |> Enum.flat_map(fn {waypoint, index} ->
      waypoint_path = "#{path}/waypoints/#{index}"

      geojson_errors(waypoint["geojson"], "#{waypoint_path}/geojson") ++
        time_errors(waypoint["time"], "#{waypoint_path}/time")
    end)
  end

  defp waypoint_errors(_entry, _path), do: []

  defp ordering_errors(nil, _claims_by_id, _path, _published?), do: []

  defp ordering_errors(%{"ordering" => ordering}, claims_by_id, path, published?)
       when is_list(ordering) do
    ordering
    |> Enum.with_index()
    |> Enum.flat_map(fn {entry, index} ->
      entry_path = "#{path}/ordering/#{index}"
      claim_id = entry["claim_id"]

      []
      |> flag(
        published? and entry["relation"] != "undetermined" and is_nil(claim_id),
        "ordering_without_evidence",
        entry_path,
        "a published ordering assertion needs cited evidence"
      )
      |> flag(
        not is_nil(claim_id) and not Map.has_key?(claims_by_id, claim_id),
        "unresolved_claim_reference",
        entry_path,
        "ordering evidence must reference a claim in this revision"
      )
    end)
  end

  defp ordering_errors(_time, _claims_by_id, _path, _published?), do: []

  defp type_note_errors(content, path) do
    uses_other? =
      ["place_types", "actor_types", "event_types", "relationship_types"]
      |> Enum.any?(fn key -> is_list(content[key]) and "other" in content[key] end)

    flag(
      [],
      uses_other? and blank?(content["editorial_notes"]),
      "other_type_without_note",
      path,
      "an other type must be explained rather than silently extending the vocabulary"
    )
  end

  defp kind_errors(content, _claims_by_id, %{kind: "event", record_id: record_id}, path) do
    part_of = if is_list(content["part_of"]), do: content["part_of"], else: []
    ordering = get_in(content, ["time", "ordering"]) || []

    part_of
    |> Enum.with_index()
    |> Enum.flat_map(fn {entry, index} ->
      flag(
        [],
        entry["event_id"] == record_id,
        "part_of_self_reference",
        "#{path}/part_of/#{index}",
        "an event cannot be part of itself"
      )
    end)
    |> concat(
      flag(
        [],
        Enum.any?(ordering, &(&1["record_id"] == record_id)),
        "ordering_self_reference",
        path,
        "a record must not order itself"
      )
    )
  end

  defp kind_errors(content, claims_by_id, %{kind: "relationship"}, path) do
    types = if is_list(content["relationship_types"]), do: content["relationship_types"], else: []

    interpretations =
      Enum.count(claims_by_id, fn {_claim_id, claim} ->
        claim["basis"] == "cited_interpretation"
      end)

    []
    |> flag(
      content["from"] == content["to"],
      "relationship_self_reference",
      path,
      "a relationship needs two distinct ends"
    )
    |> flag(
      content["causality"] == "asserted" and interpretations == 0,
      "causality_without_interpretation",
      path,
      "causation is a scholarly interpretation and needs a cited_interpretation claim"
    )
    |> flag(
      "proposed_influence" in types and interpretations == 0,
      "influence_without_interpretation",
      path,
      "a proposed influence must be presented as a cited interpretation, not as attested contact"
    )
  end

  defp kind_errors(content, _claims_by_id, %{kind: "story"}, path) do
    window = if is_map(content["window"]), do: content["window"], else: %{}
    steps = if is_list(content["steps"]), do: content["steps"], else: []

    []
    |> flag(
      is_map(window["start"]) and is_map(window["end"]) and
        Time.astro(window["start"]) > Time.astro(window["end"]),
      "story_window_start_after_end",
      "#{path}/window",
      "a story window must not start after it ends"
    )
    |> flag(
      window["boundary"] != "inclusive",
      "boundary_not_inclusive",
      "#{path}/window",
      "v0 windows are inclusive at both ends"
    )
    |> flag(
      steps != [] and hd(steps)["role"] != "start",
      "story_first_step_not_start",
      "#{path}/steps",
      "the first story step must be the entry point"
    )
  end

  defp kind_errors(_content, _claims_by_id, _context, _path), do: []

  defp published_evidence_errors(kind, claims, true, path) when kind in @evidence_kinds do
    cited? =
      Enum.any?(claims, fn claim -> is_list(claim["citations"]) and claim["citations"] != [] end)

    flag(
      [],
      not cited?,
      "published_record_without_citation",
      path,
      "every published event, place, actor, and relationship needs a cited claim"
    )
  end

  defp published_evidence_errors(_kind, _claims, _published?, _path), do: []

  # --- source documents -------------------------------------------------------

  defp source_errors(document) do
    license = document["license"] || %{}

    []
    |> flag(
      Canonical.source_hash(document) != document["source_hash"],
      "source_hash_mismatch",
      "/source_hash",
      "source metadata was edited after sealing; publish a new source document instead of rewriting an approved one"
    )
    |> concat(license_errors(license))
  end

  defp license_errors(license) do
    if license["status"] == "recorded" do
      []
      |> flag(
        is_nil(license["license_id"]),
        "license_incomplete",
        "/license",
        "record the license identifier"
      )
      |> flag(
        blank?(license["attribution_text"]),
        "license_incomplete",
        "/license",
        "record the attribution text"
      )
      |> flag(
        is_nil(license["redistribution"]),
        "license_incomplete",
        "/license",
        "record redistribution terms"
      )
      |> flag(
        is_nil(license["quotation_permitted"]),
        "license_incomplete",
        "/license",
        "record quotation terms"
      )
    else
      []
    end
  end

  # --- publication set documents ---------------------------------------------

  defp set_errors(document) do
    members = if is_list(document["members"]), do: document["members"], else: []
    review = document["review"] || %{}
    checklist = review["checklist"] || %{}
    incomplete = checklist |> Map.keys() |> Enum.reject(&(checklist[&1] == true))

    []
    |> flag(
      members |> Enum.map(& &1["record_id"]) |> duplicates() != [],
      "duplicate_set_member",
      "/members",
      "a record appears at most once per publication set"
    )
    |> flag(
      incomplete != [],
      "checklist_incomplete",
      "/review/checklist",
      "the review checklist must be complete before publication: #{inspect(Enum.sort(incomplete))}"
    )
    |> flag(
      is_binary(document["published_at"]) and is_binary(review["reviewed_at"]) and
        Timestamps.compare(document["published_at"], review["reviewed_at"]) == :lt,
      "published_before_approved",
      "/published_at",
      "publication cannot precede review"
    )
    |> flag(
      document["supersedes"] == document["set_id"],
      "set_supersedes_itself",
      "/supersedes",
      "a set cannot supersede itself"
    )
  end

  # --- shared helpers --------------------------------------------------------

  defp scan_reserved_keys(document) do
    document
    |> collect_keys("")
    |> Enum.flat_map(fn {key, path} ->
      cond do
        key in @presentation_keys ->
          [
            error(
              "presentation_field_in_content",
              path,
              "#{key} must not enter the historical source of truth"
            )
          ]

        key in @invented_precision_keys ->
          [
            error(
              "invented_precision_field",
              path,
              "#{key} must not be invented where the evidence supplies none"
            )
          ]

        true ->
          []
      end
    end)
  end

  defp collect_keys(value, path) when is_map(value) do
    Enum.flat_map(value, fn {key, nested} ->
      [{key, path}] ++ collect_keys(nested, path <> "/" <> key)
    end)
  end

  defp collect_keys(value, path) when is_list(value) do
    value
    |> Enum.with_index()
    |> Enum.flat_map(fn {nested, index} ->
      collect_keys(nested, path <> "/" <> Integer.to_string(index))
    end)
  end

  defp collect_keys(_value, _path), do: []

  defp pointer_resolves?(_content, ""), do: true

  defp pointer_resolves?(content, pointer) when is_binary(pointer) do
    pointer
    |> String.split("/")
    |> Enum.drop(1)
    |> Enum.map(&unescape_pointer_token/1)
    |> Enum.reduce_while({:ok, content}, fn token, {:ok, current} ->
      case pointer_step(current, token) do
        {:ok, next} -> {:cont, {:ok, next}}
        :error -> {:halt, :error}
      end
    end)
    |> case do
      {:ok, _value} -> true
      :error -> false
    end
  end

  defp pointer_resolves?(_content, _pointer), do: false

  defp pointer_step(%{} = map, token) do
    if Map.has_key?(map, token), do: {:ok, Map.fetch!(map, token)}, else: :error
  end

  defp pointer_step(list, token) when is_list(list) do
    case Integer.parse(token) do
      {index, ""} when index >= 0 ->
        case Enum.fetch(list, index) do
          {:ok, value} -> {:ok, value}
          :error -> :error
        end

      _other ->
        :error
    end
  end

  defp pointer_step(_current, _token), do: :error

  defp unescape_pointer_token(token),
    do: token |> String.replace("~1", "/") |> String.replace("~0", "~")

  defp duplicates(values) do
    values
    |> Enum.frequencies()
    |> Enum.filter(fn {_value, count} -> count > 1 end)
    |> Enum.map(&elem(&1, 0))
    |> Enum.sort()
  end

  defp ascii_only?(value) when is_binary(value),
    do: value == String.replace(value, ~r/[^\x00-\x7F]/, "")

  defp ascii_only?(_value), do: false

  defp blank?(value), do: is_nil(value) or value == ""

  defp where(document),
    do: document["record_id"] || document["source_id"] || document["set_id"] || "unknown"

  defp error(code, path, detail), do: %{code: code, where: path, detail: detail}

  defp flag(errors, true, code, path, detail), do: errors ++ [error(code, path, detail)]
  defp flag(errors, false, _code, _path, _detail), do: errors
  defp concat(errors, more), do: errors ++ more
end
