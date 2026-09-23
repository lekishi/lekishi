defmodule Lekishi.Historical.Contract.JSONSchema do
  @moduledoc """
  Minimal JSON Schema (2020-12 subset) validator for the v0 historical contract.

  The repository has no JSON Schema dependency and this work does not add one, so
  the contract ships real JSON Schema documents and validates them with the exact
  keyword subset those schemas use. Any other keyword raises
  `Lekishi.Historical.Contract.JSONSchema.UnsupportedKeywordError`: a schema can
  never silently under-validate, because an unimplemented keyword stops
  validation instead of being ignored. `format` is treated as an annotation, as
  the specification permits.

  `check_schema!/1` walks every subschema of a document (not only the parts
  reached by an instance) so a typo in a keyword name is caught even when no
  instance exercises that branch.
  """

  defmodule UnsupportedKeywordError do
    defexception [:message]
  end

  defmodule SchemaError do
    defexception [:message]
  end

  @annotations ~w($schema $id $defs $comment title description default examples deprecated readOnly writeOnly format)

  @keywords ~w(type required properties additionalProperties items minItems maxItems uniqueItems
               minLength maxLength pattern enum const minimum maximum exclusiveMinimum
               exclusiveMaximum anyOf allOf oneOf not if then else $ref)

  @subschema_keys ~w($defs properties items additionalProperties allOf anyOf oneOf if then else not)

  @type violation :: %{keyword: binary(), path: binary(), detail: binary()}

  @doc "Validates `instance` against the JSON Schema document at `schema_path`."
  @spec validate(Path.t(), term()) :: {:ok, []} | {:error, [violation()]}
  def validate(schema_path, instance) do
    context = context_for(schema_path)

    case check(read_schema!(schema_path), instance, "", context) do
      [] -> {:ok, []}
      violations -> {:error, violations}
    end
  end

  @doc "Raises unless every subschema of `schema_path` uses only supported keywords."
  @spec check_schema!(Path.t()) :: :ok
  def check_schema!(schema_path) do
    context = context_for(schema_path)
    walk_schema!(read_schema!(schema_path), "", context)
    :ok
  end

  @spec read_schema!(Path.t()) :: map()
  def read_schema!(schema_path) do
    path = Path.expand(schema_path)

    case Process.get({__MODULE__, path}) do
      nil ->
        schema = path |> File.read!() |> Jason.decode!()
        Process.put({__MODULE__, path}, schema)
        schema

      schema ->
        schema
    end
  end

  defp context_for(schema_path) do
    path = Path.expand(schema_path)
    %{dir: Path.dirname(path), file: Path.basename(path)}
  end

  defp check(schema, instance, path, context) when is_map(schema) do
    ensure_supported!(schema, path, context)

    case schema["$ref"] do
      ref when is_binary(ref) ->
        {referenced, ref_context} = resolve_ref!(ref, context)
        siblings = Map.drop(schema, ["$ref"])

        check(referenced, instance, path, ref_context) ++
          check_keywords(siblings, instance, path, context)

      _other ->
        check_keywords(schema, instance, path, context)
    end
  end

  defp check(schema, _instance, path, context) when is_boolean(schema) do
    raise SchemaError,
      message: "boolean schema at #{path || "/"} in #{context.file} is not supported"
  end

  defp check_keywords(schema, instance, path, context) do
    []
    |> concat(type_violations(schema, instance, path))
    |> concat(const_violations(schema, instance, path))
    |> concat(enum_violations(schema, instance, path))
    |> concat(string_violations(schema, instance, path))
    |> concat(number_violations(schema, instance, path))
    |> concat(array_violations(schema, instance, path, context))
    |> concat(object_violations(schema, instance, path, context))
    |> concat(combinator_violations(schema, instance, path, context))
  end

  defp type_violations(%{"type" => expected}, instance, path) do
    expected = List.wrap(expected)

    if Enum.any?(expected, &matches_type?(instance, &1)) do
      []
    else
      [violation("type", path, Enum.join(expected, "|"))]
    end
  end

  defp type_violations(_schema, _instance, _path), do: []

  defp const_violations(%{"const" => const}, instance, path) do
    if instance == const, do: [], else: [violation("const", path, inspect(const))]
  end

  defp const_violations(_schema, _instance, _path), do: []

  defp enum_violations(%{"enum" => allowed}, instance, path) do
    if Enum.any?(allowed, &(&1 == instance)),
      do: [],
      else: [violation("enum", path, inspect(instance))]
  end

  defp enum_violations(_schema, _instance, _path), do: []

  defp string_violations(schema, instance, path) when is_binary(instance) do
    min = Map.get(schema, "minLength")
    max = Map.get(schema, "maxLength")
    pattern = Map.get(schema, "pattern")
    length = String.length(instance)

    []
    |> maybe_violation(is_integer(min) and length < min, "minLength", path, inspect(min))
    |> maybe_violation(is_integer(max) and length > max, "maxLength", path, inspect(max))
    |> maybe_violation(
      is_binary(pattern) and not Regex.match?(Regex.compile!(pattern), instance),
      "pattern",
      path,
      inspect(instance)
    )
  end

  defp string_violations(_schema, _instance, _path), do: []

  defp number_violations(schema, instance, path) when is_number(instance) do
    []
    |> maybe_violation(
      below?(instance, schema["minimum"], &Kernel.</2),
      "minimum",
      path,
      inspect(schema["minimum"])
    )
    |> maybe_violation(
      below?(instance, schema["maximum"], &Kernel.>/2),
      "maximum",
      path,
      inspect(schema["maximum"])
    )
    |> maybe_violation(
      below?(instance, schema["exclusiveMinimum"], &Kernel.<=/2),
      "exclusiveMinimum",
      path,
      inspect(schema["exclusiveMinimum"])
    )
    |> maybe_violation(
      below?(instance, schema["exclusiveMaximum"], &Kernel.>=/2),
      "exclusiveMaximum",
      path,
      inspect(schema["exclusiveMaximum"])
    )
  end

  defp number_violations(_schema, _instance, _path), do: []

  defp array_violations(schema, instance, path, context) when is_list(instance) do
    min = Map.get(schema, "minItems")
    max = Map.get(schema, "maxItems")

    []
    |> maybe_violation(is_integer(min) and length(instance) < min, "minItems", path, inspect(min))
    |> maybe_violation(is_integer(max) and length(instance) > max, "maxItems", path, inspect(max))
    |> maybe_violation(
      Map.get(schema, "uniqueItems") == true and Enum.uniq(instance) != instance,
      "uniqueItems",
      path,
      ""
    )
    |> concat(item_violations(Map.get(schema, "items"), instance, path, context))
  end

  defp array_violations(_schema, _instance, _path, _context), do: []

  defp item_violations(nil, _instance, _path, _context), do: []

  defp item_violations(schema, instance, path, context) when is_map(schema) do
    instance
    |> Enum.with_index()
    |> Enum.flat_map(fn {item, index} ->
      check(schema, item, path <> "/" <> Integer.to_string(index), context)
    end)
  end

  defp object_violations(schema, instance, path, context) when is_map(instance) do
    properties = Map.get(schema, "properties", %{})
    required = Map.get(schema, "required", [])

    missing_violations =
      required
      |> Enum.reject(&Map.has_key?(instance, &1))
      |> Enum.map(&violation("required", path, &1))

    property_violations =
      instance
      |> Enum.filter(fn {key, _value} -> Map.has_key?(properties, key) end)
      |> Enum.flat_map(fn {key, value} ->
        check(properties[key], value, path <> "/" <> key, context)
      end)

    missing_violations ++
      property_violations ++ additional_violations(schema, instance, properties, path, context)
  end

  defp object_violations(_schema, _instance, _path, _context), do: []

  defp additional_violations(schema, instance, properties, path, context) do
    case Map.get(schema, "additionalProperties", true) do
      false ->
        instance
        |> Map.keys()
        |> Enum.reject(&Map.has_key?(properties, &1))
        |> Enum.sort()
        |> Enum.map(&violation("additionalProperties", path, &1))

      subschema when is_map(subschema) ->
        instance
        |> Enum.reject(fn {key, _value} -> Map.has_key?(properties, key) end)
        |> Enum.flat_map(fn {key, value} ->
          check(subschema, value, path <> "/" <> key, context)
        end)

      _other ->
        []
    end
  end

  defp combinator_violations(schema, instance, path, context) do
    []
    |> concat(all_of_violations(schema, instance, path, context))
    |> concat(any_of_violations(schema, instance, path, context))
    |> concat(one_of_violations(schema, instance, path, context))
    |> concat(not_violations(schema, instance, path, context))
    |> concat(conditional_violations(schema, instance, path, context))
  end

  defp all_of_violations(%{"allOf" => branches}, instance, path, context) do
    Enum.flat_map(branches, &check(&1, instance, path, context))
  end

  defp all_of_violations(_schema, _instance, _path, _context), do: []

  defp any_of_violations(%{"anyOf" => branches}, instance, path, context) do
    if Enum.any?(branches, &(check(&1, instance, path, context) == [])) do
      []
    else
      [violation("anyOf", path, "no branch matched")]
    end
  end

  defp any_of_violations(_schema, _instance, _path, _context), do: []

  defp one_of_violations(%{"oneOf" => branches}, instance, path, context) do
    matched = Enum.count(branches, &(check(&1, instance, path, context) == []))

    if matched == 1 do
      []
    else
      [violation("oneOf", path, "#{matched} branches matched")]
    end
  end

  defp one_of_violations(_schema, _instance, _path, _context), do: []

  defp not_violations(%{"not" => subschema}, instance, path, context) do
    if check(subschema, instance, path, context) == [] do
      [violation("not", path, "instance matched a forbidden schema")]
    else
      []
    end
  end

  defp not_violations(_schema, _instance, _path, _context), do: []

  defp conditional_violations(%{"if" => if_schema} = schema, instance, path, context) do
    branch =
      if check(if_schema, instance, path, context) == [] do
        Map.get(schema, "then")
      else
        Map.get(schema, "else")
      end

    if is_map(branch), do: check(branch, instance, path, context), else: []
  end

  defp conditional_violations(_schema, _instance, _path, _context), do: []

  defp resolve_ref!(ref, context) do
    {file, pointer} =
      case String.split(ref, "#", parts: 2) do
        [file, pointer] -> {file, pointer}
        [file] -> {file, ""}
      end

    if file in ["", nil] do
      {fetch_pointer!(read_schema!(Path.join(context.dir, context.file)), pointer, ref), context}
    else
      path = Path.expand(Path.join(context.dir, file))

      {fetch_pointer!(read_schema!(path), pointer, ref),
       %{dir: Path.dirname(path), file: Path.basename(path)}}
    end
  end

  defp fetch_pointer!(schema, "", _ref), do: schema

  defp fetch_pointer!(schema, "/" <> _rest = pointer, ref) do
    pointer
    |> String.split("/")
    |> Enum.drop(1)
    |> Enum.map(&unescape_pointer_token/1)
    |> Enum.reduce(schema, &resolve_pointer_token!(&2, &1, ref))
  end

  defp fetch_pointer!(_schema, pointer, ref) do
    raise SchemaError, message: "invalid JSON Pointer #{inspect(pointer)} in $ref #{ref}"
  end

  defp resolve_pointer_token!(%{} = current, token, ref) do
    case Map.fetch(current, token) do
      {:ok, value} ->
        value

      :error ->
        raise SchemaError, message: "cannot resolve $ref #{ref}: missing #{inspect(token)}"
    end
  end

  defp resolve_pointer_token!(current, token, ref) when is_list(current) do
    with {index, ""} <- Integer.parse(token),
         value when not is_nil(value) <- Enum.at(current, index) do
      value
    else
      _other ->
        raise SchemaError, message: "cannot resolve $ref #{ref}: invalid index #{inspect(token)}"
    end
  end

  defp resolve_pointer_token!(_current, token, ref) do
    raise SchemaError, message: "cannot resolve $ref #{ref}: unexpected #{inspect(token)}"
  end

  defp unescape_pointer_token(token) do
    token |> String.replace("~1", "/") |> String.replace("~0", "~")
  end

  defp walk_schema!(schema, path, context) when is_map(schema) do
    ensure_supported!(schema, path, context)

    Enum.each(schema, fn {key, value} ->
      if key in @subschema_keys, do: walk_subschema_value!(key, value, path, context)
    end)
  end

  defp walk_subschema_value!(key, value, path, context) when key in ["$defs", "properties"] do
    Enum.each(value, fn {name, subschema} ->
      walk_schema!(subschema, path <> "/" <> key <> "/" <> name, context)
    end)
  end

  defp walk_subschema_value!(key, value, path, context) when key in ["allOf", "anyOf", "oneOf"] do
    Enum.with_index(value, fn subschema, index ->
      walk_schema!(subschema, path <> "/" <> key <> "/" <> Integer.to_string(index), context)
    end)
  end

  defp walk_subschema_value!(key, value, path, context)
       when key in ["items", "if", "then", "else", "not"] do
    walk_schema!(value, path <> "/" <> key, context)
  end

  defp walk_subschema_value!("additionalProperties", value, path, context) when is_map(value) do
    walk_schema!(value, path <> "/additionalProperties", context)
  end

  defp walk_subschema_value!(_key, _value, _path, _context), do: :ok

  defp ensure_supported!(schema, path, context) do
    unknown =
      schema
      |> Map.keys()
      |> Enum.reject(&(&1 in @annotations or &1 in @keywords))

    if unknown != [] do
      raise UnsupportedKeywordError,
        message:
          "unsupported JSON Schema keyword(s) #{inspect(Enum.sort(unknown))} at #{path || "/"} " <>
            "in #{context.file}: the v0 contract validates with a fixed keyword subset and refuses to ignore keywords"
    end
  end

  defp matches_type?(instance, "integer"), do: is_integer(instance)
  defp matches_type?(instance, "number"), do: is_number(instance)
  defp matches_type?(instance, "string"), do: is_binary(instance)
  defp matches_type?(instance, "boolean"), do: is_boolean(instance)
  defp matches_type?(instance, "object"), do: is_map(instance)
  defp matches_type?(instance, "array"), do: is_list(instance)
  defp matches_type?(instance, "null"), do: is_nil(instance)

  defp matches_type?(_instance, unknown_type) do
    raise SchemaError, message: "unsupported JSON Schema type #{inspect(unknown_type)}"
  end

  defp below?(_instance, nil, _comparison), do: false
  defp below?(instance, bound, comparison) when is_number(bound), do: comparison.(instance, bound)
  defp below?(_instance, _bound, _comparison), do: false

  defp violation(keyword, path, detail) do
    %{keyword: keyword, path: path || "", detail: detail}
  end

  defp concat(violations, more), do: violations ++ more

  defp maybe_violation(violations, true, keyword, path, detail),
    do: violations ++ [violation(keyword, path, detail)]

  defp maybe_violation(violations, false, _keyword, _path, _detail), do: violations
end
