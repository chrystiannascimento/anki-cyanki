import uuid
import logging
from datetime import datetime, timedelta

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select

from src import models, schemas, auth
from src.config import settings
from src.database import get_db
from src.email_service import send_password_reset_email

logger = logging.getLogger(__name__)

router = APIRouter(
    prefix="/api/auth",
    tags=["Authentication"],
)


@router.post("/register", response_model=schemas.UserResponse, status_code=status.HTTP_201_CREATED)
async def register(user: schemas.UserCreate, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(models.User).filter(models.User.email == user.email))
    db_user = result.scalars().first()
    if db_user:
        raise HTTPException(status_code=400, detail="Email already registered")

    hashed_password = auth.get_password_hash(user.password)
    new_user = models.User(email=user.email, hashed_password=hashed_password)
    db.add(new_user)
    await db.commit()
    await db.refresh(new_user)
    return new_user


@router.post("/login", response_model=schemas.Token)
async def login(form_data: OAuth2PasswordRequestForm = Depends(), db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(models.User).filter(models.User.email == form_data.username))
    user = result.scalars().first()

    if not user or not auth.verify_password(form_data.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password",
            headers={"WWW-Authenticate": "Bearer"},
        )

    access_token_expires = timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    access_token = auth.create_access_token(
        data={"sub": user.email}, expires_delta=access_token_expires
    )
    return {"access_token": access_token, "token_type": "bearer"}


@router.post("/forgot-password", status_code=status.HTTP_200_OK)
async def forgot_password(
    body: schemas.ForgotPasswordRequest,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
):
    """Request a password reset link. Always returns 200 to avoid user enumeration."""
    result = await db.execute(select(models.User).filter(models.User.email == body.email))
    user = result.scalars().first()

    if user:
        # Invalidate any existing unused tokens for this user
        existing = await db.execute(
            select(models.PasswordResetToken).filter(
                models.PasswordResetToken.user_id == user.id,
                models.PasswordResetToken.used == False,
            )
        )
        for old_token in existing.scalars().all():
            old_token.used = True

        token = str(uuid.uuid4())
        reset_token = models.PasswordResetToken(
            token=token,
            user_id=user.id,
            expires_at=datetime.utcnow() + timedelta(minutes=30),
        )
        db.add(reset_token)
        await db.commit()

        reset_url = f"{settings.FRONTEND_URL}/reset-password?token={token}"
        background_tasks.add_task(_send_reset_email, user.email, reset_url)

    return {"message": "Se o e-mail existir, você receberá o link em breve."}


def _send_reset_email(to_email: str, reset_url: str) -> None:
    try:
        send_password_reset_email(to_email, reset_url)
    except Exception as e:
        logger.error(f"Failed to send password reset email to {to_email}: {e}")


@router.post("/reset-password", status_code=status.HTTP_200_OK)
async def reset_password(body: schemas.ResetPasswordRequest, db: AsyncSession = Depends(get_db)):
    """Validate token and update password."""
    result = await db.execute(
        select(models.PasswordResetToken).filter(models.PasswordResetToken.token == body.token)
    )
    reset_token = result.scalars().first()

    if not reset_token or reset_token.used or reset_token.expires_at < datetime.utcnow():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Link de recuperação inválido ou expirado.",
        )

    if len(body.new_password) < 8:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="A senha precisa ter pelo menos 8 caracteres.",
        )

    user_result = await db.execute(select(models.User).filter(models.User.id == reset_token.user_id))
    user = user_result.scalars().first()
    if not user:
        raise HTTPException(status_code=404, detail="Usuário não encontrado.")

    user.hashed_password = auth.get_password_hash(body.new_password)
    reset_token.used = True
    await db.commit()

    return {"message": "Senha redefinida com sucesso."}
