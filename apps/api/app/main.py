"""FastAPI application entrypoint."""

from contextlib import asynccontextmanager

from fastapi import Depends, FastAPI
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.deps import get_db


@asynccontextmanager
async def lifespan(app: FastAPI):
    yield


app = FastAPI(title="Expense Manager API", version="0.1.0", lifespan=lifespan)


@app.get("/health", include_in_schema=False)
async def health(session: AsyncSession = Depends(get_db)):
    """Health check; verifies app and DB connectivity."""
    await session.execute(text("SELECT 1"))
    return {"status": "ok"}
