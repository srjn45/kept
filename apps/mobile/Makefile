# Kept Mobile (Expo) — run from apps/mobile/ (or: make -C apps/mobile <target>)

.PHONY: run run-web run-android run-ios lint format format-check typecheck test build db-generate export-web install

install:
	npm install

# Start the Expo dev server (press w=web, a=Android, i=iOS). Fastest loop is web.
run:
	npx expo start

run-web:
	npx expo start --web

run-android:
	npx expo start --android

run-ios:
	npx expo start --ios

lint:
	npm run lint

format:
	npm run format

format-check:
	npm run format:check

typecheck:
	npm run typecheck

test:
	npm run test

# Regenerate Drizzle SQL migrations from the schema.
db-generate:
	npm run db:generate

# Static web export (also validates the web bundle incl. expo-sqlite WASM).
export-web:
	npm run export:web

# EAS build wiring lands in Phase 8; `build` currently produces the web export.
build: export-web
