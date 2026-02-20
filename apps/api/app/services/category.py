"""Category service: list, get, create, update, soft delete."""

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


async def update_category(
    session: AsyncSession,
    id: uuid.UUID,
    *,
    name: str,
    color: str | None = None,
) -> Category | None:
    """Update a category by id. Returns updated model or None if not found."""
    row = await get_category(session, id)
    if row is None:
        return None
    row.name = name.strip()
    row.color = color.strip() if color else None
    await session.flush()
    await session.refresh(row)
    return row


async def soft_delete_category(
    session: AsyncSession,
    id: uuid.UUID,
) -> Category | None:
    """Soft delete a category by id (set active=False). Idempotent if already inactive. Returns None if not found."""
    row = await get_category(session, id)
    if row is None:
        return None
    row.active = False
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
