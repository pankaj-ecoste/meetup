from fastapi import APIRouter, HTTPException, Header, Query
from services.supabase import get_client
from routers.auth import _get_user_id_from_token
from models.schemas import MeetingBatchCreate, MeetingResponse

router = APIRouter(prefix="/meetings", tags=["meetings"])


def _get_user_row(auth_uid: str) -> dict:
    client = get_client()
    r = client.table("users").select("id, company_id").eq("auth_id", auth_uid).single().execute()
    if not r.data:
        raise HTTPException(status_code=404, detail="User not found")
    return r.data


@router.get("", response_model=list[MeetingResponse])
def list_meetings(
    authorization: str = Header(...),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
):
    token = authorization.removeprefix("Bearer ").strip()
    auth_uid = _get_user_id_from_token(token)
    user = _get_user_row(auth_uid)

    client = get_client()
    offset = (page - 1) * page_size
    rows = (
        client.table("meetings")
        .select("*")
        .eq("recorded_by", user["id"])
        .order("created_at", desc=True)
        .range(offset, offset + page_size - 1)
        .execute()
        .data or []
    )

    results = []
    for row in rows:
        task_count = (
            client.table("tasks")
            .select("id", count="exact")
            .eq("meeting_id", row["id"])
            .execute()
            .count or 0
        )
        results.append(MeetingResponse(**row, task_count=task_count))
    return results


@router.get("/{meeting_id}")
def get_meeting(meeting_id: str, authorization: str = Header(...)):
    token = authorization.removeprefix("Bearer ").strip()
    auth_uid = _get_user_id_from_token(token)
    user = _get_user_row(auth_uid)

    client = get_client()
    meeting = (
        client.table("meetings")
        .select("*")
        .eq("id", meeting_id)
        .eq("recorded_by", user["id"])
        .single()
        .execute()
    )
    if not meeting.data:
        raise HTTPException(status_code=404, detail="Meeting not found")

    tasks = (
        client.table("tasks")
        .select("*, assignees:users!assignee_id(name), report_tos:users!report_to_id(name)")
        .eq("meeting_id", meeting_id)
        .execute()
        .data or []
    )
    return {**meeting.data, "tasks": tasks}


@router.post("/batch", status_code=201)
def create_meeting_batch(body: MeetingBatchCreate, authorization: str = Header(...)):
    """Save a meeting record + all its tasks in one call."""
    token = authorization.removeprefix("Bearer ").strip()
    auth_uid = _get_user_id_from_token(token)
    user = _get_user_row(auth_uid)

    client = get_client()
    meeting_row = (
        client.table("meetings")
        .insert({
            "recorded_by": user["id"],
            "company_id": user["company_id"],
            "transcript": body.transcript,
            "audio_url": body.audio_url,
            "mom_summary": body.mom_summary,
        })
        .execute()
    )
    meeting = meeting_row.data[0]

    task_rows = [
        {
            "source": "meeting",
            "meeting_id": meeting["id"],
            "assignor_id": user["id"],
            "assignee_id": str(t.assignee_id),
            "description": t.description,
            "deadline": t.deadline.isoformat(),
            "original_deadline": t.original_deadline.isoformat(),
            "report_to_id": str(t.report_to_id),
            "status": "open",
        }
        for t in body.tasks
    ]
    tasks = client.table("tasks").insert(task_rows).execute().data or []

    return {"meeting": meeting, "tasks": tasks}
