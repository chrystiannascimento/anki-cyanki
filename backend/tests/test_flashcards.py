import pytest
from httpx import AsyncClient

@pytest.mark.asyncio
async def test_push_flashcard_sync(client: AsyncClient):
    # Register and login to get token (even if sync is naive right now, good practice)
    await client.post(
        "/api/auth/register",
        json={"email": "sync@example.com", "password": "syncpassword", "name": "Sync User"}
    )
    
    # Sync push a new flashcard
    sync_payload = {
        "operations": [
            {
                "id": 1,
                "action": "CREATE",
                "entityType": "FLASHCARD",
                "entityId": "card-123",
                "payload": {
                    "front": "What is Svelte?",
                    "back": "A web framework",
                    "tags": ["frontend", "javascript"]
                },
                "createdAt": 1700000000
            }
        ]
    }
    
    response = await client.post(
        "/api/sync/push",
        json=sync_payload
    )
    
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "success"
    assert data["processed_count"] == 1
    assert len(data["errors"]) == 0

@pytest.mark.asyncio
async def test_update_flashcard_sync(client: AsyncClient):
    await client.post(
        "/api/auth/register",
        json={"email": "sync2@example.com", "password": "syncpassword", "name": "Sync User"}
    )
    
    # Create
    await client.post(
        "/api/sync/push",
        json={
            "operations": [{
                "id": 1, "action": "CREATE", "entityType": "FLASHCARD", "entityId": "card-456",
                "payload": {"front": "Old front", "back": "Old back", "tags": []},
                "createdAt": 1700000000
            }]
        }
    )
    
    # Update
    response = await client.post(
        "/api/sync/push",
        json={
            "operations": [{
                "id": 2, "action": "UPDATE", "entityType": "FLASHCARD", "entityId": "card-456",
                "payload": {"front": "New front", "back": "New back", "tags": ["updated"]},
                "createdAt": 1700000050
            }]
        }
    )
    
    assert response.status_code == 200
    assert response.json()["processed_count"] == 1
