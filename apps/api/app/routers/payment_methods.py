"""Payment methods API: GET list, GET one, POST, PUT, DELETE."""

import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import JSONResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.deps import get_db
from app.schemas.payment_method import PaymentMethodCreate, PaymentMethodResponse
from app.services.payment_method import create_payment_method, get_payment_method, list_payment_methods, soft_delete_payment_method, update_payment_method

router = APIRouter(prefix="/payment-methods", tags=["payment-methods"])


@router.get(
    "",
    response_model=dict,
    responses={200: {"description": "List of active payment methods"}},
)
async def get_payment_methods(
    session: AsyncSession = Depends(get_db),
) -> dict:
    """List active payment methods (for dropdowns)."""
    items = await list_payment_methods(session, active_only=True)
    return {
        "data": [
            PaymentMethodResponse.model_validate(m).model_dump(mode="json", by_alias=True)
            for m in items
        ]
    }


@router.get(
    "/{id}",
    response_model=dict,
    responses={
        200: {"description": "Payment method found"},
        404: {"description": "Payment method not found"},
        422: {"description": "Invalid UUID format"},
    },
)
async def get_payment_method_by_id(
    id: uuid.UUID,
    session: AsyncSession = Depends(get_db),
) -> dict:
    """Get a single payment method by id (active or inactive)."""
    row = await get_payment_method(session, id)
    if row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Payment method not found")
    payload = PaymentMethodResponse.model_validate(row).model_dump(mode="json", by_alias=True)
    return {"data": payload}


@router.post(
    "",
    status_code=status.HTTP_201_CREATED,
    response_model=dict,
    responses={
        201: {"description": "Payment method created"},
        422: {"description": "Validation error"},
    },
)
async def post_payment_method(
    body: PaymentMethodCreate,
    session: AsyncSession = Depends(get_db),
):
    """Create a payment method."""
    row = await create_payment_method(
        session,
        name=body.name,
        currency=body.currency,
    )
    payload = PaymentMethodResponse.model_validate(row).model_dump(mode="json", by_alias=True)
    return JSONResponse(
        status_code=status.HTTP_201_CREATED,
        content={"data": payload},
        headers={"Location": f"/api/v1/payment-methods/{row.id}"},
    )


@router.put(
    "/{id}",
    response_model=dict,
    responses={
        200: {"description": "Payment method updated"},
        404: {"description": "Payment method not found"},
        422: {"description": "Validation error"},
    },
)
async def put_payment_method(
    id: uuid.UUID,
    body: PaymentMethodCreate,
    session: AsyncSession = Depends(get_db),
) -> dict:
    """Update a payment method by id."""
    row = await update_payment_method(
        session,
        id,
        name=body.name,
        currency=body.currency,
    )
    if row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Payment method not found")
    payload = PaymentMethodResponse.model_validate(row).model_dump(mode="json", by_alias=True)
    return {"data": payload}


@router.delete(
    "/{id}",
    response_model=dict,
    responses={
        200: {"description": "Payment method soft-deleted"},
        404: {"description": "Payment method not found"},
        422: {"description": "Invalid UUID format"},
    },
)
async def delete_payment_method(
    id: uuid.UUID,
    session: AsyncSession = Depends(get_db),
) -> dict:
    """Soft delete a payment method by id (set active=False)."""
    row = await soft_delete_payment_method(session, id)
    if row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Payment method not found")
    payload = PaymentMethodResponse.model_validate(row).model_dump(mode="json", by_alias=True)
    return {"data": payload}
