#!/usr/bin/env python3
"""
Ingest expense CSV files into the Kept API.

Reads a CSV with columns: date (day), description, category, tags, items, amount,
payment method. Month and year are taken from the filename (expense-<month>-<year>.csv).
Creates missing payment methods (EUR) and categories via the API, then creates
ledger entries. Use "Unknown" for missing payment method or category (created once, reused).

Usage:
    python scripts/ingest_expenses.py expense-july-2025.csv
    python scripts/ingest_expenses.py expense-july-2025.csv --base-url http://localhost:8000
    python scripts/ingest_expenses.py expense-july-2025.csv --dry-run

Requires the API server to be running (unless --dry-run).
"""

from __future__ import annotations

import argparse
import calendar
import csv
import json
import random
import re
import sys
from decimal import Decimal
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

# Only first 7 columns are used; columns 8+ are analytical and ignored.
COL_DATE = 0
COL_DESCRIPTION = 1
COL_CATEGORY = 2
COL_TAGS = 3
COL_ITEMS = 4
COL_AMOUNT = 5
COL_PAYMENT_METHOD = 6
NUM_COLS = 7

UNKNOWN_LABEL = "Unknown"
CURRENCY_EUR = "EUR"

# Category color palette (max 20 chars per API).
CATEGORY_COLORS = [
    "#3b82f6",
    "#22c55e",
    "#eab308",
    "#ef4444",
    "#8b5cf6",
    "#ec4899",
    "#14b8a6",
    "#f97316",
]

MONTH_NAMES = [
    "january", "february", "march", "april", "may", "june",
    "july", "august", "september", "october", "november", "december",
]


def parse_month_year_from_filename(csv_path: Path) -> tuple[int, int]:
    """Parse month and year from filename expense-<month>-<year>.csv.
    Month can be full name (e.g. july) or two-digit (01-12).
    Returns (month, year) with month 1-12. Raises ValueError if pattern not matched.
    """
    name = csv_path.stem.lower()
    # expense-july-2025 or expense-07-2025
    match = re.match(r"^expense-(.+)-(\d{4})$", name)
    if not match:
        raise ValueError(
            f"Filename must match expense-<month>-<year>.csv (e.g. expense-july-2025.csv), got: {csv_path.name}"
        )
    month_str, year_str = match.group(1), match.group(2)
    year = int(year_str)
    if not (1 <= year <= 9999):
        raise ValueError(f"Invalid year in filename: {year_str}")

    # Try month name first
    try:
        month = MONTH_NAMES.index(month_str) + 1
        return (month, year)
    except ValueError:
        pass

    # Try two-digit month
    try:
        month = int(month_str)
        if 1 <= month <= 12:
            return (month, year)
    except ValueError:
        pass

    raise ValueError(
        f"Month in filename must be a full month name (e.g. july) or 01-12, got: {month_str}"
    )


def normalize_optional(s: str) -> str:
    """Normalize payment method or category: blank or placeholder -> Unknown."""
    if not s or not (t := s.strip()) or t == "?":
        return UNKNOWN_LABEL
    return t


def parse_tags(tags_cell: str) -> list[str] | None:
    """Parse tags from column; return list of non-empty trimmed strings or None."""
    if not tags_cell or not (t := tags_cell.strip()):
        return None
    parts = [p.strip() for p in t.split(",") if p.strip()]
    return parts if parts else None


