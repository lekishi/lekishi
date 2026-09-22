defmodule Lekishi.Repo do
  use Ecto.Repo,
    otp_app: :lekishi,
    adapter: Ecto.Adapters.Postgres
end
