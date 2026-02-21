"""Tag suggestion service: get suggestions for autocomplete; upsert for ledger tags."""

from datetime import UTC, datetime

from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import TagSuggestion


def _utc_now() -> datetime:
    return datetime.now(UTC)


async def upsert_tag_suggestions(
    session: AsyncSession,
    tags: list[str],
) -> None:
    """Upsert tag_suggestions for each tag (insert or update last_used_at)."""
    now = _utc_now()
    for tag_text in tags:
        stmt = (
            insert(TagSuggestion)
            .values(tag_text=tag_text, last_used_at=now)
            .on_conflict_do_update(
                index_elements=["tag_text"],
                set_={"last_used_at": now},
            )
        )
        await session.execute(stmt)


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
