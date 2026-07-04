# Master Plan — Expense Manager (Local-First Rebuild)

**Status:** Active — source of truth
**Created:** 2026-07-04
**Supersedes:** the architecture in `rfc-001-expense-manager.md`, `prd.md`, `implementation-plan-be.md`, `implementation-plan-fe.md`. Those describe a **server-based web app** and are retained only for product/UX reference and as the basis for the parked backend. Where they conflict with this document, **this document wins.**

This plan is written to be executed by other agents. Read this file top-to-bottom before touching code. Each phase has explicit deliverables, tasks, tests, and acceptance criteria (Definition of Done).

---

## 1. Vision & scope

Expense Manager is a **personal, local-first** app to record daily expenses and analyse them by category and tags. It runs on **web, Android, and iOS from a single codebase**. Its promise to the user is: **your data stays on your device** — there is no backend, no account, no network dependency.

**MVP scope (this plan):** record and manage expenses (a ledger), organise them with categories and tags, filter/search, and see basic stats. Lock the app with a PIN.

**Platform reality:** the **native apps (Android/iOS) are the durable home** for data. The web build is a secondary convenience — browser-hosted SQLite lives in OPFS/IndexedDB which the browser may evict, and the web has no secure enclave. Export/backup (Phase 7) matters most on web; the "your data stays with you" promise is strongest on native.

**Explicitly deferred (not MVP):** income sources, wealth calculator, multi-device sync, cloud backup, payment methods, multi-currency conversion. These are designed *around* but not *built* now.

---

## 2. Locked decisions

| # | Decision | Choice |
|---|----------|--------|
| D1 | **Data location** | **Local-first, no server.** All data in on-device SQLite. Nothing leaves the device. |
| D2 | **Framework** | **Expo (React Native) + TypeScript.** One codebase → iOS, Android, web. |
| D3 | **Auth** | **Local lock** (PIN/passphrase, optional biometrics). No accounts, no server auth. |
| D4 | **Existing backend** | **Parked.** `apps/api` stays in the repo untouched as the seed for optional future sync. Do **not** build on it during MVP. |

### Consequences of D1/D3
- "Register/login" collapses to **set a PIN on first run**, then **unlock with PIN/biometrics** thereafter. "See only my ledger" is trivially satisfied — there is only one user on the device.
- No `user_id` scoping is needed in the schema. If sync is added later, a `user_id`/`device_id` column and a sync service (revived `apps/api`) are introduced then.

---

## 3. Tech stack

| Layer | Choice | Notes |
|-------|--------|-------|
| App framework | **Expo (latest SDK) + React Native + TypeScript** | Reuses the team's React/TS skills. |
| Routing | **Expo Router** (file-based) | Works on native + web. |
| Local database | **SQLite via `expo-sqlite`** | Web uses the WASM build (may need Metro/`expo-sqlite/web` config — verify in Phase 0). |
| ORM / migrations | **Drizzle ORM** (`drizzle-orm/expo-sqlite`) + **drizzle-kit** | Type-safe schema, generated SQL migrations, `useMigrations()` on boot. |
| Reactive queries | **Drizzle `useLiveQuery`** for DB-backed screens | Auto-re-render on data change; no manual cache invalidation. |
| UI state | **Zustand** (small) | Lock state, filter state, theme. Keep server-state patterns out — data comes from the DB. |
| Styling / UI | **NativeWind** (Tailwind for RN) + a small in-repo primitives set | Reuses the team's Tailwind familiarity; works web + native. Alternatives: Tamagui, gluestack-ui. See §7.7 for the design system. |
| Forms | **React Hook Form + Zod** | Same as the old web app; schemas live in the domain layer. |
| Secure storage | **`expo-secure-store`** (native) | Stores PIN hash + (optional) DB encryption key. **Native-only** — on web, fall back to `localStorage` and treat the web lock as a convenience gate, not a security boundary (see Phase 2). |
| Biometrics | **`expo-local-authentication`** | Optional unlock via Face/Touch/fingerprint. |
| Charts | **Decide in Phase 6.** Lead candidates: `victory-native` (Skia) for native, or `react-native-gifted-charts` (works on web via react-native-web + svg). | Recharts is DOM-only — **do not** carry it over. |
| Testing (unit/component) | **Jest + `@testing-library/react-native`** | `expo-sqlite` is a native module and **cannot run in Jest** — repos accept an injected Drizzle instance; unit tests inject in-memory **`better-sqlite3`** (same SQL dialect). Do not mock the DB. |
| Testing (E2E) | **Maestro** | Flows: lock, add entry, filter. Optional but recommended. |
| Lint/format | **ESLint + Prettier** (reuse existing configs where possible) | |
| Build/distribution | **EAS Build** | Android APK for LAN sideload now; TestFlight/Play later. |

