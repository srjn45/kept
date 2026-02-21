"""Analytics API: monthly expense, expense by category, etc."""

from datetime import date, datetime

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.deps import get_db
from app.services.analytics import (
    get_expense_by_category,
    get_expense_by_payment_method,
    get_monthly_expense,
)

router = APIRouter(prefix="/analytics", tags=["analytics"])

MAX_RANGE_DAYS = 366


def _parse_month(month_str: str) -> date:
    """Parse YYYY-MM to first day of month. Raises ValueError if invalid."""
    parsed = datetime.strptime(month_str, "%Y-%m")
    return date(parsed.year, parsed.month, 1)


@router.get(
    "/monthly-expense",
    status_code=status.HTTP_200_OK,
    responses={
        200: {"description": "Monthly expense and refund totals"},
        422: {
            "description": "Validation error (missing from/to, invalid format, from > to, range > 1 year)"
        },
    },
)
async def get_monthly_expense_route(
    session: AsyncSession = Depends(get_db),
    from_: date = Query(..., alias="from", description="Start date (YYYY-MM-DD)"),
    to: date = Query(..., description="End date (YYYY-MM-DD)"),
) -> dict:
    """Monthly expense and refund aggregates. Only non-deleted entries.
    totalExpense = sum(positive amounts), totalRefund = abs(sum(negative amounts)).
    """
    if from_ > to:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail="from must be less than or equal to to",
        )
    if (to - from_).days > MAX_RANGE_DAYS:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail=f"Date range must not exceed {MAX_RANGE_DAYS} days",
        )
    data = await get_monthly_expense(session, from_, to)
    return {"data": data}


@router.get(
    "/expense-by-category",
    status_code=status.HTTP_200_OK,
    responses={
        200: {"description": "Expense totals by category for the given month"},
        422: {"description": "Validation error (missing or invalid month)"},
    },
)
async def get_expense_by_category_route(
    session: AsyncSession = Depends(get_db),
    month: str = Query(..., description="Month (YYYY-MM)"),
) -> dict:
    """Expense by category for the given month. Positive amounts only; excludes soft-deleted."""
    try:
        first_day = _parse_month(month)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail="month must be a valid month in YYYY-MM format",
        )
    data = await get_expense_by_category(session, first_day)
    return {"data": data}


@router.get(
    "/expense-by-payment-method",
    status_code=status.HTTP_200_OK,
    responses={
        200: {"description": "Expense totals by payment method for the given month"},
        422: {"description": "Validation error (missing or invalid month)"},
    },
)
async def get_expense_by_payment_method_route(
    session: AsyncSession = Depends(get_db),
    month: str = Query(..., description="Month (YYYY-MM)"),
) -> dict:
    """Expense by payment method for the given month. Positive amounts only; excludes soft-deleted."""
    try:
        first_day = _parse_month(month)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail="month must be a valid month in YYYY-MM format",
        )
    data = await get_expense_by_payment_method(session, first_day)
    return {"data": data}
