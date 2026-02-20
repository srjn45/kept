"""Payment methods API: GET list, GET one, POST, PUT, DELETE."""

from fastapi import APIRouter, Depends, status
from fastapi.responses import JSONResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.deps import get_db
from app.schemas.payment_method import PaymentMethodCreate, PaymentMethodResponse
from app.services.payment_method import create_payment_method, list_payment_methods

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
