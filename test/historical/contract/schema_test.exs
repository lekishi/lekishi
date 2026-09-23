defmodule Lekishi.Historical.Contract.SchemaTest do
  @moduledoc """
  Tests for the JSON Schema subset validator that the contract relies on.

  The validator is load-bearing: if it silently ignored a keyword, the contract
  tests would pass while the schema said nothing. These tests pin the subset
  behaviour and the loud-failure rule.
  """

  use ExUnit.Case, async: true

  alias Lekishi.Historical.Contract.{Documents, JSONSchema}

  @schema_dir Path.expand("../../../priv/historical/v0/schema", __DIR__)

  defp schema_path(name), do: Path.join(@schema_dir, name)

  defp write_schema!(name, schema) do
    dir =
      Path.join(
        System.tmp_dir!(),
        "lekishi-contract-schema-#{System.unique_integer([:positive])}"
      )

    File.mkdir_p!(dir)
    path = Path.join(dir, name)
    File.write!(path, Jason.encode!(schema))
    on_exit(fn -> File.rm_rf!(dir) end)
    path
  end

  test "every contract schema uses only supported keywords" do
    for path <- Path.wildcard(Path.join(@schema_dir, "*.json")) do
      assert :ok = JSONSchema.check_schema!(path),
             "#{Path.basename(path)} uses an unsupported keyword"
    end
  end

  test "record schema resolves its cross-file refs" do
    document = %{
      "contract" => "lekishi-historical-contract/v0",
      "document" => "record",
      "kind" => "place",
      "record_id" => "lks:place:example",
      "revisions" => [],
      "publication" => nil
    }

    assert {:error, violations} = JSONSchema.validate(schema_path("record.schema.json"), document)
    assert Enum.any?(violations, &(&1.keyword == "minItems"))
  end

  test "unknown keywords raise instead of being ignored" do
    path =
      write_schema!("strict.schema.json", %{
        "type" => "object",
        "propertiez" => %{"name" => %{"type" => "string"}}
      })

    assert_raise JSONSchema.UnsupportedKeywordError, ~r/propertiez/, fn ->
      JSONSchema.validate(path, %{"name" => 1})
    end
  end

  test "type, required, and additionalProperties are enforced" do
    path =
      write_schema!("object.schema.json", %{
        "type" => "object",
        "required" => ["name"],
        "additionalProperties" => false,
        "properties" => %{"name" => %{"type" => "string"}, "count" => %{"type" => "integer"}}
      })

    assert {:ok, []} = JSONSchema.validate(path, %{"name" => "a", "count" => 2})
    assert {:error, violations} = JSONSchema.validate(path, %{"count" => "two", "extra" => true})

    keywords = violations |> Enum.map(& &1.keyword) |> Enum.sort()
    assert keywords == ["additionalProperties", "required", "type"]
  end

  test "enum, const, and pattern are enforced" do
    path =
      write_schema!("values.schema.json", %{
        "type" => "object",
        "additionalProperties" => false,
        "properties" => %{
          "mode" => %{"enum" => ["a", "b"]},
          "document" => %{"const" => "record"},
          "id" => %{"pattern" => "^lks:[a-z]+$"}
        }
      })

    assert {:ok, []} =
             JSONSchema.validate(path, %{
               "mode" => "a",
               "document" => "record",
               "id" => "lks:place"
             })

    assert {:error, violations} =
             JSONSchema.validate(path, %{"mode" => "c", "document" => "source", "id" => "PLACE"})

    assert violations |> Enum.map(& &1.keyword) |> Enum.sort() == ["const", "enum", "pattern"]
  end

  test "array constraints are enforced" do
    path =
      write_schema!("array.schema.json", %{
        "type" => "array",
        "minItems" => 1,
        "maxItems" => 2,
        "uniqueItems" => true,
        "items" => %{"type" => "string"}
      })

    assert {:ok, []} = JSONSchema.validate(path, ["a"])
    assert {:ok, []} = JSONSchema.validate(path, ["a", "b"])
    assert {:error, violations} = JSONSchema.validate(path, ["a", "a", 1])

    assert Enum.map(violations, & &1.keyword) |> Enum.sort() == [
             "maxItems",
             "type",
             "uniqueItems"
           ]
  end

  test "anyOf, oneOf, not, and if/then are enforced" do
    path =
      write_schema!("combinators.schema.json", %{
        "type" => "object",
        "properties" => %{
          "kind" => %{"enum" => ["place", "event"]},
          "geometry" => %{"anyOf" => [%{"type" => "null"}, %{"type" => "object"}]}
        },
        "allOf" => [
          %{
            "if" => %{"properties" => %{"kind" => %{"const" => "event"}}},
            "then" => %{"required" => ["geometry"]}
          },
          %{"not" => %{"required" => ["forbidden"]}}
        ]
      })

    assert {:ok, []} = JSONSchema.validate(path, %{"kind" => "event", "geometry" => nil})
    assert {:ok, []} = JSONSchema.validate(path, %{"kind" => "place"})
    assert {:error, violations} = JSONSchema.validate(path, %{"kind" => "event", "geometry" => 1})
    assert Enum.any?(violations, &(&1.keyword == "anyOf"))

    assert {:error, violations} =
             JSONSchema.validate(path, %{"kind" => "place", "forbidden" => true})

    assert Enum.any?(violations, &(&1.keyword == "not"))
  end

  test "the record schema rejects a renderer key inside content" do
    document = %{
      "contract" => "lekishi-historical-contract/v0",
      "document" => "record",
      "kind" => "place",
      "record_id" => "lks:place:example",
      "created_at" => "2026-01-01T00:00:00Z",
      "revisions" => [
        %{
          "revision_id" => "lks:rev:example-1",
          "created_at" => "2026-01-01T00:00:00Z",
          "author" => %{"name" => "Contract example"},
          "change_explanation" => "example",
          "content" => %{
            "summary" => "s",
            "names" => [],
            "place_types" => ["settlement"],
            "geometry" => [],
            "color" => "#fff"
          },
          "claims" => [],
          "revision_hash" =>
            "sha256:0000000000000000000000000000000000000000000000000000000000000001"
        }
      ],
      "publication" => nil
    }

    assert {:error, violations} = JSONSchema.validate(schema_path("record.schema.json"), document)
    assert Enum.any?(violations, &(&1.keyword == "additionalProperties" and &1.detail == "color"))

    assert {:error, errors} = Documents.validate(document)
    assert Enum.any?(errors, &(&1.code == "presentation_field_in_content"))
  end

  test "the contract version is pinned in the schemas and the vectors" do
    common = JSONSchema.read_schema!(schema_path("common.schema.json"))
    assert get_in(common, ["$defs", "contract", "const"]) == "lekishi-historical-contract/v0"

    for name <- Lekishi.Historical.Contract.Vectors.names() do
      path = Path.expand("../../../priv/historical/v0/vectors/#{name}.json", __DIR__)

      assert path |> File.read!() |> Jason.decode!() |> Map.fetch!("contract") ==
               "lekishi-historical-contract/v0"
    end
  end
end
