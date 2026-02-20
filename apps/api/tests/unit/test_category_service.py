"""Unit tests for category service: list_categories."""

import uuid

import pytest_asyncio
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Category
from app.services.category import (
    create_category,
    get_category,
    list_categories,
    soft_delete_category,
    update_category,
)


@pytest_asyncio.fixture
async def category_active(db_session: AsyncSession) -> Category:
    """One active category."""
    row = Category(
        id=uuid.uuid4(),
        name="Food",
        color="#ff0000",
        active=True,
    )
    db_session.add(row)
    await db_session.flush()
    return row


@pytest_asyncio.fixture
async def category_inactive(db_session: AsyncSession) -> Category:
    """One inactive category."""
    row = Category(
        id=uuid.uuid4(),
        name="OldCategory",
        color=None,
        active=False,
    )
    db_session.add(row)
    await db_session.flush()
    return row


async def test_list_categories_returns_only_active(
    db_session: AsyncSession,
    category_active: Category,
    category_inactive: Category,
):
    """list_categories(active_only=True) excludes inactive records."""
    result = await list_categories(db_session, active_only=True)
    ids = [r.id for r in result]
    assert category_active.id in ids
    assert category_inactive.id not in ids
    assert len(result) == 1


async def test_list_categories_empty_returns_empty_list(db_session: AsyncSession):
    """list_categories with no rows returns empty list."""
    result = await list_categories(db_session, active_only=True)
    assert result == []


async def test_list_categories_ordered_by_name(db_session: AsyncSession):
    """list_categories returns rows ordered by name ascending."""
    for name in ["Zebra", "Alpha", "Mono"]:
        db_session.add(
            Category(
                id=uuid.uuid4(),
                name=name,
                color=None,
                active=True,
            )
        )
    await db_session.flush()
    result = await list_categories(db_session, active_only=True)
    assert [r.name for r in result] == ["Alpha", "Mono", "Zebra"]


async def test_list_categories_active_only_false_includes_inactive(
    db_session: AsyncSession,
    category_active: Category,
    category_inactive: Category,
):
    """list_categories(active_only=False) includes inactive records."""
    result = await list_categories(db_session, active_only=False)
    ids = [r.id for r in result]
    assert category_active.id in ids
    assert category_inactive.id in ids
    assert len(result) == 2


async def test_create_category_returns_active_and_persists(db_session: AsyncSession):
    """create_category returns model with active=True and persists."""
    row = await create_category(db_session, name="Food", color="#00ff00")
    assert row.id is not None
    assert row.name == "Food"
    assert row.color == "#00ff00"
    assert row.active is True
    assert row.created_at is not None
    await db_session.flush()
    listed = await list_categories(db_session, active_only=True)
    assert any(r.id == row.id for r in listed)


async def test_create_category_without_color(db_session: AsyncSession):
    """create_category with color=None persists and lists."""
    row = await create_category(db_session, name="Misc")
    assert row.color is None
    listed = await list_categories(db_session, active_only=True)
    assert any(r.id == row.id for r in listed)


async def test_get_category_returns_none_when_not_found(db_session: AsyncSession):
    """get_category returns None when id does not exist."""
    result = await get_category(db_session, uuid.uuid4())
    assert result is None


async def test_get_category_returns_record_when_found(
    db_session: AsyncSession,
    category_active: Category,
):
    """get_category returns the record when found (active or inactive)."""
    result = await get_category(db_session, category_active.id)
    assert result is not None
    assert result.id == category_active.id
    assert result.name == category_active.name


async def test_get_category_returns_inactive_record(
    db_session: AsyncSession,
    category_inactive: Category,
):
    """get_category returns inactive record for historical display."""
    result = await get_category(db_session, category_inactive.id)
    assert result is not None
    assert result.id == category_inactive.id
    assert result.active is False


async def test_update_category_returns_none_when_not_found(db_session: AsyncSession):
    """update_category returns None when id does not exist."""
    result = await update_category(db_session, uuid.uuid4(), name="Food", color="#fff")
    assert result is None


async def test_update_category_updates_and_returns(
    db_session: AsyncSession,
    category_active: Category,
):
    """update_category updates name/color and returns the model."""
    result = await update_category(
        db_session,
        category_active.id,
        name="NewName",
        color="#000000",
    )
    assert result is not None
    assert result.id == category_active.id
    assert result.name == "NewName"
    assert result.color == "#000000"
    assert result.active is category_active.active
    fetched = await get_category(db_session, category_active.id)
    assert fetched is not None
    assert fetched.name == "NewName"
    assert fetched.color == "#000000"


async def test_update_category_strips_whitespace(
    db_session: AsyncSession,
    category_active: Category,
):
    """update_category strips leading/trailing whitespace from name and color."""
    result = await update_category(
        db_session,
        category_active.id,
        name="  Food  ",
        color=" #abc ",
    )
    assert result is not None
    assert result.name == "Food"
    assert result.color == "#abc"


async def test_soft_delete_category_returns_none_when_not_found(
    db_session: AsyncSession,
):
    """soft_delete_category returns None when id does not exist."""
    result = await soft_delete_category(db_session, uuid.uuid4())
    assert result is None


async def test_soft_delete_category_sets_active_false_and_returns(
    db_session: AsyncSession,
    category_active: Category,
):
    """soft_delete_category sets active=False and returns the model."""
    result = await soft_delete_category(db_session, category_active.id)
    assert result is not None
    assert result.id == category_active.id
    assert result.active is False
    fetched = await get_category(db_session, category_active.id)
    assert fetched is not None and fetched.active is False
    listed = await list_categories(db_session, active_only=True)
    assert category_active.id not in [r.id for r in listed]


async def test_soft_delete_category_idempotent_when_already_inactive(
    db_session: AsyncSession,
    category_inactive: Category,
):
    """soft_delete_category is idempotent when already inactive."""
    result = await soft_delete_category(db_session, category_inactive.id)
    assert result is not None
    assert result.id == category_inactive.id
    assert result.active is False
