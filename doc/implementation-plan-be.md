# Backend implementation plan (step-by-step)

This plan follows [doc/rfc-001-expense-manager.md](rfc-001-expense-manager.md) and [doc/prd.md](prd.md). Each step implements **one API endpoint** at a time, with validations, unit tests for business/DB logic, and integration tests for the HTTP API covering all scenarios.

**Conventions**

- **Unit test:** Tests a single function (service, repository, validator) in isolation (mocked DB or in-memory).
- **Integration test:** Calls the HTTP endpoint (e.g. via FastAPI `TestClient`); uses a real or test DB; validates status code, response body, and side effects.
- Implement in the order below so that dependencies (e.g. payment methods and categories) exist before ledger and analytics.

---

## Step 0: Project foundation (no API yet)

**Goal:** Backend runs with uv, FastAPI app, DB connection, migrations, and test harness. No public API yet.

**Deliverables**

- Monorepo: `apps/api/` with `pyproject.toml` (uv), FastAPI app, async DB (SQLAlchemy 2 + async engine).
- Environment: `.env` / settings for `DATABASE_URL` (and test DB URL).
- Migrations: tool (e.g. Alembic) and initial migration creating tables: `payment_methods`, `categories`, `ledger_entries`, `tag_suggestions` (schema per RFC §5).
- Test setup: `pytest`, `pytest-asyncio`, `httpx`, test DB (same schema); fixture for `AsyncSession` and `TestClient` with overridden DB dependency.
- Health or root endpoint (e.g. `GET /health`) to verify app and DB.

**Validations**

- N/A (no domain validations yet).

**Unit tests**

- (Optional) Test that settings load and DB connection works.

**Integration tests**

- `GET /health` returns 200 (and optionally DB connectivity check).

---

## Step 1: GET /api/v1/payment-methods

**Goal:** List active payment methods. Response: `{ "data": [ { "id", "name", "currency", "active", "createdAt" } ] }`.

**Validations**

- None for GET (no body; optional query params only if we add filtering later).

**Unit tests**

- Service/repository: `list_payment_methods(session, active_only=True)` returns only active; ordering (e.g. by name or created_at).

**Integration tests**

- **200:** No payment methods → `{ "data": [] }`.
- **200:** One or more active payment methods → `data` array with correct shape; inactive records excluded.
- **200:** Verify `createdAt` is ISO 8601.

---

## Step 2: POST /api/v1/payment-methods

**Goal:** Create a payment method. Request: `{ "name", "currency" }`. Response: 201, `Location` header, `{ "data": { "id", "name", "currency", "active": true, "createdAt" } }`.

**Validations**

- `name`: required, non-empty string, max length (e.g. 100); strip whitespace.
- `currency`: required, non-empty string, max length (e.g. 10); e.g. ISO 4217 or free text per RFC.

**Unit tests**

- Validator: reject missing name/currency; empty string; name/currency too long.
- Service: `create_payment_method(session, name, currency)` returns model with `active=True`; persists.

**Integration tests**

- **201:** Valid body → 201, `Location: /api/v1/payment-methods/{id}`, body has `data.id`, `data.name`, `data.currency`, `data.active is true`, `data.createdAt`.
- **422:** Missing `name` or `currency` → 422, `detail` with loc/msg.
- **422:** Empty string for name or currency.
- **422:** Invalid types (e.g. number for name).

---

## Step 3: GET /api/v1/payment-methods/{id}

**Goal:** Get a single payment method by id.

**Validations**

- `id`: valid UUID (or whatever id type); 404 if not found. Return both active and inactive (so historical ledger can show name).

**Unit tests**

- Service: `get_payment_method(session, id)` returns None when not found; returns record when found (active or inactive).

**Integration tests**

- **200:** Existing id → `{ "data": { "id", "name", "currency", "active", "createdAt" } }`.
- **404:** Non-existent id → 404, `{ "detail": "..." }`.
- **422 or 404:** Invalid id format (if using UUID) → appropriate status.

---

## Step 4: PUT /api/v1/payment-methods/{id}

**Goal:** Update a payment method. Request body: `{ "name", "currency" }`. Response: 200, `{ "data": { ... } }`.

**Validations**

- Same as POST: `name` and `currency` required, non-empty, max length.
- Path: `id` must exist; 404 if not found. (Do not allow reactivating via PUT if we restrict that; otherwise allow updating active/inactive per product.)

