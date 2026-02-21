"""Unit tests for tag suggestion service: get_tag_suggestions."""

from datetime import UTC, datetime, timedelta

import pytest_asyncio
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import TagSuggestion
from app.services.tag_suggestion import get_tag_suggestions


@pytest_asyncio.fixture
async def tag_suggestions_sample(db_session: AsyncSession) -> None:
    """Insert sample tag suggestions with different last_used_at for ordering."""
    base = datetime.now(UTC)
    for i, (text, delta_min) in enumerate(
        [("food", 0), ("travel", -10), ("food-delivery", -5), ("groceries", -20)]
    ):
        db_session.add(
            TagSuggestion(
                tag_text=text,
                last_used_at=base + timedelta(minutes=delta_min),
            )
        )
    await db_session.flush()


async def test_get_tag_suggestions_returns_up_to_20(
    db_session: AsyncSession,
    tag_suggestions_sample: None,
):
    """get_tag_suggestions returns at most 20 suggestions."""
    result = await get_tag_suggestions(db_session, q=None)
    assert len(result) <= 20
    assert len(result) == 4


async def test_get_tag_suggestions_ordered_by_last_used_at_desc(
    db_session: AsyncSession,
    tag_suggestions_sample: None,
):
    """get_tag_suggestions returns tags ordered by last_used_at desc (most recent first)."""
    result = await get_tag_suggestions(db_session, q=None)
    # food=0, food-delivery=-5, travel=-10, groceries=-20 -> food, food-delivery, travel, groceries
    assert result == ["food", "food-delivery", "travel", "groceries"]


async def test_get_tag_suggestions_filter_case_insensitive(
    db_session: AsyncSession,
    tag_suggestions_sample: None,
):
    """get_tag_suggestions with q filters case-insensitively (substring)."""
    result = await get_tag_suggestions(db_session, q="FOOD")
    assert set(result) == {"food", "food-delivery"}
    result_lower = await get_tag_suggestions(db_session, q="travel")
    assert result_lower == ["travel"]


async def test_get_tag_suggestions_empty_db(
    db_session: AsyncSession,
):
    """get_tag_suggestions with no rows returns empty list."""
    result = await get_tag_suggestions(db_session, q=None)
    assert result == []


async def test_get_tag_suggestions_no_match(
    db_session: AsyncSession,
    tag_suggestions_sample: None,
):
    """get_tag_suggestions with q that matches nothing returns empty list."""
    result = await get_tag_suggestions(db_session, q="xyz")
    assert result == []
