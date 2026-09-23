defmodule LekishiWeb.AtlasController do
  use LekishiWeb, :controller

  @doc """
  Renders the atlas shell.

  Phoenix owns the route, the page, and the `#atlas-workspace` mount point.
  Everything inside the mount point belongs to the Svelte workspace, which is the
  single owner of atlas selection, time, and camera-follow state (RFD 3).

  The page is a plain controller response rather than a LiveView: the atlas does
  not need a server session, and hosting it in one would introduce a second owner
  for the state that must stay client-side.
  """
  def index(conn, _params) do
    render(conn, :index, page_title: "Atlas")
  end
end
