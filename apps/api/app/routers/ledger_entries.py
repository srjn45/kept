"""Ledger entries API: POST (list, get, put, delete in later steps)."""

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import JSONResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.deps import get_db
from app.schemas.ledger_entry import LedgerEntryCreate, LedgerEntryResponse
from app.services.ledger_entry import LedgerEntryError, create_ledger_entry

router = APIRouter(prefix="/ledger-entries", tags=["ledger-entries"])


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
