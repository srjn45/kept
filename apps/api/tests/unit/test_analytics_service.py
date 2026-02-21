"""Unit tests for analytics service: get_monthly_expense, get_expense_by_category."""

from datetime import UTC, date, datetime
from decimal import Decimal
from uuid import uuid4

import pytest_asyncio
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Category, PaymentMethod
from app.services.analytics import (
    get_expense_by_category,
    get_expense_by_payment_method,
    get_monthly_expense,
)
from app.services.ledger_entry import create_ledger_entry


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


async def test_get_monthly_expense_empty_range(
    db_session: AsyncSession,
):
    """get_monthly_expense with no entries returns one row per month with 0 totals."""
    result = await get_monthly_expense(
        db_session,
        from_date=date(2025, 1, 1),
        to_date=date(2025, 2, 28),
    )
    assert len(result) == 2
    assert result[0]["month"] == "2025-01"
    assert result[0]["totalExpense"] == 0.0
    assert result[0]["totalRefund"] == 0.0
    assert result[1]["month"] == "2025-02"
    assert result[1]["totalExpense"] == 0.0
    assert result[1]["totalRefund"] == 0.0


async def test_get_monthly_expense_aggregates_by_month(
    db_session: AsyncSession,
    active_category: Category,
    active_payment_method: PaymentMethod,
):
    """get_monthly_expense sums positive amounts as totalExpense, negative as totalRefund (abs)."""
    await create_ledger_entry(
        db_session,
        date_=date(2025, 1, 10),
        description="Expense",
        category_id=active_category.id,
        payment_method_id=active_payment_method.id,
        amount=Decimal("100"),
    )
    await create_ledger_entry(
        db_session,
        date_=date(2025, 1, 20),
        description="Refund",
        category_id=active_category.id,
        payment_method_id=active_payment_method.id,
        amount=Decimal("-30"),
    )
    await create_ledger_entry(
        db_session,
        date_=date(2025, 2, 5),
        description="Expense Feb",
        category_id=active_category.id,
        payment_method_id=active_payment_method.id,
        amount=Decimal("50"),
    )
    await db_session.flush()
    result = await get_monthly_expense(
        db_session,
        from_date=date(2025, 1, 1),
        to_date=date(2025, 2, 28),
    )
    assert len(result) == 2
    jan = next(r for r in result if r["month"] == "2025-01")
    feb = next(r for r in result if r["month"] == "2025-02")
    assert jan["totalExpense"] == 100.0
    assert jan["totalRefund"] == 30.0
    assert feb["totalExpense"] == 50.0
    assert feb["totalRefund"] == 0.0


async def test_get_monthly_expense_date_range_inclusive(
    db_session: AsyncSession,
    active_category: Category,
    active_payment_method: PaymentMethod,
):
    """get_monthly_expense includes from and to month (inclusive range)."""
    await create_ledger_entry(
        db_session,
        date_=date(2025, 3, 1),
        description="Only",
        category_id=active_category.id,
        payment_method_id=active_payment_method.id,
        amount=Decimal("10"),
    )
    await db_session.flush()
    result = await get_monthly_expense(
        db_session,
        from_date=date(2025, 3, 1),
        to_date=date(2025, 3, 31),
    )
    assert len(result) == 1
    assert result[0]["month"] == "2025-03"
    assert result[0]["totalExpense"] == 10.0


async def test_get_monthly_expense_excludes_soft_deleted(
    db_session: AsyncSession,
    active_category: Category,
    active_payment_method: PaymentMethod,
):
    """get_monthly_expense excludes entries with deleted_at set."""
    entry, _, _, _ = await create_ledger_entry(
        db_session,
        date_=date(2025, 1, 15),
        description="To delete",
        category_id=active_category.id,
        payment_method_id=active_payment_method.id,
        amount=Decimal("25"),
    )
    await db_session.flush()
    entry.deleted_at = datetime.now(UTC)
    await db_session.flush()
    result = await get_monthly_expense(
        db_session,
        from_date=date(2025, 1, 1),
        to_date=date(2025, 1, 31),
    )
    assert len(result) == 1
    assert result[0]["month"] == "2025-01"
    assert result[0]["totalExpense"] == 0.0
    assert result[0]["totalRefund"] == 0.0


