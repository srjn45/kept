"""Categories API: GET list, GET one, POST (PUT, DELETE in later steps)."""

import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import JSONResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.deps import get_db
from app.schemas.category import CategoryCreate, CategoryResponse
from app.services.category import create_category, get_category, list_categories

router = APIRouter(prefix="/categories", tags=["categories"])


@router.post(
    "",
    status_code=status.HTTP_201_CREATED,
    response_model=dict,
    responses={
        201: {"description": "Category created"},
        422: {"description": "Validation error"},
    },
)
async def post_category(
    body: CategoryCreate,
    session: AsyncSession = Depends(get_db),
) -> JSONResponse:
    """Create a category."""
    row = await create_category(
        session,
        name=body.name,
        color=body.color,
    )
    payload = CategoryResponse.model_validate(row).model_dump(
        mode="json", by_alias=True
    )
    return JSONResponse(
        status_code=status.HTTP_201_CREATED,
        content={"data": payload},
        headers={"Location": f"/api/v1/categories/{row.id}"},
    )


@router.get(
    "/{id}",
    response_model=dict,
    responses={
        200: {"description": "Category found"},
        404: {"description": "Category not found"},
        422: {"description": "Invalid UUID format"},
    },
)
async def get_category_by_id(
    id: uuid.UUID,
    session: AsyncSession = Depends(get_db),
) -> dict:
    """Get a single category by id (active or inactive)."""
    row = await get_category(session, id)
    if row is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Category not found"
        )
    payload = CategoryResponse.model_validate(row).model_dump(
        mode="json", by_alias=True
    )
    return {"data": payload}


@router.get(
    "",
    response_model=dict,
    responses={200: {"description": "List of active categories"}},
)
async def get_categories(
    session: AsyncSession = Depends(get_db),
) -> dict:
    """List active categories (for dropdowns)."""
    items = await list_categories(session, active_only=True)
    return {
        "data": [
            CategoryResponse.model_validate(c).model_dump(mode="json", by_alias=True)
            for c in items
        ]
    }
