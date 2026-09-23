defmodule Lekishi.Historical.Contract.GeometryContractTest do
  @moduledoc """
  Runs the geometry vectors: what the evidence supports, what the atlas asserts,
  and the refusals to invent a radius, a confidence value, or a coordinate for an
  unknown placement.
  """

  use ExUnit.Case, async: true

  alias Lekishi.Historical.Contract.Vectors

  for vector <- Vectors.load("geometry") do
    @vector vector

    test "vector #{vector["id"]}" do
      Vectors.run!(@vector)
    end
  end
end
