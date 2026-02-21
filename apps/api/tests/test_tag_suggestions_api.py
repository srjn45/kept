"""Integration tests for GET /api/v1/tag-suggestions."""

from datetime import UTC, datetime, timedelta

import pytest
import pytest_asyncio
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import TagSuggestion

pytestmark = pytest.mark.integration


@pytest_asyncio.fixture
async def some_tag_suggestions(db_session: AsyncSession) -> None:
    """Insert tag suggestions for tests."""
    base = datetime.now(UTC)
    for text, delta_min in [("food", 0), ("travel", -10), ("food-delivery", -5)]:
        db_session.add(
            TagSuggestion(
                tag_text=text,
                last_used_at=base + timedelta(minutes=delta_min),
            )
        )
    await db_session.flush()


async def test_get_tag_suggestions_200_empty_db(client: AsyncClient):
    """GET /tag-suggestions with empty DB returns 200 and suggestions: []."""
    response = await client.get("/api/v1/tag-suggestions")
    assert response.status_code == 200
    body = response.json()
    assert "suggestions" in body
    assert body["suggestions"] == []


async def test_get_tag_suggestions_200_no_q(
    client: AsyncClient,
    some_tag_suggestions: None,
):
    """GET /tag-suggestions without q returns all suggestions (up to 20), ordered by last_used_at desc."""
    response = await client.get("/api/v1/tag-suggestions")
    assert response.status_code == 200
    body = response.json()
    assert "suggestions" in body
    assert body["suggestions"] == ["food", "food-delivery", "travel"]


async def test_get_tag_suggestions_200_with_q_case_insensitive(
    client: AsyncClient,
    some_tag_suggestions: None,
):
    """GET /tag-suggestions?q=FOOD returns matching suggestions case-insensitively."""
    response = await client.get("/api/v1/tag-suggestions?q=FOOD")
    assert response.status_code == 200
    body = response.json()
    assert set(body["suggestions"]) == {"food", "food-delivery"}


async def test_get_tag_suggestions_200_with_q_no_match(
    client: AsyncClient,
    some_tag_suggestions: None,
):
    """GET /tag-suggestions?q=nonexistent returns empty suggestions."""
    response = await client.get("/api/v1/tag-suggestions?q=nonexistent")
    assert response.status_code == 200
    assert response.json()["suggestions"] == []
