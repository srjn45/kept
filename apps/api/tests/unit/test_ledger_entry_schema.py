"""Unit tests for LedgerEntryCreate schema (validator)."""

from datetime import date
from decimal import Decimal
from uuid import uuid4

import pytest
from pydantic import ValidationError

from app.schemas.ledger_entry import LedgerEntryCreate


def _valid_payload():
    return {
        "date": "2025-01-15",
        "description": "Lunch",
        "categoryId": str(uuid4()),
        "paymentMethodId": str(uuid4()),
        "amount": "10.50",
    }


def test_ledger_entry_create_valid():
    """Valid payload passes."""
    obj = LedgerEntryCreate(**_valid_payload())
    assert obj.date == date(2025, 1, 15)
    assert obj.description == "Lunch"
    assert obj.amount == Decimal("10.50")
    assert obj.tags is None


def test_ledger_entry_create_valid_with_tags():
    """Valid payload with tags passes; deduped and trimmed."""
    payload = _valid_payload()
    payload["tags"] = ["food", "  lunch  ", "food"]
    obj = LedgerEntryCreate(**payload)
    assert obj.tags == ["food", "lunch"]


def test_ledger_entry_create_strips_description():
    """Description is stripped."""
    payload = _valid_payload()
    payload["description"] = "  Lunch  "
    obj = LedgerEntryCreate(**payload)
    assert obj.description == "Lunch"


def test_ledger_entry_create_reject_missing_date():
    """Missing date raises ValidationError."""
    payload = _valid_payload()
    del payload["date"]
    with pytest.raises(ValidationError):
        LedgerEntryCreate(**payload)


def test_ledger_entry_create_reject_missing_description():
    """Missing description raises ValidationError."""
    payload = _valid_payload()
    del payload["description"]
    with pytest.raises(ValidationError):
        LedgerEntryCreate(**payload)


def test_ledger_entry_create_reject_empty_description():
    """Empty description after strip raises ValidationError."""
    payload = _valid_payload()
    payload["description"] = "   "
    with pytest.raises(ValidationError):
        LedgerEntryCreate(**payload)


def test_ledger_entry_create_reject_description_too_long():
    """Description longer than 500 raises ValidationError."""
    payload = _valid_payload()
    payload["description"] = "x" * 501
    with pytest.raises(ValidationError):
        LedgerEntryCreate(**payload)


def test_ledger_entry_create_reject_invalid_date_format():
    """Invalid date format raises ValidationError."""
    payload = _valid_payload()
    payload["date"] = "not-a-date"
    with pytest.raises(ValidationError):
        LedgerEntryCreate(**payload)


def test_ledger_entry_create_accepts_negative_amount():
    """Negative amount (refund) is accepted."""
    payload = _valid_payload()
    payload["amount"] = "-5.00"
    obj = LedgerEntryCreate(**payload)
    assert obj.amount == Decimal("-5.00")


def test_ledger_entry_create_reject_tag_too_long():
    """Tag longer than 50 chars raises ValidationError."""
    payload = _valid_payload()
    payload["tags"] = ["a" * 51]
    with pytest.raises(ValidationError):
        LedgerEntryCreate(**payload)


def test_ledger_entry_create_strips_whitespace_only_tag_elements():
    """Whitespace-only tag elements are removed by dedupe/trim; result is valid."""
    payload = _valid_payload()
    payload["tags"] = ["ok", "  ", "\t"]
    model = LedgerEntryCreate(**payload)
    assert model.tags == ["ok"]
