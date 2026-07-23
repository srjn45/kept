# Product Requirements Document: Kept

**Product name:** Kept  
**Version:** 0.1  
**Last updated:** February 2026  
**Status:** Draft  

---

## 1. Product overview

Kept is a web-first application for recording, categorizing, and visualizing personal (or small-team) expenses. Users maintain a ledger, define categories and tags, attach payment methods, and view charts (monthly totals, by category, by payment method) and custom tag-based totals. The product will start as a web app and may expand to mobile (native or hybrid) later.

---

## 2. Goals and success criteria

- **Primary:** Users can reliably add, edit, and delete ledger entries and see a clear, accurate ledger and charts.
- **Secondary:** Users can slice data by category, payment method, and tags via predefined views and custom queries.
- **Success metrics (examples):** Time to add an entry &lt; 30 seconds, charts load in &lt; 2 seconds, zero data loss on normal use.

---

## 3. User personas

- **Primary:** Individual user managing personal/family expenses, comfortable with web apps.
- **Future:** Shared household or small team (multi-user, permissions).

---

## 4. Functional requirements

### 4.1 Data entry and setup

| ID | Requirement | Priority | Notes |
|----|-------------|----------|--------|
| FR-1.1 | As a user, I can add payment methods I use (e.g. Card, Cash, UPI). | Must | Each method has a name; optional: currency, icon. |
| FR-1.2 | As a user, I can define categories (e.g. Food, Transport). | Must | Category name required; optional: color, icon. |
| FR-1.3 | As a user, I can define tags (e.g. #work, #reimbursable). | Must | Tags are multi-select per entry; optional: predefined list. |
| FR-1.4 | As a user, I can view my ledger (list/table of all entries). | Must | Sortable/filterable by date, category, type, etc. |
| FR-1.5 | As a user, I can add a ledger entry. | Must | See data model below. |
| FR-1.6 | As a user, I can edit an existing ledger entry. | Must | All fields editable. |
| FR-1.7 | As a user, I can delete a ledger entry. | Must | With confirmation to avoid accidents. |

**Ledger entry data model (per entry):**

- **Date** (required)
- **Description** (required)
- **Category** (required, from user-defined categories)
- **Tags** (optional, multi-select from user-defined tags)
- **Amount** (required): value + currency
- **Payment method** (required, from user-defined payment methods)
- **Type** (required): `expense` or `refund`

(Refunds can be represented as negative amounts or a separate type depending on implementation; both are in scope.)

---

### 4.2 Data visualization

| ID | Requirement | Priority | Notes |
|----|-------------|----------|--------|
| FR-2.1 | As a user, I can view a consolidated view of my data (dashboard). | Must | Summary cards + links to detailed charts. |
| FR-2.2 | As a user, I can view monthly expense in a bar graph (one bar per month). | Must | Time range selector (e.g. last 6/12 months). |
| FR-2.3 | As a user, I can view monthly expense per category with a toggle between bar graph and pie chart. | Must | Month selector; bar = categories on x-axis, pie = category breakdown. |
| FR-2.4 | As a user, I can view monthly expense per payment method with a toggle between bar graph and pie chart. | Must | Same interaction pattern as FR-2.3. |
| FR-2.5 | As a user, I can run a custom query to calculate total expense filtered by tags. | Must | e.g. "Total expense where tag = #work" for a selected date range. |

---

## 5. Non-functional requirements

- **Performance:** Ledger and charts should load in under 2 seconds for typical dataset (e.g. &lt; 10k entries).
- **Usability:** Add/edit entry in minimal steps; mobile-friendly layout for future.
- **Data integrity:** No silent loss of data; validate required fields and amounts.
- **Security (later):** If multi-user or cloud, authenticate users and scope data per user.

---

## 6. Data model (conceptual)

- **PaymentMethod:** id, name, currency (optional), createdAt.
- **Category:** id, name, color/icon (optional), createdAt.
- **Tag:** id, name, createdAt.
- **LedgerEntry:** id, date, description, categoryId, amountValue, amountCurrency, paymentMethodId, type (expense | refund), createdAt, updatedAt.
- **LedgerEntryTag:** ledgerEntryId, tagId (many-to-many between LedgerEntry and Tag).

---

## 7. API outline (REST)

- `GET/POST /api/payment-methods`
- `GET/PUT/DELETE /api/payment-methods/:id`
- `GET/POST /api/categories`
- `GET/PUT/DELETE /api/categories/:id`
- `GET/POST /api/tags`
- `GET/PUT/DELETE /api/tags/:id`
- `GET/POST /api/ledger-entries` (POST body: date, description, categoryId, tagIds[], amountValue, amountCurrency, paymentMethodId, type)
- `GET/PUT/DELETE /api/ledger-entries/:id`
- `GET /api/analytics/monthly-expense?from=&to=`
- `GET /api/analytics/monthly-expense-by-category?month=&year=`
- `GET /api/analytics/monthly-expense-by-payment-method?month=&year=`
- `GET /api/analytics/custom-by-tags?tagIds=&from=&to=` (or POST with body for complex filters)

---

## 8. UI/UX considerations

- **Navigation:** Sidebar or top nav: Ledger, Dashboard, Payment methods, Categories & tags, Custom query.
- **Ledger:** Table with columns matching the data model; row actions: Edit, Delete; "Add entry" FAB or button.
- **Charts:** Month/range picker at top; for "per category" and "per payment method," a clear Bar/Pie toggle.
- **Custom query:** Tag multi-select, date range, result = total expense (and optionally list of matching entries).
- **Empty states:** Onboarding when no payment methods/categories; hints to add first entry.

---

## 9. Phases and milestones

| Phase | Scope | Outcome |
|-------|--------|--------|
| **M1 – Foundation** | Payment methods, categories, tags CRUD; ledger CRUD; single currency. | User can maintain master data and full ledger. |
| **M2 – Core charts** | Dashboard, monthly bar, category and payment method (bar + pie). | User can see all required visualizations. |
| **M3 – Custom query** | Tag-based total expense for date range. | User can answer "how much by tag?". |
| **M4 – Polish** | Filters on ledger, export (CSV), better empty states. | Production-ready web app. |
| **Future** | Mobile (React Native/Expo or Capacitor), multi-user, auth, cloud sync. | Broader platform and collaboration. |

---

## 10. Out of scope (v1)

- Multi-user and authentication (in scope only when expanding beyond single-user).
- Recurring expenses, budgets, and forecasts.
- Bank/statement import (can be added later).
- Multiple currencies with conversion (single currency or manual handling in v1).

---

## 11. Open questions

- Default currency: single global default or per payment method?
- Refund: separate "type" vs negative amount only? (Recommendation: store as `type` and keep amount positive for clarity.)
- Custom query: only "total by tags" or also "list of entries" and more filters (category, payment method)?
