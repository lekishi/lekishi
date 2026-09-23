defmodule Lekishi.Historical.Contract.PublicationContractTest do
  @moduledoc """
  Runs the publication vectors and pins the correction-history rule that the
  vectors can only state as data: a published revision stays current until a set
  publishes its successor, and the history keeps both.
  """

  use ExUnit.Case, async: true

  alias Lekishi.Historical.Contract.{Canonical, Publication, Timestamps, Vectors}

  for vector <- Vectors.load("publication") do
    @vector vector

    test "vector #{vector["id"]}" do
      Vectors.run!(@vector)
    end
  end

  test "history keeps prior published revisions with their change explanations" do
    {documents, sets} =
      Vectors.build_tree(%{
        "documents" => [
          %{"source_id" => "lks:source:vector-a", "kind" => "scholarly"},
          %{
            "kind" => "event",
            "revisions" => [
              %{
                "content" => %{
                  "summary" => "First.",
                  "event_types" => ["occurrence"],
                  "time" => nil
                },
                "change_explanation" => "Initial account.",
                "claims" => [
                  %{
                    "claim_id" => "lks:claim:vector-1",
                    "statement" => "The source reports the event.",
                    "asserts" => "",
                    "basis" => "attested",
                    "role" => "main",
                    "citations" => [
                      %{
                        "source_id" => "lks:source:vector-a",
                        "locator" => %{"kind" => "page", "value" => "1"}
                      }
                    ]
                  }
                ]
              },
              %{
                "content" => %{
                  "summary" => "Corrected.",
                  "event_types" => ["occurrence"],
                  "time" => nil
                },
                "change_explanation" => "Corrected the year after reviewing the second source.",
                "claims" => [
                  %{
                    "claim_id" => "lks:claim:vector-2",
                    "statement" => "The source reports the corrected year.",
                    "asserts" => "",
                    "basis" => "attested",
                    "role" => "main",
                    "citations" => [
                      %{
                        "source_id" => "lks:source:vector-a",
                        "locator" => %{"kind" => "page", "value" => "2"}
                      }
                    ]
                  }
                ]
              }
            ]
          }
        ],
        "sets" => [
          %{
            "set_id" => "lks:set:vector-1",
            "members" => [
              %{"record_id" => "lks:event:vector-example", "revision_id" => "lks:rev:vector-1"}
            ],
            "published_at" => "2026-01-06T00:00:00Z"
          },
          %{
            "set_id" => "lks:set:vector-2",
            "members" => [
              %{"record_id" => "lks:event:vector-example", "revision_id" => "lks:rev:vector-2"}
            ],
            "published_at" => "2026-01-08T00:00:00Z",
            "correction_of_revision" => "lks:rev:vector-1"
          }
        ]
      })

    assert {:ok, _result} = Publication.check_all(documents, sets)
    records = Enum.filter(documents, &(&1["document"] == "record"))
    history = Publication.history(records, sets)

    assert [first, second] = history["lks:event:vector-example"]
    assert first["revision_id"] == "lks:rev:vector-1"
    assert first["change_explanation"] == "Initial account."
    assert second["revision_id"] == "lks:rev:vector-2"
    assert second["change_explanation"] == "Corrected the year after reviewing the second source."
    assert second["independence"] == "self_review"
    assert second["reviewer"] == "Vector Author"
  end

  defp cited_event_tree do
    Vectors.build_tree(%{
      "documents" => [
        %{
          "source_id" => "lks:source:vector-a",
          "kind" => "scholarly",
          "title" => "Approved title"
        },
        %{
          "kind" => "event",
          "published" => true,
          "content" => %{"summary" => "An event.", "event_types" => ["occurrence"], "time" => nil},
          "claims" => [
            %{
              "claim_id" => "lks:claim:vector-1",
              "statement" => "The source reports the event.",
              "asserts" => "",
              "basis" => "attested",
              "role" => "main",
              "citations" => [
                %{
                  "source_id" => "lks:source:vector-a",
                  "locator" => %{"kind" => "page", "value" => "2"}
                }
              ]
            }
          ]
        }
      ]
    })
  end

  test "a resealed source edit is still caught by the set pin" do
    {documents, sets} = cited_event_tree()
    assert {:ok, _result} = Publication.check_all(documents, sets)

    # Simulate an editor rewriting an approved source and resealing it: the
    # document's own hash is consistent again, so only the set pin can catch it.
    edited =
      Enum.map(documents, fn
        %{"document" => "source"} = source ->
          source
          |> Map.put("title", "Edited after approval")
          |> Map.update("license", %{}, &Map.put(&1, "attribution_text", "Edited attribution"))
          |> then(&Map.put(&1, "source_hash", Canonical.source_hash(&1)))

        document ->
          document
      end)

    assert {:error, errors} = Publication.check_all(edited, sets)
    codes = Enum.map(errors, & &1.code)
    assert "pinned_source_hash_mismatch" in codes
    refute "source_hash_mismatch" in codes
  end

  test "an invalid timestamp cannot win publication order" do
    refute Timestamps.valid?("2026-99-99T99:99:99Z")
    assert Timestamps.compare("2026-99-99T99:99:99Z", "2026-01-06T00:00:00Z") == :unknown
    assert Timestamps.valid?("2026-01-06T00:00:00Z")

    {documents, sets} =
      Vectors.build_tree(%{
        "documents" => [
          %{
            "kind" => "event",
            "revisions" => [
              %{
                "content" => %{
                  "summary" => "First.",
                  "event_types" => ["occurrence"],
                  "time" => nil
                }
              },
              %{
                "content" => %{
                  "summary" => "Second.",
                  "event_types" => ["occurrence"],
                  "time" => nil
                }
              }
            ]
          }
        ],
        "sets" => [
          %{
            "set_id" => "lks:set:vector-1",
            "members" => [
              %{"record_id" => "lks:event:vector-example", "revision_id" => "lks:rev:vector-1"}
            ],
            "sources" => [],
            "published_at" => "2026-01-06T00:00:00Z"
          },
          %{
            "set_id" => "lks:set:vector-2",
            "members" => [
              %{"record_id" => "lks:event:vector-example", "revision_id" => "lks:rev:vector-2"}
            ],
            "sources" => [],
            "published_at" => "2026-99-99T99:99:99Z"
          }
        ]
      })

    assert {:error, errors} = Publication.check_all(documents, sets)
    assert "invalid_timestamp" in Enum.map(errors, & &1.code)

    # String comparison would make the impossible timestamp the newest set; the
    # derived current revision must stay on the set that has a real timestamp.
    records = Enum.filter(documents, &(&1["document"] == "record"))
    current = Publication.current_published(records, sets)
    assert current["lks:event:vector-example"]["revision_id"] == "lks:rev:vector-1"
  end
end
