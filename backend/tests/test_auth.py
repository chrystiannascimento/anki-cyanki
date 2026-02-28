import pytest
from httpx import AsyncClient

@pytest.mark.asyncio
async def test_register_user(client: AsyncClient):
    response = await client.post(
        "/api/auth/register",
        json={"email": "test@example.com", "password": "testpassword", "name": "Test User"}
    )
    assert response.status_code == 201
    data = response.json()
    assert data["email"] == "test@example.com"
    assert "id" in data

@pytest.mark.asyncio
async def test_register_existing_user(client: AsyncClient):
    # Register first time
    await client.post(
        "/api/auth/register",
        json={"email": "test@example.com", "password": "testpassword", "name": "Test User"}
    )
    # Register second time
    response = await client.post(
        "/api/auth/register",
        json={"email": "test@example.com", "password": "testpassword", "name": "Test User"}
    )
    assert response.status_code == 400
    assert "already registered" in response.json()["detail"]

@pytest.mark.asyncio
async def test_login_user(client: AsyncClient):
    # Register first
    await client.post(
        "/api/auth/register",
        json={"email": "test@example.com", "password": "testpassword", "name": "Test User"}
    )
    
    # Login
    response = await client.post(
        "/api/auth/login",
        data={"username": "test@example.com", "password": "testpassword"}
    )
    assert response.status_code == 200
    data = response.json()
    assert "access_token" in data
    assert data["token_type"] == "bearer"

@pytest.mark.asyncio
async def test_login_invalid_credentials(client: AsyncClient):
    # Register first
    await client.post(
        "/api/auth/register",
        json={"email": "test@example.com", "password": "testpassword", "name": "Test User"}
    )
    
    # Login with wrong password
    response = await client.post(
        "/api/auth/login",
        data={"username": "test@example.com", "password": "wrongpassword"}
    )
    assert response.status_code == 401
