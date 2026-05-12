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

class PullNotebook(BaseModel):
    id: str
    title: str
    content: str
    isPublic: bool
    isDeleted: bool = False
    createdAt: int
    updatedAt: int

class PullFlashcard(BaseModel):
    id: str
    front: str
    back: str
    tags: List[str]
    isDeleted: bool = False
    createdAt: int
    updatedAt: int

class PullReviewLog(BaseModel):
    id: int
    flashcardId: str
    grade: int
    state: int
    reviewedAt: int
    synced: bool

class PullSavedFilter(BaseModel):
    id: str
    name: str
    criteria: Dict[str, Any]
    isDeleted: bool = False
    createdAt: int
    updatedAt: int

class GamificationState(BaseModel):
    xp: int = 0
    level: int = 1
    streak: int = 0
    coins: int = 0
    lastStudyDate: Optional[str] = None

class SyncPullRequest(BaseModel):
    gamificationState: Optional[GamificationState] = None

class SyncPullResponse(BaseModel):
    notebooks: List[PullNotebook]
    flashcards: List[PullFlashcard]
    reviewLogs: List[PullReviewLog]
    savedFilters: List[PullSavedFilter] = []
    gamificationState: Optional[GamificationState] = None

class ForgotPasswordRequest(BaseModel):
    email: EmailStr

class ResetPasswordRequest(BaseModel):
    token: str
    new_password: str
