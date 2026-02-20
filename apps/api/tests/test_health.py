"""Integration tests for GET /health."""

from httpx import AsyncClient


async def test_health_returns_200(client: AsyncClient):
    """GET /health returns 200 and status ok (verifies app and DB connectivity)."""
    response = await client.get("/health")
    assert response.status_code == 200
    data = response.json()
    assert data == {"status": "ok"}
