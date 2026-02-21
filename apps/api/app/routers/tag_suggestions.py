"""Tag suggestions API: GET list (autocomplete)."""

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.deps import get_db
from app.services.tag_suggestion import get_tag_suggestions

router = APIRouter(prefix="/tag-suggestions", tags=["tag-suggestions"])


@router.get(
    "",
    response_model=dict,
    responses={200: {"description": "List of tag suggestions"}},
)
async def list_tag_suggestions(
    session: AsyncSession = Depends(get_db),
    q: str | None = Query(
        None, description="Optional filter (case-insensitive substring)"
    ),
) -> dict:
    """Return up to 20 tag suggestions, optionally filtered by q. Ordered by last_used_at desc."""
    query = q.strip() if q else None
    suggestions = await get_tag_suggestions(session, q=query)
    return {"suggestions": suggestions}
