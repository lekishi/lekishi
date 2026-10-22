# Lekishi agent guidance

Lekishi is a historical atlas for exploring events and relationships across
places and time. This repository contains a statically built SvelteKit site: the
deployable artifact is prerendered HTML, hashed JS/CSS, the globe's tile worker,
and its generated tile bundles in `build/`, with no application server, database,
or BEAM runtime.

Project workflow conventions are adapted from
[Lecinote's AGENTS.md](https://github.com/chaba-dev/lecinote/blob/main/AGENTS.md).
This file is the local authority: do not assume Lecinote's authentication,
helper scripts, or application features exist here. Preserve the static-site
rules below when updating project-specific guidance.

## Product and design records

- Read the relevant [RFDs](rfd/README.adoc) before changing product or architecture behavior. Respect each document's state; drafts are proposals, not implemented features or final stack decisions. [RFD 4](rfd/0004/README.adoc) defines the publicly accessible PoC's acceptance criteria and non-goals; treat them as the release scope.
- **Publication is owner-gated.** A chapter is published only by the owner's `approval` in its manifest, `historical/chapters/<id>.yaml`, which pins a digest of the manifest and of every record and source the chapter reaches ([the authoring format record](rfd/0002/AUTHORING_FORMAT.adoc)). Never write, edit, or copy an approval, and never run `pnpm approvals approve`: prepare the change, show what it changes with `pnpm approvals`, and let the owner approve it. An edit to anything an approved chapter reaches, a shared place included, makes its approval stale. A stale or missing approval never fails a build or a check (the owner's decision of 2026-10-21): production leaves that chapter out until the owner approves again, and tests and CI's checks serve drafts, so every chapter's content is checked either way; development and pull-request previews serve drafts under a banner, by the owner's decision of 2026-10-18. `.github/CODEOWNERS` requires the owner's review on every manifest. [The publication approval ledger](rfd/0002/PUBLICATION_APPROVAL.adoc) records how the hand-written JSON sets were approved before the record files and takes no new rows.
- Keep implementation progress in `rfd/NNNN/IMPLEMENTATION.adoc`, using AsciiDoc checklists and reciprocal links to `README.adoc`. Preserve task completion states when reorganizing plans.
- The site is a static SvelteKit build rendering a custom Three.js globe, chosen by the owner on 2026-10-12 in [the renderer spike record](rfd/0003/RENDERER_SPIKE.adoc) and brought into the atlas by [the globe renderer decision](rfd/0003/GLOBE_RENDERER.adoc). [RFD 3's static architecture decision](rfd/0003/STATIC_ARCHITECTURE.adoc) supersedes the experimental Phoenix runtime that Wave 1C/1D used; RFD 3 remains the owner of browser architecture and delivery, and RFD 4 records the owner's goal of a publicly accessible PoC. The stack is still an experiment rather than a final production decision, external deployment and paid providers require explicit owner authorization, and PostGIS and a historical-content database remain proposed.
- Record an architecture or behavior change as a dated, measured decision record that links the evidence; do not rewrite an earlier record to match a later choice. Supersession is stated explicitly and the superseded record stays readable.
- Keep native delivery open. Historical data and behavior contracts must not depend on browser UI or renderer objects.
- Treat trade, learning, religion, diplomacy, and institutional change as first-class interactions alongside war. Distinguish states, cultures, communities, and companies.
- Preserve historical sources, uncertainty, calendar/precision information, and the distinction between contact and inferred influence. Generated visual concepts are design references, never historical evidence.

## Development environment

- Use the pinned `flake.nix` environment: `nix develop`, or `nix develop --command <command>` from the repository root. It provides Node 24 (matching CI) and pnpm; Playwright installs its own browsers.
- Use the existing Makefile and `package.json` scripts rather than inventing parallel setup workflows. In an Amp orb, use `amp orb services ensure` for the services declared in `.amp/services.yaml` (the development server, and the built artifact served as files).
- `pnpm dev` and `pnpm build` build the globe's tiles into `static/globe` first (`pnpm sync:globe`, which runs `scripts/globe/build-tiles.py` with Python 3, numpy and Pillow, and fetches open elevation once into `.cache/globe`). Both directories are generated and ignored; never commit them and never assume they exist before `pnpm sync:globe` has run. An unchanged `scripts/globe/` leaves the tiles in place; a changed one repaints them all.
- `pnpm dev` and `pnpm build` then cut the self-hosted fonts into `static/fonts` (`pnpm sync:fonts`, which runs `scripts/fonts/subset.py` with fontTools in a virtualenv under `.cache/fonts`, from faces pinned by commit and sha256 in `scripts/fonts/sources.json`). The subset follows the characters of `historical/` and `src/`; the build invariant fails if a chapter's searchable text uses a character the subsets lack, so a rebuild picks up new text. `static/fonts` is generated and ignored; never commit it.
- `pnpm build` runs `vite build` through `scripts/build-app.mjs`, which copies `src/routes` into `.svelte-kit-build/routes` (without `/dev` in production), builds from the copy, removes it and re-syncs `.svelte-kit` from `src/routes`. That directory is generated and ignored; never commit it, and build with `pnpm build` rather than `vite build`.
- Chapter content is YAML record files under `historical/` (one record per file, chapters as manifests in `historical/chapters/`; see [`historical/README.md`](historical/README.md)). The Vite plugin in `scripts/historical-chapters.mjs` compiles them to the v0 contract at build time, one chunk per chapter. Never check in compiled output, and never hand-write v0 JSON for a chapter.
- If a required tool or service is unavailable, report the blocked check explicitly; do not claim verification succeeded.

## Project guidelines

- Run `pnpm verify` when you are done with all changes (format check, `svelte-check`, unit and contract tests, then the static build with its invariant) and fix any pending issues. `pnpm e2e` runs the browser checks.
- Use Conventional Commits for commit messages and pull request titles (`type(optional-scope): description`), for example `feat(atlas): add event selection` or `docs(rfd): document historical time semantics`.
- Add intent-focused comments around domain rules, historical invariants, normalization, prerendering constraints, and non-obvious UI state. Explain why the choice exists and what must not regress; avoid restating the next line of code.
- The browser keeps one thing: the last position per chapter in `localStorage` (`$lib/atlas/memory.ts`), guarded so a blocked or corrupt store reads as empty. A signed-in member also holds the session cookie and its readable `lekishi_member` hint (RFD 6). Anything more needs an owner decision.
- Keep the artifact free of secrets and provider credentials. The only secrets are members' sign-in's (`GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`, `SESSION_SECRET`), set in the Pages dashboard for Production; locally they go in `.dev.vars`, which Git ignores. Nothing else may require a secret, token or account without an explicit owner decision.

### Version control guidelines

- Prefer `jj` (Jujutsu) for status, history, commits, rebases, and pushes. Use the pinned Nix environment if it is not on the shell's PATH.
- For a Git-only checkout without `.jj`, initialize with `jj git init --colocate` from the repository root before using Jujutsu. Lekishi does not currently provide Lecinote's `.agents/jj-init` helper. Preserve existing work; do not delete or recreate an existing `.jj` directory to work around errors.
- In a colocated checkout, do not use Git commands that rewrite the working copy or refs (`checkout`, `reset`, `commit`, `rebase`, `merge`, or `stash`). Use Jujutsu equivalents. Read-only Git inspection is an acceptable fallback when Jujutsu is unavailable; report the limitation before version-control mutations.
- Rebase onto `main@origin` rather than merging. Verify revision selections before rebasing, and do not rewrite published history without authorization.
- Track remote bookmarks you intend to work on with `jj bookmark track <name> --remote=origin`; inspect tracking and immutable revisions if a rebase is refused rather than overriding protections blindly.
- Resolve conflicts at their originating revision: inspect `jj log -r 'conflicts()'`, edit the appropriate revision, and let Jujutsu propagate the resolution to descendants.
- When authorized to push, use `jj git push --bookmark <name>` for the intended bookmark rather than pushing every bookmark. These workflow instructions do not authorize pushing, opening PRs, or deploying.
- Before committing, verify Jujutsu's author identity. If needed, set repository-local `user.name` and `user.email` with `jj config set --repo` to the user's established identity. Do not invent an identity or assume `.agents/setup` configures one.

### Static-site boundaries

- The reader site has no server: every public route is prerendered (`src/routes/+layout.ts` sets `prerender = true`) and served as plain files. The one exception is the Cloudflare Pages worker that `@sveltejs/adapter-cloudflare` emits, authorized by the owner on 2026-10-21 for [RFD 6](rfd/0006/README.adoc): it answers sign-in under `/auth/` and the drafts a signed-in member of the `lekishi` organization may open, and nothing else. `build/_routes.json` sends it `/chapters/*`, `/auth/*` and `/drafts*` only and excludes every prerendered page; the build invariant checks both. Do not route anything else to it, add a database, or render a public page at runtime.
- Unapproved content is server-only. A production build compiles the chapters it leaves out into `virtual:lekishi-drafts`, which only `src/lib/server/` may import, and `scripts/check-static-build.mjs` fails if any file in `build/` names one. Chapter data reaches the browser through the chapter route's server load (`__data.json`), never as a client chunk.
- Nothing may touch `window`, `document`, or WebGL at module scope: SvelteKit renders the pages on the server while prerendering. Browser-only work belongs in `onMount` or behind an explicit `typeof window` guard (`src/lib/atlas/entry.ts` does both).
- One page has one workspace. `src/lib/atlas/entry.ts` is the only module that mounts it, it refuses to mount a second workspace, and the chapter route releases it on teardown. Do not mount the workspace from anywhere else, and keep the regression coverage for it.
- The site is served from the domain root. The globe reads its tiles from `/globe/`; if a deployment ever moves under a sub-path, that URL (in `globe-renderer.ts`) and `_redirects` must move with it.
- No tile service, account, token, or third-party provider. Elevation and imagery are built offline from open data and shipped in the artifact. Keep it that way unless the owner authorizes a provider, and keep attribution visible where it is shown today, with the full text at `/globe/ATTRIBUTION.txt`.

### SvelteKit guidelines

- Routes live in `src/routes`: `+page.svelte` for the home page, `chapters/[chapter]/+page.svelte` for every chapter's atlas shell (`atlas/` only redirects the old address), `+error.svelte` for 404s, `+layout.svelte` for the global stylesheet. `src/app.html` is the document template.
- Import shared code through `$lib/...` (`$lib/atlas`, `$lib/historical/contract`) instead of deep relative paths from routes.
- Files that must be served as-is (favicon, robots, images, the 404 page, `_redirects`) live in `static/` and are copied into `build/` unchanged. `static/globe` and `static/fonts` are generated.
- Search reads one prerendered file, `/search-index.json` (`src/routes/search-index.json/+server.ts`, built from the same projected chapters the pages render). The build invariant requires it to cover every served chapter, so a new chapter needs no search wiring of its own.
- The chapter route owns the address. In-chapter state is in the query (`?event=`, `?place=`, `?step=`, `?from=`/`?to=`, parsed and written by `$lib/atlas/query.ts`); the route writes it through SvelteKit's shallow routing (`pushState` for jumps, `replaceState` for in-view changes) and hands Back and Forward to the workspace. Nothing is written for the address a page opened at, and a stale id gets the arrival plate's not-found line rather than a silent default.
- Use `<svelte:head>` for the page title and description; each page sets its own.
- The prerendered HTML is real content, so a direct request for a chapter works before any JavaScript runs. Do not move the shell into a client-only path.

### Svelte and TypeScript guidelines

- Svelte 5 runes only: `$state`, `$state.raw`, `$derived`, `$effect`, `$props`, `$bindable`. No stores, no `export let`, no `createEventDispatcher`.
- In `AtlasWorkspace.svelte` the state variable is deliberately named `atlasState`, not `state`: `svelte-check` reads `$state` as a Svelte 4 store subscription otherwise and stops type-checking the component.
- The workspace is the only owner of selection, time window, playhead, playback, camera-follow, and address state. Keep `state.ts`, `time.ts`, and `scene.ts` pure and renderer-independent; the renderer receives a derived scene and reports user input as callbacks. Renderer objects must never enter those modules.
- Prefer plain functions and derived values over reactive side effects. Playback advances from the workspace's own clock (`$effect` in `AtlasWorkspace.svelte`); the renderer must never advance time.
- Type every public boundary. `svelte-check` runs with `strict`; do not silence a type error with `any` or a cast when a narrower type will do.

### Tailwind and CSS guidelines

- Build interface on the design system: read [docs/design-system.md](docs/design-system.md) first. Use the tokens in `src/app.css` and the primitives in `$lib/ui`, and check your change on `/dev/design` (development and PR previews only; every non-production page lives under `/dev`, gated by `scripts/dev-pages.mjs`). `src/lib/ui/design-system.test.ts` fails on Tailwind palette colours, hex values, default type sizes and off-scale radii. Its `LEGACY` list is empty and new files never join it; `src/app.css` clears Tailwind's default colours, sizes and radii, so an off-system class generates no style at all.

- One stylesheet, `src/app.css`, imported by `src/routes/+layout.svelte`. Tailwind v4 needs no config file; keep the explicit source list and extend it when a new directory contributes classes:

      @import "tailwindcss" source(none);
      @source "./lib";
      @source "./routes";

- The site ships one stylesheet; `scripts/check-static-build.mjs` fails the build otherwise. The globe's markers and labels are Tailwind-styled overlay elements, not a separate stylesheet.
- **Never** use `@apply` in raw CSS, and do not add daisyUI or another component kit: the atlas surfaces are hand-written Tailwind utilities.
- Use Tailwind's list syntax for conditional classes (`class={["a", condition && "b"]}`), and keep focus-visible styles on every interactive control.

### Testing guidelines

- Vitest runs `src/**/*.test.ts`. DOM tests declare `// @vitest-environment jsdom`; everything else runs in Node.
- Component tests mount the client Svelte build; `vite.config.ts` sets `resolve.conditions` to `["browser"]` while Vitest runs. Do not remove that without replacing it.
- Never `sleep` to wait for a process or a render: await the microtask flush (see `mount.test.ts`), poll with `expect.poll`, or assert on the durable outcome.
- The historical contract suite is the regression surface for historical meaning. Every code and caveat a vector expects must be documented by the reference semantics, and `examples.test.ts` pins the vector files and their case count. Adding a rule means adding vectors. Until the atlas launches, adding a kind or extending a vocabulary amends v0 in place (owner decision, 2026-10-22); after launch, changing a rule means a new contract version, not an edit that weakens an existing case.
- Browser checks run against the built artifact by default (`pnpm e2e`), and against the development server with `LEKISHI_E2E_MODE=dev pnpm e2e`. Assert behavior and elements, not raw HTML or text that is expected to change.
- Save screenshots or recordings for review under `.amp/in/artifacts/`; they are ignored by Git.

### Globe guidelines

- The map draws places, not events: the scene carries places (with their event counts and evidence form), journeys, arcs, territories and dioramas, and the renderer reports `onSelectPlace`, `onViewChange` and manual camera input as callbacks. The workspace measures the regions that cover the globe and passes them as `scene.safeArea`; flights and follow frame into the clear zone. See [the atlas frame record](rfd/0003/ATLAS_FRAME.adoc).
- `src/lib/atlas/renderer/globe-renderer.ts` is the only `AtlasRenderer` implementation. It owns pointer, wheel and resize handling and drives `globe/view.ts`, which is the only module that creates a WebGL context. Only `globe/` modules import Three.js; the domain, state, and scene never see a Three.js object.
- Tiles come from `/globe/`: `tileset.json`, then one bundle per refinement (`b/root.bin` for level 0, `b/{z}/{x}/{y}.bin` for the four children of a tile; the format is in `globe/bundle.ts`). They load in a module worker (`globe/tile-worker.ts`) with cancellation and a GPU memory budget. Beyond the built levels the globe subdivides the parent's heights rather than requesting tiles that do not exist. `scripts/check-static-build.mjs` fails the build if the worker, the tileset, the bundles, or the attribution are missing.
- The tile builder is `scripts/globe/build-tiles.py`; the Natural Earth II hue it paints from is vendored under `scripts/globe/natural-earth-ii/`. Changing the coverage or levels changes the artifact's file count and size, so record the new measurements, and keep the artifact under the static host's file limit (20,000, enforced by the build invariant).
- Manual camera input is detected from pointer and wheel events, not from camera motion, so a programmatic flight never cancels camera following.
- Dispose everything the renderer creates (WebGL context, worker, tiles, overlays, listeners, resize observer) and keep disposal idempotent; `globe-renderer.test.ts` guards it.
- The Firefox/Linux trackpad pinch arrives as a Ctrl-modified wheel event with very small deltas. The renderer replaces only that form with a 5x-amplified event; ordinary wheels and touchscreen pinches must keep the camera controls' default response. `globe-renderer.test.ts` and the browser check both pin the multiplier.

### UI/UX & design guidelines

- **Produce world-class UI designs** with a focus on usability, aesthetics, and modern design principles
- Implement **subtle micro-interactions** (e.g., button hover effects, and smooth transitions)
- Ensure **clean typography, spacing, and layout balance** for a refined, premium look
- Focus on **delightful details** like hover effects, loading states, and smooth page transitions
- The atlas is a dark, map-first surface: keep overlays non-overlapping at the phone widths the browser checks cover (390 px and 320 px), and keep the event list usable without the map.
