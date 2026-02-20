"""Integration tests for GET /api/v1/categories."""

import uuid

import pytest
import pytest_asyncio
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Category

pytestmark = pytest.mark.integration


@pytest_asyncio.fixture
async def one_active_category(db_session: AsyncSession) -> Category:
    """Insert one active category for tests that need data."""
    row = Category(
        id=uuid.uuid4(),
        name="Food",
        color="#00ff00",
        active=True,
    )
    db_session.add(row)
    await db_session.flush()
    return row


@pytest_asyncio.fixture
async def one_inactive_category(db_session: AsyncSession) -> Category:
    """Insert one inactive category."""
    row = Category(
        id=uuid.uuid4(),
        name="OldCat",
        color=None,
        active=False,
    )
    db_session.add(row)
    await db_session.flush()
    return row


async def test_get_categories_empty_returns_200_and_empty_data(
    client: AsyncClient,
):
    """GET /api/v1/categories with no data returns 200 and data: []."""
    response = await client.get("/api/v1/categories")
    assert response.status_code == 200
    body = response.json()
    assert "data" in body
    assert body["data"] == []


async def test_get_categories_returns_active_only_with_correct_shape(
    client: AsyncClient,
    one_active_category: Category,
    one_inactive_category: Category,
):
    """GET returns only active categories with id, name, color, active, createdAt."""
    response = await client.get("/api/v1/categories")
    assert response.status_code == 200
    body = response.json()
    assert "data" in body
    assert len(body["data"]) == 1
    item = body["data"][0]
    assert item["id"] == str(one_active_category.id)
    assert item["name"] == one_active_category.name
    assert item["color"] == one_active_category.color
    assert item["active"] is True
    assert "createdAt" in item
    ids = [x["id"] for x in body["data"]]
    assert str(one_inactive_category.id) not in ids
