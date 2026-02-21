"""Ledger entries API: POST, GET list, GET by id, PUT (delete in later steps)."""

from datetime import date
from typing import Literal
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import JSONResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.deps import get_db
from app.schemas.ledger_entry import LedgerEntryCreate, LedgerEntryResponse
from app.services.ledger_entry import (
    LedgerEntryError,
    create_ledger_entry,
    get_ledger_entry,
    list_ledger_entries,
    update_ledger_entry,
)

router = APIRouter(prefix="/ledger-entries", tags=["ledger-entries"])


@router.get(
    "",
    status_code=status.HTTP_200_OK,
    responses={
        200: {"description": "Paginated list of ledger entries"},
        422: {"description": "Validation error (e.g. invalid date, limit)"},
    },
)
async def get_ledger_entries(
    session: AsyncSession = Depends(get_db),
    cursor: str | None = Query(None, description="Opaque cursor for next page"),
    limit: int = Query(50, ge=1, le=100, description="Page size"),
    dateFrom: date | None = Query(
        None, alias="dateFrom", description="Filter from date (inclusive)"
    ),
    dateTo: date | None = Query(
        None, alias="dateTo", description="Filter to date (inclusive)"
    ),
    categoryId: UUID | None = Query(None, alias="categoryId"),
    paymentMethodId: UUID | None = Query(None, alias="paymentMethodId"),
    type: Literal["expense", "refund"] | None = Query(
        None, description="expense=amount<0, refund=amount>0"
    ),
    tags: str | None = Query(None, description="Comma-separated tags (AND)"),
) -> dict:
    """List ledger entries, cursor-paginated, sorted by date desc. Excludes soft-deleted.
    Invalid cursor returns first page.
    """
    tag_list: list[str] | None = None
    if tags is not None and tags.strip():
        tag_list = [t.strip() for t in tags.split(",") if t.strip()]
    rows, next_cursor = await list_ledger_entries(
        session,
        cursor=cursor,
        limit=limit,
        date_from=dateFrom,
        date_to=dateTo,
        category_id=categoryId,
        payment_method_id=paymentMethodId,
        type_=type,
        tags=tag_list,
    )
    data = [
        LedgerEntryResponse(
            id=entry.id,
            date=entry.date,
            description=entry.description,
            categoryId=entry.category_id,
            categoryName=cat_name,
            paymentMethodId=entry.payment_method_id,
            paymentMethodName=pm_name,
            currency=currency,
            amount=entry.amount,
            tags=entry.tags,
            created_at=entry.created_at,
            updated_at=entry.updated_at,
        ).model_dump(mode="json", by_alias=True)
        for entry, cat_name, pm_name, currency in rows
    ]
    return {"data": data, "nextCursor": next_cursor}


@router.get(
    "/{id}",
    status_code=status.HTTP_200_OK,
    responses={
        200: {"description": "Ledger entry with resolved names and currency"},
        404: {"description": "Entry not found or soft-deleted"},
        422: {"description": "Invalid id format"},
    },
)
async def get_ledger_entry_by_id(
    id: UUID,
    session: AsyncSession = Depends(get_db),
) -> dict:
    """Get a single ledger entry by id. Returns 404 if not found or soft-deleted."""
    row = await get_ledger_entry(session, id)
    if row is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Ledger entry not found",
        )
    entry, category_name, payment_method_name, currency = row
    payload = LedgerEntryResponse(
        id=entry.id,
        date=entry.date,
        description=entry.description,
        categoryId=entry.category_id,
        categoryName=category_name,
        paymentMethodId=entry.payment_method_id,
        paymentMethodName=payment_method_name,
        currency=currency,
        amount=entry.amount,
        tags=entry.tags,
        created_at=entry.created_at,
        updated_at=entry.updated_at,
    ).model_dump(mode="json", by_alias=True)
    return {"data": payload}


@router.put(
    "/{id}",
    status_code=status.HTTP_200_OK,
    responses={
        200: {"description": "Ledger entry updated"},
        404: {
            "description": "Entry not found, deleted, or category/payment method invalid"
        },
        422: {"description": "Validation error"},
    },
)
async def put_ledger_entry(
    id: UUID,
    body: LedgerEntryCreate,
    session: AsyncSession = Depends(get_db),
) -> dict:
    """Update a ledger entry. Same body as POST. Returns 404 if not found or soft-deleted."""
    try:
        row = await update_ledger_entry(
            session,
            id,
            date_=body.date,
            description=body.description,
            category_id=body.categoryId,
            payment_method_id=body.paymentMethodId,
            amount=body.amount,
            tags=body.tags,
        )
    except LedgerEntryError as e:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=e.message,
        ) from e
    if row is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Ledger entry not found",
        )
    entry, category_name, payment_method_name, currency = row
    payload = LedgerEntryResponse(
        id=entry.id,
        date=entry.date,
        description=entry.description,
        categoryId=entry.category_id,
        categoryName=category_name,
        paymentMethodId=entry.payment_method_id,
        paymentMethodName=payment_method_name,
        currency=currency,
        amount=entry.amount,
        tags=entry.tags,
        created_at=entry.created_at,
        updated_at=entry.updated_at,
    ).model_dump(mode="json", by_alias=True)
    return {"data": payload}


@router.post(
    "",
    status_code=status.HTTP_201_CREATED,
    responses={
        201: {"description": "Ledger entry created"},
        404: {"description": "Category or payment method not found or inactive"},
        422: {"description": "Validation error"},
    },
)
async def post_ledger_entry(
    body: LedgerEntryCreate,
    session: AsyncSession = Depends(get_db),
) -> JSONResponse:
    """Create a ledger entry. Category and payment method must exist and be active."""
    try:
        entry, category_name, payment_method_name, currency = await create_ledger_entry(
            session,
            date_=body.date,
            description=body.description,
            category_id=body.categoryId,
            payment_method_id=body.paymentMethodId,
            amount=body.amount,
            tags=body.tags,
        )
    except LedgerEntryError as e:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=e.message,
        ) from e

    payload = LedgerEntryResponse(
        id=entry.id,
        date=entry.date,
        description=entry.description,
        categoryId=entry.category_id,
        categoryName=category_name,
        paymentMethodId=entry.payment_method_id,
        paymentMethodName=payment_method_name,
        currency=currency,
        amount=entry.amount,
        tags=entry.tags,
        created_at=entry.created_at,
        updated_at=entry.updated_at,
    ).model_dump(mode="json", by_alias=True)

    return JSONResponse(
        status_code=status.HTTP_201_CREATED,
        content={"data": payload},
        headers={"Location": f"/api/v1/ledger-entries/{entry.id}"},
    )
