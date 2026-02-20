"""Payment method service: list, get, create, update, delete."""

import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import PaymentMethod


async def get_payment_method(
    session: AsyncSession,
    id: uuid.UUID,
) -> PaymentMethod | None:
    """Return a payment method by id, or None if not found. Includes active and inactive."""
    result = await session.execute(select(PaymentMethod).where(PaymentMethod.id == id))
    return result.scalar_one_or_none()


async def create_payment_method(
    session: AsyncSession,
    *,
    name: str,
    currency: str,
) -> PaymentMethod:
    """Create a payment method; active=True by default. Persists and returns the model."""
    row = PaymentMethod(name=name.strip(), currency=currency.strip(), active=True)
    session.add(row)
    await session.flush()
    await session.refresh(row)
    return row


async def update_payment_method(
    session: AsyncSession,
    id: uuid.UUID,
    *,
    name: str,
    currency: str,
) -> PaymentMethod | None:
    """Update a payment method by id. Returns updated model or None if not found."""
    row = await get_payment_method(session, id)
    if row is None:
        return None
    row.name = name.strip()
    row.currency = currency.strip()
    await session.flush()
    await session.refresh(row)
    return row


async def soft_delete_payment_method(
    session: AsyncSession,
    id: uuid.UUID,
) -> PaymentMethod | None:
    """Soft delete a payment method by id (set active=False). Idempotent if already inactive. Returns None if not found."""
    row = await get_payment_method(session, id)
    if row is None:
        return None
    row.active = False
    await session.flush()
    await session.refresh(row)
    return row


async def list_payment_methods(
    session: AsyncSession,
    *,
    active_only: bool = True,
) -> list[PaymentMethod]:
    """Return payment methods, optionally only active, ordered by name."""
    q = select(PaymentMethod).order_by(PaymentMethod.name.asc())
    if active_only:
        q = q.where(PaymentMethod.active.is_(True))
    result = await session.execute(q)
    return list(result.scalars().all())
