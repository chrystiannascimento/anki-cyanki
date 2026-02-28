from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from src.database import get_db
from src.models import Flashcard, ReviewLog
from src.schemas import SyncPushRequest, SyncPushResponse

router = APIRouter(prefix="/api/sync", tags=["sync"])

@router.post("/push", response_model=SyncPushResponse)
async def push_sync(request: SyncPushRequest, db: AsyncSession = Depends(get_db)):
    # In a real app we'd also check user dependencies here via JWT token
    # For now we'll naively process
    
    processed = 0
    errors = []
    
    for op in request.operations:
        try:
            if op.entityType == "FLASHCARD":
                if op.action in ["CREATE", "UPDATE"]:
                    # Upsert logic pseudo-code 
                    card = await db.get(Flashcard, str(op.entityId))
                    if not card:
                        card = Flashcard(id=str(op.entityId), user_id=1) # Hardcoded user_id for now
                        db.add(card)
                    
                    card.front = op.payload.get("front", card.front)
                    card.back = op.payload.get("back", card.back)
                    
                    tags_payload = op.payload.get("tags")
                    if isinstance(tags_payload, list):
                        card.tags = ",".join(tags_payload)
                    elif isinstance(tags_payload, str):
                        card.tags = tags_payload
                        
                elif op.action == "DELETE":
                    card = await db.get(Flashcard, str(op.entityId))
                    if card:
                        await db.delete(card)
                        
            elif op.entityType == "REVIEW_LOG":
                if op.action == "CREATE":
                    log = ReviewLog(
                        flashcard_id=str(op.entityId),
                        grade=op.payload.get("grade"),
                        state=op.payload.get("state"),
                        user_id=1 # Hardcoded for now
                    )
                    db.add(log)
                    
            processed += 1
        except Exception as e:
            errors.append({"operation_id": op.id, "error": str(e)})

    await db.commit()
    
    return SyncPushResponse(status="success", processed_count=processed, errors=errors)
