"""Payment method service: list, get, create, update, delete."""

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import PaymentMethod


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
