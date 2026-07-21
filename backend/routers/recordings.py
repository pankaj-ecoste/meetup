from fastapi import APIRouter, UploadFile, File, Form, HTTPException, Header, BackgroundTasks
from services.supabase import get_client
from services.assemblyai import transcribe
from services import extraction
from routers.auth import _get_user_id_from_token
from models.schemas import JobResponse
import uuid

router = APIRouter(prefix="/recordings", tags=["recordings"])

BUCKET = "audio"


def _get_user_row(auth_uid: str) -> dict:
    client = get_client()
    result = client.table("users").select("id").eq("auth_id", auth_uid).single().execute()
    if not result.data:
        raise HTTPException(status_code=404, detail="User not found")
    return result.data


def _run_pipeline(job_id: str, audio_url: str, job_type: str) -> None:
    client = get_client()

    def _update(status: str, **extra):
        client.table("recording_jobs").update({"status": status, **extra}).eq("id", job_id).execute()

    try:
        _update("transcribing")
        transcript = transcribe(audio_url)

        _update("extracting", transcript=transcript)

        if job_type == "task_delegation":
            result = extraction.extract_task(transcript)
        elif job_type == "meeting":
            result = extraction.extract_meeting(transcript)
        else:
            result = extraction.extract_idea(transcript)

        _update("done", result=result)

    except Exception as exc:
        _update("error", error_msg=str(exc))


@router.post("/upload", response_model=JobResponse)
async def upload_recording(
    background_tasks: BackgroundTasks,
    job_type: str = Form(...),
    file: UploadFile = File(...),
    authorization: str = Header(...),
):
    if job_type not in ("task_delegation", "meeting", "idea"):
        raise HTTPException(status_code=400, detail="Invalid job_type")

    token = authorization.removeprefix("Bearer ").strip()
    auth_uid = _get_user_id_from_token(token)
    user = _get_user_row(auth_uid)

    client = get_client()
    ext = file.filename.rsplit(".", 1)[-1] if file.filename and "." in file.filename else "webm"
    storage_path = f"{user['id']}/{uuid.uuid4()}.{ext}"

    audio_bytes = await file.read()
    client.storage.from_(BUCKET).upload(
        path=storage_path,
        file=audio_bytes,
        file_options={"content-type": file.content_type or "audio/webm"},
    )

    signed = client.storage.from_(BUCKET).create_signed_url(storage_path, expires_in=3600)
    audio_url = signed["signedURL"]

    job_row = (
        client.table("recording_jobs")
        .insert({
            "user_id": user["id"],
            "job_type": job_type,
            "audio_url": audio_url,
            "status": "pending",
        })
        .execute()
    )
    job = job_row.data[0]

    background_tasks.add_task(_run_pipeline, job["id"], audio_url, job_type)

    return JobResponse(
        id=job["id"],
        status=job["status"],
        transcript=None,
        result=None,
        error_msg=None,
        created_at=job["created_at"],
    )


@router.get("/jobs/{job_id}", response_model=JobResponse)
def get_job(job_id: str, authorization: str = Header(...)):
    token = authorization.removeprefix("Bearer ").strip()
    auth_uid = _get_user_id_from_token(token)
    user = _get_user_row(auth_uid)

    client = get_client()
    result = (
        client.table("recording_jobs")
        .select("*")
        .eq("id", job_id)
        .eq("user_id", user["id"])
        .single()
        .execute()
    )
    if not result.data:
        raise HTTPException(status_code=404, detail="Job not found")

    row = result.data
    return JobResponse(
        id=row["id"],
        status=row["status"],
        transcript=row.get("transcript"),
        result=row.get("result"),
        error_msg=row.get("error_msg"),
        created_at=row["created_at"],
    )
