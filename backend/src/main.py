from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from src.routers import sync
from src.database import engine, Base
import src.models as models # Ensuring models are loaded into Base

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Auto-create tables for local testing
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    yield

app = FastAPI(title="Cyanki API", version="0.1.0", lifespan=lifespan)


# Set up CORS for frontend communication
origins = [
    "http://localhost:5173",  # SvelteKit dev server
    "http://127.0.0.1:5173",
    "http://localhost:5174",
    "http://127.0.0.1:5174",
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(sync.router)
from src.routers import user, community
app.include_router(user.router)
app.include_router(community.router)

@app.get("/health")
async def health_check():
    """Health check endpoint for Docker compose and general monitoring"""
    return {"status": "ok"}

@app.get("/")
async def root():
    return {"message": "Welcome to Cyanki API"}
