from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from src.database import get_db
from src.models import Flashcard, ReviewLog, Notebook, User
from src.schemas import SyncPushRequest, SyncPushResponse, SyncPullResponse
from src.auth import get_current_user
from sqlalchemy.future import select

router = APIRouter(prefix="/api/sync", tags=["sync"])

@router.post("/push", response_model=SyncPushResponse)
async def push_sync(request: SyncPushRequest, db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    processed = 0
    errors = []
    
    for op in request.operations:
        try:
            if op.entityType == "FLASHCARD":
                if op.action in ["CREATE", "UPDATE"]:
                    # Ensure the card either belongs to current_user or doesn't exist yet
                    card = await db.get(Flashcard, str(op.entityId))
                    if not card:
                        card = Flashcard(id=str(op.entityId), user_id=current_user.id)
                        db.add(card)
                    elif card.user_id != current_user.id:
                        raise HTTPException(status_code=403, detail="Not authorized to modify this flashcard")
                    
                    card.front = op.payload.get("front", card.front)
                    card.back = op.payload.get("back", card.back)
                    
                    tags_payload = op.payload.get("tags")
                    if isinstance(tags_payload, list):
                        card.tags = ",".join(tags_payload)
                    elif isinstance(tags_payload, str):
                        card.tags = tags_payload
                        
                elif op.action == "DELETE":
                    card = await db.get(Flashcard, str(op.entityId))
                    if card and card.user_id == current_user.id:
                        await db.delete(card)
                        
            elif op.entityType == "NOTEBOOK":
                if op.action in ["CREATE", "UPDATE"]:
                    book = await db.get(Notebook, str(op.entityId))
                    if not book:
                        book = Notebook(id=str(op.entityId), user_id=current_user.id)
                        db.add(book)
                    elif book.user_id != current_user.id:
                         raise HTTPException(status_code=403, detail="Not authorized to modify this notebook")
                         
                    book.title = op.payload.get("title", book.title)
                    book.content = op.payload.get("content", book.content)
                    if "isPublic" in op.payload:
                        book.is_public = op.payload.get("isPublic")
                        
                elif op.action == "DELETE":
                    book = await db.get(Notebook, str(op.entityId))
                    if book and book.user_id == current_user.id:
                        await db.delete(book)
                        
            elif op.entityType == "REVIEW_LOG":
                if op.action == "CREATE":
                    log = ReviewLog(
                        flashcard_id=str(op.entityId),
                        grade=op.payload.get("grade"),
                        state=op.payload.get("state"),
                        user_id=current_user.id
                    )
                    db.add(log)
                    
            processed += 1
        except Exception as e:
            errors.append({"operation_id": op.id, "error": str(e)})

    await db.commit()
    
    return SyncPushResponse(status="success", processed_count=processed, errors=errors)

@router.get("/pull", response_model=SyncPullResponse)
async def pull_sync(db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    # Fetch Notebooks
    books_res = await db.execute(select(Notebook).filter(Notebook.user_id == current_user.id))
    books = books_res.scalars().all()
    
    # Fetch Flashcards
    cards_res = await db.execute(select(Flashcard).filter(Flashcard.user_id == current_user.id))
    cards = cards_res.scalars().all()
    
    # Fetch Review Logs
    logs_res = await db.execute(select(ReviewLog).filter(ReviewLog.user_id == current_user.id))
    logs = logs_res.scalars().all()
    
    def dt_to_ms(dt):
        return int(dt.timestamp() * 1000) if dt else 0
        
    return {
        "notebooks": [
            {
                "id": b.id,
                "title": b.title,
                "content": b.content,
                "isPublic": bool(b.is_public),
                "createdAt": dt_to_ms(b.created_at),
                "updatedAt": dt_to_ms(b.updated_at)
            } for b in books
        ],
        "flashcards": [
            {
                "id": c.id,
                "front": c.front,
                "back": c.back,
                "tags": c.tags.split(",") if c.tags else [],
                "createdAt": dt_to_ms(c.created_at)
            } for c in cards
        ],
        "reviewLogs": [
            {
                "id": l.id,
                "flashcardId": l.flashcard_id,
                "grade": l.grade,
                "state": l.state,
                "reviewedAt": dt_to_ms(l.reviewed_at),
                "synced": True
            } for l in logs
        ]
    }