### Encryption-at-rest (optional, note for later)
`expo-sqlite` has no built-in encryption. If encryption-at-rest is wanted, switch the driver to **`op-sqlite` with SQLCipher** and store the key in `expo-secure-store`. Keep the Drizzle schema identical so this is a drop-in swap. **Not required for MVP** — the PIN gate is the MVP guarantee.

---

## 4. Repository layout

```
apps/
  mobile/            # NEW — the Expo app (iOS/Android/web). All MVP work happens here.
    app/             # Expo Router routes (screens)
    src/
      domain/        # framework-agnostic: types, zod schemas, money & sign logic, tag rules
      db/            # drizzle schema, migrations, client, seed
      data/          # repositories: entriesRepo, categoriesRepo, tagsRepo (all DB access)
      features/      # feature UI: lock, ledger, entry-form, categories, settings, stats
      components/    # shared UI primitives
      lib/           # helpers (currency format, date)
    ...
  api/               # PARKED — existing FastAPI backend. Do not modify during MVP.
doc/
  master-plan.md     # this file (source of truth)
  ...                # older docs retained for reference
```

- Keep the domain layer (`src/domain`) **pure TypeScript** with no React/RN imports, so it is unit-testable and reusable if we later extract a `packages/core`.
- **All database access goes through `src/data` repositories.** Screens/components never import Drizzle directly (except `useLiveQuery` wrappers exposed by the repo layer).
- Do not add a workspace/`packages/*` split yet — it complicates Metro config. Revisit only if a second app needs to share code.

---

## 5. Data model

SQLite has no native array or decimal types. Two rules follow:

- **Money is stored as integer minor units.** `amount_minor INTEGER` (e.g. paise/cents) + `currency TEXT` (ISO 4217, e.g. `INR`, `USD`). Never store money as a float.
- **Tags are normalised into a join table** so multi-tag AND-filtering is a clean SQL query and tags are indexable/searchable.

### 5.1 Tables

**`categories`**
| column | type | notes |
|--------|------|-------|
| id | text PK | uuid |
| name | text NOT NULL | unique per active set |
| color | text NULL | hex, optional |
| icon | text NULL | optional icon name |
| is_preloaded | integer NOT NULL default 0 | seed rows = 1 |
| active | integer NOT NULL default 1 | soft delete = set 0 |
| created_at | integer NOT NULL | epoch ms |

**`ledger_entries`**
| column | type | notes |
|--------|------|-------|
| id | text PK | uuid |
| title | text NOT NULL | user-facing short label (**new field**) |
| description | text NULL | optional longer note |
| category_id | text NOT NULL FK → categories.id | |
| amount_minor | integer NOT NULL | **signed**: negative = debit (money out), positive = credit (money in) |
| currency | text NOT NULL | ISO 4217; per-entry (default from settings) |
| occurred_on | text NOT NULL | transaction date as **`YYYY-MM-DD`** (local calendar date — see §6.6; never epoch ms, which invites TZ off-by-one-day bugs) |
| created_at | integer NOT NULL | epoch ms |
| updated_at | integer NOT NULL | epoch ms |
| deleted_at | integer NULL | soft delete |

**`entry_tags`** (join)
| column | type | notes |
|--------|------|-------|
| entry_id | text NOT NULL FK → ledger_entries.id | |
| tag | text NOT NULL | normalised (lowercase, no spaces) |
| PK (entry_id, tag) | | |

**`tag_suggestions`** (for autocomplete)
| column | type | notes |
|--------|------|-------|
| tag | text PK | normalised |
| last_used_at | integer NOT NULL | epoch ms; upserted on entry create/update |

