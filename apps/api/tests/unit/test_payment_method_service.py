"""Unit tests for payment method service: list_payment_methods."""

import uuid

import pytest_asyncio
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import PaymentMethod
from app.services.payment_method import create_payment_method, get_payment_method, list_payment_methods, soft_delete_payment_method, update_payment_method


@pytest_asyncio.fixture
async def payment_method_active(db_session: AsyncSession) -> PaymentMethod:
    """One active payment method."""
    row = PaymentMethod(
        id=uuid.uuid4(),
        name="Card",
        currency="INR",
        active=True,
    )
    db_session.add(row)
    await db_session.flush()
    return row


@pytest_asyncio.fixture
async def payment_method_inactive(db_session: AsyncSession) -> PaymentMethod:
    """One inactive payment method."""
    row = PaymentMethod(
        id=uuid.uuid4(),
        name="OldWallet",
        currency="INR",
        active=False,
    )
    db_session.add(row)
    await db_session.flush()
    return row


async def test_list_payment_methods_returns_only_active(
    db_session: AsyncSession,
    payment_method_active: PaymentMethod,
    payment_method_inactive: PaymentMethod,
):
    """list_payment_methods(active_only=True) excludes inactive records."""
    result = await list_payment_methods(db_session, active_only=True)
    ids = [r.id for r in result]
    assert payment_method_active.id in ids
    assert payment_method_inactive.id not in ids
    assert len(result) == 1


async def test_list_payment_methods_empty_returns_empty_list(db_session: AsyncSession):
    """list_payment_methods with no rows returns empty list."""
    result = await list_payment_methods(db_session, active_only=True)
    assert result == []


async def test_list_payment_methods_ordered_by_name(db_session: AsyncSession):
    """list_payment_methods returns rows ordered by name ascending."""
    for name in ["Zebra", "Alpha", "Mono"]:
        db_session.add(
            PaymentMethod(id=uuid.uuid4(), name=name, currency="INR", active=True)
        )
    await db_session.flush()
    result = await list_payment_methods(db_session, active_only=True)
    assert [r.name for r in result] == ["Alpha", "Mono", "Zebra"]


async def test_list_payment_methods_active_only_false_includes_inactive(
    db_session: AsyncSession,
    payment_method_active: PaymentMethod,
    payment_method_inactive: PaymentMethod,
):
    """list_payment_methods(active_only=False) includes inactive records."""
    result = await list_payment_methods(db_session, active_only=False)
    ids = [r.id for r in result]
    assert payment_method_active.id in ids
    assert payment_method_inactive.id in ids
    assert len(result) == 2


async def test_create_payment_method_returns_active_and_persists(db_session: AsyncSession):
    """create_payment_method returns model with active=True and persists."""
    row = await create_payment_method(db_session, name="UPI", currency="INR")
    assert row.id is not None
    assert row.name == "UPI"
    assert row.currency == "INR"
    assert row.active is True
    assert row.created_at is not None
    # Persisted: can be listed
    await db_session.flush()
    listed = await list_payment_methods(db_session, active_only=True)
    assert any(r.id == row.id for r in listed)


async def test_get_payment_method_returns_none_when_not_found(db_session: AsyncSession):
    """get_payment_method returns None when id does not exist."""
    result = await get_payment_method(db_session, uuid.uuid4())
    assert result is None


async def test_get_payment_method_returns_record_when_found(
    db_session: AsyncSession,
    payment_method_active: PaymentMethod,
):
    """get_payment_method returns the record when found (active or inactive)."""
    result = await get_payment_method(db_session, payment_method_active.id)
    assert result is not None
    assert result.id == payment_method_active.id
    assert result.name == payment_method_active.name


async def test_get_payment_method_returns_inactive_record(
    db_session: AsyncSession,
    payment_method_inactive: PaymentMethod,
):
    """get_payment_method returns inactive record so historical ledger can show name."""
    result = await get_payment_method(db_session, payment_method_inactive.id)
    assert result is not None
    assert result.id == payment_method_inactive.id
    assert result.active is False


async def test_update_payment_method_returns_none_when_not_found(db_session: AsyncSession):
    """update_payment_method returns None when id does not exist."""
    result = await update_payment_method(db_session, uuid.uuid4(), name="UPI", currency="INR")
    assert result is None


async def test_update_payment_method_updates_and_returns(
    db_session: AsyncSession,
    payment_method_active: PaymentMethod,
):
    """update_payment_method updates name/currency and returns the model."""
    result = await update_payment_method(
        db_session,
        payment_method_active.id,
        name="NewName",
        currency="USD",
    )
    assert result is not None
    assert result.id == payment_method_active.id
    assert result.name == "NewName"
    assert result.currency == "USD"
    assert result.active is payment_method_active.active
    # Persisted: get_payment_method sees new values
    fetched = await get_payment_method(db_session, payment_method_active.id)
    assert fetched is not None
    assert fetched.name == "NewName"
    assert fetched.currency == "USD"


async def test_update_payment_method_strips_whitespace(
    db_session: AsyncSession,
    payment_method_active: PaymentMethod,
):
    """update_payment_method strips leading/trailing whitespace from name and currency."""
    result = await update_payment_method(
        db_session,
        payment_method_active.id,
        name="  UPI  ",
        currency=" INR ",
    )
    assert result is not None
    assert result.name == "UPI"
    assert result.currency == "INR"


async def test_soft_delete_payment_method_returns_none_when_not_found(db_session: AsyncSession):
    """soft_delete_payment_method returns None when id does not exist."""
    result = await soft_delete_payment_method(db_session, uuid.uuid4())
    assert result is None


async def test_soft_delete_payment_method_sets_active_false_and_returns(
    db_session: AsyncSession,
    payment_method_active: PaymentMethod,
):
    """soft_delete_payment_method sets active=False and returns the model."""
    result = await soft_delete_payment_method(db_session, payment_method_active.id)
    assert result is not None
    assert result.id == payment_method_active.id
    assert result.active is False
    # Persisted: get_payment_method sees inactive; list active_only excludes it
    fetched = await get_payment_method(db_session, payment_method_active.id)
    assert fetched is not None and fetched.active is False
    listed = await list_payment_methods(db_session, active_only=True)
    assert payment_method_active.id not in [r.id for r in listed]


async def test_soft_delete_payment_method_idempotent_when_already_inactive(
    db_session: AsyncSession,
    payment_method_inactive: PaymentMethod,
):
    """soft_delete_payment_method is idempotent: calling again on inactive record still returns 200-style result."""
    result = await soft_delete_payment_method(db_session, payment_method_inactive.id)
    assert result is not None
    assert result.id == payment_method_inactive.id
    assert result.active is False
