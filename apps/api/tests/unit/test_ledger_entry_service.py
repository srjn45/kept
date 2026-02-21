"""Unit tests for ledger entry service: create_ledger_entry."""

from datetime import date
from decimal import Decimal
from uuid import uuid4

import pytest
import pytest_asyncio
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Category, PaymentMethod
from app.services.ledger_entry import LedgerEntryError, create_ledger_entry
from app.services.tag_suggestion import get_tag_suggestions


@pytest_asyncio.fixture
async def active_category(db_session: AsyncSession) -> Category:
    """One active category."""
    row = Category(
        id=uuid4(),
        name="Food",
        color="#ff0000",
        active=True,
    )
    db_session.add(row)
    await db_session.flush()
    return row


@pytest_asyncio.fixture
async def active_payment_method(db_session: AsyncSession) -> PaymentMethod:
    """One active payment method."""
    row = PaymentMethod(
        id=uuid4(),
        name="Card",
        currency="INR",
        active=True,
    )
    db_session.add(row)
    await db_session.flush()
    return row


async def test_create_ledger_entry_success(
    db_session: AsyncSession,
    active_category: Category,
    active_payment_method: PaymentMethod,
):
    """create_ledger_entry creates entry and returns resolved names and currency."""
    entry, cat_name, pm_name, currency = await create_ledger_entry(
        db_session,
        date_=date(2025, 1, 15),
        description="Lunch",
        category_id=active_category.id,
        payment_method_id=active_payment_method.id,
        amount=Decimal("10.50"),
        tags=["food", "lunch"],
    )
    assert entry.id is not None
    assert entry.description == "Lunch"
    assert entry.amount == Decimal("10.50")
    assert entry.tags == ["food", "lunch"]
    assert cat_name == "Food"
    assert pm_name == "Card"
    assert currency == "INR"


async def test_create_ledger_entry_upserts_tag_suggestions(
    db_session: AsyncSession,
    active_category: Category,
    active_payment_method: PaymentMethod,
):
    """create_ledger_entry upserts tag_suggestions for each tag."""
    await create_ledger_entry(
        db_session,
        date_=date(2025, 1, 15),
        description="Test",
        category_id=active_category.id,
        payment_method_id=active_payment_method.id,
        amount=Decimal("1"),
        tags=["autocomplete-tag"],
    )
    await db_session.flush()
    suggestions = await get_tag_suggestions(db_session, q=None)
    assert "autocomplete-tag" in suggestions


async def test_create_ledger_entry_category_not_found(
    db_session: AsyncSession,
    active_payment_method: PaymentMethod,
):
    """create_ledger_entry raises LedgerEntryError when category not found."""
    with pytest.raises(LedgerEntryError) as exc_info:
        await create_ledger_entry(
            db_session,
            date_=date(2025, 1, 15),
            description="Test",
            category_id=uuid4(),
            payment_method_id=active_payment_method.id,
            amount=Decimal("1"),
        )
    assert "Category" in exc_info.value.message


async def test_create_ledger_entry_payment_method_not_found(
    db_session: AsyncSession,
    active_category: Category,
):
    """create_ledger_entry raises LedgerEntryError when payment method not found."""
    with pytest.raises(LedgerEntryError) as exc_info:
        await create_ledger_entry(
            db_session,
            date_=date(2025, 1, 15),
            description="Test",
            category_id=active_category.id,
            payment_method_id=uuid4(),
            amount=Decimal("1"),
        )
    assert "Payment method" in exc_info.value.message


async def test_create_ledger_entry_category_inactive(
    db_session: AsyncSession,
    active_payment_method: PaymentMethod,
):
    """create_ledger_entry raises LedgerEntryError when category is inactive."""
    inactive_cat = Category(
        id=uuid4(),
        name="Old",
        color=None,
        active=False,
    )
    db_session.add(inactive_cat)
    await db_session.flush()
    with pytest.raises(LedgerEntryError) as exc_info:
        await create_ledger_entry(
            db_session,
            date_=date(2025, 1, 15),
            description="Test",
            category_id=inactive_cat.id,
            payment_method_id=active_payment_method.id,
            amount=Decimal("1"),
        )
    assert "Category" in exc_info.value.message


async def test_create_ledger_entry_payment_method_inactive(
    db_session: AsyncSession,
    active_category: Category,
):
    """create_ledger_entry raises LedgerEntryError when payment method is inactive."""
    inactive_pm = PaymentMethod(
        id=uuid4(),
        name="Old",
        currency="INR",
        active=False,
    )
    db_session.add(inactive_pm)
    await db_session.flush()
    with pytest.raises(LedgerEntryError) as exc_info:
        await create_ledger_entry(
            db_session,
            date_=date(2025, 1, 15),
            description="Test",
            category_id=active_category.id,
            payment_method_id=inactive_pm.id,
            amount=Decimal("1"),
        )
    assert "Payment method" in exc_info.value.message