**`app_settings`** (single-row key/value or one row)
| column | type | notes |
|--------|------|-------|
| id | integer PK (always 1) | |
| default_currency | text NOT NULL default 'INR' | |
| pin_set | integer NOT NULL default 0 | actual PIN hash lives in secure-store, **not** the DB |
| biometrics_enabled | integer NOT NULL default 0 | |

> Note: the PIN **hash** and any DB encryption key live in `expo-secure-store`, never in SQLite.

### 5.2 Indexes
- `ledger_entries(occurred_on DESC)` — list ordering.
- `ledger_entries(deleted_at)` — exclude soft-deleted.
- `ledger_entries(category_id)` — category filter.
- `entry_tags(tag)` — tag filter/search.

---

## 6. Domain rules

### 6.1 Debit vs credit (the sign convention)
- **Store a signed `amount_minor`.**
- **Debit** = money out = **negative** (a normal expense). This is the default for a new entry.
- **Credit** = money in = **positive** (refund/income).
- `type` is **derived**, never stored: `type = amount_minor < 0 ? 'debit' : 'credit'`.
- The entry form shows a **Debit/Credit toggle** plus a positive amount input; the repo applies the sign. Zero amount is invalid.
- **Minor-unit exponent is currency-aware** in the money helpers: INR/USD/EUR = 2 decimals, JPY = 0, BHD/KWD = 3. Parse/format via a small exponent table; never assume "×100" universally.

### 6.2 Tags
- Tags are **strings without spaces**. Validation regex: `^[^\s]+$`, trimmed, lowercased, max length 50, max ~20 tags/entry.
- Reject or auto-strip spaces at input time (recommend: convert spaces to `-` and warn, or block — pick block for MVP clarity).
- On entry save: upsert each tag into `tag_suggestions(last_used_at=now)`.
- **Filtering by multiple tags is AND (restrictive):** an entry matches only if it has **all** selected tags.

### 6.3 Filtering & search (Ledger)
- Filters combine with **AND** across dimensions: `category` (optional) **AND** `tags` (optional, itself AND across tags) **AND** free-text search over `title`/`description`.
- Tag-AND query pattern:
  ```sql
  SELECT e.* FROM ledger_entries e
  JOIN entry_tags t ON t.entry_id = e.id
  WHERE e.deleted_at IS NULL AND t.tag IN (:tags)
  GROUP BY e.id
  HAVING COUNT(DISTINCT t.tag) = :tagCount
  ORDER BY e.occurred_on DESC;
  ```
- Always exclude `deleted_at IS NOT NULL`. Order by `occurred_on DESC, created_at DESC`.

### 6.4 Categories
- Ship a **preloaded seed set** (see 6.5). Users can add custom categories.
- "Delete" a category = **soft delete** (`active=0`). It disappears from pickers but historical entries still resolve its name. Block deleting a category that would leave existing entries orphaned in the UI — just hide it from new-entry pickers.
- **Name uniqueness is case-insensitive** and enforced in the repo (`Travel` == `travel`). Creating a category whose name matches an **inactive** one **reactivates** that row (preserving its id and historical links) instead of inserting a duplicate.

### 6.5 Seed categories (preloaded)
`Food & Dining`, `Groceries`, `Transport`, `Rent`, `Utilities`, `Health`, `Entertainment`, `Shopping`, `Education`, `Travel`, `Subscriptions`, `Income`, `Miscellaneous`. Seeded with `is_preloaded=1` on first DB init (idempotent).

### 6.6 Dates
- `occurred_on` is a **local calendar date** stored as `YYYY-MM-DD` TEXT. No timezone math anywhere — an expense entered on July 4 is July 4 forever, regardless of device TZ.
- Sorts lexicographically = chronologically; month bucketing for stats is `substr(occurred_on, 1, 7)` → `YYYY-MM`.
- `created_at` / `updated_at` / `deleted_at` remain epoch-ms instants (they are real timestamps, not calendar dates).

### 6.7 Soft delete, Undo, and purge
- Entry delete = set `deleted_at = now`. The delete toast's **Undo** simply clears `deleted_at`.
- **Purge policy:** on app start, hard-delete entries (and their `entry_tags`) where `deleted_at` is older than **30 days**. This bounds DB growth and defines the recovery window.
- JSON backup **includes** soft-deleted rows (full fidelity); CSV export **excludes** them (user-facing view).

