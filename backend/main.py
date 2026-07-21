from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv
import os

load_dotenv()

from routers import auth, recordings, tasks, extensions, meetings, ideas, performance, users

app = FastAPI(title="MeetUp API", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[os.getenv("FRONTEND_URL", "http://localhost:3000")],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(recordings.router)
app.include_router(tasks.router)
app.include_router(extensions.router)
app.include_router(meetings.router)
app.include_router(ideas.router)
app.include_router(performance.router)
app.include_router(users.router)


@app.get("/health")
def health():
    return {"status": "ok"}
