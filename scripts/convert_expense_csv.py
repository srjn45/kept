#!/usr/bin/env python3
"""
Convert a personal trip-expense CSV (day-of-month, description, category, tags,
items, amount, payment method — plus any number of trailing analytical columns,
which are ignored) into the CSV format Kept's Settings -> Import
accepts: date,title,amount,currency,category,tags,description
(see apps/mobile/src/data/backup.ts).

Month and year are read from the filename (a month name followed by a 2- or
4-digit year, e.g. "Barcelona Expenses - June25.csv"). A blank date cell
carries forward the previous row's day, matching how these trip logs are kept.

Usage:
    python scripts/convert_expense_csv.py "scratch/Barcelona Expenses - June25.csv" \
        -o scratch/june25-app-import.csv --currency EUR
"""

from __future__ import annotations

import argparse
import calendar
import csv
import re
import sys
from decimal import Decimal, InvalidOperation
from pathlib import Path

COL_DATE = 0
COL_DESCRIPTION = 1
COL_CATEGORY = 2
COL_TAGS = 3
COL_ITEMS = 4
COL_AMOUNT = 5
COL_PAYMENT_METHOD = 6
NUM_COLS = 7

APP_CSV_HEADER = ['date', 'title', 'amount', 'currency', 'category', 'tags', 'description']

MONTH_NAMES = [
    'january', 'february', 'march', 'april', 'may', 'june',
    'july', 'august', 'september', 'october', 'november', 'december',
]

# Maps this trip-log's free-form category labels onto Kept's preloaded
# categories (apps/mobile/src/db/seed.ts SEED_CATEGORY_NAMES), so imported rows land
# in the app's existing categories instead of spawning near-duplicates ("food" vs
# "Food & Dining"). A category not listed here is passed through unchanged — the
# importer auto-creates it.
CATEGORY_MAP = {
    'food': 'Food & Dining',
    'groceries': 'Groceries',
    'commute': 'Transport',
    'travel': 'Travel',
    'shopping': 'Shopping',
    'subscription': 'Subscriptions',
    'utility': 'Utilities',
    'leisure': 'Entertainment',
    'others': 'Miscellaneous',
}


def parse_month_year_from_filename(csv_path: Path) -> tuple[int, int]:
    stem = csv_path.stem.lower()
    pattern = r'(' + '|'.join(MONTH_NAMES) + r')\s*(\d{2}|\d{4})'
    match = re.search(pattern, stem)
    if not match:
        raise ValueError(
            f'Filename must contain a month name + 2/4-digit year (e.g. "June25"), got: {csv_path.name}'
        )
    month = MONTH_NAMES.index(match.group(1)) + 1
    year_str = match.group(2)
    year = int(year_str) if len(year_str) == 4 else 2000 + int(year_str)
    return month, year


def map_category(raw: str) -> str:
    return CATEGORY_MAP.get(raw.strip().lower(), raw.strip())


def parse_tags(cell: str) -> str:
    parts = [p.strip() for p in cell.split(',') if p.strip()]
    return '|'.join(parts)


def convert_rows(csv_path: Path, month: int, year: int, currency: str) -> list[list[str]]:
    _, max_day = calendar.monthrange(year, month)
    out_rows: list[list[str]] = [APP_CSV_HEADER]
    last_day: int | None = None

    with open(csv_path, newline='', encoding='utf-8') as f:
        reader = csv.reader(f)
        header = next(reader, None)
        if not header:
            raise ValueError('CSV has no header row')

        for line_no, row in enumerate(reader, start=2):
            cells = row[:NUM_COLS] if len(row) >= NUM_COLS else row + [''] * (NUM_COLS - len(row))
            if not any(c.strip() for c in cells):
                continue  # fully blank row

            day_cell = cells[COL_DATE].strip()
            if day_cell:
                try:
                    day = int(day_cell)
                except ValueError:
                    print(f'Skipping line {line_no}: invalid date cell {day_cell!r}', file=sys.stderr)
                    continue
                if not (1 <= day <= max_day):
                    print(f'Skipping line {line_no}: day {day} out of range for {year}-{month:02d}', file=sys.stderr)
                    continue
                last_day = day
            elif last_day is None:
                print(f'Skipping line {line_no}: no date and no previous date to carry forward', file=sys.stderr)
                continue
            day = last_day

            description = cells[COL_DESCRIPTION].strip()
            if not description:
                print(f'Skipping line {line_no}: missing description (title)', file=sys.stderr)
                continue

            amount_cell = cells[COL_AMOUNT].strip()
            if not amount_cell:
                print(f'Skipping line {line_no} ({description}): missing amount', file=sys.stderr)
                continue
            try:
                amount = abs(Decimal(amount_cell))
            except InvalidOperation:
                print(f'Skipping line {line_no} ({description}): invalid amount {amount_cell!r}', file=sys.stderr)
                continue
            if amount == 0:
                print(f'Skipping line {line_no} ({description}): zero amount', file=sys.stderr)
                continue

            is_refund = 'refund' in description.lower()
            amount_str = f'+{amount}' if is_refund else str(amount)

            category_raw = cells[COL_CATEGORY].strip()
            category = map_category(category_raw) if category_raw else ''
            if category_raw and category == category_raw and category_raw.lower() not in (
                c.lower() for c in CATEGORY_MAP.values()
            ):
                print(f'Note line {line_no}: unmapped category {category_raw!r} — will be auto-created', file=sys.stderr)

            tags = parse_tags(cells[COL_TAGS])
            payment_method = cells[COL_PAYMENT_METHOD].strip()
            note = f'Paid via {payment_method}' if payment_method else ''

            out_rows.append([
                f'{year}-{month:02d}-{day:02d}',
                description,
                amount_str,
                currency,
                category,
                tags,
                note,
            ])

    return out_rows


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument('csv_path', type=Path, help='Path to the source trip-expense CSV')
    parser.add_argument('-o', '--output', type=Path, help='Output path (default: <input>-app-import.csv next to input)')
    parser.add_argument('--currency', default='EUR', help='ISO 4217 currency for every row (default: EUR)')
    args = parser.parse_args()

    if not args.csv_path.is_file():
        print(f'Error: file not found: {args.csv_path}', file=sys.stderr)
        return 1

    try:
        month, year = parse_month_year_from_filename(args.csv_path)
    except ValueError as e:
        print(f'Error: {e}', file=sys.stderr)
        return 1

    rows = convert_rows(args.csv_path, month, year, args.currency)
    if len(rows) <= 1:
        print('No rows converted.')
        return 0

    output = args.output or args.csv_path.with_name(args.csv_path.stem + '-app-import.csv')
    with open(output, 'w', newline='', encoding='utf-8') as f:
        csv.writer(f).writerows(rows)

    print(f'Wrote {len(rows) - 1} entries to {output}')
    return 0


if __name__ == '__main__':
    sys.exit(main())