**Unit tests**

- Validator: same as POST.
- Service: `update_payment_method(session, id, name, currency)` updates and returns; raises or returns None when id not found.

**Integration tests**

- **200:** Valid body and existing id → 200, body matches updated values.
- **404:** Non-existent id → 404.
- **422:** Invalid body (missing name/currency, empty, wrong types).

---

## Step 5: DELETE /api/v1/payment-methods/{id}

**Goal:** Soft delete: set `active = false`. Response: 200 with `{ "data": { ... } }` or 204 No Content (RFC allows either; choose one and stick to it).

**Validations**

- `id`: must exist; 404 if not found.

**Unit tests**

- Service: `soft_delete_payment_method(session, id)` sets `active=False`; idempotent if already inactive; raises/returns None when not found.

**Integration tests**

- **200 (or 204):** Existing id → success; GET same id still returns record with `active: false`.
- **404:** Non-existent id → 404.

---

## Step 6: GET /api/v1/categories

**Goal:** List active categories. Response: `{ "data": [ { "id", "name", "color", "active", "createdAt" } ] }`.

**Validations**

- None for GET.

**Unit tests**

- Service: `list_categories(session, active_only=True)` returns only active; ordering.

**Integration tests**

- **200:** Empty list and non-empty list; correct shape; inactive excluded.

---

## Step 7: POST /api/v1/categories

**Goal:** Create category. Request: `{ "name", "color"?: string }`. Response: 201, Location, `{ "data": { "id", "name", "color", "active": true, "createdAt" } }`.

**Validations**

- `name`: required, non-empty, max length (e.g. 100); strip whitespace.
- `color`: optional; if present, non-empty string, max length (e.g. 20).

**Unit tests**

- Validator: name required/empty/length; color optional and length.
- Service: create returns `active=True`; persists.

**Integration tests**

- **201:** Valid body (with and without `color`) → 201, correct shape.
- **422:** Missing name; empty name; invalid types.

---

## Step 8: GET /api/v1/categories/{id}

**Goal:** Get one category by id. Return active or inactive (for historical display).

**Validations**

- `id`: exists; 404 otherwise.

**Unit tests**

- Service: get by id; None when not found.

**Integration tests**

- **200:** Existing id → correct shape.
- **404:** Non-existent id.

---

## Step 9: PUT /api/v1/categories/{id}

