from fastapi import APIRouter, HTTPException, Header
from services.supabase import get_client
from routers.auth import _get_user_id_from_token
from models.schemas import ExtensionCreate, ExtensionDecide, ExtensionResponse
from datetime import datetime, timezone

router = APIRouter(prefix="/extensions", tags=["extensions"])


def _get_user_row(auth_uid: str) -> dict:
    client = get_client()
    r = client.table("users").select("id").eq("auth_id", auth_uid).single().execute()
    if not r.data:
        raise HTTPException(status_code=404, detail="User not found")
    return r.data


@router.post("", response_model=ExtensionResponse, status_code=201)
def request_extension(body: ExtensionCreate, authorization: str = Header(...)):
    token = authorization.removeprefix("Bearer ").strip()
    auth_uid = _get_user_id_from_token(token)
    user = _get_user_row(auth_uid)

    client = get_client()
    task = (
        client.table("tasks")
        .select("id, assignee_id, status")
        .eq("id", str(body.task_id))
        .single()
        .execute()
    )
    if not task.data:
        raise HTTPException(status_code=404, detail="Task not found")
    if task.data["assignee_id"] != user["id"]:
        raise HTTPException(status_code=403, detail="Only the assignee can request an extension")
    if task.data["status"] == "completed":
        raise HTTPException(status_code=400, detail="Cannot request extension on a completed task")

    existing = (
        client.table("task_extensions")
        .select("id")
        .eq("task_id", str(body.task_id))
        .eq("status", "requested")
        .execute()
    )
    if existing.data:
        raise HTTPException(status_code=400, detail="An extension request is already pending for this task")

    row = (
        client.table("task_extensions")
        .insert({
            "task_id": str(body.task_id),
            "requested_by": user["id"],
            "reason": body.reason,
            "proposed_deadline": body.proposed_deadline.isoformat(),
            "status": "requested",
        })
        .execute()
    )
    return ExtensionResponse(**row.data[0])


@router.patch("/{extension_id}/decide", response_model=ExtensionResponse)
def decide_extension(extension_id: str, body: ExtensionDecide, authorization: str = Header(...)):
    if body.decision not in ("approved", "denied"):
        raise HTTPException(status_code=400, detail="decision must be 'approved' or 'denied'")

    token = authorization.removeprefix("Bearer ").strip()
    auth_uid = _get_user_id_from_token(token)
    user = _get_user_row(auth_uid)

    client = get_client()
    ext = (
        client.table("task_extensions")
        .select("*, tasks(assignor_id, deadline)")
        .eq("id", extension_id)
        .single()
        .execute()
    )
    if not ext.data:
        raise HTTPException(status_code=404, detail="Extension not found")
    if ext.data["tasks"]["assignor_id"] != user["id"]:
        raise HTTPException(status_code=403, detail="Only the task assignor can decide on extensions")
    if ext.data["status"] != "requested":
        raise HTTPException(status_code=400, detail="Extension already decided")

    now = datetime.now(timezone.utc).isoformat()
    client.table("task_extensions").update({
        "status": body.decision,
        "decided_by": user["id"],
        "decided_at": now,
    }).eq("id", extension_id).execute()

    if body.decision == "approved":
        new_deadline = ext.data["proposed_deadline"]
        task_update: dict = {"deadline": new_deadline}
        if new_deadline > now:
            task_update["status"] = "open"
        client.table("tasks").update(task_update).eq("id", ext.data["task_id"]).execute()

    updated = client.table("task_extensions").select("*").eq("id", extension_id).single().execute()
    return ExtensionResponse(**updated.data)
