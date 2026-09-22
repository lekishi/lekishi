defmodule LekishiWeb.PageController do
  use LekishiWeb, :controller

  def home(conn, _params) do
    render(conn, :home)
  end
end
