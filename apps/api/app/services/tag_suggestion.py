"""Tag suggestion service: get suggestions for autocomplete."""

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import TagSuggestion


async def get_tag_suggestions(
    session: AsyncSession,
    *,
    q: str | None = None,
) -> list[str]:
    """Return up to 20 tag texts, ordered by last_used_at desc. If q is provided, filter case-insensitively (substring)."""
    stmt = (
        select(TagSuggestion.tag_text)
        .order_by(TagSuggestion.last_used_at.desc())
        .limit(20)
    )
    if q:
        stmt = stmt.where(TagSuggestion.tag_text.ilike(f"%{q}%"))
    result = await session.execute(stmt)
    return [row[0] for row in result.all()]
