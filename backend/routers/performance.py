from fastapi import APIRouter, HTTPException, Header, Query
from services.supabase import get_client
from routers.auth import _get_user_id_from_token
from models.schemas import PerformanceRow

router = APIRouter(prefix="/performance", tags=["performance"])


def _get_user_profile(auth_uid: str) -> dict:
    client = get_client()
    r = (
        client.table("users")
        .select("id, designations(capability_tier)")
        .eq("auth_id", auth_uid)
        .single()
        .execute()
    )
    if not r.data:
        raise HTTPException(status_code=404, detail="User not found")
    return r.data


@router.get("/me", response_model=PerformanceRow)
def my_performance(authorization: str = Header(...)):
    token = authorization.removeprefix("Bearer ").strip()
    auth_uid = _get_user_id_from_token(token)
    user = _get_user_profile(auth_uid)

    client = get_client()
    row = (
        client.table("user_performance")
        .select("*")
        .eq("user_id", user["id"])
        .single()
        .execute()
    )
    if not row.data:
        raise HTTPException(status_code=404, detail="Performance data not found")
    return PerformanceRow(**row.data)


@router.get("/org", response_model=list[PerformanceRow])
def org_performance(
    authorization: str = Header(...),
    search: str = Query(default=""),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=50, ge=1, le=200),
):
    """Leadership-only endpoint. Returns scores for all employees."""
    token = authorization.removeprefix("Bearer ").strip()
    auth_uid = _get_user_id_from_token(token)
    user = _get_user_profile(auth_uid)

    tier = (
        user.get("designations", {}).get("capability_tier")
        if user.get("designations") else None
    )
    if tier != "leadership":
        raise HTTPException(status_code=403, detail="Access denied — leadership tier required")

    client = get_client()
    q = client.table("user_performance").select("*")
    if search:
        q = q.or_(f"name.ilike.%{search}%,email.ilike.%{search}%")

    offset = (page - 1) * page_size
    rows = q.order("on_time_pct", desc=True).range(offset, offset + page_size - 1).execute().data or []
    return [PerformanceRow(**r) for r in rows]


@router.get("/extensions/my", response_model=list[dict])
def my_extension_history(authorization: str = Header(...)):
    token = authorization.removeprefix("Bearer ").strip()
    auth_uid = _get_user_id_from_token(token)
    user = _get_user_profile(auth_uid)

    client = get_client()
    rows = (
        client.table("task_extensions")
        .select("*, tasks(description, deadline, original_deadline)")
        .eq("requested_by", user["id"])
        .order("created_at", desc=True)
        .execute()
        .data or []
    )
    return rows
