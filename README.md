# Lekishi

An interactive historical atlas for exploring events and connections across
places and time. Product and architecture proposals live in the
[Requests for Discussion](rfd/README.adoc).

## Architecture: a statically built SvelteKit site

The site is a SvelteKit project built with `@sveltejs/adapter-cloudflare`. Every
public route is prerendered, so what a reader gets is a directory of plain files
with no application server, no database, and no BEAM runtime. A small Cloudflare
Pages worker answers only sign-in and the drafts that signed-in members of the
`lekishi` organization may open ([RFD 6](rfd/0006/README.adoc)):

| Owner                                                                                       | Responsibility                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| ------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| SvelteKit (`src/routes`)                                                                    | Routing, the prerendered page shells, and the `#atlas-workspace` mount point. `/` is the overview page; `/atlas` is the atlas shell.                                                                                                                                                                                                                                                                                                            |
| Atlas bootstrap (`src/lib/atlas/entry.ts`)                                                  | The only module that mounts the workspace. It keeps one workspace per page, releases it at the `pagehide` boundary, and restores exactly one on `pageshow`.                                                                                                                                                                                                                                                                                     |
| Svelte + TypeScript (`src/lib/atlas`)                                                       | Search, filters, drawers, timeline controls, selection, responsive layout, and the single source of truth for selection, time window, playhead, and camera-follow state (`state.ts`).                                                                                                                                                                                                                                                           |
| Chapter content (`src/lib/atlas/chapter-content.ts`, `chapter-catalog.ts`, `projection.ts`) | The browser-safe content boundary: Vite bundles the reviewed chapter's records and publication sets, the projection selects the newest published revision per record and takes the chapter's coverage window from its caller, and the atlas domain is what the workspace, scene, and renderer share. The comparison catalog loads non-production chapters (the Qin fixture) through the same projection without entering the production bundle. |
| Globe (`src/lib/atlas/renderer`)                                                            | A custom Three.js globe: tiles, camera, picking, markers, and labels. It receives a derived, renderer-independent scene and reports user input back as callbacks.                                                                                                                                                                                                                                                                               |
| Tailwind (`src/app.css`)                                                                    | All styling, including the globe's markers and labels, so the site ships one stylesheet.                                                                                                                                                                                                                                                                                                                                                        |
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

The full browser suite runs in Chromium and WebKit at desktop, tablet-touch,
and phone sizes, and in Firefox on desktop. No engine uses a smoke-only filter.
Install all three engines with
`pnpm exec playwright install --with-deps chromium webkit firefox`.
On headless Linux, run `xvfb-run -a pnpm e2e` so Firefox can create its software
WebGL context. Select a project with, for example, `--project=desktop-webkit` or
`--project=desktop-firefox`. These checks do not replace physical-iPad Safari or
physical-trackpad acceptance.

`pnpm preview` serves the artifact with `scripts/serve-static.mjs`: a file-only
server rooted at `build/` with clean-URL handling (`/atlas` serves `atlas.html`;
`/atlas/` redirects to `/atlas`, because the page references its assets
relatively), the artifact's own `404.html` for anything else, a 400 for a
malformed request target, and no access to `.svelte-kit`, the module graph, or an
SSR runtime. That is what the browser checks run against, so the suite proves the
artifact is deployable as plain files rather than proving a preview server works.

`pnpm dev` and `pnpm build` first run `pnpm sync:globe`, which builds the
globe's tiles into `static/globe` with `scripts/globe/build-tiles.py` (Python 3
with numpy and Pillow; a private virtual environment under `.cache/globe` is
created when the system Python lacks them). The first build fetches open
elevation into `.cache/globe` and paints every tile, which takes a few minutes;
later runs skip the build while `scripts/globe/` is unchanged. SvelteKit copies
everything under `static/` into the build unchanged, so the same `/globe/` paths
work in development and in the deployed artifact.

The pinned `nix develop` environment includes Python, numpy and Pillow, so it
does not need the fallback virtual environment. On an existing Cesium checkout,
the sync step also removes the retired generated `static/cesium` runtime before
building; no manual migration cleanup is needed.

### The deployable artifact

```
build/
  index.html              prerendered overview page
  atlas.html              prerendered atlas shell (direct /atlas loads)
  404.html                fallback for a path that is not in the artifact
  _redirects              explicit /atlas/ → /atlas redirect
  favicon.ico  robots.txt  images/
  _app/immutable/...      hashed JS and CSS
  _app/immutable/workers/ the globe's tile worker
  globe/                  tileset.json, tile bundles (b/), ATTRIBUTION.txt
```

