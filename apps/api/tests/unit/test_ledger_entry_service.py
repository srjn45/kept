"""Unit tests for ledger entry service: create, get, update, list."""

from datetime import UTC, date, datetime
from decimal import Decimal
from uuid import uuid4

import pytest
import pytest_asyncio
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Category, PaymentMethod
from app.services.ledger_entry import (
    LedgerEntryError,
    create_ledger_entry,
    get_ledger_entry,
    list_ledger_entries,
    update_ledger_entry,
)
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


# --- get_ledger_entry ---


async def test_get_ledger_entry_returns_none_when_not_found(
    db_session: AsyncSession,
):
    """get_ledger_entry returns None for non-existent id."""
    result = await get_ledger_entry(db_session, uuid4())
    assert result is None


async def test_get_ledger_entry_returns_none_when_deleted(
    db_session: AsyncSession,
    active_category: Category,
    active_payment_method: PaymentMethod,
):
    """get_ledger_entry returns None when entry is soft-deleted."""
    entry, _, _, _ = await create_ledger_entry(
        db_session,
        date_=date(2025, 1, 15),
        description="To delete",
        category_id=active_category.id,
        payment_method_id=active_payment_method.id,
        amount=Decimal("-1"),
    )
    await db_session.flush()
    entry.deleted_at = datetime.now(UTC)
    await db_session.flush()
    result = await get_ledger_entry(db_session, entry.id)
    assert result is None


async def test_get_ledger_entry_returns_entry_with_names_when_found(
    db_session: AsyncSession,
    active_category: Category,
    active_payment_method: PaymentMethod,
):
    """get_ledger_entry returns (entry, category_name, pm_name, currency) when found."""
    entry, _, _, _ = await create_ledger_entry(
        db_session,
        date_=date(2025, 1, 15),
        description="Lunch",
        category_id=active_category.id,
        payment_method_id=active_payment_method.id,
        amount=Decimal("-10.50"),
        tags=["food"],
    )
    await db_session.flush()
    result = await get_ledger_entry(db_session, entry.id)
    assert result is not None
    got_entry, cat_name, pm_name, currency = result
    assert got_entry.id == entry.id
    assert got_entry.description == "Lunch"
    assert cat_name == "Food"
    assert pm_name == "Card"
    assert currency == "INR"


# --- list_ledger_entries ---


async def test_list_ledger_entries_empty(
    db_session: AsyncSession,
):
    """list_ledger_entries with no data returns empty list and nextCursor None."""
    rows, next_cursor = await list_ledger_entries(db_session, limit=50)
    assert rows == []
    assert next_cursor is None


async def test_list_ledger_entries_one_page_sort_date_desc(
    db_session: AsyncSession,
    active_category: Category,
    active_payment_method: PaymentMethod,
):
    """list_ledger_entries returns entries ordered by date desc, id desc."""
    await create_ledger_entry(
        db_session,
        date_=date(2025, 1, 10),
        description="First",
        category_id=active_category.id,
        payment_method_id=active_payment_method.id,
        amount=Decimal("-5"),
    )
    await create_ledger_entry(
        db_session,
        date_=date(2025, 1, 15),
        description="Second",
        category_id=active_category.id,
        payment_method_id=active_payment_method.id,
        amount=Decimal("-10"),
    )
    await db_session.flush()
    rows, next_cursor = await list_ledger_entries(db_session, limit=10)
    assert len(rows) == 2
    assert next_cursor is None
    assert rows[0][0].date == date(2025, 1, 15)
    assert rows[0][0].description == "Second"
    assert rows[1][0].date == date(2025, 1, 10)
    assert rows[1][0].description == "First"


async def test_list_ledger_entries_limit_and_next_cursor(
    db_session: AsyncSession,
    active_category: Category,
    active_payment_method: PaymentMethod,
):
    """list_ledger_entries enforces limit and returns nextCursor when more results exist."""
    for i in range(3):
        await create_ledger_entry(
            db_session,
            date_=date(2025, 1, 15),
            description=f"Entry {i}",
            category_id=active_category.id,
            payment_method_id=active_payment_method.id,
            amount=Decimal("-1"),
        )
    await db_session.flush()
    rows, next_cursor = await list_ledger_entries(db_session, limit=2)
    assert len(rows) == 2
    assert next_cursor is not None
    # Second page
    rows2, next_cursor2 = await list_ledger_entries(
        db_session, cursor=next_cursor, limit=2
    )
    assert len(rows2) == 1
    assert next_cursor2 is None
    ids_page1 = {r[0].id for r in rows}
    ids_page2 = {r[0].id for r in rows2}
    assert ids_page1.isdisjoint(ids_page2)


