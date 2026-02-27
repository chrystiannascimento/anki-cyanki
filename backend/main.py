from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI(title="Cyanki API", version="0.1.0")

# Set up CORS for frontend communication
origins = [
    "http://localhost:5173",  # SvelteKit dev server
    "http://127.0.0.1:5173",
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/health")
async def health_check():
    """Health check endpoint for Docker compose and general monitoring"""
    return {"status": "ok"}

@app.get("/")
async def root():
    return {"message": "Welcome to Cyanki API"}
