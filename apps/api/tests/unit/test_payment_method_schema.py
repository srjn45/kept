"""Unit tests for PaymentMethodCreate schema (validator)."""

import pytest
from pydantic import ValidationError

from app.schemas.payment_method import PaymentMethodCreate


def test_payment_method_create_valid():
    """Valid name and currency pass."""
    obj = PaymentMethodCreate(name="Card", currency="INR")
    assert obj.name == "Card"
    assert obj.currency == "INR"


def test_payment_method_create_strips_whitespace():
    """Leading/trailing whitespace is stripped."""
    obj = PaymentMethodCreate(name="  Cash  ", currency=" USD ")
    assert obj.name == "Cash"
    assert obj.currency == "USD"


def test_payment_method_create_reject_missing_name():
    """Missing name raises ValidationError."""
    with pytest.raises(ValidationError) as exc_info:
        PaymentMethodCreate(currency="INR")
    assert "name" in str(exc_info.value).lower() or any(
        e["loc"] == ("name",) for e in exc_info.value.errors()
    )


def test_payment_method_create_reject_missing_currency():
    """Missing currency raises ValidationError."""
    with pytest.raises(ValidationError) as exc_info:
        PaymentMethodCreate(name="Card")
    assert "currency" in str(exc_info.value).lower() or any(
        e["loc"] == ("currency",) for e in exc_info.value.errors()
    )


def test_payment_method_create_reject_empty_name():
    """Empty name after strip raises ValidationError."""
    with pytest.raises(ValidationError):
        PaymentMethodCreate(name="   ", currency="INR")


def test_payment_method_create_reject_empty_currency():
    """Empty currency after strip raises ValidationError."""
    with pytest.raises(ValidationError):
        PaymentMethodCreate(name="Card", currency="")


def test_payment_method_create_reject_name_too_long():
    """Name longer than 100 chars raises ValidationError."""
    with pytest.raises(ValidationError):
        PaymentMethodCreate(name="x" * 101, currency="INR")


def test_payment_method_create_reject_currency_too_long():
    """Currency longer than 10 chars raises ValidationError."""
    with pytest.raises(ValidationError):
        PaymentMethodCreate(name="Card", currency="x" * 11)


def test_payment_method_create_reject_invalid_type_name():
    """Name as number raises ValidationError."""
    with pytest.raises(ValidationError):
        PaymentMethodCreate(name=123, currency="INR")  # type: ignore[arg-type]


def test_payment_method_create_reject_invalid_type_currency():
    """Currency as number raises ValidationError."""
    with pytest.raises(ValidationError):
        PaymentMethodCreate(name="Card", currency=456)  # type: ignore[arg-type]
