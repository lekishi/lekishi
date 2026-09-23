defmodule Lekishi.Historical.Contract.NamesContractTest do
  @moduledoc """
  Runs the naming vectors. The label derivation and the script checks are the two
  places where a plausible wrong interpretation (a romanization presented as the
  local form, or a modern name presented as the historical label) would otherwise
  pass silently.
  """

  use ExUnit.Case, async: true

  alias Lekishi.Historical.Contract.Vectors

  for vector <- Vectors.load("names") do
    @vector vector

    test "vector #{vector["id"]}" do
      Vectors.run!(@vector)
    end
  end
end
