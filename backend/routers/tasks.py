from fastapi import APIRouter, HTTPException, Header, Query
from services.supabase import get_client
from routers.auth import _get_user_id_from_token
from models.schemas import TaskCreate, TaskResponse, TaskComplete, DashboardCounts
from datetime import datetime, timezone

router = APIRouter(prefix="/tasks", tags=["tasks"])


def _get_user_row(auth_uid: str) -> dict:
    client = get_client()
    r = client.table("users").select("id").eq("auth_id", auth_uid).single().execute()
    if not r.data:
        raise HTTPException(status_code=404, detail="User not found")
    return r.data


def _enrich(rows: list[dict]) -> list[TaskResponse]:
    return [
        TaskResponse(
            **{k: v for k, v in row.items() if k not in ("assignees", "assignors", "report_tos", "companies")},
            assignee_name=row.get("assignees", {}).get("name") if row.get("assignees") else None,
            assignor_name=row.get("assignors", {}).get("name") if row.get("assignors") else None,
            report_to_name=row.get("report_tos", {}).get("name") if row.get("report_tos") else None,
            company_name=row.get("companies", {}).get("name") if row.get("companies") else None,
        )
        for row in rows
    ]


_TASK_SELECT = """
  *,
  assignees:users!assignee_id(name),
  assignors:users!assignor_id(name),
  report_tos:users!report_to_id(name)
"""


@router.get("/dashboard", response_model=DashboardCounts)
def dashboard(authorization: str = Header(...)):
    token = authorization.removeprefix("Bearer ").strip()
    auth_uid = _get_user_id_from_token(token)
    user = _get_user_row(auth_uid)
    uid = user["id"]
    client = get_client()

    def count(col: str, val: str, status: str) -> int:
        r = client.table("tasks").select("id", count="exact").eq(col, uid).eq("status", status).execute()
        return r.count or 0

    return DashboardCounts(
        given_open=count("assignor_id", uid, "open"),
        received_open=count("assignee_id", uid, "open"),
        completed=count("assignee_id", uid, "completed"),
        overdue=count("assignee_id", uid, "overdue"),
    )


@router.get("/received", response_model=list[TaskResponse])
def received(
    authorization: str = Header(...),
    search: str = Query(default=""),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
):
    token = authorization.removeprefix("Bearer ").strip()
    auth_uid = _get_user_id_from_token(token)
    user = _get_user_row(auth_uid)

    client = get_client()
    q = client.table("tasks").select(_TASK_SELECT).eq("assignee_id", user["id"])
    if search:
        q = q.ilike("description", f"%{search}%")
    offset = (page - 1) * page_size
    q = q.order("created_at", desc=True).range(offset, offset + page_size - 1)
    return _enrich(q.execute().data or [])


@router.get("/allocated", response_model=list[TaskResponse])
def allocated(
    authorization: str = Header(...),
    search: str = Query(default=""),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
):
    token = authorization.removeprefix("Bearer ").strip()
    auth_uid = _get_user_id_from_token(token)
    user = _get_user_row(auth_uid)

    client = get_client()
    q = client.table("tasks").select(_TASK_SELECT).eq("assignor_id", user["id"])
    if search:
        q = q.ilike("description", f"%{search}%")
    offset = (page - 1) * page_size
    q = q.order("created_at", desc=True).range(offset, offset + page_size - 1)
    return _enrich(q.execute().data or [])


@router.post("", response_model=TaskResponse, status_code=201)
def create_task(body: TaskCreate, authorization: str = Header(...)):
    token = authorization.removeprefix("Bearer ").strip()
    auth_uid = _get_user_id_from_token(token)
    user = _get_user_row(auth_uid)

    client = get_client()
    row = (
        client.table("tasks")
        .insert({
            "source": body.source,
            "meeting_id": str(body.meeting_id) if body.meeting_id else None,
            "assignor_id": user["id"],
            "assignee_id": str(body.assignee_id),
            "description": body.description,
            "deadline": body.deadline.isoformat(),
            "original_deadline": body.original_deadline.isoformat(),
            "report_to_id": str(body.report_to_id),
            "status": "open",
        })
        .execute()
    )
    created = row.data[0]
    enriched = (
        client.table("tasks").select(_TASK_SELECT).eq("id", created["id"]).single().execute()
    )
    return _enrich([enriched.data])[0]


@router.patch("/{task_id}/complete", response_model=TaskResponse)
def complete_task(task_id: str, body: TaskComplete, authorization: str = Header(...)):
    token = authorization.removeprefix("Bearer ").strip()
    auth_uid = _get_user_id_from_token(token)
    user = _get_user_row(auth_uid)

    client = get_client()
    existing = (
        client.table("tasks").select("*").eq("id", task_id).eq("assignee_id", user["id"]).single().execute()
    )
    if not existing.data:
        raise HTTPException(status_code=404, detail="Task not found or not your task")

    now = datetime.now(timezone.utc).isoformat()
    client.table("tasks").update({
        "status": "completed",
        "completed_at": now,
        "completion_note": body.completion_note,
    }).eq("id", task_id).execute()

    enriched = client.table("tasks").select(_TASK_SELECT).eq("id", task_id).single().execute()
    return _enrich([enriched.data])[0]
