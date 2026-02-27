from pydantic import BaseModel
from typing import List, Optional, Any, Dict

class SyncOperation(BaseModel):
    id: Optional[int] = None
    action: str  # 'CREATE', 'UPDATE', 'DELETE', 'REVIEW'
    entityType: str  # 'FLASHCARD', 'REVIEW_LOG'
    entityId: str | int
    payload: Dict[str, Any]
    createdAt: int

class SyncPushRequest(BaseModel):
    operations: List[SyncOperation]

class SyncPushResponse(BaseModel):
    status: str
    processed_count: int
    errors: List[dict] = []
