"""Analytics service: monthly expense, expense by category, etc."""

import calendar
from datetime import date
from decimal import Decimal

from sqlalchemy import case, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Category, LedgerEntry, PaymentMethod


async def get_monthly_expense(
    session: AsyncSession,
    from_date: date,
    to_date: date,
) -> list[dict[str, str | float]]:
    """Aggregate ledger entries by month (YYYY-MM) in the given range (inclusive).
    Only non-deleted entries. totalExpense = sum(amount where amount > 0),
    totalRefund = abs(sum(amount where amount < 0)). Returns one row per month in range,
    with 0 for months that have no entries.
    """
    month_start = func.date_trunc("month", LedgerEntry.date).label("month_start")
    total_expense = func.coalesce(
        func.sum(case((LedgerEntry.amount > 0, LedgerEntry.amount), else_=0)), 0
    ).label("total_expense")
    total_refund = func.coalesce(
        func.sum(case((LedgerEntry.amount < 0, -LedgerEntry.amount), else_=0)), 0
    ).label("total_refund")

    q = (
        select(month_start, total_expense, total_refund)
        .select_from(LedgerEntry)
        .where(
            LedgerEntry.deleted_at.is_(None),
            LedgerEntry.date >= from_date,
            LedgerEntry.date <= to_date,
        )
        .group_by(month_start)
        .order_by(month_start)
    )
    result = await session.execute(q)
    rows = result.all()

    by_month: dict[str, tuple[Decimal, Decimal]] = {}
    for row in rows:
        # month_start is timestamp; format as YYYY-MM
        ts = row[0]
        if hasattr(ts, "strftime"):
            month_str = ts.strftime("%Y-%m")
        else:
            month_str = f"{ts.year:04d}-{ts.month:02d}"
        by_month[month_str] = (row[1], row[2])

    out: list[dict[str, str | float]] = []
    y, m = from_date.year, from_date.month
    end_y, end_m = to_date.year, to_date.month
    while (y, m) <= (end_y, end_m):
        month_str = f"{y:04d}-{m:02d}"
        te, tr = by_month.get(month_str, (Decimal("0"), Decimal("0")))
        out.append(
            {
                "month": month_str,
                "totalExpense": float(te),
                "totalRefund": float(tr),
            }
        )
        m += 1
        if m > 12:
            m = 1
            y += 1
    return out


async def get_expense_by_category(
    session: AsyncSession,
    first_day_of_month: date,
) -> list[dict[str, str | float]]:
    """Expense totals by category for the given month (positive amounts only).
    Excludes soft-deleted entries. Returns list of categoryId, categoryName, amount.
    """
    _, last_day = calendar.monthrange(first_day_of_month.year, first_day_of_month.month)
    last_day_of_month = first_day_of_month.replace(day=last_day)

    total = func.coalesce(func.sum(LedgerEntry.amount), Decimal("0")).label("amount")

    q = (
        select(
            LedgerEntry.category_id,
            Category.name.label("category_name"),
            total,
        )
        .select_from(LedgerEntry)
        .join(Category, LedgerEntry.category_id == Category.id)
        .where(
            LedgerEntry.deleted_at.is_(None),
            LedgerEntry.date >= first_day_of_month,
            LedgerEntry.date <= last_day_of_month,
            LedgerEntry.amount > 0,
        )
        .group_by(LedgerEntry.category_id, Category.name)
        .order_by(total.desc())
    )
    result = await session.execute(q)
    return [
        {
            "categoryId": str(row[0]),
            "categoryName": row[1],
            "amount": float(row[2]),
        }
        for row in result.all()
    ]


async def get_expense_by_payment_method(
    session: AsyncSession,
    first_day_of_month: date,
) -> list[dict[str, str | float]]:
    """Expense totals by payment method for the given month (positive amounts only).
    Excludes soft-deleted entries. Returns list of paymentMethodId, paymentMethodName, amount.
    """
    _, last_day = calendar.monthrange(first_day_of_month.year, first_day_of_month.month)
    last_day_of_month = first_day_of_month.replace(day=last_day)

    total = func.coalesce(func.sum(LedgerEntry.amount), Decimal("0")).label("amount")

    q = (
        select(
            LedgerEntry.payment_method_id,
            PaymentMethod.name.label("payment_method_name"),
            total,
        )
        .select_from(LedgerEntry)
        .join(PaymentMethod, LedgerEntry.payment_method_id == PaymentMethod.id)
        .where(
            LedgerEntry.deleted_at.is_(None),
            LedgerEntry.date >= first_day_of_month,
            LedgerEntry.date <= last_day_of_month,
            LedgerEntry.amount > 0,
        )
        .group_by(LedgerEntry.payment_method_id, PaymentMethod.name)
        .order_by(total.desc())
    )
    result = await session.execute(q)
    return [
        {
            "paymentMethodId": str(row[0]),
            "paymentMethodName": row[1],
            "amount": float(row[2]),
        }
        for row in result.all()
    ]