# --- get_expense_by_category ---


@pytest_asyncio.fixture
async def second_category(db_session: AsyncSession) -> Category:
    """Second active category."""
    row = Category(
        id=uuid4(),
        name="Transport",
        color="#0000ff",
        active=True,
    )
    db_session.add(row)
    await db_session.flush()
    return row


async def test_get_expense_by_category_empty(
    db_session: AsyncSession,
):
    """get_expense_by_category with no entries returns empty list."""
    result = await get_expense_by_category(
        db_session, first_day_of_month=date(2025, 1, 1)
    )
    assert result == []


async def test_get_expense_by_category_groups_and_sum_positive_only(
    db_session: AsyncSession,
    active_category: Category,
    second_category: Category,
    active_payment_method: PaymentMethod,
):
    """get_expense_by_category groups by category; sums positive amounts only."""
    await create_ledger_entry(
        db_session,
        date_=date(2025, 1, 10),
        description="Food 1",
        category_id=active_category.id,
        payment_method_id=active_payment_method.id,
        amount=Decimal("50"),
    )
    await create_ledger_entry(
        db_session,
        date_=date(2025, 1, 20),
        description="Food 2",
        category_id=active_category.id,
        payment_method_id=active_payment_method.id,
        amount=Decimal("30"),
    )
    await create_ledger_entry(
        db_session,
        date_=date(2025, 1, 15),
        description="Transport",
        category_id=second_category.id,
        payment_method_id=active_payment_method.id,
        amount=Decimal("25"),
    )
    await create_ledger_entry(
        db_session,
        date_=date(2025, 1, 5),
        description="Refund (ignored)",
        category_id=active_category.id,
        payment_method_id=active_payment_method.id,
        amount=Decimal("-10"),
    )
    await db_session.flush()
    result = await get_expense_by_category(
        db_session, first_day_of_month=date(2025, 1, 1)
    )
    assert len(result) == 2
    by_name = {r["categoryName"]: r for r in result}
    assert by_name["Food"]["categoryId"] == str(active_category.id)
    assert by_name["Food"]["amount"] == 80.0
    assert by_name["Transport"]["categoryId"] == str(second_category.id)
    assert by_name["Transport"]["amount"] == 25.0


async def test_get_expense_by_category_excludes_soft_deleted(
    db_session: AsyncSession,
    active_category: Category,
    active_payment_method: PaymentMethod,
):
    """get_expense_by_category excludes entries with deleted_at set."""
    await create_ledger_entry(
        db_session,
        date_=date(2025, 1, 10),
        description="Kept",
        category_id=active_category.id,
        payment_method_id=active_payment_method.id,
        amount=Decimal("40"),
    )
    entry, _, _, _ = await create_ledger_entry(
        db_session,
        date_=date(2025, 1, 20),
        description="Deleted",
        category_id=active_category.id,
        payment_method_id=active_payment_method.id,
        amount=Decimal("60"),
    )
    await db_session.flush()
    entry.deleted_at = datetime.now(UTC)
    await db_session.flush()
    result = await get_expense_by_category(
        db_session, first_day_of_month=date(2025, 1, 1)
    )
    assert len(result) == 1
    assert result[0]["categoryName"] == "Food"
    assert result[0]["amount"] == 40.0


async def test_get_expense_by_category_only_in_month(
    db_session: AsyncSession,
    active_category: Category,
    active_payment_method: PaymentMethod,
):
    """get_expense_by_category only includes entries in the given month."""
    await create_ledger_entry(
        db_session,
        date_=date(2025, 2, 10),
        description="February",
        category_id=active_category.id,
        payment_method_id=active_payment_method.id,
        amount=Decimal("100"),
    )
    await db_session.flush()
    result_jan = await get_expense_by_category(
        db_session, first_day_of_month=date(2025, 1, 1)
    )
    result_feb = await get_expense_by_category(
        db_session, first_day_of_month=date(2025, 2, 1)
    )
    assert result_jan == []
    assert len(result_feb) == 1
    assert result_feb[0]["amount"] == 100.0


# --- get_expense_by_payment_method ---