async def test_list_ledger_entries_excludes_deleted(
    db_session: AsyncSession,
    active_category: Category,
    active_payment_method: PaymentMethod,
):
    """list_ledger_entries excludes entries with deleted_at set."""
    entry, _, _, _ = await create_ledger_entry(
        db_session,
        date_=date(2025, 1, 15),
        description="To delete",
        category_id=active_category.id,
        payment_method_id=active_payment_method.id,
        amount=Decimal("-1"),
    )
    await db_session.flush()
    entry.deleted_at = datetime.now(UTC)
    await db_session.flush()
    rows, _ = await list_ledger_entries(db_session, limit=50)
    assert len(rows) == 0


async def test_list_ledger_entries_filter_date_range(
    db_session: AsyncSession,
    active_category: Category,
    active_payment_method: PaymentMethod,
):
    """list_ledger_entries filters by dateFrom and dateTo."""
    await create_ledger_entry(
        db_session,
        date_=date(2025, 1, 5),
        description="Before",
        category_id=active_category.id,
        payment_method_id=active_payment_method.id,
        amount=Decimal("-1"),
    )
    await create_ledger_entry(
        db_session,
        date_=date(2025, 1, 15),
        description="In range",
        category_id=active_category.id,
        payment_method_id=active_payment_method.id,
        amount=Decimal("-1"),
    )
    await create_ledger_entry(
        db_session,
        date_=date(2025, 1, 25),
        description="After",
        category_id=active_category.id,
        payment_method_id=active_payment_method.id,
        amount=Decimal("-1"),
    )
    await db_session.flush()
    rows, _ = await list_ledger_entries(
        db_session,
        date_from=date(2025, 1, 10),
        date_to=date(2025, 1, 20),
        limit=50,
    )
    assert len(rows) == 1
    assert rows[0][0].description == "In range"


async def test_list_ledger_entries_filter_type_expense(
    db_session: AsyncSession,
    active_category: Category,
    active_payment_method: PaymentMethod,
):
    """list_ledger_entries type=expense returns only negative amounts."""
    await create_ledger_entry(
        db_session,
        date_=date(2025, 1, 15),
        description="Expense",
        category_id=active_category.id,
        payment_method_id=active_payment_method.id,
        amount=Decimal("-10"),
    )
    await create_ledger_entry(
        db_session,
        date_=date(2025, 1, 15),
        description="Refund",
        category_id=active_category.id,
        payment_method_id=active_payment_method.id,
        amount=Decimal("5"),
    )
    await db_session.flush()
    rows, _ = await list_ledger_entries(db_session, type_="expense", limit=50)
    assert len(rows) == 1
    assert rows[0][0].amount < 0


async def test_list_ledger_entries_filter_type_refund(
    db_session: AsyncSession,
    active_category: Category,
    active_payment_method: PaymentMethod,
):
    """list_ledger_entries type=refund returns only positive amounts."""
    await create_ledger_entry(
        db_session,
        date_=date(2025, 1, 15),
        description="Refund",
        category_id=active_category.id,
        payment_method_id=active_payment_method.id,
        amount=Decimal("5"),
    )
    await db_session.flush()
    rows, _ = await list_ledger_entries(db_session, type_="refund", limit=50)
    assert len(rows) == 1
    assert rows[0][0].amount > 0


