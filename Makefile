# Kept — run from project root
# Apps: make -C apps/mobile <target> | make -C apps/web <target> | make -C apps/api <target>
# This Makefile provides combined targets and local Docker Compose.
#
# NOTE: apps/api (FastAPI/Postgres) is PARKED — kept in the repo as the seed for optional
# future sync, but not part of the local-first MVP. apps/mobile (Expo) is the active app;
# apps/web (React/Vite) is reference-only. Its targets remain here for convenience.

.PHONY: fmt lint test build \
	run-api run-web run-mobile run-mobile-web run-mobile-android run-mobile-ios \
	mobile-fmt mobile-lint mobile-typecheck mobile-test mobile-build \
	local-build local-up local-down local-recreate

# --- Combined targets (active apps: web + mobile) ---

fmt:
	$(MAKE) -C apps/web fmt
	$(MAKE) -C apps/mobile format

lint:
	$(MAKE) -C apps/web lint
	$(MAKE) -C apps/mobile lint
	$(MAKE) -C apps/mobile typecheck

test:
	$(MAKE) -C apps/web test
	$(MAKE) -C apps/mobile test

build:
	$(MAKE) -C apps/web build
	$(MAKE) -C apps/mobile build

# --- Mobile (Expo: iOS/Android/web) ---
# Fastest dev loop is web; verify Android before calling a phase done.
run-mobile:
	$(MAKE) -C apps/mobile run

run-mobile-web:
	$(MAKE) -C apps/mobile run-web

run-mobile-android:
	$(MAKE) -C apps/mobile run-android

run-mobile-ios:
	$(MAKE) -C apps/mobile run-ios

mobile-fmt:
	$(MAKE) -C apps/mobile format

mobile-lint:
	$(MAKE) -C apps/mobile lint

mobile-typecheck:
	$(MAKE) -C apps/mobile typecheck

mobile-test:
	$(MAKE) -C apps/mobile test

mobile-build:
	$(MAKE) -C apps/mobile build

# --- Web dev server ---
run-web:
	$(MAKE) -C apps/web run

# --- API (PARKED — not part of MVP; requires its own Python/uv toolchain) ---
run-api:
	$(MAKE) -C apps/api run

# --- Local Docker Compose (docker-compose.local.yml) — belongs to the parked backend ---
# Prereq: start Postgres with: docker compose -f docker-compose.postgres.yml up -d

COMPOSE_FILE := docker-compose.local.yml
COMPOSE_PROJECT := expense-manager-app

local-build:
	docker compose -p $(COMPOSE_PROJECT) -f $(COMPOSE_FILE) build

local-up:
	docker compose -p $(COMPOSE_PROJECT) -f $(COMPOSE_FILE) up -d

local-down:
	docker compose -p $(COMPOSE_PROJECT) -f $(COMPOSE_FILE) down

# Rebuild images (no cache), recreate containers, then start
local-recreate: local-down
	docker compose -p $(COMPOSE_PROJECT) -f $(COMPOSE_FILE) build --no-cache
	docker compose -p $(COMPOSE_PROJECT) -f $(COMPOSE_FILE) up -d --force-recreate
