"""Category API schemas."""

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class CategoryResponse(BaseModel):
    """Response shape for a single category."""

    model_config = ConfigDict(from_attributes=True)

    id: UUID
    name: str
    color: str | None
    active: bool
    created_at: datetime = Field(serialization_alias="createdAt")
