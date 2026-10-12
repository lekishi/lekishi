SHELL := /bin/bash
.SHELLFLAGS := -euo pipefail -c
.DEFAULT_GOAL := dev

.PHONY: dev build preview check test lint format seal screenshots e2e e2e-dev verify clean

# Development server (SvelteKit + Vite) at http://localhost:5173. It serves the
# same static/globe tiles the built artifact ships (built on first run).
dev:
	pnpm dev

# The deployable artifact: prerendered HTML, hashed bundles, and the globe
# tiles in build/. `pnpm build` also runs the build invariant.
build:
	pnpm build

# Serve build/ the way a static host does, including extension-less /atlas.
preview:
	pnpm preview

check:
	pnpm check

test:
	pnpm test

lint:
	pnpm lint

format:
	pnpm format

# Reseal the worked examples after editing content (see historical/README.md).
seal:
	pnpm seal

# Capture the rendered states a reviewer needs from a running server.
screenshots:
	pnpm screenshots

# Browser checks against the built artifact (the default e2e mode).
e2e:
	pnpm e2e

# Browser checks against the development server.
e2e-dev:
	pnpm e2e:dev

# Everything CI runs: format check, type/Svelte check, unit and contract tests,
# then the static build with its invariant.
verify:
	pnpm verify

clean:
	rm -rf build .svelte-kit static/globe
