from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv
import os

load_dotenv()

from routers import auth, recordings, tasks, extensions, meetings, ideas, performance, users

app = FastAPI(title="MeetUp API", version="0.1.0")

# FRONTEND_URL may be a single origin or a comma-separated list
# (e.g. the Vercel production URL plus http://localhost:3000 for local dev).
_frontend_origins = [
    o.strip()
    for o in os.getenv("FRONTEND_URL", "http://localhost:3000").split(",")
    if o.strip()
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=_frontend_origins,
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
