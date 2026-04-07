import os
from pydantic_settings import BaseSettings
from typing import Optional

class Settings(BaseSettings):
    PROJECT_NAME: str = "Cyanki API"
    DATABASE_URL: str = os.getenv("DATABASE_URL", "sqlite+aiosqlite:///./cyanki.db")
    SECRET_KEY: str = os.getenv("SECRET_KEY", "supersecretkey-dev-only")
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 24 * 7  # 7 days

    # Email (password recovery)
    MAIL_SERVER: str = os.getenv("SERVER_MAIL_SERVER", "")
    MAIL_PORT: int = int(os.getenv("SERVER_MAIL_PORT", "465"))
    MAIL_USER: str = os.getenv("SERVER_MAIL_USER", "")
    MAIL_PASSWORD: str = os.getenv("SERVER_MAIL_PASSWORD", "")
    MAIL_SENDER: str = os.getenv("SERVER_MAIL_SENDER", "")
    MAIL_USE_SSL: bool = os.getenv("SERVER_HTTPS", "false").lower() == "true"

    FRONTEND_URL: str = os.getenv("FRONTEND_URL", "http://localhost:5174")

settings = Settings()
