defmodule LekishiWeb.AtlasHTML do
  @moduledoc """
  Templates for the atlas shell.

  See the `atlas_html` directory for all templates available.
  """

  use LekishiWeb, :html

  embed_templates "atlas_html/*"
end
