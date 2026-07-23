# Kept — Mobile (Expo)

Local-first expense manager for **web, Android, and iOS** from one Expo/React Native
codebase. All data lives in on-device SQLite; there is no backend and no account.
See `doc/master-plan.md` (repo root) for the full plan — it is the source of truth.

This app was scaffolded in **Phase 0 — Scaffold & foundation**.

## Stack

- **Expo SDK 57** + **Expo Router** (file-based routing) + **TypeScript (strict)**
- **SQLite** via `expo-sqlite` (native + web WASM) with **Drizzle ORM** + drizzle-kit migrations
- **NativeWind** (Tailwind for RN) + a small in-repo primitives kit (see `src/components`)
- **Zustand** (UI state), **React Hook Form** + **Zod** (forms/validation)
- **Jest** + `@testing-library/react-native` (unit/component tests)

## Layout

```
app/            Expo Router routes (screens)
src/
  components/   Primitives kit — Screen, Button, Card, Input, Chip, FAB, AmountText, EmptyState
  theme/        Design tokens (theme.ts) + useThemeColors
  db/           Drizzle schema, client, generated migrations
  domain/ data/ features/ lib/   (populated in later phases)
```

Design tokens are defined once (`src/theme/theme.ts` + `tailwind.config.js` + `global.css`,
light + dark). **Build screens only from the primitives** — do not restyle ad-hoc.

## Commands

Run from `apps/mobile/` (or `make -C apps/mobile <target>` from the repo root):

| Command                                    | What                                                  |
| ------------------------------------------ | ----------------------------------------------------- |
| `npm run start` / `make run`               | Expo dev server (press `w` web, `a` Android, `i` iOS) |
| `npm run web` / `make run-web`             | Web (fastest dev loop)                                |
| `npm run android` / `make run-android`     | Android device/emulator                               |
| `npm run lint` / `make lint`               | ESLint                                                |
| `npm run typecheck` / `make typecheck`     | `tsc --noEmit`                                        |
| `npm test` / `make test`                   | Jest                                                  |
| `npm run db:generate` / `make db-generate` | Regenerate Drizzle migrations from the schema         |
| `npm run export:web` / `make build`        | Static web export                                     |

## ⚠️ Web SQLite requires cross-origin isolation + a worker warm-up

`expo-sqlite`'s web build runs SQLite in a Web Worker (wa-sqlite WASM + OPFS) and needs
`SharedArrayBuffer`, so the page must be **cross-origin isolated**:

- **Dev server:** `metro.config.js` sends `Cross-Origin-Opener-Policy: same-origin` and
  `Cross-Origin-Embedder-Policy: credentialless`.
- **Production/static hosting:** the same headers are declared for the `expo-router`
  plugin in `app.json`. Any host serving the web export **must** send them.

Additionally, Drizzle's driver + `useMigrations` use expo-sqlite's **synchronous** API,
whose first (cold) call times out on web while the worker/WASM/OPFS initialize. The app
therefore calls `warmUpDatabaseAsync()` (an async open that boots the worker) **before**
the first sync op — see `src/db/client.ts` and `app/_layout.tsx`. This is a no-op on
native. Verified working on web (headless Chromium) and required going forward.
