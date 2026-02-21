"""Ledger entry service: create (list, get, update, delete in later steps)."""

from datetime import date
from decimal import Decimal
from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession

from app.models import LedgerEntry
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