@pytest_asyncio.fixture
async def second_payment_method(db_session: AsyncSession) -> PaymentMethod:
    """Second active payment method."""
    row = PaymentMethod(
        id=uuid4(),
        name="UPI",
        currency="INR",
        active=True,
    )
    db_session.add(row)
    await db_session.flush()
    return row


async def test_get_expense_by_payment_method_empty(db_session: AsyncSession):
    """get_expense_by_payment_method with no entries returns empty list."""
    result = await get_expense_by_payment_method(
        db_session, first_day_of_month=date(2025, 1, 1)
    )
    assert result == []


async def test_get_expense_by_payment_method_groups_and_sum_positive_only(
    db_session: AsyncSession,
    active_category: Category,
    active_payment_method: PaymentMethod,
    second_payment_method: PaymentMethod,
):
    """get_expense_by_payment_method groups by payment method; sums positive amounts only."""
    await create_ledger_entry(
        db_session,
        date_=date(2025, 1, 10),
        description="Card 1",
        category_id=active_category.id,
        payment_method_id=active_payment_method.id,
        amount=Decimal("50"),
    )
    await create_ledger_entry(
        db_session,
        date_=date(2025, 1, 20),
        description="Card 2",
        category_id=active_category.id,
        payment_method_id=active_payment_method.id,
        amount=Decimal("30"),
    )
    await create_ledger_entry(
        db_session,
        date_=date(2025, 1, 15),
        description="UPI",
        category_id=active_category.id,
        payment_method_id=second_payment_method.id,
        amount=Decimal("25"),
    )
    await create_ledger_entry(
        db_session,
        date_=date(2025, 1, 5),
        description="Refund (ignored)",
        category_id=active_category.id,
        payment_method_id=active_payment_method.id,
        amount=Decimal("-10"),
    )
    await db_session.flush()
    result = await get_expense_by_payment_method(
        db_session, first_day_of_month=date(2025, 1, 1)
    )
    assert len(result) == 2
    by_name = {r["paymentMethodName"]: r for r in result}
    assert by_name["Card"]["paymentMethodId"] == str(active_payment_method.id)
    assert by_name["Card"]["amount"] == 80.0
    assert by_name["UPI"]["paymentMethodId"] == str(second_payment_method.id)
    assert by_name["UPI"]["amount"] == 25.0


async def test_get_expense_by_payment_method_excludes_soft_deleted(
    db_session: AsyncSession,
    active_category: Category,
    active_payment_method: PaymentMethod,
):
    """get_expense_by_payment_method excludes entries with deleted_at set."""
    await create_ledger_entry(
        db_session,
        date_=date(2025, 1, 10),
        description="Kept",
        category_id=active_category.id,
        payment_method_id=active_payment_method.id,
        amount=Decimal("40"),
    )
    entry, _, _, _ = await create_ledger_entry(
        db_session,
        date_=date(2025, 1, 20),
        description="Deleted",
        category_id=active_category.id,
        payment_method_id=active_payment_method.id,
        amount=Decimal("60"),
    )
    await db_session.flush()
    entry.deleted_at = datetime.now(UTC)
    await db_session.flush()
    result = await get_expense_by_payment_method(
        db_session, first_day_of_month=date(2025, 1, 1)
    )
    assert len(result) == 1
    assert result[0]["paymentMethodName"] == "Card"
    assert result[0]["amount"] == 40.0


async def test_get_expense_by_payment_method_only_in_month(
    db_session: AsyncSession,
    active_category: Category,
    active_payment_method: PaymentMethod,
):
    """get_expense_by_payment_method only includes entries in the given month."""
    await create_ledger_entry(
        db_session,
        date_=date(2025, 2, 10),
        description="February",
        category_id=active_category.id,
        payment_method_id=active_payment_method.id,
        amount=Decimal("100"),
    )
    await db_session.flush()
    result_jan = await get_expense_by_payment_method(
        db_session, first_day_of_month=date(2025, 1, 1)
    )
    result_feb = await get_expense_by_payment_method(
        db_session, first_day_of_month=date(2025, 2, 1)
    )
    assert result_jan == []
    assert len(result_feb) == 1
    assert result_feb[0]["amount"] == 100.0
