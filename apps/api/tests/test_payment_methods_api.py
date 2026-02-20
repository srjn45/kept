"""Integration tests for GET /api/v1/payment-methods."""

import uuid
from datetime import datetime

import pytest
import pytest_asyncio
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import PaymentMethod

pytestmark = pytest.mark.integration


@pytest_asyncio.fixture
async def one_active_payment_method(db_session: AsyncSession) -> PaymentMethod:
    """Insert one active payment method for tests that need data."""
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
async def one_inactive_payment_method(db_session: AsyncSession) -> PaymentMethod:
    """Insert one inactive payment method."""
    row = PaymentMethod(
        id=uuid.uuid4(),
        name="OldCard",
        currency="USD",
        active=False,
    )
    db_session.add(row)
    await db_session.flush()
    return row


async def test_get_payment_methods_empty_returns_200_and_empty_data(client: AsyncClient):
    """GET /api/v1/payment-methods with no data returns 200 and data: []."""
    response = await client.get("/api/v1/payment-methods")
    assert response.status_code == 200
    body = response.json()
    assert "data" in body
    assert body["data"] == []


async def test_get_payment_methods_returns_active_only_with_correct_shape(
    client: AsyncClient,
    one_active_payment_method: PaymentMethod,
    one_inactive_payment_method: PaymentMethod,
):
    """GET returns only active payment methods with id, name, currency, active, createdAt."""
    response = await client.get("/api/v1/payment-methods")
    assert response.status_code == 200
    body = response.json()
    assert "data" in body
    assert len(body["data"]) == 1
    item = body["data"][0]
    assert item["id"] == str(one_active_payment_method.id)
    assert item["name"] == one_active_payment_method.name
    assert item["currency"] == one_active_payment_method.currency
    assert item["active"] is True
    assert "createdAt" in item
    # Inactive record must not appear
    ids = [x["id"] for x in body["data"]]
    assert str(one_inactive_payment_method.id) not in ids


async def test_get_payment_methods_created_at_is_iso8601(
    client: AsyncClient,
    one_active_payment_method: PaymentMethod,
):
    """GET response createdAt is ISO 8601 format (date and time with T separator)."""
    response = await client.get("/api/v1/payment-methods")
    assert response.status_code == 200
    item = response.json()["data"][0]
    created_at = item["createdAt"]
    assert "T" in created_at
    # Parseable as ISO 8601 (naive or with Z/offset)
    datetime.fromisoformat(created_at.replace("Z", "+00:00"))


# --- POST /api/v1/payment-methods (Step 2) ---


async def test_post_payment_method_201_valid_body(client: AsyncClient):
    """POST with valid body returns 201, Location header, and data with id, name, currency, active, createdAt."""
    response = await client.post(
        "/api/v1/payment-methods",
        json={"name": "Card", "currency": "INR"},
    )
    assert response.status_code == 201
    assert response.headers.get("location", "").startswith("/api/v1/payment-methods/")
    body = response.json()
    assert "data" in body
    data = body["data"]
    assert "id" in data
    assert data["name"] == "Card"
    assert data["currency"] == "INR"
    assert data["active"] is True
    assert "createdAt" in data


async def test_post_payment_method_422_missing_name(client: AsyncClient):
    """POST without name returns 422."""
    response = await client.post(
        "/api/v1/payment-methods",
        json={"currency": "INR"},
    )
    assert response.status_code == 422
    detail = response.json().get("detail", [])
    assert any("name" in str(e.get("loc", [])) for e in detail)


async def test_post_payment_method_422_missing_currency(client: AsyncClient):
    """POST without currency returns 422."""
    response = await client.post(
        "/api/v1/payment-methods",
        json={"name": "Card"},
    )
    assert response.status_code == 422
    detail = response.json().get("detail", [])
    assert any("currency" in str(e.get("loc", [])) for e in detail)


async def test_post_payment_method_422_empty_name(client: AsyncClient):
    """POST with empty name returns 422."""
    response = await client.post(
        "/api/v1/payment-methods",
        json={"name": "", "currency": "INR"},
    )
    assert response.status_code == 422


async def test_post_payment_method_422_empty_currency(client: AsyncClient):
    """POST with empty currency returns 422."""
    response = await client.post(
        "/api/v1/payment-methods",
        json={"name": "Card", "currency": ""},
    )
    assert response.status_code == 422


async def test_post_payment_method_422_invalid_type_name(client: AsyncClient):
    """POST with name as number returns 422."""
    response = await client.post(
        "/api/v1/payment-methods",
        json={"name": 123, "currency": "INR"},
    )
    assert response.status_code == 422


# --- GET /api/v1/payment-methods/{id} (Step 3) ---


async def test_get_payment_method_by_id_200_existing(
    client: AsyncClient,
    one_active_payment_method: PaymentMethod,
):
    """GET /payment-methods/{id} with existing id returns 200 and data with id, name, currency, active, createdAt."""
    response = await client.get(f"/api/v1/payment-methods/{one_active_payment_method.id}")
    assert response.status_code == 200
    body = response.json()
    assert "data" in body
    data = body["data"]
    assert data["id"] == str(one_active_payment_method.id)
    assert data["name"] == one_active_payment_method.name
    assert data["currency"] == one_active_payment_method.currency
    assert data["active"] is True
    assert "createdAt" in data


