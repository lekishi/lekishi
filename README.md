# Lekishi

An interactive historical atlas for exploring events and connections across
places and time. Product and architecture proposals live in the
[Requests for Discussion](rfd/README.adoc).

## Architecture: a statically built SvelteKit site

The site is a SvelteKit project built with `@sveltejs/adapter-static`. Every route
is prerendered, so the deployable artifact is a directory of plain files with no
application server, no database, and no BEAM runtime:

| Owner                                                                                       | Responsibility                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| ------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| SvelteKit (`src/routes`)                                                                    | Routing, the prerendered page shells, and the `#atlas-workspace` mount point. `/` is the overview page; `/atlas` is the atlas shell.                                                                                                                                                                                                                                                                                                            |
| Atlas bootstrap (`src/lib/atlas/entry.ts`)                                                  | The only module that mounts the workspace. It keeps one workspace per page, releases it at the `pagehide` boundary, and restores exactly one on `pageshow`.                                                                                                                                                                                                                                                                                     |
| Svelte + TypeScript (`src/lib/atlas`)                                                       | Search, filters, drawers, timeline controls, selection, responsive layout, and the single source of truth for selection, time window, playhead, and camera-follow state (`state.ts`).                                                                                                                                                                                                                                                           |
| Chapter content (`src/lib/atlas/chapter-content.ts`, `chapter-catalog.ts`, `projection.ts`) | The browser-safe content boundary: Vite bundles the reviewed chapter's records and publication sets, the projection selects the newest published revision per record and takes the chapter's coverage window from its caller, and the atlas domain is what the workspace, scene, and renderer share. The comparison catalog loads non-production chapters (the Qin fixture) through the same projection without entering the production bundle. |
| Cesium (`src/lib/atlas/renderer`)                                                           | Globe, camera, picking, and map primitives. It receives a derived, renderer-independent scene and reports user input back as callbacks.                                                                                                                                                                                                                                                                                                         |
| Tailwind (`src/app.css`)                                                                    | All styling, including the Cesium widget stylesheet, so the site ships one stylesheet.                                                                                                                                                                                                                                                                                                                                                          |
| Historical contract (`historical/v0`, `src/lib/historical/contract`)                        | The versioned schemas, worked examples, and adversarial vectors, with the TypeScript reference semantics that validate them.                                                                                                                                                                                                                                                                                                                    |

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
  contracts. The browser never reads the content tree with Node `fs`: the
  chapter arrives through `chapter-content.ts`, `projection.ts` maps published
  revisions into `domain.ts`, and `fixtures.ts` is synthetic content that only
  focused unit tests import.

### Development commands