`pnpm build` ends with `node scripts/check-static-build.mjs`, the build invariant
that replaced the old `mix lekishi.assets.check`: it fails the build if the
prerendered pages, the hashed bundles, the single stylesheet, the globe's tile
worker, its tileset, bundles, or attribution are missing, if the artifact holds
more files than the static host accepts, if the atlas page
does not have exactly one mount point, if the artifact contains a server runtime,
if the built scripts or the prerendered pages do not carry the reviewed chapter,
if the retired synthetic fixture's sentinel strings reach the artifact, if the Qin
chapter's page is missing or does not state that it is unapproved preparation, if
the root page does not link both chapter entries or drops the Tang chapter's
recorded owner approval or carries the project's own framing where a reader meets
a chapter (a review category, `comparison harness`, the harness's `map treatments`
phrase, or the contract id), or if the production atlas page renders the Qin
chapter instead of the Tang one.

### Reviewed chapter content

The atlas renders two chapters, the Tang mission of 750–754 and the bounded Qin
episode of 233–226 BCE. Their content is authored as YAML record files under
`historical/` (see [`historical/README.md`](historical/README.md)), and one
path takes it into the app:

1. `src/lib/historical/authoring/` compiles the record files into complete
   `lekishi-historical-contract/v0` documents: a chapter manifest's story,
   everything it reaches, one generated revision per record, and a publication
   set when the owner's approval in the manifest matches the content's digest.
2. `scripts/check-chapter.mjs` runs before Vite in `pnpm build` and runs each
   chapter's contract test, the publication approval gate, and the projection
   and catalog suites through Vitest, so a stale approval or content the
   contract refuses fails the build. Schemas and hashes need Node, so this
   validation cannot run in the bundle; `src/lib/historical/chapter.ts` is the
   Node-side loader the tests use.
3. A Vite plugin (`scripts/historical-chapters.mjs`) compiles the
   same bundles at build time and serves each approved chapter as one lazily
   loaded chunk, so the browser reads exactly what the contract validated, with
   no `fs`, no generated files on disk, and no request a static host has to
   serve. A draft is listed but not served, except by development and
   pull-request previews, which serve it under a draft banner.
4. `src/lib/atlas/projection.ts` selects the newest published revision per
   record through the contract's own publication ordering and maps it into the
   atlas domain; `src/lib/atlas/chapter-catalog.ts` is the one loader every
   chapter page uses, with the window its manifest writes. The chapter route is
   prerendered, so content the projection cannot represent fails `pnpm build`
   instead of shipping placeholder content.

The root page presents the served chapters as peer cards (name, window, and
summary from each manifest) from `src/lib/atlas/chapters.ts`; each card carries
its chapter's approval as secondary metadata, and `/compare/qin`, the Qin
chapter's old review route, redirects to its chapter page.

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
- Output directory: `build` (set by `pages_build_output_dir` in `wrangler.jsonc`)
- Node version: 24 (see `engines` in `package.json` and `.github/workflows/ci.yml`)
- Secrets, Production only: `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET` and
  `SESSION_SECRET`, for members' sign-in. Without them sign-in answers 503 and
  the published site serves approved chapters only. See
  [docs/members-sign-in.md](docs/members-sign-in.md).

`build/_routes.json` sends the worker `/chapters/*`, `/auth/*` and `/drafts*`
only, and excludes every prerendered page by name, so a reader's request is a
file and never a worker invocation.

Preview builds (any branch but `main`) also run
`spikes/renderer/globe/preview-build.mjs`, which adds the renderer spike's
custom globe under `/spikes/` for testing on devices; it generates that page's
tiles from open data during the build. Production builds skip it.

Cloudflare Pages resolves `/atlas` to `atlas.html` with its default clean-URL
behavior. `_redirects` (at the repository root, where the adapter reads it)
only normalizes `/atlas/` to `/atlas`; rewriting
`/atlas` to `/atlas.html` would loop because Pages redirects the file back to its
clean URL. A path that is not in the artifact is answered from `404.html`, which
static hosts serve by convention; a chapter address the artifact does not
carry reaches the worker, which renders the same not-found page.

### A globe without a provider account

The globe draws only tiles the artifact ships: elevation from the Terrain Tiles
on AWS Open Data (Mapzen and contributors), and imagery painted from that
elevation with the Natural Earth II hue, at levels 0–5 worldwide and 6–7 over
the Tang chapter's extent. Four sibling tiles share one bundle, so the artifact
carries about 810 tile files. No tile service, account, token, or third-party
provider is required. Attribution is shown in the workspace footer
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