**Goal:** Update category. Request: `{ "name", "color"? }. Response: 200, `{ "data": { ... } }`.

**Validations**

- Same as POST (name required; color optional). Path id must exist.

**Unit tests**

- Validator and service: same patterns as payment method update.

**Integration tests**

- **200:** Valid update.
- **404:** Non-existent id.
- **422:** Invalid body.

---

## Step 10: DELETE /api/v1/categories/{id}

**Goal:** Soft delete category (set `active = false`). Response: 200 or 204.

**Validations**

- `id` must exist; 404 otherwise.

**Unit tests**

- Service: soft delete; idempotent; not found.

**Integration tests**

- **200/204:** Success; GET same id returns with `active: false`.
- **404:** Non-existent id.

---

## Step 11: GET /api/v1/tag-suggestions

**Goal:** Return `{ "suggestions": string[] }` from suggestion store; optional `q` for prefix/substring match (case-insensitive); max 20; order by `last_used_at` desc.

**Validations**

- Query `q`: optional string; if present, strip; no length constraint for query (backend limits result size).

**Unit tests**

- Service: `get_tag_suggestions(session, q=None)` returns up to 20; when `q` provided, filters case-insensitively; ordering by last_used_at desc.

**Integration tests**

- **200:** No `q` → all suggestions (up to 20) or empty array.
- **200:** With `q` → only matching suggestions; case-insensitive.
- **200:** Empty DB → `{ "suggestions": [] }`.

---

## Step 12: POST /api/v1/ledger-entries

**Goal:** Create ledger entry. Request: `{ "date", "description", "categoryId", "paymentMethodId", "amount", "tags"?: string[] }`. Response: 201, `Location`, `{ "data": { "id", "date", "description", "categoryId", "categoryName", "paymentMethodId", "paymentMethodName", "currency", "amount", "tags", "createdAt", "updatedAt" } }`. Side effect: upsert `tag_suggestions` for each tag.

**Validations**

- `date`: required, ISO date `YYYY-MM-DD`; allow future or not (product choice; recommend allow).
- `description`: required, non-empty, max 500; strip whitespace.
- `categoryId`: required, must reference existing category (active only for new entries per RFC).
- `paymentMethodId`: required, must reference existing payment method (active only).
- `amount`: required, number (integer or decimal); allow negative (refund).
- `tags`: optional array of strings; each element non-empty after trim, max length per tag (e.g. 50); dedupe.

**Unit tests**

- Validator: all required fields; date format; description length; amount type; tags array and element rules.
- Service: create entry; resolve category/payment method and set names/currency in response; upsert tag_suggestions for each tag; 404 or 400 when category/payment method not found or inactive.

**Integration tests**

- **201:** Valid body (with and without tags) → 201, Location, body with resolved names and currency; tag_suggestions table updated.
- **422:** Missing required fields; invalid date format; description empty or too long; amount non-numeric; tags not array or invalid element.
- **404 or 422:** Invalid or inactive categoryId/paymentMethodId (choose one contract and document).

---

## Step 13: GET /api/v1/ledger-entries (list)

**Goal:** Cursor-paginated list, sorted by date desc. Query: `cursor`, `limit` (default 50, max 100), optional filters: `dateFrom`, `dateTo`, `categoryId`, `paymentMethodId`, `type` (expense|refund), `tags` (comma-separated). Response: `{ "data": LedgerEntry[], "nextCursor": string | null }`. Exclude soft-deleted.

**Validations**

- `cursor`: optional, opaque string; invalid cursor → 400 or return first page (document behaviour).
- `limit`: optional, integer 1–100, default 50.
- `dateFrom` / `dateTo`: optional, ISO date; invalid format → 422.
- `categoryId` / `paymentMethodId`: optional, UUID (or id type); invalid → 422 or ignore.
- `type`: optional, enum `expense` | `refund`; filter by sign of amount.
- `tags`: optional, comma-separated strings; filter entries that contain all listed tags (AND).

**Unit tests**

- Service: list with cursor (e.g. (date, id)); apply filters; exclude deleted_at not null; nextCursor present when more results; limit enforced.

**Integration tests**

- **200:** Empty list → `data: []`, `nextCursor: null`.
- **200:** One page of results → correct shape; sort order date desc.
- **200:** Second page with cursor → next page; no duplicate entries.
- **200:** Filters: dateFrom/dateTo, categoryId, paymentMethodId, type, tags (AND) — each filter applied correctly.
- **422:** Invalid limit (e.g. 0, 101); invalid date format.

---

## Step 14: GET /api/v1/ledger-entries/{id}

**Goal:** Get one entry by id. Include resolved categoryName, paymentMethodName, currency. Exclude soft-deleted (404 if deleted).

**Validations**

- `id`: must exist and not soft-deleted; 404 otherwise.

**Unit tests**

- Service: get by id; None when not found or deleted.

**Integration tests**

- **200:** Existing id → full response shape with names and currency.
- **404:** Non-existent or soft-deleted id.

---

## Step 15: PUT /api/v1/ledger-entries/{id}

**Goal:** Update entry. Same request body as POST. Response: 200, `{ "data": { ... } }`. Update tag_suggestions for new tag set.

**Validations**

- Same as POST. Path id must exist and not be soft-deleted; 404 otherwise. categoryId/paymentMethodId must exist (and active for consistency).

**Unit tests**

- Service: update; upsert tag_suggestions; not found when id missing or deleted.

**Integration tests**

- **200:** Valid update → body reflects changes; tag_suggestions updated.
- **404:** Non-existent or deleted id.
- **422:** Invalid body (same cases as POST).

---

## Step 16: DELETE /api/v1/ledger-entries/{id}

**Goal:** Soft delete: set `deleted_at = now()`. Response: 200 with `{ "data": { ... } }` or 204.

**Validations**

- `id`: must exist; 404 if not found. Idempotent: already-deleted returns same success (or 404; choose one).

**Unit tests**

- Service: set deleted_at; idempotent behaviour.

**Integration tests**

- **200/204:** Success; GET same id then returns 404 (or exclude from GET single).
- **404:** Non-existent id.

---

## Step 17: GET /api/v1/analytics/monthly-expense

**Goal:** Query params `from`, `to` (YYYY-MM-DD). Response: `{ "data": [ { "month": "YYYY-MM", "totalExpense": number, "totalRefund": number } ] }`. Only non-deleted entries; totalExpense = sum(amount where amount > 0), totalRefund = abs(sum(amount where amount < 0)).

**Validations**

- `from`, `to`: required (or default to a range); valid ISO date; `from` <= `to`; optional max range (e.g. 1 year) to avoid heavy queries.

**Unit tests**

- Service: aggregate by month; correct sums; date range inclusive; exclude soft-deleted.

**Integration tests**

- **200:** Range with no entries → data array with months and 0 totals.
- **200:** Range with entries → correct totalExpense and totalRefund per month.
- **422:** Missing from/to; invalid format; from > to.

---

## Step 18: GET /api/v1/analytics/expense-by-category

**Goal:** Query param `month` (YYYY-MM). Response: `{ "data": [ { "categoryId", "categoryName", "amount" } ] }`. Only positive amounts (expenses) in that month; exclude soft-deleted.

**Validations**

- `month`: required; format YYYY-MM; valid month.

**Unit tests**

- Service: group by category; sum positive amounts only; exclude deleted.

**Integration tests**

- **200:** No data → empty or zero amounts.
- **200:** With data → correct category breakdown.
- **422:** Missing or invalid month.

---

## Step 19: GET /api/v1/analytics/expense-by-payment-method

**Goal:** Query param `month` (YYYY-MM). Response: `{ "data": [ { "paymentMethodId", "paymentMethodName", "amount" } ] }`. Same rules as expense-by-category.

**Validations**

- Same as Step 18.

**Unit tests**

- Service: group by payment method; positive amounts only; exclude deleted.

**Integration tests**

- **200:** Correct breakdown; 422 for invalid month.

---

## Step 20: GET /api/v1/analytics/custom-by-tags

**Goal:** Query params `tags` (comma-separated), `from`, `to`. Response: `{ "totalExpense": number }`. Sum of positive amounts for entries that have all given tags in range; exclude soft-deleted.

**Validations**

- `tags`: required (at least one tag); comma-separated; trim each.
- `from`, `to`: required; ISO date; from <= to; optional max range.

**Unit tests**

- Service: filter by tags (AND); date range; sum positive amounts only.

**Integration tests**

- **200:** No matching entries → 0.
- **200:** Matching entries → correct total.
- **422:** Missing tags or dates; invalid format.

---

## Step 21: GET /api/v1/analytics/dashboard

**Goal:** Query params `from`, `to`. Response: `{ "totalExpense", "totalRefund", "entryCount", "lastEntries"?: LedgerEntry[] }`. Composite endpoint; lastEntries = last 5 (or 10) by date desc, non-deleted.

**Validations**

- `from`, `to`: required (or default); ISO date; from <= to; optional max range.

**Unit tests**

- Service: compute totals and count; fetch last N entries; exclude deleted.

**Integration tests**

- **200:** Empty range → zeros and empty lastEntries.
- **200:** With data → correct totals, count, and lastEntries shape and order.
- **422:** Invalid or missing dates.

---

## Summary table

| Step | Endpoint | Focus |
|------|----------|--------|
| 0 | (foundation) | Project, DB, migrations, test harness |
| 1 | GET /payment-methods | List active |
| 2 | POST /payment-methods | Create + validations |
| 3 | GET /payment-methods/{id} | Get one |
| 4 | PUT /payment-methods/{id} | Update |
| 5 | DELETE /payment-methods/{id} | Soft delete |
| 6–10 | Categories | Same pattern as payment-methods |
| 11 | GET /tag-suggestions | Suggestions only |
| 12 | POST /ledger-entries | Create + tag_suggestions upsert |
| 13 | GET /ledger-entries | Cursor list + filters |
| 14 | GET /ledger-entries/{id} | Get one |
| 15 | PUT /ledger-entries/{id} | Update |
| 16 | DELETE /ledger-entries/{id} | Soft delete |
| 17 | GET /analytics/monthly-expense | Monthly aggregates |
| 18 | GET /analytics/expense-by-category | Category breakdown |
| 19 | GET /analytics/expense-by-payment-method | Payment method breakdown |
| 20 | GET /analytics/custom-by-tags | Tag total |
| 21 | GET /analytics/dashboard | Composite dashboard |

Each step is implementable and testable in isolation; complete Steps 0–10 before ledger and analytics so that category and payment method IDs exist for validation and response resolution.