---

## 7. Screens & UX (MVP)

- **7.1 Lock screen** — first run: create PIN (+ confirm), offer biometrics. Thereafter: unlock via PIN or biometrics. Gates the whole app. Includes a **"Forgot PIN?"** path (see Phase 2) — never a dead end.
- **7.2 Ledger (home)** — reverse-chronological list of entries. Each row: title, category chip, tags, signed amount (color-coded: debit vs credit), date. Sticky **filter bar** (category selector + tag filter + search). **Add** button (FAB). Empty state → prompt to add first entry.
- **7.3 Add / Edit entry** — form: title (req), amount + currency + **Debit/Credit toggle** (req), category picker (req), date (default today), tags input with suggestions, description (optional). Delete action on edit (with confirm → soft delete).
- **7.4 Categories** — list preloaded + custom; add/edit/deactivate. Color pick optional.
- **7.5 Settings** — change PIN, toggle biometrics, default currency, **export/import** (JSON backup; CSV export/import), "about / your data stays with you" note (with the web-storage caveat from §1).
- **7.6 Stats/Dashboard** *(Phase 6)* — summary cards (total spent this month, count), monthly bar, by-category breakdown, tag-total custom query.

Design mobile-first; the web build is the same screens via react-native-web. Keep the old web app's UX one-pager (`doc/dashboard-ledger-ux-onepager.md`) as inspiration for the stats screen.

### 7.7 Design language & UX principles

The app must feel **simple, attractive, and effortless** — recording an expense is a 5-second, one-thumb task the user does many times a day. Design for that. These are requirements, not suggestions; every screen agent follows them.

**Guiding principles**
- **Speed over chrome.** The primary job is "add an expense fast." Add-entry must be reachable in one tap from the ledger (persistent FAB) and savable with the minimum required fields (title, amount, category) — everything else optional.
- **One primary action per screen.** Make it obvious and thumb-reachable (bottom of screen on mobile). Don't crowd screens with equal-weight buttons.
- **Content first, calm surfaces.** Generous whitespace, few borders, soft elevation instead of heavy lines. Let the data (amounts, categories) be the visual focus.
- **Progressive disclosure.** Show the common path; tuck advanced options (tags, description, date override) behind a collapsed "More" area in the entry form so first-time use isn't intimidating.
- **Familiar, not novel.** Use platform-standard patterns (native pickers, share sheet, swipe-to-delete). Don't invent interactions users must learn.

**Design tokens** (define once in a theme module; NativeWind config + a `theme.ts`; never hardcode hex in screens)
- **Color:** one **brand/accent** color for primary actions; a neutral gray scale for surfaces/text. **Semantic money colors:** debit (money out) = a restrained red, credit (money in) = green — but never rely on color alone (also show sign/`−`/`+` and a label; §7.7 accessibility). Category colors are decorative accents (chips), not the amount color.
- **Typography:** one type scale (e.g. 12/14/16/20/28). Amounts use **tabular/monospaced numerals** so columns align. Titles semibold, secondary text muted gray.
- **Spacing:** a single 4-pt spacing scale (4/8/12/16/24/32). Consistent screen padding (16). Consistent card radius (e.g. 12–16).
- **Elevation:** subtle shadows/one elevation level; avoid nested cards.

**Component & interaction standards**
- **Touch targets ≥ 44×44 pt.** Comfortable spacing between tappable rows.
- **Ledger rows:** left = title + category chip + tags; right = signed, color-coded, tabular amount + date. Swipe-left to delete (with confirm), tap to edit.
- **Forms:** big, obvious inputs; numeric keypad for amount; inline validation (only after blur/submit, never nagging mid-typing); the Debit/Credit toggle is a clear segmented control that recolors the amount live.
- **Tag input:** chips with an inline "×"; type-ahead suggestions from `tag_suggestions`; block spaces with a gentle inline hint (§6.2).
- **Feedback:** every mutation gives immediate feedback (optimistic UI via `useLiveQuery`, plus a toast/snackbar with **Undo** for delete). No spinners for local DB reads — they're instant.
- **Empty & first-run states:** friendly, illustrated-lite empty states with a single clear CTA ("Add your first expense"). These carry the "your data stays on your device" reassurance.
- **Motion:** small, purposeful transitions (list insert/remove, FAB press, screen push). Keep durations short (~150–250ms); respect "reduce motion".

