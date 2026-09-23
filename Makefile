SHELL := /bin/bash
.SHELLFLAGS := -euo pipefail -c
.DEFAULT_GOAL := dev

POSTGRES_PORT ?= 5432
DEV_DIR := $(CURDIR)/.dev
POSTGRES_DIR := $(DEV_DIR)/postgres
POSTGRES_DATA := $(POSTGRES_DIR)/data
POSTGRES_SOCKET := $(POSTGRES_DIR)/socket
POSTGRES_LOG := $(POSTGRES_DIR)/postgres.log

.PHONY: dev up down migration postgres init-postgres psql release check-release

dev:
	mix phx.server

up: init-postgres
	@if pg_ctl --pgdata="$(POSTGRES_DATA)" status >/dev/null 2>&1; then \
		echo "PostgreSQL is already running"; \
	else \
		pg_ctl --pgdata="$(POSTGRES_DATA)" --log="$(POSTGRES_LOG)" \
			--options='-h "" -k "$(POSTGRES_SOCKET)" -p $(POSTGRES_PORT)' \
			--wait start; \
	fi

down:
	@if [[ -s "$(POSTGRES_DATA)/PG_VERSION" ]] && \
		pg_ctl --pgdata="$(POSTGRES_DATA)" status >/dev/null 2>&1; then \
		pg_ctl --pgdata="$(POSTGRES_DATA)" --mode=fast --wait stop; \
	else \
		echo "PostgreSQL is not running"; \
	fi

migration:
	mix ecto.migrate
	mix ecto.dump

init-postgres:
	@mkdir -p "$(POSTGRES_DATA)" "$(POSTGRES_SOCKET)"
	@if [[ ! -s "$(POSTGRES_DATA)/PG_VERSION" ]]; then \
		initdb --pgdata="$(POSTGRES_DATA)" --username=postgres --auth-local=trust \
			--auth-host=trust --encoding=UTF8 --no-locale; \
	fi

postgres: init-postgres
	exec postgres -D "$(POSTGRES_DATA)" -h "" -k "$(POSTGRES_SOCKET)" \
		-p "$${PORT:-$(POSTGRES_PORT)}"

psql: up
	psql --host="$(POSTGRES_SOCKET)" --port="$(POSTGRES_PORT)" \
		--username=postgres --dbname=postgres

# Production artifact without deploying it: minified Tailwind, Vite production
# build, digested static assets, and the asset check.
release:
	MIX_ENV=prod mix assets.deploy

# Build the release, then run the browser checks against it with no Vite
# development server (LEKISHI_SKIP_BUILD=1 reuses the artifact `release` built).
check-release: release
	MIX_ENV=prod mix release --overwrite
	cd assets && LEKISHI_SKIP_BUILD=1 pnpm e2e
