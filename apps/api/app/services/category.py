"""Category service: list, get, create (update, delete in later steps)."""

import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Category


async def get_category(
    session: AsyncSession,
    id: uuid.UUID,
) -> Category | None:
    """Return a category by id, or None if not found. Includes active and inactive."""
    result = await session.execute(select(Category).where(Category.id == id))
    return result.scalar_one_or_none()


async def create_category(
    session: AsyncSession,
    *,
    name: str,
    color: str | None = None,
) -> Category:
    """Create a category; active=True by default. Persists and returns the model."""
    row = Category(
        name=name.strip(), color=color.strip() if color else None, active=True
    )
    session.add(row)
    await session.flush()
    await session.refresh(row)
    return row


async def list_categories(
    session: AsyncSession,
    *,
    active_only: bool = True,
) -> list[Category]:
    """Return categories, optionally only active, ordered by name."""
    q = select(Category).order_by(Category.name.asc())
    if active_only:
        q = q.where(Category.active.is_(True))
    result = await session.execute(q)
    return list(result.scalars().all())