**Accessibility & robustness (non-negotiable)**
- **Dark mode + light mode** from day one (theme tokens, not per-screen hacks). Respect system theme; allow override in Settings.
- **Never encode meaning in color alone** — debit/credit also carry sign and/or label; hit WCAG AA contrast for text.
- Proper `accessibilityLabel`/roles on interactive elements; dynamic-type/font-scaling friendly (no fixed-height text rows that clip).
- Handle long titles, huge amounts, and 20 tags gracefully (truncate/wrap, never overflow).

**Consistency mechanism**
- Phase 0 establishes the theme tokens + a **primitives kit** (`Button`, `Card`, `Input`, `Chip`, `Screen`, `FAB`, `AmountText`, `EmptyState`). Every later phase builds screens **only** from these primitives — this is what keeps the whole app visually coherent as different agents build different screens. Adding a new primitive is allowed; restyling ad-hoc in a screen is not.

---

## 8. Phased execution plan

Each phase is sized to be one agent's bounded task. **Definition of Done (DoD)** for every phase: code compiles, `lint` + `typecheck` pass, tests for that phase pass, and the app boots on web (fastest loop) **and** Android. Commit at the end of each phase on a feature branch.

### Phase 0 — Scaffold & foundation
**Goal:** An Expo app that boots on web + Android with SQLite wired up.
- Scaffold `apps/mobile` (Expo, TS, Expo Router). Add ESLint/Prettier.
- Add `expo-sqlite`, Drizzle, drizzle-kit; open a DB, run an empty migration, confirm a query works **on web and Android** (verify the web WASM path early — this is the riskiest integration).
- Add Zustand, RHF, Zod. Set up Jest + RN Testing Library with one smoke test.
- Add **NativeWind** and establish the **design system** (§7.7): `theme.ts` tokens (color, type scale, spacing, radius, light/dark) + the primitives kit (`Screen`, `Button`, `Card`, `Input`, `Chip`, `FAB`, `AmountText`, `EmptyState`). Later phases build screens only from these.
- Update root `Makefile` with `mobile` targets (run/lint/test/build); note `apps/api` is parked.
- **CI enforcement:** extend `.pre-commit-config.yaml` with mobile lint/format hooks, and add a minimal GitHub Actions workflow running mobile lint + typecheck + Jest on push. The per-phase DoD needs a red ✗ to be enforceable, not just agent discipline.
- **DoD:** `make -C apps/mobile run` shows a placeholder home (using the primitives, in light + dark) on web and on an Android device/emulator; a trivial SQLite read/write works on both.

### Phase 1 — Data layer (schema, migrations, seed, repos)
**Goal:** Full typed persistence with no UI.
- Drizzle schema for all tables in §5; generate initial migration; wire `useMigrations()` on boot.
- Enable **`PRAGMA foreign_keys = ON`** on every connection (SQLite defaults it off — without this the §5 FKs are decorative).
- Idempotent **seed** of preloaded categories + default `app_settings`.
- Repositories in `src/data`: `categoriesRepo` (incl. case-insensitive uniqueness + reactivation per §6.4), `entriesRepo` (CRUD, soft delete, purge per §6.7, list with filters per §6.3), `tagsRepo` (upsert suggestions, search).
- Domain (`src/domain`): Zod schemas, money helpers (currency-aware minor units per §6.1), sign logic, tag validation, date helpers (§6.6).
- **Test strategy:** repos take an injected Drizzle instance; unit tests run against in-memory **`better-sqlite3`** (`expo-sqlite` cannot run in Jest). Real SQL, no DB mocks.
- **Unit tests** for domain logic and repo query behavior (money rounding incl. 0/3-decimal currencies, sign derivation, tag-AND filtering, soft-delete exclusion, purge cutoff, category reactivation, seed idempotency).
- **DoD:** repos + domain fully unit-tested; seed runs once; no UI yet.

