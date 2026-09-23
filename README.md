# Lekishi

An interactive historical atlas for exploring events and connections across
places and time. Product and architecture proposals live in the
[Requests for Discussion](rfd/README.adoc).

## Running the application

* `mix setup` installs Elixir dependencies, prepares the database, installs the
  frontend workspace, and builds browser assets.
* `mix phx.server` (or `make dev`) starts the server at
  [`localhost:4000`](http://localhost:4000). The Phoenix watchers run Tailwind
  and Vite, so frontend edits rebuild automatically.
* `make up` / `make down` control the local PostgreSQL instance used by
  `mix phx.server`.

The atlas workspace is served at `/atlas`; `/` remains the Phoenix home page.

## Frontend workspace: ownership boundary

The atlas is a Svelte-owned workspace hosted by a Phoenix page:

| Owner | Responsibility |
| --- | --- |
| Phoenix (`lib/lekishi_web`) | Routes, page shells, static asset serving, future content and editorial boundaries. `LekishiWeb.AtlasController` renders the `/atlas` shell and the `#atlas-workspace` mount point. |
| Atlas bootstrap (`assets/js/atlas/entry.ts`) | The only module that mounts the workspace. It loads as its own bundle (`/assets/js/atlas.js`) on the atlas page, keeps one workspace per page, and releases it on `pagehide` so a restored page gets exactly one workspace. |
| Svelte + TypeScript (`assets/js/atlas`) | Search, filters, drawers, timeline controls, selection, responsive layout, and the single source of truth for selection, time window, playhead, and camera-follow state (`state.ts`). |
| Cesium (`assets/js/atlas/renderer`) | Globe, camera, picking, and map primitives. It receives a derived, renderer-independent scene and reports user input back as callbacks. |
| Tailwind (`assets/css/app.css`) | All styling, including the Cesium widget stylesheet, so Phoenix still ships one CSS bundle. |

Rules that keep the boundary intact:

* Renderer objects never appear in historical data or state contracts. `domain.ts`
  and `state.ts` are plain data and pure functions; `scene.ts` is the only
  translation layer the renderer sees.
* The workspace is the only owner of selection, time, and camera-follow state.
  The renderer must not advance time or change selection by itself.
* One page has one workspace. The atlas bootstrap is a separate Vite entry rather
  than a chunk of the Phoenix bundle: Phoenix rewrites a script URL to its
  digested name while Vite's chunk imports reference an entry by its unhashed
  name, so an entry that a chunk imports is fetched and evaluated twice in
  production. `mix lekishi.assets.check` fails the build if a chunk imports an
  entry.
* RFD 2 owns the durable historical data, calendar, precision, and evidence
  contracts. `fixtures.ts` is explicitly synthetic placeholder content for the
  technical foundation and must be replaced by reviewed content, not grown.

### Development commands

| Command | Purpose |
| --- | --- |
| `make dev` | Phoenix with Tailwind + Vite watch builds (`vite build --watch --mode development`). |
| `mix assets.build` | Compile, then build production assets (Vite production build + Tailwind). |
| `mix assets.check` | Type-check (`svelte-check`) and unit-test (`vitest`) the frontend workspace. |
| `make release` | `MIX_ENV=prod mix assets.deploy`: minified Tailwind, Vite production build, `mix phx.digest`, then `mix lekishi.assets.check`. |
| `make check-release` | Build the release, serve it without the Vite dev server, and run the browser checks. |

Vite builds into `priv/static/assets` — the same paths Phoenix serves in
development and production — and copies the Cesium runtime (workers, textures,
widgets, third-party files) into `priv/static/cesium`. `window.CESIUM_BASE_URL`
points at `/cesium/`, which is why the same bundle works with or without a
digest step and never needs the Vite development server. `mix phx.digest`
digests both trees, and `mix lekishi.assets.check` fails the build if the
bundles, the runtime, or the digest manifest disagree.

The pinned Nix environment provides pnpm; `assets/package.json` pins the pnpm
version for CI. Vite is not used as a second dev server: there is one origin,
one static path, and no proxy or HMR layer that production does not have.

### Cesium without a provider account

The foundation uses only what ships with the CesiumJS package: Natural Earth II
imagery from `Assets/Textures/NaturalEarthII` and the ellipsoid terrain
provider. No Cesium ion account, token, or third-party provider is required, and
the renderer clears Cesium's bundled demo token and ion logo credit so that
accidental ion usage fails loudly. Attribution is shown in the workspace footer.
