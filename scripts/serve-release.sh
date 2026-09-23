#!/usr/bin/env bash
# Builds and serves the production release for the browser checks.
#
# `pnpm e2e` starts this through Playwright's webServer, so the checks always run
# against a real production artifact: Vite production build, digested static
# assets, Mix release, and no Vite development server.
#
# Environment:
#   LEKISHI_E2E_PORT      port to serve on (default 4111)
#   LEKISHI_SKIP_BUILD=1  reuse existing assets and release instead of rebuilding
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$repo_root"

port="${LEKISHI_E2E_PORT:-4111}"
release_bin="_build/prod/rel/lekishi/bin/lekishi"

if [[ "${LEKISHI_SKIP_BUILD:-0}" != "1" ]]; then
	MIX_ENV=prod mix assets.deploy
	MIX_ENV=prod mix release --overwrite
fi

if [[ ! -x "$release_bin" ]]; then
	echo "Missing release at $release_bin. Run without LEKISHI_SKIP_BUILD=1." >&2
	exit 1
fi

# The atlas page does not query the database, so the release boots without a
# reachable PostgreSQL; the URL is still required by the production config.
export DATABASE_URL="${DATABASE_URL:-ecto://postgres:postgres@127.0.0.1:5432/lekishi_dev}"
# Local release checks only. Real deployments must set SECRET_KEY_BASE; cookie
# signing requires at least 64 bytes.
export SECRET_KEY_BASE="${SECRET_KEY_BASE:-lekishi-local-release-check-only-not-a-deployment-secret-0000000000000000}"
export PHX_SERVER=true
export PHX_HOST=127.0.0.1
export PORT="$port"

exec "$release_bin" start
