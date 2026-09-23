defmodule Lekishi.Historical.Contract.DocumentsContractTest do
  @moduledoc """
  Runs the record-document vectors, which cover renderer independence, claim
  evidence and pointers, attestation versus cited interpretation, visible
  disputes, reference resolution, and draft-only research notes.
  """

  use ExUnit.Case, async: true

  alias Lekishi.Historical.Contract.Vectors

  for vector <- Vectors.load("documents") do
    @vector vector

    test "vector #{vector["id"]}" do
      Vectors.run!(@vector)
    end
  end
end