def load_rows(csv_path: Path, month: int, year: int, skip_invalid: bool) -> list[dict]:
    """Load and normalize rows from CSV. Only first 7 columns used. Carry-forward date.
    Returns list of dicts with date, description, category, tags, amount, payment_method.
    """
    rows: list[dict] = []
    last_day: int | None = None
    _, max_day = calendar.monthrange(year, month)

    with open(csv_path, newline="", encoding="utf-8") as f:
        reader = csv.reader(f)
        header = next(reader, None)
        if not header:
            raise ValueError("CSV has no header row")
        # Use only first NUM_COLS columns
        for line_no, row in enumerate(reader, start=2):
            # Ignore columns beyond first 7
            cells = row[:NUM_COLS] if len(row) >= NUM_COLS else row + [""] * (NUM_COLS - len(row))

            day_cell = (cells[COL_DATE] or "").strip()
            if day_cell:
                try:
                    last_day = int(day_cell)
                    if not (1 <= last_day <= max_day):
                        if skip_invalid:
                            print(f"Skipping line {line_no}: day {last_day} out of range for {year}-{month:02d}", file=sys.stderr)
                            continue
                        raise ValueError(f"Line {line_no}: day {last_day} out of range for {year}-{month:02d}")
                except ValueError as e:
                    if "invalid literal" in str(e).lower():
                        if skip_invalid:
                            print(f"Skipping line {line_no}: invalid date cell", file=sys.stderr)
                            continue
                    raise

            if last_day is None:
                if skip_invalid:
                    print(f"Skipping line {line_no}: no date", file=sys.stderr)
                    continue
                raise ValueError(f"Line {line_no}: date column is empty and no previous date to carry forward")

            description = (cells[COL_DESCRIPTION] or "").strip()
            if not description:
                if skip_invalid:
                    print(f"Skipping line {line_no}: empty description", file=sys.stderr)
                    continue
                raise ValueError(f"Line {line_no}: empty description")

            amount_cell = (cells[COL_AMOUNT] or "").strip()
            if not amount_cell:
                if skip_invalid:
                    print(f"Skipping line {line_no}: empty amount", file=sys.stderr)
                    continue
                raise ValueError(f"Line {line_no}: empty amount")
            try:
                amount = Decimal(amount_cell)
            except Exception:
                if skip_invalid:
                    print(f"Skipping line {line_no}: invalid amount {amount_cell!r}", file=sys.stderr)
                    continue
                raise ValueError(f"Line {line_no}: invalid amount {amount_cell!r}")

            category = normalize_optional(cells[COL_CATEGORY] or "")
            payment_method = normalize_optional(cells[COL_PAYMENT_METHOD] or "")
            tags = parse_tags(cells[COL_TAGS] or "")

            full_date = f"{year}-{month:02d}-{last_day:02d}"
            rows.append({
                "date": full_date,
                "description": description[:500],
                "category": category,
                "payment_method": payment_method,
                "amount": amount,
                "tags": tags,
            })

    return rows


def api_get(base_url: str, path: str) -> dict:
    """GET JSON from API. Raises on non-2xx or connection error."""
    url = f"{base_url.rstrip('/')}{path}"
    req = Request(url, method="GET", headers={"Accept": "application/json"})
    try:
        with urlopen(req, timeout=30) as resp:
            return json.loads(resp.read().decode())
    except HTTPError as e:
        body = e.read().decode() if e.fp else ""
        raise RuntimeError(f"GET {url} failed {e.code}: {body}") from e
    except URLError as e:
        raise RuntimeError(f"GET {url} failed: {e.reason}") from e


def api_post(base_url: str, path: str, body: dict) -> dict:
    """POST JSON to API. Raises on non-2xx or connection error."""
    url = f"{base_url.rstrip('/')}{path}"
    data = json.dumps(body).encode("utf-8")
    req = Request(
        url,
        data=data,
        method="POST",
        headers={"Accept": "application/json", "Content-Type": "application/json"},
    )
    try:
        with urlopen(req, timeout=30) as resp:
            return json.loads(resp.read().decode())
    except HTTPError as e:
        body = e.read().decode() if e.fp else ""
        raise RuntimeError(f"POST {url} failed {e.code}: {body}") from e
    except URLError as e:
        raise RuntimeError(f"POST {url} failed: {e.reason}") from e


