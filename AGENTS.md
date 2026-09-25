# Lekishi agent guidance

Lekishi is a historical atlas for exploring events and relationships across
places and time. This repository contains a statically built SvelteKit site: the
deployable artifact is prerendered HTML, hashed JS/CSS, and the bundled Cesium
runtime in `build/`, with no application server, database, or BEAM runtime.

Project workflow conventions are adapted from
[Lecinote's AGENTS.md](https://github.com/chaba-dev/lecinote/blob/main/AGENTS.md).
This file is the local authority: do not assume Lecinote's authentication,
helper scripts, or application features exist here. Preserve the static-site
rules below when updating project-specific guidance.

## Product and design records

- Read the relevant [RFDs](rfd/README.adoc) before changing product or architecture behavior. Respect each document's state; drafts are proposals, not implemented features or final stack decisions. [RFD 4](rfd/0004/README.adoc) defines the publicly accessible PoC's acceptance criteria and non-goals; treat them as the release scope.
- **Publication is owner-gated.** Never create, extend, or supersede a publication set on your own. Prepare draft revisions instead — a draft leaves the currently published revision visible — and let the owner decide. Every set must have a row in the ledger in [the publication approval gate](rfd/0002/PUBLICATION_APPROVAL.adoc), and `src/lib/historical/contract/publication-approval.test.ts` fails the build for a set the ledger does not cover, a row for a set that does not exist, a decision the gate does not know, or a set whose review independence disagrees with its row. Do not record an `owner approved` decision for the owner.
- Keep implementation progress in `rfd/NNNN/IMPLEMENTATION.adoc`, using AsciiDoc checklists and reciprocal links to `README.adoc`. Preserve task completion states when reorganizing plans.
- The site is a static SvelteKit build with Cesium evaluated first. [RFD 3's static architecture decision](rfd/0003/STATIC_ARCHITECTURE.adoc) supersedes the experimental Phoenix runtime that Wave 1C/1D used; RFD 3 remains the owner of browser architecture and delivery, and RFD 4 records the owner's goal of a publicly accessible PoC. The stack is still an experiment rather than a final production decision, external deployment and paid providers require explicit owner authorization, and PostGIS and a historical-content database remain proposed.
- Record an architecture or behavior change as a dated, measured decision record that links the evidence; do not rewrite an earlier record to match a later choice. Supersession is stated explicitly and the superseded record stays readable.
- Keep native delivery open. Historical data and behavior contracts must not depend on browser UI or renderer objects.
- Treat trade, learning, religion, diplomacy, and institutional change as first-class interactions alongside war. Distinguish states, cultures, communities, and companies.
- Preserve historical sources, uncertainty, calendar/precision information, and the distinction between contact and inferred influence. Generated visual concepts are design references, never historical evidence.

## Development environment

- Use the pinned `flake.nix` environment: `nix develop`, or `nix develop --command <command>` from the repository root. It provides Node 24 (matching CI) and pnpm; Playwright installs its own browsers.
- Use the existing Makefile and `package.json` scripts rather than inventing parallel setup workflows. In an Amp orb, use `amp orb services ensure` for the services declared in `.amp/services.yaml` (the development server, and the built artifact served as files).
- `pnpm dev` and `pnpm build` copy the Cesium runtime into `static/cesium` first. That directory is generated and ignored; never commit it and never assume it exists before `pnpm sync:cesium` has run.
- If a required tool or service is unavailable, report the blocked check explicitly; do not claim verification succeeded.

## Project guidelines

- Run `pnpm verify` when you are done with all changes (format check, `svelte-check`, unit and contract tests, then the static build with its invariant) and fix any pending issues. `pnpm e2e` runs the browser checks.
- Use Conventional Commits for commit messages and pull request titles (`type(optional-scope): description`), for example `feat(atlas): add event selection` or `docs(rfd): document historical time semantics`.
- Add intent-focused comments around domain rules, historical invariants, normalization, prerendering constraints, and non-obvious UI state. Explain why the choice exists and what must not regress; avoid restating the next line of code.
- Keep the artifact free of secrets and provider credentials. There is no `.env` file, no token, and no account; nothing may be introduced that requires one without an explicit owner decision.

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

- There is no server: every route is prerendered (`src/routes/+layout.ts` sets `prerender = true`) and the artifact is plain files. Do not add a runtime server, an adapter that needs one, server-only data loading, or a dependency that requires a database or secret.
- Nothing may touch `window`, `document`, or WebGL at module scope: SvelteKit renders the pages on the server while prerendering. Browser-only work belongs in `onMount` or behind an explicit `typeof window` guard (`src/lib/atlas/entry.ts` does both).
- One page has one workspace. `src/lib/atlas/entry.ts` is the only module that mounts it, it refuses to mount a second workspace, and the atlas route releases it on teardown. Do not mount the workspace from anywhere else, and keep the regression coverage for it.
- The site is served from the domain root. `window.CESIUM_BASE_URL` is `/cesium/`; if a deployment ever moves under a sub-path, the base URL and `static/_redirects` must move with it.
- No Cesium ion account, token, or third-party provider. Imagery is the bundled Natural Earth II tiles and terrain is the ellipsoid. Keep it that way unless the owner authorizes a provider, and keep attribution visible where it is shown today.

### SvelteKit guidelines

- Routes live in `src/routes`: `+page.svelte` for the overview page, `atlas/+page.svelte` for the atlas shell, `+error.svelte` for 404s, `+layout.svelte` for the global stylesheet. `src/app.html` is the document template.
- Import shared code through `$lib/...` (`$lib/atlas`, `$lib/historical/contract`) instead of deep relative paths from routes.
- Files that must be served as-is (favicon, robots, images, the 404 page, `_redirects`) live in `static/` and are copied into `build/` unchanged. `static/cesium` is generated.
- Use `<svelte:head>` for the page title and description; each page sets its own.
- The prerendered HTML is real content, so a direct request for `/atlas` works before any JavaScript runs. Do not move the shell into a client-only path.

### Svelte and TypeScript guidelines

- Svelte 5 runes only: `$state`, `$state.raw`, `$derived`, `$effect`, `$props`, `$bindable`. No stores, no `export let`, no `createEventDispatcher`.
- In `AtlasWorkspace.svelte` the state variable is deliberately named `atlasState`, not `state`: `svelte-check` reads `$state` as a Svelte 4 store subscription otherwise and stops type-checking the component.
- The workspace is the only owner of selection, time window, playhead, playback, and camera-follow state. Keep `state.ts`, `time.ts`, and `scene.ts` pure and renderer-independent; the renderer receives a derived scene and reports user input as callbacks. Renderer objects must never enter those modules.
- Prefer plain functions and derived values over reactive side effects. Playback advances from the workspace's own clock (`$effect` in `AtlasWorkspace.svelte`); the renderer must never advance time.
- Type every public boundary. `svelte-check` runs with `strict`; do not silence a type error with `any` or a cast when a narrower type will do.

### Tailwind and CSS guidelines

- One stylesheet, `src/app.css`, imported by `src/routes/+layout.svelte`. Tailwind v4 needs no config file; keep the explicit source list and extend it when a new directory contributes classes:

      @import "tailwindcss" source(none);
      @source "./lib";
      @source "./routes";

- The Cesium widget stylesheet is imported into that file so the site ships one stylesheet. Keep `.cesium-viewer` sizing rules there.
- **Never** use `@apply` in raw CSS, and do not add daisyUI or another component kit: the atlas surfaces are hand-written Tailwind utilities.
- Use Tailwind's list syntax for conditional classes (`class={["a", condition && "b"]}`), and keep focus-visible styles on every interactive control.

### Testing guidelines

- Vitest runs `src/**/*.test.ts`. DOM tests declare `// @vitest-environment jsdom`; everything else runs in Node.
- Component tests mount the client Svelte build; `vite.config.ts` sets `resolve.conditions` to `["browser"]` while Vitest runs. Do not remove that without replacing it.
- Never `sleep` to wait for a process or a render: await the microtask flush (see `mount.test.ts`), poll with `expect.poll`, or assert on the durable outcome.
- The historical contract suite is the regression surface for historical meaning. Every code and caveat a vector expects must be documented by the reference semantics, and `examples.test.ts` pins the vector files and their case count (187). Adding a rule means adding vectors; changing a rule means a new contract version, not an edit that weakens an existing case.
- Browser checks run against the built artifact by default (`pnpm e2e`), and against the development server with `LEKISHI_E2E_MODE=dev pnpm e2e`. Assert behavior and elements, not raw HTML or text that is expected to change.
- Save screenshots or recordings for review under `.amp/in/artifacts/`; they are ignored by Git.

### Cesium guidelines

- `src/lib/atlas/renderer/cesium-renderer.ts` is the only module that imports Cesium. It sets the ion token and ion credit to `undefined`, uses Natural Earth II plus the ellipsoid terrain provider, and must stay free of provider accounts.
- Runtime assets (Workers, Assets, Widgets, ThirdParty) are resolved through `window.CESIUM_BASE_URL`. `scripts/sync-cesium-runtime.mjs` copies them and `scripts/check-static-build.mjs` fails the build if they are missing from the artifact.
- Dispose everything the renderer creates (viewer, event handler, listeners, resize observer) and keep disposal idempotent; `dispose.test`-style coverage in `cesium-renderer.test.ts` guards it.
- The Firefox/Linux trackpad pinch arrives as a Ctrl-modified wheel event with very small deltas. The renderer replaces only that form with a 5x-amplified event; ordinary wheels and touchscreen pinches must keep Cesium's default response. `cesium-renderer.test.ts` and the browser check both pin the multiplier.

### UI/UX & design guidelines

- **Produce world-class UI designs** with a focus on usability, aesthetics, and modern design principles
- Implement **subtle micro-interactions** (e.g., button hover effects, and smooth transitions)
- Ensure **clean typography, spacing, and layout balance** for a refined, premium look
- Focus on **delightful details** like hover effects, loading states, and smooth page transitions
- The atlas is a dark, map-first surface: keep overlays non-overlapping at the phone widths the browser checks cover (390 px and 320 px), and keep the event list usable without the map.
