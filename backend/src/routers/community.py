from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy.orm import selectinload
from typing import List

from src.database import get_db
import src.models as models

router = APIRouter(prefix="/api/community", tags=["community"])

@router.get("/notebooks")
async def get_public_notebooks(db: AsyncSession = Depends(get_db)):
    # Fetch all public notebooks joined with the author's email
    query = select(models.Notebook).options(selectinload(models.Notebook.owner)).filter(models.Notebook.is_public == True).order_by(models.Notebook.created_at.desc())
    result = await db.execute(query)
    notebooks = result.scalars().all()
    
    # Map to simple response format for the frontend
    return [
        {
            "id": nb.id,
            "title": nb.title,
            "content": nb.content,
            "author": nb.owner.email.split('@')[0], # Safe privacy for displaying author names
            "created_at": nb.created_at
        }
        for nb in notebooks
    ]