def ensure_payment_methods(
    base_url: str,
    names: set[str],
) -> dict[str, str]:
    """Build name -> id map. GET existing first; create only missing (including Unknown)."""
    out: dict[str, str] = {}
    resp = api_get(base_url, "/api/v1/payment-methods")
    for item in resp.get("data") or []:
        out[item["name"].strip()] = str(item["id"])

    for name in names:
        if name in out:
            continue
        created = api_post(base_url, "/api/v1/payment-methods", {"name": name, "currency": CURRENCY_EUR})
        out[name] = str(created["data"]["id"])
    return out


def ensure_categories(
    base_url: str,
    names: set[str],
) -> dict[str, str]:
    """Build name -> id map. GET existing first; create only missing (with random color)."""
    out: dict[str, str] = {}
    resp = api_get(base_url, "/api/v1/categories")
    for item in resp.get("data") or []:
        out[item["name"].strip()] = str(item["id"])

    for name in names:
        if name in out:
            continue
        color = random.choice(CATEGORY_COLORS)
        created = api_post(base_url, "/api/v1/categories", {"name": name, "color": color})
        out[name] = str(created["data"]["id"])
    return out


def create_ledger_entries(
    base_url: str,
    rows: list[dict],
    category_ids: dict[str, str],
    payment_method_ids: dict[str, str],
) -> int:
    """POST each ledger entry. Amount: negative if 'refund' in description else positive. Returns count created."""
    count = 0
    for row in rows:
        desc = row["description"]
        amount = row["amount"]
        if "refund" in desc.lower():
            amount = -abs(amount)
        else:
            amount = abs(amount)

        body = {
            "date": row["date"],
            "description": desc,
            "categoryId": category_ids[row["category"]],
            "paymentMethodId": payment_method_ids[row["payment_method"]],
            "amount": str(amount),
            "tags": row["tags"],
        }
        api_post(base_url, "/api/v1/ledger-entries", body)
        count += 1
    return count


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Ingest expense CSV into Kept API (first 7 columns only)."
    )
    parser.add_argument(
        "csv_path",
        type=Path,
        help="Path to CSV file (e.g. expense-july-2025.csv)",
    )
    parser.add_argument(
        "--base-url",
        default="http://localhost:8000",
        help="API base URL (default: http://localhost:8000)",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Parse CSV and print summary only; do not call API",
    )
    parser.add_argument(
        "--skip-invalid",
        action="store_true",
        help="Skip rows with missing date, description, or amount",
    )
    args = parser.parse_args()

    csv_path: Path = args.csv_path
    if not csv_path.is_file():
        print(f"Error: file not found: {csv_path}", file=sys.stderr)
        return 1

    try:
        month, year = parse_month_year_from_filename(csv_path)
    except ValueError as e:
        print(f"Error: {e}", file=sys.stderr)
        return 1

    try:
        rows = load_rows(csv_path, month, year, args.skip_invalid)
    except ValueError as e:
        print(f"Error: {e}", file=sys.stderr)
        return 1

    if not rows:
        print("No rows to ingest.")
        return 0

    if args.dry_run:
        categories = {r["category"] for r in rows}
        payment_methods = {r["payment_method"] for r in rows}
        print(f"Dry run: {len(rows)} rows, {len(categories)} categories, {len(payment_methods)} payment methods.")
        print(f"Date range: {rows[0]['date']} .. {rows[-1]['date']}")
        return 0

    categories_needed = {r["category"] for r in rows}
    payment_methods_needed = {r["payment_method"] for r in rows}

    try:
        payment_method_ids = ensure_payment_methods(args.base_url, payment_methods_needed)
        category_ids = ensure_categories(args.base_url, categories_needed)
        created_entries = create_ledger_entries(args.base_url, rows, category_ids, payment_method_ids)
    except RuntimeError as e:
        print(f"API error: {e}", file=sys.stderr)
        return 1

    print(f"Created {created_entries} ledger entries.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
