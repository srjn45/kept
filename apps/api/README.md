# Expense Manager API

Backend for Expense Manager (FastAPI + PostgreSQL). See [doc/rfc-001-expense-manager.md](../../doc/rfc-001-expense-manager.md) and [doc/implementation-plan-be.md](../../doc/implementation-plan-be.md).

## Setup

1. **uv** (Python package manager): install from [https://docs.astral.sh/uv/](https://docs.astral.sh/uv/).

2. **PostgreSQL** — start the test/dev database with Docker Compose (from repo root):
   ```bash
   docker compose up -d
   ```
   This starts PostgreSQL 16 on port 5432 with databases `expense_manager` and `expense_manager_test`. Stop with `docker compose down`.

3. From `apps/api/`:
   ```bash
   uv sync
   ```

4. Copy `.env.example` to `.env` and set `DATABASE_URL` to your PostgreSQL (async: `postgresql+asyncpg://...`). With Docker Compose defaults, use:
   ```
   DATABASE_URL=postgresql+asyncpg://postgres:postgres@localhost:5432/expense_manager
   TEST_DATABASE_URL=postgresql+asyncpg://postgres:postgres@localhost:5432/expense_manager_test
   ```

5. Run migrations:
   ```bash
   uv run alembic upgrade head
   ```

6. Start the API:
   ```bash
   uv run uvicorn app.main:app --reload
   ```

- Health: `GET http://localhost:8000/health`
- OpenAPI: `GET http://localhost:8000/docs`

## Tests

From `apps/api/`:

```bash
uv run pytest
```

Uses `TEST_DATABASE_URL` if set, otherwise `DATABASE_URL`. Ensure the database exists and migrations have been run (`uv run alembic upgrade head`).
