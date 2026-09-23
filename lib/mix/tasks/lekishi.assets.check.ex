defmodule Mix.Tasks.Lekishi.Assets.Check do
  @shortdoc "Verifies the built frontend and Cesium assets for a release"

  @moduledoc """
  Verifies the production frontend artifact before it is served or released.

  Phoenix serves the atlas from `priv/static` without the Vite development
  server, so a release is only correct if the Vite bundle, the Cesium runtime
  (workers, textures, widget styles), and the digest manifest all agree. Run it
  after `mix assets.deploy`:

      mix lekishi.assets.check

  The task fails with the specific missing entries instead of letting a release
  ship a globe that cannot load its workers or textures.
  """

  use Mix.Task

  @required_files [
    "priv/static/assets/js/app.js",
    "priv/static/assets/js/atlas.js",
    "priv/static/assets/css/app.css",
    "priv/static/cesium/Widgets/widgets.css",
    "priv/static/cesium/Assets/Textures/NaturalEarthII/tilemapresource.xml"
  ]

  @required_digest_entries [
    "assets/js/app.js",
    "assets/js/atlas.js",
    "assets/css/app.css",
    "cesium/Widgets/widgets.css",
    "cesium/Assets/Textures/NaturalEarthII/tilemapresource.xml"
  ]

  # Vite entry file names, kept unhashed because `mix phx.digest` owns their
  # content-addressed names.
  @entry_files ["app.js", "atlas.js"]

  @impl Mix.Task
  def run(_args) do
    problems =
      missing_files() ++
        missing_worker_files() ++
        missing_cesium_bundle_reference() ++
        missing_widget_styles() ++
        digest_problems() ++
        entry_import_problems()

    case problems do
      [] ->
        Mix.shell().info("""
        Lekishi asset check passed.
          - Vite bundles (Phoenix and atlas) and the Tailwind stylesheet are present.
          - No chunk imports a Vite entry by its unhashed name, so no entry can be
            loaded twice under a digested and an undigested URL.
          - Cesium runtime (workers, assets, widgets) is present under priv/static/cesium.
          - Digest manifest covers the app bundles and the Cesium runtime.
        """)

      _ ->
        Mix.raise("""
        Lekishi asset check failed:

        #{Enum.map_join(problems, "\n", &"  - #{&1}")}

        Run "mix assets.deploy" (production assets + digest) and try again.
        """)
    end
  end

  defp missing_files do
    Enum.flat_map(@required_files, fn path ->
      if File.exists?(path), do: [], else: ["missing built asset #{path}"]
    end)
  end

  defp missing_worker_files do
    case Path.wildcard("priv/static/cesium/Workers/*.js") do
      [] -> ["no Cesium workers found under priv/static/cesium/Workers"]
      _ -> []
    end
  end

  # The bundled atlas must point Cesium at the copied runtime directory; if this
  # string is missing, the renderer would resolve workers against the JS bundle.
  defp missing_cesium_bundle_reference do
    bundled =
      "priv/static/assets/js/*.js"
      |> Path.wildcard()
      |> Enum.any?(fn path ->
        contents = File.read!(path)
        String.contains?(contents, "CESIUM_BASE_URL") and String.contains?(contents, "/cesium/")
      end)

    if bundled, do: [], else: ["no built JS bundle references CESIUM_BASE_URL with /cesium/"]
  end

  defp missing_widget_styles do
    contents = File.read!("priv/static/assets/css/app.css")

    if String.contains?(contents, ".cesium-viewer") do
      []
    else
      ["assets/css/app.css does not contain the Cesium widget styles"]
    end
  end

  # An entry that a chunk imports is loaded twice in production: Phoenix rewrites
  # the page's script URL to the digested file name, while the chunk import keeps
  # the unhashed name, so the browser treats them as two modules and evaluates the
  # entry body twice. Keep every entry a root of its own page.
  defp entry_import_problems do
    for path <- Path.wildcard("priv/static/assets/js/*.js"),
        name = Path.basename(path),
        entry <- @entry_files,
        entry != name,
        imported_by_chunk?(File.read!(path), entry) do
      "#{name} imports entry #{entry} by its unhashed name; the entry would be " <>
        "evaluated twice in production. Load the entry from its own page instead."
    end
  end

  defp imported_by_chunk?(contents, entry) do
    # `from"./app.js"` (a static import), `import("./app.js")` (a dynamic one), and
    # `import"./app.js"` (a side-effect one).
    Regex.match?(~r/(?:from|import\s*\(?)\s*["']\.\/#{Regex.escape(entry)}["']/, contents)
  end

  defp digest_problems do
    manifest_path = "priv/static/cache_manifest.json"

    if File.exists?(manifest_path) do
      digest_manifest_problems(manifest_path)
    else
      ["missing #{manifest_path}; run \"mix assets.deploy\" so assets are digested"]
    end
  end

  defp digest_manifest_problems(manifest_path) do
    manifest = manifest_path |> File.read!() |> Jason.decode!()
    # Phoenix records logical paths in "latest" and digested metadata in
    # "digests"; both are needed for Plug.Static's production cache behavior.
    latest = Map.get(manifest, "latest", %{})
    digests = Map.get(manifest, "digests", %{})

    missing_entries =
      @required_digest_entries
      |> Enum.reject(&Map.has_key?(latest, &1))
      |> Enum.map(&"digest manifest has no entry for #{&1}")

    missing_entries ++ missing_worker_digest(latest) ++ missing_digested_files(latest, digests)
  end

  defp missing_worker_digest(latest) do
    digested? =
      latest
      |> Map.keys()
      |> Enum.any?(&String.starts_with?(&1, "cesium/Workers/"))

    if digested?, do: [], else: ["digest manifest has no Cesium worker entry"]
  end

  defp missing_digested_files(latest, digests) do
    latest
    |> Enum.filter(fn {entry, _digested} ->
      Enum.any?(@required_digest_entries, &(&1 == entry)) or
        String.starts_with?(entry, "cesium/Workers/")
    end)
    |> Enum.flat_map(fn {entry, digested} ->
      problems = []

      problems =
        if File.exists?(Path.join("priv/static", digested)) do
          problems
        else
          problems ++ ["digested file priv/static/#{digested} for #{entry} is missing"]
        end

      if Map.has_key?(digests, digested) do
        problems
      else
        problems ++ ["digest manifest metadata is missing for #{digested}"]
      end
    end)
  end
end