async def test_get_payment_method_by_id_200_inactive(
    client: AsyncClient,
    one_inactive_payment_method: PaymentMethod,
):
    """GET /payment-methods/{id} returns inactive record (for historical ledger)."""
    response = await client.get(f"/api/v1/payment-methods/{one_inactive_payment_method.id}")
    assert response.status_code == 200
    data = response.json()["data"]
    assert data["id"] == str(one_inactive_payment_method.id)
    assert data["active"] is False


async def test_get_payment_method_by_id_404_not_found(client: AsyncClient):
    """GET /payment-methods/{id} with non-existent UUID returns 404."""
    response = await client.get(f"/api/v1/payment-methods/{uuid.uuid4()}")
    assert response.status_code == 404
    body = response.json()
    assert "detail" in body


async def test_get_payment_method_by_id_422_invalid_uuid(client: AsyncClient):
    """GET /payment-methods/{id} with invalid UUID format returns 422."""
    response = await client.get("/api/v1/payment-methods/not-a-uuid")
    assert response.status_code == 422


# --- PUT /api/v1/payment-methods/{id} (Step 4) ---


async def test_put_payment_method_200_valid_body(
    client: AsyncClient,
    one_active_payment_method: PaymentMethod,
):
    """PUT with valid body and existing id returns 200 and data with updated values."""
    response = await client.put(
        f"/api/v1/payment-methods/{one_active_payment_method.id}",
        json={"name": "CardUpdated", "currency": "USD"},
    )
    assert response.status_code == 200
    body = response.json()
    assert "data" in body
    data = body["data"]
    assert data["id"] == str(one_active_payment_method.id)
    assert data["name"] == "CardUpdated"
    assert data["currency"] == "USD"
    assert data["active"] is True
    assert "createdAt" in data
    # GET same id returns updated values
    get_resp = await client.get(f"/api/v1/payment-methods/{one_active_payment_method.id}")
    assert get_resp.status_code == 200
    assert get_resp.json()["data"]["name"] == "CardUpdated"
    assert get_resp.json()["data"]["currency"] == "USD"


async def test_put_payment_method_404_not_found(client: AsyncClient):
    """PUT with non-existent id returns 404."""
    response = await client.put(
        f"/api/v1/payment-methods/{uuid.uuid4()}",
        json={"name": "X", "currency": "INR"},
    )
    assert response.status_code == 404
    assert "detail" in response.json()


async def test_put_payment_method_422_missing_name(
    client: AsyncClient,
    one_active_payment_method: PaymentMethod,
):
    """PUT without name returns 422."""
    response = await client.put(
        f"/api/v1/payment-methods/{one_active_payment_method.id}",
        json={"currency": "INR"},
    )
    assert response.status_code == 422


async def test_put_payment_method_422_missing_currency(
    client: AsyncClient,
    one_active_payment_method: PaymentMethod,
):
    """PUT without currency returns 422."""
    response = await client.put(
        f"/api/v1/payment-methods/{one_active_payment_method.id}",
        json={"name": "Card"},
    )
    assert response.status_code == 422


async def test_put_payment_method_422_empty_name(
    client: AsyncClient,
    one_active_payment_method: PaymentMethod,
):
    """PUT with empty name returns 422."""
    response = await client.put(
        f"/api/v1/payment-methods/{one_active_payment_method.id}",
        json={"name": "", "currency": "INR"},
    )
    assert response.status_code == 422


async def test_put_payment_method_422_empty_currency(
    client: AsyncClient,
    one_active_payment_method: PaymentMethod,
):
    """PUT with empty currency returns 422."""
    response = await client.put(
        f"/api/v1/payment-methods/{one_active_payment_method.id}",
        json={"name": "Card", "currency": ""},
    )
    assert response.status_code == 422


async def test_put_payment_method_422_invalid_type_name(
    client: AsyncClient,
    one_active_payment_method: PaymentMethod,
):
    """PUT with name as number returns 422."""
    response = await client.put(
        f"/api/v1/payment-methods/{one_active_payment_method.id}",
        json={"name": 123, "currency": "INR"},
    )
    assert response.status_code == 422


async def test_put_payment_method_422_invalid_uuid(client: AsyncClient):
    """PUT with invalid UUID path returns 422."""
    response = await client.put(
        "/api/v1/payment-methods/not-a-uuid",
        json={"name": "Card", "currency": "INR"},
    )
    assert response.status_code == 422


# --- DELETE /api/v1/payment-methods/{id} (Step 5) ---


async def test_delete_payment_method_200_soft_deletes(
    client: AsyncClient,
    one_active_payment_method: PaymentMethod,
):
    """DELETE with existing id returns 200 and data with active=false; GET same id still returns record with active false."""
    response = await client.delete(f"/api/v1/payment-methods/{one_active_payment_method.id}")
    assert response.status_code == 200
    body = response.json()
    assert "data" in body
    data = body["data"]
    assert data["id"] == str(one_active_payment_method.id)
    assert data["active"] is False
    # GET same id still returns record with active: false
    get_resp = await client.get(f"/api/v1/payment-methods/{one_active_payment_method.id}")
    assert get_resp.status_code == 200
    assert get_resp.json()["data"]["active"] is False


async def test_delete_payment_method_404_not_found(client: AsyncClient):
    """DELETE with non-existent id returns 404."""
    response = await client.delete(f"/api/v1/payment-methods/{uuid.uuid4()}")
    assert response.status_code == 404
    assert "detail" in response.json()


async def test_delete_payment_method_422_invalid_uuid(client: AsyncClient):
    """DELETE with invalid UUID path returns 422."""
    response = await client.delete("/api/v1/payment-methods/not-a-uuid")
    assert response.status_code == 422
