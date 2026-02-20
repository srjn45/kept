"""Lightweight schema tests: assert tables, columns, and key indexes from Alembic migrations.

Requires migrations to be applied to the test database first: run `uv run alembic upgrade head` from apps/api.
Uses the same DB as other tests (TEST_DATABASE_URL or DATABASE_URL) via a sync engine (psycopg2).
"""

from sqlalchemy import inspect

# Expected tables and their columns (names only; types can be added later if needed).
EXPECTED_TABLES = {
    "payment_methods": {"id", "name", "currency", "active", "created_at", "updated_at"},
    "categories": {"id", "name", "color", "active", "created_at", "updated_at"},
    "ledger_entries": {
        "id",
        "date",
        "description",
        "category_id",
        "payment_method_id",
        "amount",
        "tags",
        "created_at",
        "updated_at",
        "deleted_at",
    },
    "tag_suggestions": {"tag_text", "last_used_at"},
}

# Key indexes on ledger_entries: index name -> set of column names.
EXPECTED_LEDGER_INDEXES = {
    "ix_ledger_entries_date_id": {"date", "id"},
    "ix_ledger_entries_category_id": {"category_id"},
    "ix_ledger_entries_payment_method_id": {"payment_method_id"},
}


def test_all_tables_exist(sync_engine):
    """Migration creates the four expected tables."""
    inspector = inspect(sync_engine)
    tables = set(inspector.get_table_names())
    for expected in EXPECTED_TABLES:
        assert expected in tables, f"Table {expected!r} not found. Got: {sorted(tables)}"


def test_payment_methods_columns(sync_engine):
    """payment_methods has expected columns."""
    inspector = inspect(sync_engine)
    columns = {c["name"] for c in inspector.get_columns("payment_methods")}
    assert columns == EXPECTED_TABLES["payment_methods"], f"payment_methods: expected {EXPECTED_TABLES['payment_methods']}, got {columns}"


def test_categories_columns(sync_engine):
    """categories has expected columns."""
    inspector = inspect(sync_engine)
    columns = {c["name"] for c in inspector.get_columns("categories")}
    assert columns == EXPECTED_TABLES["categories"], f"categories: expected {EXPECTED_TABLES['categories']}, got {columns}"


def test_ledger_entries_columns(sync_engine):
    """ledger_entries has expected columns."""
    inspector = inspect(sync_engine)
    columns = {c["name"] for c in inspector.get_columns("ledger_entries")}
    assert columns == EXPECTED_TABLES["ledger_entries"], f"ledger_entries: expected {EXPECTED_TABLES['ledger_entries']}, got {columns}"


def test_tag_suggestions_columns(sync_engine):
    """tag_suggestions has expected columns."""
    inspector = inspect(sync_engine)
    columns = {c["name"] for c in inspector.get_columns("tag_suggestions")}
    assert columns == EXPECTED_TABLES["tag_suggestions"], f"tag_suggestions: expected {EXPECTED_TABLES['tag_suggestions']}, got {columns}"


def test_ledger_entries_indexes(sync_engine):
    """ledger_entries has expected indexes for listing and filtering."""
    inspector = inspect(sync_engine)
    indexes = {idx["name"]: set(idx["column_names"]) for idx in inspector.get_indexes("ledger_entries")}
    for index_name, expected_cols in EXPECTED_LEDGER_INDEXES.items():
        assert index_name in indexes, f"Index {index_name!r} not found. Got: {list(indexes)}"
        actual = indexes[index_name]
        assert actual == expected_cols, f"Index {index_name}: expected columns {expected_cols}, got {actual}"
