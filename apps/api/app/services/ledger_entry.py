"""Ledger entry service: create, list (get, update, delete in later steps)."""

import base64
import json
from datetime import date
from decimal import Decimal
from uuid import UUID

from sqlalchemy import and_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Category, LedgerEntry, PaymentMethod
from app.services import category as category_service
from app.services import payment_method as payment_method_service
from app.services import tag_suggestion as tag_suggestion_service


class LedgerEntryError(Exception):
    """Raised when category or payment method not found or inactive."""

    def __init__(self, message: str) -> None:
        self.message = message
        super().__init__(message)


async def create_ledger_entry(
    session: AsyncSession,
    *,
    date_: date,
    description: str,
    category_id: UUID,
    payment_method_id: UUID,
    amount: Decimal,
    tags: list[str] | None = None,
) -> tuple[LedgerEntry, str, str, str]:
    """Create a ledger entry. Resolve category and payment method (must exist and be active).
    Upserts tag_suggestions for each tag. Returns (entry, category_name, payment_method_name, currency).
    Raises LedgerEntryError when category or payment method not found or inactive.
    """
    category = await category_service.get_category(session, category_id)
    if category is None:
        raise LedgerEntryError("Category not found")
    if not category.active:
        raise LedgerEntryError("Category not found")
    payment_method = await payment_method_service.get_payment_method(
        session, payment_method_id
    )
    if payment_method is None:
        raise LedgerEntryError("Payment method not found")
    if not payment_method.active:
        raise LedgerEntryError("Payment method not found")

    tag_list = tags or []
    entry = LedgerEntry(
        date=date_,
        description=description.strip(),
        category_id=category_id,
        payment_method_id=payment_method_id,
        amount=amount,
        tags=tag_list,
    )
    session.add(entry)
    await session.flush()
    if tag_list:
        await tag_suggestion_service.upsert_tag_suggestions(session, tag_list)
    await session.refresh(entry)
    return (
        entry,
        category.name,
        payment_method.name,
        payment_method.currency,
    )


def _encode_cursor(entry_date: date, entry_id: UUID) -> str:
    """Encode (date, id) into an opaque cursor string."""
    payload = {"d": str(entry_date), "i": str(entry_id)}
    return base64.urlsafe_b64encode(json.dumps(payload).encode()).decode()


async def get_ledger_entry(
    session: AsyncSession,
    id: UUID,
) -> tuple[LedgerEntry, str, str, str] | None:
    """Get a ledger entry by id with resolved category name, payment method name, currency.
    Returns None if not found or soft-deleted.
    """
    q = (
        select(LedgerEntry, Category.name, PaymentMethod.name, PaymentMethod.currency)
        .select_from(LedgerEntry)
        .join(Category, LedgerEntry.category_id == Category.id)
        .join(PaymentMethod, LedgerEntry.payment_method_id == PaymentMethod.id)
        .where(LedgerEntry.id == id, LedgerEntry.deleted_at.is_(None))
    )
    result = await session.execute(q)
    row = result.one_or_none()
    if row is None:
        return None
    return (row[0], row[1], row[2], row[3])


async def update_ledger_entry(
    session: AsyncSession,
    id: UUID,
    *,
    date_: date,
    description: str,
    category_id: UUID,
    payment_method_id: UUID,
    amount: Decimal,
    tags: list[str] | None = None,
) -> tuple[LedgerEntry, str, str, str] | None:
    """Update a ledger entry. Returns None if not found or soft-deleted.
    Raises LedgerEntryError when category or payment method not found or inactive.
    Upserts tag_suggestions for the new tag set.
    """
    row = await get_ledger_entry(session, id)
    if row is None:
        return None
    entry, _, _, _ = row

    category = await category_service.get_category(session, category_id)
    if category is None:
        raise LedgerEntryError("Category not found")
    if not category.active:
        raise LedgerEntryError("Category not found")
    payment_method = await payment_method_service.get_payment_method(
        session, payment_method_id
    )
    if payment_method is None:
        raise LedgerEntryError("Payment method not found")
    if not payment_method.active:
        raise LedgerEntryError("Payment method not found")

    tag_list = tags or []
    entry.date = date_
    entry.description = description.strip()
    entry.category_id = category_id
    entry.payment_method_id = payment_method_id
    entry.amount = amount
    entry.tags = tag_list
    await session.flush()
    if tag_list:
        await tag_suggestion_service.upsert_tag_suggestions(session, tag_list)
    await session.refresh(entry)
    return (
        entry,
        category.name,
        payment_method.name,
        payment_method.currency,
    )


def _decode_cursor(cursor: str) -> tuple[date, UUID] | None:
    """Decode cursor to (date, id). Returns None if invalid."""
    try:
        raw = base64.urlsafe_b64decode(cursor.encode())
        data = json.loads(raw.decode())
        return date.fromisoformat(data["d"]), UUID(data["i"])
    except (ValueError, KeyError, TypeError):
        return None


async def list_ledger_entries(
    session: AsyncSession,
    *,
    cursor: str | None = None,
    limit: int = 50,
    date_from: date | None = None,
    date_to: date | None = None,
    category_id: UUID | None = None,
    payment_method_id: UUID | None = None,
    type_: str | None = None,
    tags: list[str] | None = None,
) -> tuple[list[tuple[LedgerEntry, str, str, str]], str | None]:
    """List ledger entries (excl. soft-deleted), cursor-paginated, date desc, id desc.
    Returns ((entry, category_name, payment_method_name, currency), ...), next_cursor.
    type_: 'expense' = amount < 0, 'refund' = amount > 0. tags: entries must contain all (AND).
    Invalid cursor is ignored (first page returned).
    """
    q = (
        select(LedgerEntry, Category.name, PaymentMethod.name, PaymentMethod.currency)
        .select_from(LedgerEntry)
        .join(Category, LedgerEntry.category_id == Category.id)
        .join(PaymentMethod, LedgerEntry.payment_method_id == PaymentMethod.id)
        .where(LedgerEntry.deleted_at.is_(None))
    )
    if date_from is not None:
        q = q.where(LedgerEntry.date >= date_from)
    if date_to is not None:
        q = q.where(LedgerEntry.date <= date_to)
    if category_id is not None:
        q = q.where(LedgerEntry.category_id == category_id)
    if payment_method_id is not None:
        q = q.where(LedgerEntry.payment_method_id == payment_method_id)
    if type_ == "expense":
        q = q.where(LedgerEntry.amount < 0)
    elif type_ == "refund":
        q = q.where(LedgerEntry.amount > 0)
    if tags:
        q = q.where(LedgerEntry.tags.contains(tags))
    if cursor:
        decoded = _decode_cursor(cursor)
        if decoded is not None:
            cursor_date, cursor_id = decoded
            q = q.where(
                and_(
                    (LedgerEntry.date < cursor_date)
                    | ((LedgerEntry.date == cursor_date) & (LedgerEntry.id < cursor_id))
                )
            )
    q = q.order_by(LedgerEntry.date.desc(), LedgerEntry.id.desc()).limit(limit + 1)
    result = await session.execute(q)
    rows = result.all()
    next_cursor: str | None = None
    if len(rows) > limit:
        last_returned = rows[limit - 1]
        next_cursor = _encode_cursor(last_returned[0].date, last_returned[0].id)
        rows = rows[:limit]
    out = [(r[0], r[1], r[2], r[3]) for r in rows]
    return out, next_cursor
