import os
from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    PROJECT_NAME: str = "Cyanki API"
    DATABASE_URL: str = os.getenv("DATABASE_URL", "postgresql+asyncpg://cyanki:cyanki_pass@localhost:5432/cyanki_db")
    SECRET_KEY: str = os.getenv("SECRET_KEY", "supersecretkey-dev-only")
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 24 * 7  # 7 days

settings = Settings()
