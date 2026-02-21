"""Integration tests for GET /api/v1/analytics/monthly-expense."""

import uuid

import pytest
import pytest_asyncio
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Category, PaymentMethod

pytestmark = pytest.mark.integration


@pytest_asyncio.fixture
async def one_active_category(db_session: AsyncSession) -> Category:
    """One active category."""
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
    """One active payment method."""
    row = PaymentMethod(
        id=uuid.uuid4(),
        name="Cash",
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


async def test_get_monthly_expense_200_empty_range(client: AsyncClient):
    """GET with range and no entries returns 200 and data array with months and 0 totals."""
    response = await client.get(
        "/api/v1/analytics/monthly-expense?from=2025-01-01&to=2025-02-28"
    )
    assert response.status_code == 200
    body = response.json()
    assert "data" in body
    data = body["data"]
    assert len(data) == 2
    assert data[0]["month"] == "2025-01"
    assert data[0]["totalExpense"] == 0.0
    assert data[0]["totalRefund"] == 0.0
    assert data[1]["month"] == "2025-02"
    assert data[1]["totalExpense"] == 0.0
    assert data[1]["totalRefund"] == 0.0


async def test_get_monthly_expense_200_with_entries(
    client: AsyncClient,
    one_active_category: Category,
    one_active_payment_method: PaymentMethod,
):
    """GET with entries returns correct totalExpense and totalRefund per month."""
    await client.post(
        "/api/v1/ledger-entries",
        json={
            **_valid_payload(
                category_id=one_active_category.id,
                payment_method_id=one_active_payment_method.id,
            ),
            "date": "2025-02-10",
            "description": "Expense",
            "amount": "100",
        },
    )
    await client.post(
        "/api/v1/ledger-entries",
        json={
            **_valid_payload(
                category_id=one_active_category.id,
                payment_method_id=one_active_payment_method.id,
            ),
            "date": "2025-02-20",
            "description": "Refund",
            "amount": "-25",
        },
    )
    response = await client.get(
        "/api/v1/analytics/monthly-expense?from=2025-02-01&to=2025-02-28"
    )
    assert response.status_code == 200
    data = response.json()["data"]
    assert len(data) == 1
    assert data[0]["month"] == "2025-02"
    assert data[0]["totalExpense"] == 100.0
    assert data[0]["totalRefund"] == 25.0


async def test_get_monthly_expense_422_missing_from(client: AsyncClient):
    """GET without from returns 422."""
    response = await client.get("/api/v1/analytics/monthly-expense?to=2025-12-31")
    assert response.status_code == 422


async def test_get_monthly_expense_422_missing_to(client: AsyncClient):
    """GET without to returns 422."""
    response = await client.get("/api/v1/analytics/monthly-expense?from=2025-01-01")
    assert response.status_code == 422


async def test_get_monthly_expense_422_invalid_date_format(client: AsyncClient):
    """GET with invalid date format returns 422."""
    response = await client.get(
        "/api/v1/analytics/monthly-expense?from=not-a-date&to=2025-12-31"
    )
    assert response.status_code == 422


async def test_get_monthly_expense_422_from_after_to(client: AsyncClient):
    """GET with from > to returns 422."""
    response = await client.get(
        "/api/v1/analytics/monthly-expense?from=2025-12-01&to=2025-01-01"
    )
    assert response.status_code == 422
    assert "detail" in response.json()


async def test_get_monthly_expense_422_range_exceeds_max(client: AsyncClient):
    """GET with range > 366 days returns 422."""
    response = await client.get(
        "/api/v1/analytics/monthly-expense?from=2024-01-01&to=2025-12-31"
    )
    assert response.status_code == 422
    assert "detail" in response.json()


# --- GET /analytics/expense-by-category ---


async def test_get_expense_by_category_200_empty(client: AsyncClient):
    """GET expense-by-category with no entries returns 200 and empty data."""
    response = await client.get("/api/v1/analytics/expense-by-category?month=2025-01")
    assert response.status_code == 200
    body = response.json()
    assert "data" in body
    assert body["data"] == []


async def test_get_expense_by_category_200_with_data(
    client: AsyncClient,
    one_active_category: Category,
    one_active_payment_method: PaymentMethod,
):
    """GET expense-by-category returns correct category breakdown."""
    await client.post(
        "/api/v1/ledger-entries",
        json={
            **_valid_payload(
                category_id=one_active_category.id,
                payment_method_id=one_active_payment_method.id,
            ),
            "date": "2025-03-10",
            "description": "Lunch",
            "amount": "50",
        },
    )
    await client.post(
        "/api/v1/ledger-entries",
        json={
            **_valid_payload(
                category_id=one_active_category.id,
                payment_method_id=one_active_payment_method.id,
            ),
            "date": "2025-03-20",
            "description": "Dinner",
            "amount": "30",
        },
    )
    response = await client.get("/api/v1/analytics/expense-by-category?month=2025-03")
    assert response.status_code == 200
    data = response.json()["data"]
    assert len(data) == 1
    assert data[0]["categoryId"] == str(one_active_category.id)
    assert data[0]["categoryName"] == "Food"
    assert data[0]["amount"] == 80.0


async def test_get_expense_by_category_422_missing_month(client: AsyncClient):
    """GET without month returns 422."""
    response = await client.get("/api/v1/analytics/expense-by-category")
    assert response.status_code == 422


async def test_get_expense_by_category_422_invalid_month(client: AsyncClient):
    """GET with invalid month format or value returns 422."""
    response = await client.get(
        "/api/v1/analytics/expense-by-category?month=not-a-month"
    )
    assert response.status_code == 422
    response2 = await client.get("/api/v1/analytics/expense-by-category?month=2025-13")
    assert response2.status_code == 422


# --- GET /analytics/expense-by-payment-method ---


async def test_get_expense_by_payment_method_200_empty(client: AsyncClient):
    """GET expense-by-payment-method with no entries returns 200 and empty data."""
    response = await client.get(
        "/api/v1/analytics/expense-by-payment-method?month=2025-01"
    )
    assert response.status_code == 200
    body = response.json()
    assert "data" in body
    assert body["data"] == []


async def test_get_expense_by_payment_method_200_with_data(
    client: AsyncClient,
    one_active_category: Category,
    one_active_payment_method: PaymentMethod,
):
    """GET expense-by-payment-method returns correct payment method breakdown."""
    await client.post(
        "/api/v1/ledger-entries",
        json={
            **_valid_payload(
                category_id=one_active_category.id,
                payment_method_id=one_active_payment_method.id,
            ),
            "date": "2025-04-10",
            "description": "Lunch",
            "amount": "50",
        },
    )
    await client.post(
        "/api/v1/ledger-entries",
        json={
            **_valid_payload(
                category_id=one_active_category.id,
                payment_method_id=one_active_payment_method.id,
            ),
            "date": "2025-04-20",
            "description": "Dinner",
            "amount": "30",
        },
    )
    response = await client.get(
        "/api/v1/analytics/expense-by-payment-method?month=2025-04"
    )
    assert response.status_code == 200
    data = response.json()["data"]
    assert len(data) == 1
    assert data[0]["paymentMethodId"] == str(one_active_payment_method.id)
    assert data[0]["paymentMethodName"] == "Cash"
    assert data[0]["amount"] == 80.0


async def test_get_expense_by_payment_method_422_missing_month(client: AsyncClient):
    """GET without month returns 422."""
    response = await client.get("/api/v1/analytics/expense-by-payment-method")
    assert response.status_code == 422


async def test_get_expense_by_payment_method_422_invalid_month(client: AsyncClient):
    """GET with invalid month format or value returns 422."""
    response = await client.get(
        "/api/v1/analytics/expense-by-payment-method?month=not-a-month"
    )
    assert response.status_code == 422
    response2 = await client.get(
        "/api/v1/analytics/expense-by-payment-method?month=2025-13"
    )
    assert response2.status_code == 422
