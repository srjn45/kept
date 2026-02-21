"""Integration tests for POST and GET /api/v1/ledger-entries."""

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


@pytest_asyncio.fixture
async def one_second_category(db_session: AsyncSession) -> Category:
    """Second active category for filter tests."""
    row = Category(
        id=uuid.uuid4(),
        name="Travel",
        color="#0000ff",
        active=True,
    )
    db_session.add(row)
    await db_session.flush()
    return row


@pytest_asyncio.fixture
async def one_second_payment_method(db_session: AsyncSession) -> PaymentMethod:
    """Second active payment method for filter tests."""
    row = PaymentMethod(
        id=uuid.uuid4(),
        name="Card",
        currency="INR",
        active=True,
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


# --- GET /api/v1/ledger-entries (list) ---


async def test_get_ledger_entries_200_empty(client: AsyncClient):
    """GET with no entries returns 200, data: [], nextCursor: null."""
    response = await client.get("/api/v1/ledger-entries")
    assert response.status_code == 200
    body = response.json()
    assert body["data"] == []
    assert body["nextCursor"] is None


async def test_get_ledger_entries_200_one_page_shape_and_sort(
    client: AsyncClient,
    one_active_category: Category,
    one_active_payment_method: PaymentMethod,
):
    """GET returns one page with correct shape; sort order date desc."""
    await client.post(
        "/api/v1/ledger-entries",
        json={
            **_valid_payload(
                category_id=one_active_category.id,
                payment_method_id=one_active_payment_method.id,
            ),
            "date": "2025-01-10",
            "description": "First",
        },
    )
    await client.post(
        "/api/v1/ledger-entries",
        json={
            **_valid_payload(
                category_id=one_active_category.id,
                payment_method_id=one_active_payment_method.id,
            ),
            "date": "2025-01-15",
            "description": "Second",
        },
    )
    response = await client.get("/api/v1/ledger-entries")
    assert response.status_code == 200
    body = response.json()
    assert "data" in body
    assert len(body["data"]) == 2
    assert body["data"][0]["date"] == "2025-01-15"
    assert body["data"][0]["description"] == "Second"
    assert body["data"][1]["date"] == "2025-01-10"
    assert body["data"][1]["description"] == "First"
    assert body["nextCursor"] is None
    item = body["data"][0]
    assert "id" in item
    assert "categoryId" in item
    assert item["categoryName"] == "Food"
    assert "paymentMethodId" in item
    assert item["paymentMethodName"] == "Cash"
    assert item["currency"] == "INR"
    assert "amount" in item
    assert "tags" in item
    assert "createdAt" in item
    assert "updatedAt" in item


async def test_get_ledger_entries_200_second_page_no_duplicates(
    client: AsyncClient,
    one_active_category: Category,
    one_active_payment_method: PaymentMethod,
):
    """GET with cursor returns next page; no duplicate entries."""
    for i in range(3):
        await client.post(
            "/api/v1/ledger-entries",
            json={
                **_valid_payload(
                    category_id=one_active_category.id,
                    payment_method_id=one_active_payment_method.id,
                ),
                "date": "2025-01-15",
                "description": f"Entry {i}",
            },
        )
    response = await client.get("/api/v1/ledger-entries?limit=2")
    assert response.status_code == 200
    body = response.json()
    assert len(body["data"]) == 2
    assert body["nextCursor"] is not None
    cursor = body["nextCursor"]
    response2 = await client.get(f"/api/v1/ledger-entries?limit=2&cursor={cursor}")
    assert response2.status_code == 200
    body2 = response2.json()
    assert len(body2["data"]) == 1
    assert body2["nextCursor"] is None
    ids1 = {e["id"] for e in body["data"]}
    ids2 = {e["id"] for e in body2["data"]}
    assert ids1.isdisjoint(ids2)


async def test_get_ledger_entries_200_filter_date_from_to(
    client: AsyncClient,
    one_active_category: Category,
    one_active_payment_method: PaymentMethod,
):
    """GET with dateFrom and dateTo returns only entries in range."""
    await client.post(
        "/api/v1/ledger-entries",
        json={
            **_valid_payload(
                category_id=one_active_category.id,
                payment_method_id=one_active_payment_method.id,
            ),
            "date": "2025-01-05",
            "description": "Before",
        },
    )
    await client.post(
        "/api/v1/ledger-entries",
        json={
            **_valid_payload(
                category_id=one_active_category.id,
                payment_method_id=one_active_payment_method.id,
            ),
            "date": "2025-01-15",
            "description": "In range",
        },
    )
    await client.post(
        "/api/v1/ledger-entries",
        json={
            **_valid_payload(
                category_id=one_active_category.id,
                payment_method_id=one_active_payment_method.id,
            ),
            "date": "2025-01-25",
            "description": "After",
        },
    )
    response = await client.get(
        "/api/v1/ledger-entries?dateFrom=2025-01-10&dateTo=2025-01-20"
    )
    assert response.status_code == 200
    data = response.json()["data"]
    assert len(data) == 1
    assert data[0]["description"] == "In range"


async def test_get_ledger_entries_200_filter_category_id(
    client: AsyncClient,
    one_active_category: Category,
    one_second_category: Category,
    one_active_payment_method: PaymentMethod,
):
    """GET with categoryId returns only entries in that category."""
    await client.post(
        "/api/v1/ledger-entries",
        json={
            **_valid_payload(
                category_id=one_active_category.id,
                payment_method_id=one_active_payment_method.id,
            ),
            "description": "Food entry",
        },
    )
    await client.post(
        "/api/v1/ledger-entries",
        json={
            **_valid_payload(
                category_id=one_second_category.id,
                payment_method_id=one_active_payment_method.id,
            ),
            "description": "Travel entry",
        },
    )
    response = await client.get(
        f"/api/v1/ledger-entries?categoryId={one_active_category.id}"
    )
    assert response.status_code == 200
    data = response.json()["data"]
    assert len(data) == 1
    assert data[0]["description"] == "Food entry"


async def test_get_ledger_entries_200_filter_payment_method_id(
    client: AsyncClient,
    one_active_category: Category,
    one_active_payment_method: PaymentMethod,
    one_second_payment_method: PaymentMethod,
):
    """GET with paymentMethodId returns only entries for that payment method."""
    await client.post(
        "/api/v1/ledger-entries",
        json={
            **_valid_payload(
                category_id=one_active_category.id,
                payment_method_id=one_active_payment_method.id,
            ),
            "description": "Cash entry",
        },
    )
    await client.post(
        "/api/v1/ledger-entries",
        json={
            **_valid_payload(
                category_id=one_active_category.id,
                payment_method_id=one_second_payment_method.id,
            ),
            "description": "Card entry",
        },
    )
    response = await client.get(
        f"/api/v1/ledger-entries?paymentMethodId={one_active_payment_method.id}"
    )
    assert response.status_code == 200
    data = response.json()["data"]
    assert len(data) == 1
    assert data[0]["description"] == "Cash entry"


async def test_get_ledger_entries_200_filter_type(
    client: AsyncClient,
    one_active_category: Category,
    one_active_payment_method: PaymentMethod,
):
    """GET with type=expense returns only negative amounts."""
    await client.post(
        "/api/v1/ledger-entries",
        json={
            **_valid_payload(
                category_id=one_active_category.id,
                payment_method_id=one_active_payment_method.id,
            ),
            "amount": "-10.00",
            "description": "Expense",
        },
    )
    await client.post(
        "/api/v1/ledger-entries",
        json={
            **_valid_payload(
                category_id=one_active_category.id,
                payment_method_id=one_active_payment_method.id,
            ),
            "amount": "5.00",
            "description": "Refund",
        },
    )
    response = await client.get("/api/v1/ledger-entries?type=expense")
    assert response.status_code == 200
    data = response.json()["data"]
    assert len(data) == 1
    assert data[0]["description"] == "Expense"


async def test_get_ledger_entries_200_filter_tags(
    client: AsyncClient,
    one_active_category: Category,
    one_active_payment_method: PaymentMethod,
):
    """GET with tags (comma-separated) returns entries containing all tags (AND)."""
    await client.post(
        "/api/v1/ledger-entries",
        json={
            **_valid_payload(
                category_id=one_active_category.id,
                payment_method_id=one_active_payment_method.id,
                tags=["a", "b"],
            ),
            "description": "Both tags",
        },
    )
    await client.post(
        "/api/v1/ledger-entries",
        json={
            **_valid_payload(
                category_id=one_active_category.id,
                payment_method_id=one_active_payment_method.id,
                tags=["a"],
            ),
            "description": "Only A",
        },
    )
    response = await client.get("/api/v1/ledger-entries?tags=a,b")
    assert response.status_code == 200
    data = response.json()["data"]
    assert len(data) == 1
    assert data[0]["description"] == "Both tags"


async def test_get_ledger_entries_422_invalid_limit(client: AsyncClient):
    """GET with limit=0 or limit=101 returns 422."""
    r0 = await client.get("/api/v1/ledger-entries?limit=0")
    assert r0.status_code == 422
    r1 = await client.get("/api/v1/ledger-entries?limit=101")
    assert r1.status_code == 422


async def test_get_ledger_entries_422_invalid_date_format(client: AsyncClient):
    """GET with invalid dateFrom/dateTo returns 422."""
    r = await client.get("/api/v1/ledger-entries?dateFrom=not-a-date")
    assert r.status_code == 422


# --- GET /api/v1/ledger-entries/{id} ---


async def test_get_ledger_entry_by_id_200_existing(
    client: AsyncClient,
    one_active_category: Category,
    one_active_payment_method: PaymentMethod,
):
    """GET /ledger-entries/{id} with existing id returns 200 and full response shape."""
    create_resp = await client.post(
        "/api/v1/ledger-entries",
        json=_valid_payload(
            category_id=one_active_category.id,
            payment_method_id=one_active_payment_method.id,
        )
        | {"description": "Single entry"},
    )
    assert create_resp.status_code == 201
    entry_id = create_resp.json()["data"]["id"]
    response = await client.get(f"/api/v1/ledger-entries/{entry_id}")
    assert response.status_code == 200
    body = response.json()
    assert "data" in body
    data = body["data"]
    assert data["id"] == entry_id
    assert data["description"] == "Single entry"
    assert data["categoryName"] == "Food"
    assert data["paymentMethodName"] == "Cash"
    assert data["currency"] == "INR"
    assert "date" in data
    assert "categoryId" in data
    assert "paymentMethodId" in data
    assert "amount" in data
    assert "tags" in data
    assert "createdAt" in data
    assert "updatedAt" in data


async def test_get_ledger_entry_by_id_404_not_found(client: AsyncClient):
    """GET /ledger-entries/{id} with non-existent id returns 404."""
    response = await client.get(f"/api/v1/ledger-entries/{uuid.uuid4()}")
    assert response.status_code == 404
    assert "detail" in response.json()


async def test_get_ledger_entry_by_id_404_soft_deleted(
    client: AsyncClient,
    db_session: AsyncSession,
    one_active_category: Category,
    one_active_payment_method: PaymentMethod,
):
    """GET /ledger-entries/{id} with soft-deleted entry returns 404."""
    from datetime import UTC, datetime

    from sqlalchemy import update

    from app.models import LedgerEntry

    create_resp = await client.post(
        "/api/v1/ledger-entries",
        json=_valid_payload(
            category_id=one_active_category.id,
            payment_method_id=one_active_payment_method.id,
        )
        | {"description": "To delete"},
    )
    assert create_resp.status_code == 201
    entry_id = create_resp.json()["data"]["id"]
    await db_session.execute(
        update(LedgerEntry)
        .where(LedgerEntry.id == uuid.UUID(entry_id))
        .values(deleted_at=datetime.now(UTC))
    )
    await db_session.flush()
    response = await client.get(f"/api/v1/ledger-entries/{entry_id}")
    assert response.status_code == 404
    assert "detail" in response.json()


async def test_get_ledger_entry_by_id_422_invalid_uuid(client: AsyncClient):
    """GET /ledger-entries/{id} with invalid UUID returns 422."""
    response = await client.get("/api/v1/ledger-entries/not-a-uuid")
    assert response.status_code == 422


# --- PUT /api/v1/ledger-entries/{id} ---


async def test_put_ledger_entry_200_valid_update(
    client: AsyncClient,
    one_active_category: Category,
    one_active_payment_method: PaymentMethod,
):
    """PUT with valid body updates entry; response reflects changes; tag_suggestions updated."""
    create_resp = await client.post(
        "/api/v1/ledger-entries",
        json=_valid_payload(
            category_id=one_active_category.id,
            payment_method_id=one_active_payment_method.id,
        )
        | {"description": "Original"},
    )
    assert create_resp.status_code == 201
    entry_id = create_resp.json()["data"]["id"]
    update_payload = {
        **_valid_payload(
            category_id=one_active_category.id,
            payment_method_id=one_active_payment_method.id,
        ),
        "date": "2025-03-01",
        "description": "Updated via PUT",
        "amount": "-99.99",
        "tags": ["put-tag"],
    }
    response = await client.put(
        f"/api/v1/ledger-entries/{entry_id}",
        json=update_payload,
    )
    assert response.status_code == 200
    data = response.json()["data"]
    assert data["id"] == entry_id
    assert data["date"] == "2025-03-01"
    assert data["description"] == "Updated via PUT"
    assert data["amount"] == "-99.99"
    assert data["tags"] == ["put-tag"]
    suggestions_resp = await client.get("/api/v1/tag-suggestions")
    assert suggestions_resp.status_code == 200
    assert "put-tag" in suggestions_resp.json().get("suggestions", [])


async def test_put_ledger_entry_404_not_found(
    client: AsyncClient,
    one_active_category: Category,
    one_active_payment_method: PaymentMethod,
):
    """PUT with non-existent id returns 404."""
    payload = _valid_payload(
        category_id=one_active_category.id,
        payment_method_id=one_active_payment_method.id,
    )
    response = await client.put(
        f"/api/v1/ledger-entries/{uuid.uuid4()}",
        json=payload,
    )
    assert response.status_code == 404
    assert "detail" in response.json()


async def test_put_ledger_entry_404_soft_deleted(
    client: AsyncClient,
    db_session: AsyncSession,
    one_active_category: Category,
    one_active_payment_method: PaymentMethod,
):
    """PUT with soft-deleted entry id returns 404."""
    from datetime import UTC, datetime

    from sqlalchemy import update

    from app.models import LedgerEntry

    create_resp = await client.post(
        "/api/v1/ledger-entries",
        json=_valid_payload(
            category_id=one_active_category.id,
            payment_method_id=one_active_payment_method.id,
        )
        | {"description": "To delete"},
    )
    assert create_resp.status_code == 201
    entry_id = create_resp.json()["data"]["id"]
    await db_session.execute(
        update(LedgerEntry)
        .where(LedgerEntry.id == uuid.UUID(entry_id))
        .values(deleted_at=datetime.now(UTC))
    )
    await db_session.flush()
    response = await client.put(
        f"/api/v1/ledger-entries/{entry_id}",
        json=_valid_payload(
            category_id=one_active_category.id,
            payment_method_id=one_active_payment_method.id,
        ),
    )
    assert response.status_code == 404
    assert "detail" in response.json()


async def test_put_ledger_entry_422_missing_description(
    client: AsyncClient,
    one_active_category: Category,
    one_active_payment_method: PaymentMethod,
):
    """PUT without description returns 422."""
    create_resp = await client.post(
        "/api/v1/ledger-entries",
        json=_valid_payload(
            category_id=one_active_category.id,
            payment_method_id=one_active_payment_method.id,
        ),
    )
    assert create_resp.status_code == 201
    entry_id = create_resp.json()["data"]["id"]
    payload = _valid_payload(
        category_id=one_active_category.id,
        payment_method_id=one_active_payment_method.id,
    )
    del payload["description"]
    response = await client.put(f"/api/v1/ledger-entries/{entry_id}", json=payload)
    assert response.status_code == 422


async def test_put_ledger_entry_422_empty_description(
    client: AsyncClient,
    one_active_category: Category,
    one_active_payment_method: PaymentMethod,
):
    """PUT with empty description returns 422."""
    create_resp = await client.post(
        "/api/v1/ledger-entries",
        json=_valid_payload(
            category_id=one_active_category.id,
            payment_method_id=one_active_payment_method.id,
        ),
    )
    assert create_resp.status_code == 201
    entry_id = create_resp.json()["data"]["id"]
    payload = _valid_payload(
        category_id=one_active_category.id,
        payment_method_id=one_active_payment_method.id,
    )
    payload["description"] = "   "
    response = await client.put(f"/api/v1/ledger-entries/{entry_id}", json=payload)
    assert response.status_code == 422


async def test_put_ledger_entry_422_invalid_amount(
    client: AsyncClient,
    one_active_category: Category,
    one_active_payment_method: PaymentMethod,
):
    """PUT with invalid amount returns 422."""
    create_resp = await client.post(
        "/api/v1/ledger-entries",
        json=_valid_payload(
            category_id=one_active_category.id,
            payment_method_id=one_active_payment_method.id,
        ),
    )
    assert create_resp.status_code == 201
    entry_id = create_resp.json()["data"]["id"]
    payload = _valid_payload(
        category_id=one_active_category.id,
        payment_method_id=one_active_payment_method.id,
    )
    payload["amount"] = "not-a-number"
    response = await client.put(f"/api/v1/ledger-entries/{entry_id}", json=payload)
    assert response.status_code == 422


async def test_put_ledger_entry_404_inactive_category(
    client: AsyncClient,
    one_active_category: Category,
    one_inactive_category: Category,
    one_active_payment_method: PaymentMethod,
):
    """PUT with inactive categoryId returns 404."""
    create_resp = await client.post(
        "/api/v1/ledger-entries",
        json=_valid_payload(
            category_id=one_active_category.id,
            payment_method_id=one_active_payment_method.id,
        ),
    )
    assert create_resp.status_code == 201
    entry_id = create_resp.json()["data"]["id"]
    response = await client.put(
        f"/api/v1/ledger-entries/{entry_id}",
        json=_valid_payload(
            category_id=one_inactive_category.id,
            payment_method_id=one_active_payment_method.id,
        ),
    )
    assert response.status_code == 404
    assert "detail" in response.json()
