from pydantic import BaseModel, EmailStr
from typing import List, Optional, Any, Dict

class UserCreate(BaseModel):
    email: EmailStr
    password: str

class UserResponse(BaseModel):
    id: int
    email: str

    class Config:
        from_attributes = True

class Token(BaseModel):
    access_token: str
    token_type: str

class TokenData(BaseModel):
    email: Optional[str] = None

class SyncOperation(BaseModel):
    id: Optional[int] = None
    action: str  # 'CREATE', 'UPDATE', 'DELETE', 'REVIEW'
    entityType: str  # 'FLASHCARD', 'REVIEW_LOG', 'NOTEBOOK'
    entityId: str | int
    payload: Dict[str, Any]
    createdAt: int

class SyncPushRequest(BaseModel):
    operations: List[SyncOperation]

class SyncPushResponse(BaseModel):
    status: str
    processed_count: int
    errors: List[dict] = []

