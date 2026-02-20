"""Categories API: GET list (GET one, POST, PUT, DELETE in later steps)."""

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.deps import get_db
from app.schemas.category import CategoryResponse
from app.services.category import list_categories

router = APIRouter(prefix="/categories", tags=["categories"])


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