### Phase 2 — App lock (PIN + biometrics)
**Goal:** The app is gated.
- First-run PIN creation; store **salted hash** in `expo-secure-store`. Unlock flow. Optional biometrics via `expo-local-authentication`.
- **Web fallback:** `expo-secure-store` is native-only. On web, store the PIN hash in `localStorage` behind the same storage interface (one `pinStorage` abstraction, two impls). The web lock is a **convenience gate, not a security boundary** — say so in Settings/about.
- **Forgot PIN (required):** no server ⇒ no reset email. The lock screen offers "Forgot PIN?": re-authenticate via **biometrics** (if enrolled) to set a new PIN; otherwise offer **wipe data & start over** with a strong, explicit warning. Never a silent dead end.
- **Auto-lock with grace period:** lock on relaunch and on backgrounding, but with a short grace window (default **30 s**, configurable) so switching apps briefly doesn't force re-entry.
- Zustand `lockStore`; route guard that redirects to lock screen until unlocked.
- Tests: PIN set/verify logic, wrong-PIN handling, forgot-PIN paths, grace-period timing, locked→unlocked routing.
- **DoD:** fresh install forces PIN creation; relaunch requires unlock; biometrics optional; forgot-PIN path works on native and web.

### Phase 3 — Categories management UI
**Goal:** CRUD categories on top of Phase 1 repos.
- List (preloaded + custom), add, edit, deactivate (soft). Uses `useLiveQuery`.
- Component tests for add/edit/deactivate.
- **DoD:** user can manage categories; deactivated ones vanish from pickers but names still resolve on old entries.

### Phase 4 — Ledger CRUD (the core)
**Goal:** Add/edit/delete/list entries — the heart of the app.
- Ledger list screen (reverse chronological, color-coded amounts, live).
- **Performance guardrail:** `FlatList` virtualization + a windowed/paginated live query (e.g. first 100 rows + load-more) — do not `useLiveQuery` the entire ledger unbounded. Plain `LIKE '%q%'` search is fine at 10k rows; skip FTS5 for MVP.
- Add/Edit entry form (§7.3) with RHF+Zod, Debit/Credit toggle, category picker, tags input + suggestions, currency default from settings.
- **Day grouping:** section headers per calendar day with a day total (e.g. "Wed, Jul 3 — ₹840") instead of a flat list.
- **Duplicate entry:** long-press/row action to clone an entry with today's date — makes recurring daily expenses a 2-tap record (serves the 5-second-entry principle, §7.7).
- Delete = toast with **Undo** (clears `deleted_at`, §6.7) → soft delete.
- Component + integration tests (create → appears in list; edit; delete → disappears; tag suggestions upserted).
- **DoD:** full expense lifecycle works end-to-end on web + Android; this is the first genuinely usable build.

### Phase 5 — Filtering & search
**Goal:** Slice the ledger.
- Filter bar: category selector, multi-tag filter (**AND**), free-text search over title/description. Filters combine with AND (§6.3). Persist filter UI state in Zustand.
- Tests for each filter and combinations, especially multi-tag AND correctness.
- **DoD:** all §6.3 filter behaviors verified, including "restrictive" multi-tag AND.

### Phase 6 — Stats / dashboard & charts
**Goal:** Analyse spending.
- Pick charting lib (§3). Summary cards (month total debit/credit, entry count), monthly bar, by-category breakdown (bar/pie), custom **total-by-tags** query for a date range.
- **Mixed-currency rule:** aggregate **only default-currency entries**; when other-currency entries exist in the range, show a small "n entries in other currencies excluded" badge. Never silently sum across currencies; no conversion in MVP.
- Aggregation queries in `entriesRepo` (grouped sums, exclude soft-deleted, debit/credit split, default-currency filter).
- Tests for aggregation correctness.
- **DoD:** charts render on web + native with real data; totals reconcile with the ledger.

### Phase 7 — Backup: export / import
**Goal:** User owns and can move their data (reinforces "your data stays with you").
- **Export**: full JSON backup + CSV of entries (share sheet / file save). The JSON envelope carries **`schemaVersion`** + app version so future app versions can migrate old backups. JSON includes soft-deleted rows; CSV excludes them (§6.7).
- **Import (JSON)**: restore from backup — validate, migrate older `schemaVersion`s, merge or replace with confirm.
- **Import (CSV) — legacy data path:** column-mapped CSV import (date, title, amount, category, tags) so the user's **existing history** (currently in the parked Postgres stack / `scripts/ingest_expenses.py` CSVs) can be brought into the app. Auto-create missing categories; report skipped/invalid rows. Without this, historical data is stranded.
- Tests for round-trip export→import fidelity and CSV mapping edge cases.
- **DoD:** a JSON backup round-trips into a clean install with identical data; a legacy CSV imports with a visible success/skip report.

