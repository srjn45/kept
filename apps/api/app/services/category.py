"""Category service: list (get, create, update, delete in later steps)."""

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Category


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