async def test_list_ledger_entries_filter_tags_and(
    db_session: AsyncSession,
    active_category: Category,
    active_payment_method: PaymentMethod,
):
    """list_ledger_entries tags filter returns entries containing all listed tags (AND)."""
    await create_ledger_entry(
        db_session,
        date_=date(2025, 1, 15),
        description="Both",
        category_id=active_category.id,
        payment_method_id=active_payment_method.id,
        amount=Decimal("-1"),
        tags=["a", "b"],
    )
    await create_ledger_entry(
        db_session,
        date_=date(2025, 1, 15),
        description="Only A",
        category_id=active_category.id,
        payment_method_id=active_payment_method.id,
        amount=Decimal("-1"),
        tags=["a"],
    )
    await db_session.flush()
    rows, _ = await list_ledger_entries(db_session, tags=["a", "b"], limit=50)
    assert len(rows) == 1
    assert rows[0][0].description == "Both"


# --- update_ledger_entry ---


async def test_update_ledger_entry_success(
    db_session: AsyncSession,
    active_category: Category,
    active_payment_method: PaymentMethod,
):
    """update_ledger_entry updates entry and returns resolved names."""
    entry, _, _, _ = await create_ledger_entry(
        db_session,
        date_=date(2025, 1, 10),
        description="Original",
        category_id=active_category.id,
        payment_method_id=active_payment_method.id,
        amount=Decimal("-5"),
    )
    await db_session.flush()
    result = await update_ledger_entry(
        db_session,
        entry.id,
        date_=date(2025, 2, 20),
        description="Updated",
        category_id=active_category.id,
        payment_method_id=active_payment_method.id,
        amount=Decimal("-15.00"),
        tags=["updated-tag"],
    )
    assert result is not None
    updated, cat_name, pm_name, currency = result
    assert updated.id == entry.id
    assert updated.date == date(2025, 2, 20)
    assert updated.description == "Updated"
    assert updated.amount == Decimal("-15.00")
    assert updated.tags == ["updated-tag"]
    assert cat_name == "Food"
    assert pm_name == "Card"
    assert currency == "INR"


async def test_update_ledger_entry_upserts_tag_suggestions(
    db_session: AsyncSession,
    active_category: Category,
    active_payment_method: PaymentMethod,
):
    """update_ledger_entry upserts tag_suggestions for new tags."""
    entry, _, _, _ = await create_ledger_entry(
        db_session,
        date_=date(2025, 1, 15),
        description="Entry",
        category_id=active_category.id,
        payment_method_id=active_payment_method.id,
        amount=Decimal("-1"),
    )
    await db_session.flush()
    await update_ledger_entry(
        db_session,
        entry.id,
        date_=entry.date,
        description=entry.description,
        category_id=active_category.id,
        payment_method_id=active_payment_method.id,
        amount=entry.amount,
        tags=["put-tag-suggestion"],
    )
    await db_session.flush()
    suggestions = await get_tag_suggestions(db_session, q=None)
    assert "put-tag-suggestion" in suggestions


async def test_update_ledger_entry_returns_none_when_not_found(
    db_session: AsyncSession,
    active_category: Category,
    active_payment_method: PaymentMethod,
):
    """update_ledger_entry returns None for non-existent id."""
    result = await update_ledger_entry(
        db_session,
        uuid4(),
        date_=date(2025, 1, 15),
        description="X",
        category_id=active_category.id,
        payment_method_id=active_payment_method.id,
        amount=Decimal("-1"),
    )
    assert result is None


async def test_update_ledger_entry_returns_none_when_deleted(
    db_session: AsyncSession,
    active_category: Category,
    active_payment_method: PaymentMethod,
):
    """update_ledger_entry returns None when entry is soft-deleted."""
    entry, _, _, _ = await create_ledger_entry(
        db_session,
        date_=date(2025, 1, 15),
        description="Entry",
        category_id=active_category.id,
        payment_method_id=active_payment_method.id,
        amount=Decimal("-1"),
    )
    await db_session.flush()
    entry.deleted_at = datetime.now(UTC)
    await db_session.flush()
    result = await update_ledger_entry(
        db_session,
        entry.id,
        date_=date(2025, 1, 15),
        description="X",
        category_id=active_category.id,
        payment_method_id=active_payment_method.id,
        amount=Decimal("-1"),
    )
    assert result is None


