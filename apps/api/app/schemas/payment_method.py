"""Payment method API schemas."""

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator


class PaymentMethodCreate(BaseModel):
    """Request body for creating a payment method."""

    name: str = Field(..., min_length=1, max_length=100)
    currency: str = Field(..., min_length=1, max_length=10)

    @field_validator("name", "currency", mode="before")
    @classmethod
    def strip_whitespace(cls, v: str) -> str:
        if isinstance(v, str):
            return v.strip()
        return v

    @field_validator("name", "currency", mode="after")
    @classmethod
    def reject_empty(cls, v: str) -> str:
        if not v:
            raise ValueError("must not be empty")
        return v


class PaymentMethodResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    name: str
    currency: str
    active: bool
    created_at: datetime = Field(serialization_alias="createdAt")
