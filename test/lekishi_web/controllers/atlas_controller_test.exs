defmodule LekishiWeb.AtlasControllerTest do
  use LekishiWeb.ConnCase

  test "GET /atlas renders an empty mount point and one workspace bundle", %{conn: conn} do
    document =
      conn
      |> get(~p"/atlas")
      |> html_response(200)
      |> LazyHTML.from_document()

    # The workspace is client-owned: Phoenix renders the mount point and leaves it
    # empty, and LiveView must not touch what Svelte owns inside it.
    assert [mount_point] = document |> LazyHTML.query("#atlas-workspace") |> Enum.to_list()
    assert LazyHTML.attribute(mount_point, "phx-update") == ["ignore"]
    assert mount_point |> LazyHTML.child_nodes() |> Enum.to_list() == []

    # One page loads one workspace bundle, from its own entry.
    assert document
           |> LazyHTML.query(~s(script[src="/assets/js/atlas.js"]))
           |> Enum.count() == 1

    # The atlas shell marks the page as the foundation, not the Phoenix home page.
    assert document
           |> LazyHTML.query("header a[href='/']")
           |> LazyHTML.text() =~ "Atlas foundation"
  end
end
