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


# --- POST /api/v1/categories (Step 7) ---


async def test_post_category_201_valid_with_color(client: AsyncClient):
    """POST with name and color returns 201, Location, and data with id, name, color, active, createdAt."""
    response = await client.post(
        "/api/v1/categories",
        json={"name": "Food", "color": "#ff0000"},
    )
    assert response.status_code == 201
    assert response.headers.get("location", "").startswith("/api/v1/categories/")
    body = response.json()
    assert "data" in body
    data = body["data"]
    assert "id" in data
    assert data["name"] == "Food"
    assert data["color"] == "#ff0000"
    assert data["active"] is True
    assert "createdAt" in data


async def test_post_category_201_valid_without_color(client: AsyncClient):
    """POST with name only returns 201; color is null."""
    response = await client.post(
        "/api/v1/categories",
        json={"name": "Misc"},
    )
    assert response.status_code == 201
    data = response.json()["data"]
    assert data["name"] == "Misc"
    assert data["color"] is None
    assert data["active"] is True


async def test_post_category_422_missing_name(client: AsyncClient):
    """POST without name returns 422."""
    response = await client.post(
        "/api/v1/categories",
        json={"color": "#fff"},
    )
    assert response.status_code == 422
    detail = response.json().get("detail", [])
    assert any("name" in str(e.get("loc", [])) for e in detail)


async def test_post_category_422_empty_name(client: AsyncClient):
    """POST with empty name returns 422."""
    response = await client.post(
        "/api/v1/categories",
        json={"name": ""},
    )
    assert response.status_code == 422


async def test_post_category_422_invalid_type_name(client: AsyncClient):
    """POST with name as number returns 422."""
    response = await client.post(
        "/api/v1/categories",
        json={"name": 123},
    )
    assert response.status_code == 422


# --- GET /api/v1/categories/{id} (Step 8) ---


async def test_get_category_by_id_200_existing(
    client: AsyncClient,
    one_active_category: Category,
):
    """GET /categories/{id} with existing id returns 200 and data with id, name, color, active, createdAt."""
    response = await client.get(f"/api/v1/categories/{one_active_category.id}")
    assert response.status_code == 200
    body = response.json()
    assert "data" in body
    data = body["data"]
    assert data["id"] == str(one_active_category.id)
    assert data["name"] == one_active_category.name
    assert data["color"] == one_active_category.color
    assert data["active"] is True
    assert "createdAt" in data


async def test_get_category_by_id_200_inactive(
    client: AsyncClient,
    one_inactive_category: Category,
):
    """GET /categories/{id} returns inactive record (for historical display)."""
    response = await client.get(f"/api/v1/categories/{one_inactive_category.id}")
    assert response.status_code == 200
    data = response.json()["data"]
    assert data["id"] == str(one_inactive_category.id)
    assert data["active"] is False


async def test_get_category_by_id_404_not_found(client: AsyncClient):
    """GET /categories/{id} with non-existent UUID returns 404."""
    response = await client.get(f"/api/v1/categories/{uuid.uuid4()}")
    assert response.status_code == 404
    body = response.json()
    assert "detail" in body


async def test_get_category_by_id_422_invalid_uuid(client: AsyncClient):
    """GET /categories/{id} with invalid UUID format returns 422."""
    response = await client.get("/api/v1/categories/not-a-uuid")
    assert response.status_code == 422
