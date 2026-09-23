# Lekishi

An interactive historical atlas for exploring events and connections across
places and time. Product and architecture proposals live in the
[Requests for Discussion](rfd/README.adoc).

## Architecture: a statically built SvelteKit site

The site is a SvelteKit project built with `@sveltejs/adapter-static`. Every route
is prerendered, so the deployable artifact is a directory of plain files with no
application server, no database, and no BEAM runtime:

| Owner                                                                | Responsibility                                                                                                                                                                        |
| -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| SvelteKit (`src/routes`)                                             | Routing, the prerendered page shells, and the `#atlas-workspace` mount point. `/` is the overview page; `/atlas` is the atlas shell.                                                  |
| Atlas bootstrap (`src/lib/atlas/entry.ts`)                           | The only module that mounts the workspace. It keeps one workspace per page, releases it at the `pagehide` boundary, and restores exactly one on `pageshow`.                           |
| Svelte + TypeScript (`src/lib/atlas`)                                | Search, filters, drawers, timeline controls, selection, responsive layout, and the single source of truth for selection, time window, playhead, and camera-follow state (`state.ts`). |
| Cesium (`src/lib/atlas/renderer`)                                    | Globe, camera, picking, and map primitives. It receives a derived, renderer-independent scene and reports user input back as callbacks.                                               |
| Tailwind (`src/app.css`)                                             | All styling, including the Cesium widget stylesheet, so the site ships one stylesheet.                                                                                                |
| Historical contract (`historical/v0`, `src/lib/historical/contract`) | The versioned schemas, worked examples, and adversarial vectors, with the TypeScript reference semantics that validate them.                                                          |

Rules that keep the boundary intact:

- Renderer objects never appear in historical data or state contracts. `domain.ts`
  and `state.ts` are plain data and pure functions; `scene.ts` is the only
  translation layer the renderer sees.
- The workspace is the only owner of selection, time, and camera-follow state.
  The renderer must not advance time or change selection by itself.
- One page has one workspace. Mounting is guarded in `entry.ts`, and the route
  releases the workspace when it is destroyed, so a duplicated bundle, a re-run,
  or a back/forward-cache restore cannot stack a second globe.
- RFD 2 owns the durable historical data, calendar, precision, and evidence
  contracts. `fixtures.ts` is explicitly synthetic placeholder content for the
  technical foundation and must be replaced by reviewed content, not grown.

### Development commands

| Command                        | Purpose                                                                                                                |
| ------------------------------ | ---------------------------------------------------------------------------------------------------------------------- |
| `pnpm dev` (or `make dev`)     | Development server at [`localhost:5173`](http://localhost:5173).                                                       |
| `pnpm build` (or `make build`) | Build the static artifact into `build/` and run the build invariant.                                                   |
| `pnpm preview`                 | Serve `build/` as a static host would, including extension-less `/atlas`.                                              |
| `pnpm check`                   | `svelte-check` over the Svelte components and TypeScript.                                                              |
| `pnpm test`                    | Vitest: the atlas workspace unit tests and the whole historical contract suite, including all 187 adversarial vectors. |
| `pnpm lint` / `pnpm format`    | Prettier check / rewrite.                                                                                              |
| `pnpm e2e`                     | Browser checks against the built artifact (`LEKISHI_E2E_MODE=dev` runs them against the development server).           |
| `pnpm screenshots`             | Capture the desktop, tablet, and phone rendered states for review into `.amp/in/artifacts/`.                           |
| `pnpm verify`                  | Everything CI runs: format check, type check, tests, then the build with its invariant.                                |

`pnpm dev` and `pnpm build` first run `pnpm sync:cesium`, which copies the Cesium
runtime (Workers, Assets, Widgets, ThirdParty) from the npm package into
`static/cesium`. SvelteKit copies everything under `static/` into the build
unchanged, and `window.CESIUM_BASE_URL` points at `/cesium/`, so the same paths
work in development and in the deployed artifact.

### The deployable artifact

```
build/
  index.html              prerendered overview page
  atlas.html              prerendered atlas shell (direct /atlas loads)
  404.html                fallback for a path that is not in the artifact
  _redirects              explicit /atlas → /atlas.html rewrite for static hosts
  favicon.ico  robots.txt  images/
  _app/immutable/...      hashed JS and CSS
  cesium/                 Workers, Assets (Natural Earth II), Widgets, ThirdParty
```

`pnpm build` ends with `node scripts/check-static-build.mjs`, the build invariant
that replaced the old `mix lekishi.assets.check`: it fails the build if the
prerendered pages, the hashed bundles, the single stylesheet with the Cesium
widget styles, or the Cesium runtime directories are missing, if the atlas page
does not have exactly one mount point, or if the artifact contains a server
runtime.

### Cloudflare Pages readiness (step 3, not done here)

The artifact is ready to be connected to a static host; no project, account,
domain, secret, or deployment exists yet, and creating them is a separate,
owner-authorized step.

- Build command: `pnpm build`
- Output directory: `build`
- Node version: 24 (see `engines` in `package.json` and `.github/workflows/ci.yml`)
- Environment variables: none

Cloudflare Pages resolves `/atlas` to `atlas.html` with its default clean-URL
behavior, and `static/_redirects` states that rewrite explicitly. A path that is
not in the artifact is answered from `404.html`, which static hosts serve by
convention.

### Cesium without a provider account

The foundation uses only what ships with the CesiumJS package: Natural Earth II
imagery from `Assets/Textures/NaturalEarthII` and the ellipsoid terrain provider.
No Cesium ion account, token, or third-party provider is required, and the
renderer clears Cesium's bundled demo token and ion logo credit so that
accidental ion usage fails loudly. Attribution is shown in the workspace footer
(from the `lg` breakpoint) and on the overview page at every width.

## Historical contract

`historical/v0` holds the renderer-independent contract the first chapter
depends on: JSON Schema documents, a synthetic example content tree, and the
machine-readable boundary vectors. Its rationale and open owner decisions are in
[`rfd/0002/CONTRACTS.adoc`](rfd/0002/CONTRACTS.adoc); the directory's own
[README](historical/README.md) covers layout, validation, and resealing.

The reference semantics that validate the contract are TypeScript modules under
`src/lib/historical/contract` (`time`, `documents`, `publication`, `canonical`,
`json-schema`, `names`, `timestamps`, `vectors`, `seal`). They were ported from
the Elixir implementation that the Phoenix runtime used; the schemas, examples,
pins, and all 187 vectors are unchanged, and `pnpm test` runs every vector.

```bash
pnpm test    # validates the examples, the schemas, the pins, and every vector
pnpm seal    # recomputes the example hashes after editing content
```
