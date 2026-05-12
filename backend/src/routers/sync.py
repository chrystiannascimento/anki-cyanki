from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from typing import Optional
import datetime
import json
from src.database import get_db
from src.models import Flashcard, ReviewLog, Notebook, User, SavedFilter
from src.schemas import SyncPushRequest, SyncPushResponse, SyncPullResponse, SyncPullRequest
from src.auth import get_current_user
from sqlalchemy.future import select

router = APIRouter(prefix="/api/sync", tags=["sync"])

@router.post("/push", response_model=SyncPushResponse)
async def push_sync(request: SyncPushRequest, db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    processed = 0
    errors = []
    
    for op in request.operations:
        try:
            async with db.begin_nested():
                if op.entityType == "FLASHCARD":
                    if op.action in ["CREATE", "UPDATE"]:
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
                            card.is_deleted = True
                            card.updated_at = datetime.datetime.utcnow()

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
                        book.updated_at = datetime.datetime.utcnow()

                    elif op.action == "DELETE":
                        book = await db.get(Notebook, str(op.entityId))
                        if book and book.user_id == current_user.id:
                            book.is_deleted = True
                            book.updated_at = datetime.datetime.utcnow()

                elif op.entityType == "SAVED_FILTER":
                    if op.action in ["CREATE", "UPDATE"]:
                        sf = await db.get(SavedFilter, str(op.entityId))
                        if not sf:
                            sf = SavedFilter(id=str(op.entityId), user_id=current_user.id)
                            db.add(sf)
                        elif sf.user_id != current_user.id:
                            raise HTTPException(status_code=403, detail="Not authorized to modify this saved filter")

                        sf.name = op.payload.get("name", sf.name)
                        criteria_val = op.payload.get("criteria")
                        if criteria_val is not None:
                            sf.criteria = json.dumps(criteria_val) if isinstance(criteria_val, dict) else criteria_val
                        sf.updated_at = datetime.datetime.utcnow()

                    elif op.action == "DELETE":
                        sf = await db.get(SavedFilter, str(op.entityId))
                        if sf and sf.user_id == current_user.id:
                            sf.is_deleted = True
                            sf.updated_at = datetime.datetime.utcnow()

                elif op.entityType == "REVIEW_LOG":
                    if op.action == "CREATE":
                        f_id = str(op.payload.get("flashcardId"))

                        # Skip if the referenced flashcard doesn't exist (orphan log)
                        flashcard = await db.get(Flashcard, f_id)
                        if not flashcard:
                            errors.append({"operation_id": op.id, "error": f"flashcard {f_id} not found, skipping review_log"})
                            processed += 1
                            continue

                        reviewed_at_ms = op.payload.get("reviewedAt")
                        r_time = datetime.datetime.utcnow()
                        if reviewed_at_ms:
                            r_time = datetime.datetime.utcfromtimestamp(reviewed_at_ms / 1000.0)

                        log = ReviewLog(
                            flashcard_id=f_id,
                            grade=op.payload.get("grade"),
                            state=op.payload.get("state"),
                            user_id=current_user.id,
                            reviewed_at=r_time
                        )
                        db.add(log)

            processed += 1
        except Exception as e:
            errors.append({"operation_id": op.id, "error": str(e)})

    await db.commit()
    
    return SyncPushResponse(status="success", processed_count=processed, errors=errors)

@router.post("/pull", response_model=SyncPullResponse)
async def pull_sync(request: Optional[SyncPullRequest] = None, db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    # Fetch Notebooks
    books_res = await db.execute(select(Notebook).filter(Notebook.user_id == current_user.id))
    books = books_res.scalars().all()

    # Fetch Flashcards
    cards_res = await db.execute(select(Flashcard).filter(Flashcard.user_id == current_user.id))
    cards = cards_res.scalars().all()

    # Fetch Review Logs
    logs_res = await db.execute(select(ReviewLog).filter(ReviewLog.user_id == current_user.id))
    logs = logs_res.scalars().all()

    # Fetch Saved Filters
    filters_res = await db.execute(select(SavedFilter).filter(SavedFilter.user_id == current_user.id))
    filters = filters_res.scalars().all()
    
    def dt_to_ms(dt):
        if not dt:
            return int(datetime.datetime.now(datetime.timezone.utc).timestamp() * 1000)
        return int(dt.replace(tzinfo=datetime.timezone.utc).timestamp() * 1000)

    # Merge incoming gamification state with stored state (max-wins per field)
    merged_gamification = None
    if request and request.gamificationState:
        client = request.gamificationState
        stored = {}
        if current_user.gamification_data:
            try:
                stored = json.loads(current_user.gamification_data)
            except Exception:
                stored = {}

        client_total_xp = (client.level - 1) * 100 + client.xp
        stored_total_xp = (stored.get("level", 1) - 1) * 100 + stored.get("xp", 0)
        winner_total_xp = max(client_total_xp, stored_total_xp)
        winner_streak = max(client.streak, stored.get("streak", 0))
        winner_coins = max(client.coins, stored.get("coins", 0))

        # Keep the more recent lastStudyDate
        client_date = client.lastStudyDate
        stored_date = stored.get("lastStudyDate")
        if client_date and stored_date:
            winner_date = client_date if client_date > stored_date else stored_date
        else:
            winner_date = client_date or stored_date

        merged_gamification = {
            "xp": winner_total_xp % 100,
            "level": (winner_total_xp // 100) + 1,
            "streak": winner_streak,
            "coins": winner_coins,
            "lastStudyDate": winner_date
        }
        current_user.gamification_data = json.dumps(merged_gamification)
        await db.commit()

    return {
        "notebooks": [
            {
                "id": b.id,
                "title": b.title,
                "content": b.content,
                "isPublic": bool(b.is_public),
                "isDeleted": bool(b.is_deleted),
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
                "isDeleted": bool(c.is_deleted),
                "createdAt": dt_to_ms(c.created_at),
                "updatedAt": dt_to_ms(c.updated_at)
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
        ],
        "savedFilters": [
            {
                "id": f.id,
                "name": f.name,
                "criteria": json.loads(f.criteria) if f.criteria else {},
                "isDeleted": bool(f.is_deleted),
                "createdAt": dt_to_ms(f.created_at),
                "updatedAt": dt_to_ms(f.updated_at)
            } for f in filters
        ],
        "gamificationState": merged_gamification
    }
