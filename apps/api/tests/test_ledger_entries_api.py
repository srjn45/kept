"""Integration tests for POST /api/v1/ledger-entries."""

import uuid

import pytest
import pytest_asyncio
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Category, PaymentMethod

pytestmark = pytest.mark.integration


@pytest_asyncio.fixture
async def one_active_category(db_session: AsyncSession) -> Category:
    """One active category for ledger entry tests."""
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
async def one_active_payment_method(db_session: AsyncSession) -> PaymentMethod:
    """One active payment method for ledger entry tests."""
    row = PaymentMethod(
        id=uuid.uuid4(),
        name="Cash",
        currency="INR",
        active=True,
    )
    db_session.add(row)
    await db_session.flush()
    return row


@pytest_asyncio.fixture
async def one_inactive_category(db_session: AsyncSession) -> Category:
    """One inactive category."""
    row = Category(
        id=uuid.uuid4(),
        name="OldCat",
        color=None,
        active=False,
    )
    db_session.add(row)
    await db_session.flush()
    return row


@pytest_asyncio.fixture
async def one_inactive_payment_method(db_session: AsyncSession) -> PaymentMethod:
    """One inactive payment method."""
    row = PaymentMethod(
        id=uuid.uuid4(),
        name="OldCard",
        currency="USD",
        active=False,
    )
    db_session.add(row)
    await db_session.flush()
    return row


def _valid_payload(
    *,
    category_id: uuid.UUID,
    payment_method_id: uuid.UUID,
    tags: list[str] | None = None,
) -> dict[str, str | list[str]]:
    base: dict[str, str | list[str]] = {
        "date": "2025-01-15",
        "description": "Lunch",
        "categoryId": str(category_id),
        "paymentMethodId": str(payment_method_id),
        "amount": "10.50",
    }
    if tags is not None:
        base["tags"] = tags
    return base


async def test_post_ledger_entry_201_valid_without_tags(
    client: AsyncClient,
    one_active_category: Category,
    one_active_payment_method: PaymentMethod,
):
    """POST with valid body without tags returns 201, Location, and data with resolved names and currency."""
    payload = _valid_payload(
        category_id=one_active_category.id,
        payment_method_id=one_active_payment_method.id,
    )
    response = await client.post("/api/v1/ledger-entries", json=payload)
    assert response.status_code == 201
    assert response.headers.get("location", "").startswith("/api/v1/ledger-entries/")
    body = response.json()
    assert "data" in body
    data = body["data"]
    assert "id" in data
    assert data["date"] == "2025-01-15"
    assert data["description"] == "Lunch"
    assert data["categoryId"] == str(one_active_category.id)
    assert data["categoryName"] == "Food"
    assert data["paymentMethodId"] == str(one_active_payment_method.id)
    assert data["paymentMethodName"] == "Cash"
    assert data["currency"] == "INR"
    assert data["amount"] == "10.50"
    assert data["tags"] == []
    assert "createdAt" in data
    assert "updatedAt" in data


async def test_post_ledger_entry_201_valid_with_tags_and_tag_suggestions(
    client: AsyncClient,
    one_active_category: Category,
    one_active_payment_method: PaymentMethod,
):
    """POST with tags returns 201 and tag_suggestions includes the tags."""
    payload = _valid_payload(
        category_id=one_active_category.id,
        payment_method_id=one_active_payment_method.id,
        tags=["food", "lunch"],
    )
    response = await client.post("/api/v1/ledger-entries", json=payload)
    assert response.status_code == 201
    data = response.json()["data"]
    assert data["tags"] == ["food", "lunch"]
    # Tag suggestions should include the new tags
    suggestions_resp = await client.get("/api/v1/tag-suggestions")
    assert suggestions_resp.status_code == 200
    suggestions = set(suggestions_resp.json().get("suggestions", []))
    assert "food" in suggestions
    assert "lunch" in suggestions


async def test_post_ledger_entry_422_missing_date(
    client: AsyncClient,
    one_active_category: Category,
    one_active_payment_method: PaymentMethod,
):
    """POST without date returns 422."""
    payload = _valid_payload(
        category_id=one_active_category.id,
        payment_method_id=one_active_payment_method.id,
    )
    del payload["date"]
    response = await client.post("/api/v1/ledger-entries", json=payload)
    assert response.status_code == 422
    detail = response.json().get("detail", [])
    assert any("date" in str(e.get("loc", [])) for e in detail)