### Phase 8 — Build & distribution
**Goal:** Get it onto the user's devices.
- EAS Build config; produce an Android APK for **LAN/sideload** install now.
- Basic branding: app name, icon, splash screen (`app.json` / `expo-splash-screen`) consistent with the §7.7 theme.
- Document install steps. iOS via TestFlight and store submission are **future** (needs Apple Developer account).
- **DoD:** an installable Android build exists and runs on a real device.

### Future (post-MVP, designed-for not built)
- Income sources as a first-class concept; **wealth calculator**.
- **Optional sync**: revive `apps/api` as a sync service; add `device_id`/`user_id` + conflict resolution. Encryption-at-rest via op-sqlite/SQLCipher.
- Payment methods (dropped from MVP per the new field spec — revisit if wanted).
- **Receipt photos** on entries (design the schema so an attachments column/table can be added without migration pain; don't build now).
- **Budgets & recurring expenses** (carried over from the old PRD's deferred list).
- **Backup nudge**: gentle Settings reminder when no export has happened in 30 days — local-only data dies with the device.
- App Store / Play Store submission.

> **Known risk (accepted):** iOS is **expected to work, verified later** — the per-phase DoD only requires web + Android since there's no Apple developer account yet. Expo keeps this low-risk, but do not mistake iOS for tested.

---

## 9. What to do with existing code

- **`apps/api` (FastAPI/Postgres):** leave as-is, parked. It is the head start for future sync. Do not delete, do not build on it now.
- **`apps/web` (React/Vite):** **not** carried forward as the app (Recharts + openapi-fetch + REST assumptions don't fit local-first). Mine it for **reference only** — the page layouts, form fields, Zod schemas, and analytics query shapes are useful when building the equivalent RN screens. Do not import from it.
- **Docker compose files / ingest script:** keep; they belong to the parked backend.
- **Docs:** `prd.md`, `rfc-001`, the two implementation plans → reference/history. This `master-plan.md` is the live source of truth.

---

## 10. Conventions for executing agents

- **Language/tooling:** TypeScript strict. All DB access through `src/data` repos; domain layer stays pure (no RN imports).
- **Money:** integer minor units everywhere; format only at the UI edge.
- **Tests:** every phase ships tests for its logic. Domain + repo logic = unit tests; screens = component tests; critical flows = Maestro E2E where practical.
- **Definition of Done (every phase):** compiles, lint + typecheck clean, phase tests green, boots on **web and Android**, committed on a feature branch with a clear message.
- **Verify on a real target**, not just tests — web is the fast loop, but confirm Android before calling a phase done (SQLite/native behavior differs).
- **Don't reintroduce a server** or any network dependency into the MVP.
- **No analytics, telemetry, or crash-reporting SDKs that send data off-device.** The privacy promise is absolute — it's the product's marketing claim. (Local-only crash logs are fine.)

---

## 11. Recommended build approach

This is a large, multi-phase effort. Run it as a **warden pipeline** of short-lived, single-phase agents (Phase 0 → 8), each with a fresh bounded context and this document as its brief. Gate each phase on the previous phase's DoD. Phase 0 and Phase 1 are the highest-risk (Expo web-SQLite integration; schema correctness) — validate them before parallelizing anything.

---

## 12. Open questions (non-blocking; sensible defaults chosen)

- **Space in tags:** default = **block** input with spaces (clearer than silently converting). Confirm if auto-convert-to-`-` is preferred.
- **Default currency:** default = `INR` in `app_settings`; user-editable in Settings. Confirm.
- **Multi-currency in ledger:** entries carry their own currency, but MVP stats assume a single default currency (no conversion). Mixed-currency totals are a future concern.
- **Category delete with existing entries:** default = soft-deactivate only (never hard-delete). Confirm.