| Command                        | Purpose                                                                                                                |
| ------------------------------ | ---------------------------------------------------------------------------------------------------------------------- |
| `pnpm dev` (or `make dev`)     | Development server at [`localhost:5173`](http://localhost:5173).                                                       |
| `pnpm build` (or `make build`) | Build the static artifact into `build/` and run the build invariant.                                                   |
| `pnpm preview`                 | Serve `build/` with `scripts/serve-static.mjs`, a file-only server: clean URLs, a real 404 page, no SSR.               |
| `pnpm check`                   | `svelte-check` over the Svelte components and TypeScript.                                                              |
| `pnpm test`                    | Vitest: the atlas workspace unit tests and the whole historical contract suite, including all 187 adversarial vectors. |
| `pnpm lint` / `pnpm format`    | Prettier check / rewrite.                                                                                              |
| `pnpm e2e`                     | Browser checks against the built artifact (`LEKISHI_E2E_MODE=dev` runs them against the development server).           |
| `pnpm screenshots`             | Capture the desktop, tablet, and phone rendered states for review into `.amp/in/artifacts/`.                           |
| `pnpm verify`                  | Everything CI runs: format check, type check, tests, then the build with its invariant.                                |

`pnpm preview` serves the artifact with `scripts/serve-static.mjs`: a file-only
server rooted at `build/` with clean-URL handling (`/atlas` serves `atlas.html`;
`/atlas/` redirects to `/atlas`, because the page references its assets
relatively), the artifact's own `404.html` for anything else, a 400 for a
malformed request target, and no access to `.svelte-kit`, the module graph, or an
SSR runtime. That is what the browser checks run against, so the suite proves the
artifact is deployable as plain files rather than proving a preview server works.

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
  _redirects              explicit /atlas/ → /atlas redirect
  favicon.ico  robots.txt  images/
  _app/immutable/...      hashed JS and CSS
  cesium/                 Workers, Assets (Natural Earth II), Widgets, ThirdParty
```

`pnpm build` ends with `node scripts/check-static-build.mjs`, the build invariant
that replaced the old `mix lekishi.assets.check`: it fails the build if the
prerendered pages, the hashed bundles, the single stylesheet with the Cesium
widget styles, or the Cesium runtime directories are missing, if the atlas page
does not have exactly one mount point, if the artifact contains a server runtime,
if the built scripts or the prerendered pages do not carry the reviewed chapter,
if the retired synthetic fixture's sentinel strings reach the artifact, if the
comparison review page is missing or does not state that the bounded Qin fixture
is unapproved preparation, if the root page does not link that review route and
state the fixture's unapproved status and the reviewed chapter's recorded owner
approval, or if the production atlas page renders that fixture instead of the
reviewed chapter.

### Reviewed chapter content

The atlas renders the reviewed Tang chapter
(`historical/chapters/tang-mission-750-754/`) through one browser-safe boundary,
and that boundary is the only way chapter content enters the app:

1. `src/lib/historical/chapter.ts` is the Node-side loader. It reads the tree
   with `fs` and hands it to the contract's own `Publication.checkAll`; it is
   used by tests and tooling, never by the browser.
2. `scripts/check-chapter.mjs` runs before Vite in `pnpm build` and runs each
   chapter's contract test, the publication approval gate, the projection test
   suite, and the comparison catalog suite through Vitest, so an edited approved
   revision, a missing source pin, a set the ledger does not name, or a record
   published at a revision it does not carry fails the build. This is the
   validation gate: schemas, hashes, and pins need Node, so they cannot run in
   the bundle.
3. `src/lib/atlas/chapter-content.ts` bundles the same records and publication
   sets with Vite's `import.meta.glob`, so the browser reads the files the
   contract validates: no `fs`, no second copy, and no request a static host has
   to serve. The projection runs at module scope and **throws** if the chapter
   cannot be represented. The atlas route is prerendered, so that failure fails
   `pnpm build` instead of shipping placeholder content.
4. `src/lib/atlas/projection.ts` selects the newest published revision per
   record through the contract's own publication ordering — the same
   `currentPublished` the validator uses, split into `publication-order.ts` so
   the browser and Node share one rule — and maps it into the atlas domain. The
   chapter's coverage window (the window the atlas opens in) comes from the
   caller, so the comparison catalog can name the Qin fixture's window without a
   chapter branch in the projection.
5. `src/lib/atlas/chapter-catalog.ts` loads non-production chapters lazily for
   the comparison review route (`/compare/qin`), which renders the bounded Qin
   fixture through the same projection and states that it is unapproved
   preparation. The atlas route does not import the catalog, so the production
   page still bundles only the reviewed chapter, and the build invariant requires
   the review page while forbidding the fixture on the production page.

The bounded Qin comparison fixture
(`historical/chapters/qin-conquest-han-233-226/`) is source-checked content in
the same contract, recorded in the publication ledger as a preparation snapshot
rather than a release, and rendered only by the comparison review route
(`/compare/qin`), which labels it unapproved preparation. It stays
comparison-only until the treatment harness and the owner's decision exist.

What the projection refuses to do is part of the contract with the reader:

- An event keeps its whole support interval, and an event with no published map
  position (no place named, no sourced identification, or a place named only as
  context) stays in the non-map list with **no** coordinate.
- A place whose geometry is `unknown` carries no position; a `display_anchor`
  stays a display anchor and is never presented as an asserted location.
- The occurrence mode survives to the surfaces: a duration is active at the
  playhead, an uncertain occurrence window is only ever a possible match, and
  neither is presented as the other.
- A coda node is the chapter's own presentation label, cross-checked against the
  caller's primary window, so a coda node cannot be folded into the mission
  window and a mission event cannot drift out of it.
- Route geometry, an undated event, and an open-ended occurrence fail the
  projection rather than being flattened into points or guessed at. Those are
  documented gaps, not silent omissions.

The decisions and their measured evidence are recorded in
[`rfd/0003/CONTENT_BOUNDARY.adoc`](rfd/0003/CONTENT_BOUNDARY.adoc) for the Tang
chapter's boundary and
[`rfd/0003/COMPARISON_FIXTURE_BOUNDARY.adoc`](rfd/0003/COMPARISON_FIXTURE_BOUNDARY.adoc)
for the comparison fixture and the caller-supplied coverage window.

### Cloudflare Pages

The site is deployed from the `main` branch at <https://lekishi.pages.dev>.

- Build command: `pnpm build`
- Output directory: `build`
- Node version: 24 (see `engines` in `package.json` and `.github/workflows/ci.yml`)
- Environment variables: none

Cloudflare Pages resolves `/atlas` to `atlas.html` with its default clean-URL
behavior. `static/_redirects` only normalizes `/atlas/` to `/atlas`; rewriting
`/atlas` to `/atlas.html` would loop because Pages redirects the file back to its
clean URL. A path that is not in the artifact is answered from `404.html`, which
static hosts serve by convention.

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
`src/lib/historical/contract` (`time`, `documents`, `publication`,
`publication-order`, `canonical`, `json-schema`, `names`, `timestamps`,
`vectors`, `seal`). They were ported from the Elixir implementation that the
Phoenix runtime used; the schemas, examples, pins, and all 187 vectors are
unchanged, and `pnpm test` runs every vector.

```bash
pnpm test    # validates the examples, the schemas, the pins, and every vector
pnpm seal    # recomputes the example hashes after editing content
```
