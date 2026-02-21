"""Ledger entry API schemas."""

from datetime import date, datetime
from decimal import Decimal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator


class LedgerEntryCreate(BaseModel):
    """Request body for creating a ledger entry."""

    date: date
    description: str = Field(..., min_length=1, max_length=500)
    categoryId: UUID = Field(..., alias="categoryId")
    paymentMethodId: UUID = Field(..., alias="paymentMethodId")
    amount: Decimal
    tags: list[str] | None = None

    model_config = ConfigDict(populate_by_name=True)

    @field_validator("description", mode="before")
    @classmethod
    def strip_description(cls, v: str) -> str:
        if isinstance(v, str):
            return v.strip()
        return v

    @field_validator("description", mode="after")
    @classmethod
    def reject_empty_description(cls, v: str) -> str:
        if not v:
            raise ValueError("must not be empty")
        return v

    @field_validator("tags", mode="before")
    @classmethod
    def dedupe_and_trim_tags(cls, v: list[str] | None) -> list[str] | None:
        if v is None:
            return None
        seen: set[str] = set()
        out: list[str] = []
        for t in v:
            if isinstance(t, str):
                t = t.strip()
            if t and t not in seen:
                seen.add(t)
                out.append(t)
        return out if out else None

    @field_validator("tags", mode="after")
    @classmethod
    def validate_tag_elements(cls, v: list[str] | None) -> list[str] | None:
        if v is None:
            return None
        for i, t in enumerate(v):
            if not t:
                raise ValueError("each tag must be non-empty after trim")
            if len(t) > 50:
                raise ValueError("each tag must be at most 50 characters")
        return v


class LedgerEntryResponse(BaseModel):
    """Response shape for a single ledger entry (with resolved names and currency)."""

    model_config = ConfigDict()

    id: UUID
    date: date
    description: str
    categoryId: UUID = Field(serialization_alias="categoryId")
    categoryName: str = Field(serialization_alias="categoryName")
    paymentMethodId: UUID = Field(serialization_alias="paymentMethodId")
    paymentMethodName: str = Field(serialization_alias="paymentMethodName")
    currency: str
    amount: Decimal
    tags: list[str]
    created_at: datetime = Field(serialization_alias="createdAt")
    updated_at: datetime = Field(serialization_alias="updatedAt")