async def test_post_ledger_entry_422_missing_description(
    client: AsyncClient,
    one_active_category: Category,
    one_active_payment_method: PaymentMethod,
):
    """POST without description returns 422."""
    payload = _valid_payload(
        category_id=one_active_category.id,
        payment_method_id=one_active_payment_method.id,
    )
    del payload["description"]
    response = await client.post("/api/v1/ledger-entries", json=payload)
    assert response.status_code == 422
    detail = response.json().get("detail", [])
    assert any("description" in str(e.get("loc", [])) for e in detail)


async def test_post_ledger_entry_422_empty_description(
    client: AsyncClient,
    one_active_category: Category,
    one_active_payment_method: PaymentMethod,
):
    """POST with empty description returns 422."""
    payload = _valid_payload(
        category_id=one_active_category.id,
        payment_method_id=one_active_payment_method.id,
    )
    payload["description"] = "   "
    response = await client.post("/api/v1/ledger-entries", json=payload)
    assert response.status_code == 422


async def test_post_ledger_entry_422_invalid_amount(
    client: AsyncClient,
    one_active_category: Category,
    one_active_payment_method: PaymentMethod,
):
    """POST with invalid amount type returns 422."""
    payload = _valid_payload(
        category_id=one_active_category.id,
        payment_method_id=one_active_payment_method.id,
    )
    payload["amount"] = "not-a-number"
    response = await client.post("/api/v1/ledger-entries", json=payload)
    assert response.status_code == 422


async def test_post_ledger_entry_422_invalid_tags(
    client: AsyncClient,
    one_active_category: Category,
    one_active_payment_method: PaymentMethod,
):
    """POST with tag longer than 50 chars returns 422."""
    payload = _valid_payload(
        category_id=one_active_category.id,
        payment_method_id=one_active_payment_method.id,
        tags=["a" * 51],
    )
    response = await client.post("/api/v1/ledger-entries", json=payload)
    assert response.status_code == 422


async def test_post_ledger_entry_404_category_not_found(
    client: AsyncClient,
    one_active_payment_method: PaymentMethod,
):
    """POST with non-existent categoryId returns 404."""
    payload = _valid_payload(
        category_id=uuid.uuid4(),
        payment_method_id=one_active_payment_method.id,
    )
    response = await client.post("/api/v1/ledger-entries", json=payload)
    assert response.status_code == 404
    assert "detail" in response.json()
    assert "Category" in response.json()["detail"]


async def test_post_ledger_entry_404_payment_method_not_found(
    client: AsyncClient,
    one_active_category: Category,
):
    """POST with non-existent paymentMethodId returns 404."""
    payload = _valid_payload(
        category_id=one_active_category.id,
        payment_method_id=uuid.uuid4(),
    )
    response = await client.post("/api/v1/ledger-entries", json=payload)
    assert response.status_code == 404
    assert "detail" in response.json()
    assert "Payment method" in response.json()["detail"]


async def test_post_ledger_entry_404_category_inactive(
    client: AsyncClient,
    one_inactive_category: Category,
    one_active_payment_method: PaymentMethod,
):
    """POST with inactive category returns 404."""
    payload = _valid_payload(
        category_id=one_inactive_category.id,
        payment_method_id=one_active_payment_method.id,
    )
    response = await client.post("/api/v1/ledger-entries", json=payload)
    assert response.status_code == 404
    assert "detail" in response.json()
    assert "Category" in response.json()["detail"]


async def test_post_ledger_entry_404_payment_method_inactive(
    client: AsyncClient,
    one_active_category: Category,
    one_inactive_payment_method: PaymentMethod,
):
    """POST with inactive payment method returns 404."""
    payload = _valid_payload(
        category_id=one_active_category.id,
        payment_method_id=one_inactive_payment_method.id,
    )
    response = await client.post("/api/v1/ledger-entries", json=payload)
    assert response.status_code == 404
    assert "detail" in response.json()
    assert "Payment method" in response.json()["detail"]