async def test_update_ledger_entry_category_not_found(
    db_session: AsyncSession,
    active_category: Category,
    active_payment_method: PaymentMethod,
):
    """update_ledger_entry raises LedgerEntryError when category not found."""
    entry, _, _, _ = await create_ledger_entry(
        db_session,
        date_=date(2025, 1, 15),
        description="Entry",
        category_id=active_category.id,
        payment_method_id=active_payment_method.id,
        amount=Decimal("-1"),
    )
    await db_session.flush()
    with pytest.raises(LedgerEntryError) as exc_info:
        await update_ledger_entry(
            db_session,
            entry.id,
            date_=entry.date,
            description=entry.description,
            category_id=uuid4(),
            payment_method_id=active_payment_method.id,
            amount=entry.amount,
        )
    assert "Category" in exc_info.value.message


async def test_update_ledger_entry_payment_method_not_found(
    db_session: AsyncSession,
    active_category: Category,
    active_payment_method: PaymentMethod,
):
    """update_ledger_entry raises LedgerEntryError when payment method not found."""
    entry, _, _, _ = await create_ledger_entry(
        db_session,
        date_=date(2025, 1, 15),
        description="Entry",
        category_id=active_category.id,
        payment_method_id=active_payment_method.id,
        amount=Decimal("-1"),
    )
    await db_session.flush()
    with pytest.raises(LedgerEntryError) as exc_info:
        await update_ledger_entry(
            db_session,
            entry.id,
            date_=entry.date,
            description=entry.description,
            category_id=active_category.id,
            payment_method_id=uuid4(),
            amount=entry.amount,
        )
    assert "Payment method" in exc_info.value.message


async def test_update_ledger_entry_category_inactive(
    db_session: AsyncSession,
    active_category: Category,
    active_payment_method: PaymentMethod,
):
    """update_ledger_entry raises LedgerEntryError when new category is inactive."""
    inactive_cat = Category(
        id=uuid4(),
        name="Old",
        color=None,
        active=False,
    )
    db_session.add(inactive_cat)
    await db_session.flush()
    entry, _, _, _ = await create_ledger_entry(
        db_session,
        date_=date(2025, 1, 15),
        description="Entry",
        category_id=active_category.id,
        payment_method_id=active_payment_method.id,
        amount=Decimal("-1"),
    )
    await db_session.flush()
    with pytest.raises(LedgerEntryError) as exc_info:
        await update_ledger_entry(
            db_session,
            entry.id,
            date_=entry.date,
            description=entry.description,
            category_id=inactive_cat.id,
            payment_method_id=active_payment_method.id,
            amount=entry.amount,
        )
    assert "Category" in exc_info.value.message


async def test_update_ledger_entry_payment_method_inactive(
    db_session: AsyncSession,
    active_category: Category,
    active_payment_method: PaymentMethod,
):
    """update_ledger_entry raises LedgerEntryError when new payment method is inactive."""
    inactive_pm = PaymentMethod(
        id=uuid4(),
        name="Old",
        currency="INR",
        active=False,
    )
    db_session.add(inactive_pm)
    await db_session.flush()
    entry, _, _, _ = await create_ledger_entry(
        db_session,
        date_=date(2025, 1, 15),
        description="Entry",
        category_id=active_category.id,
        payment_method_id=active_payment_method.id,
        amount=Decimal("-1"),
    )
    await db_session.flush()
    with pytest.raises(LedgerEntryError) as exc_info:
        await update_ledger_entry(
            db_session,
            entry.id,
            date_=entry.date,
            description=entry.description,
            category_id=active_category.id,
            payment_method_id=inactive_pm.id,
            amount=entry.amount,
        )
    assert "Payment method" in exc_info.value.message


async def test_list_ledger_entries_invalid_cursor_returns_first_page(
    db_session: AsyncSession,
    active_category: Category,
    active_payment_method: PaymentMethod,
):
    """Invalid cursor is ignored; first page is returned."""
    await create_ledger_entry(
        db_session,
        date_=date(2025, 1, 15),
        description="Only",
        category_id=active_category.id,
        payment_method_id=active_payment_method.id,
        amount=Decimal("-1"),
    )
    await db_session.flush()
    rows, next_cursor = await list_ledger_entries(
        db_session, cursor="invalid-cursor", limit=50
    )
    assert len(rows) == 1
    assert next_cursor is None
