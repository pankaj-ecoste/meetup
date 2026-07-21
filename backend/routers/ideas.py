from fastapi import APIRouter, HTTPException, Header, Query
from services.supabase import get_client
from routers.auth import _get_user_id_from_token
from models.schemas import IdeaCreate, IdeaResponse

router = APIRouter(prefix="/ideas", tags=["ideas"])


def _get_user_row(auth_uid: str) -> dict:
    client = get_client()
    r = client.table("users").select("id, company_id").eq("auth_id", auth_uid).single().execute()
    if not r.data:
        raise HTTPException(status_code=404, detail="User not found")
    return r.data


@router.get("", response_model=list[IdeaResponse])
def list_ideas(
    authorization: str = Header(...),
    search: str = Query(default=""),
    company_id: str = Query(default=""),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
):
    token = authorization.removeprefix("Bearer ").strip()
    _get_user_id_from_token(token)   # just verify auth; ideas are universal

    client = get_client()
    q = client.table("ideas").select(
        "*, recorders:users!recorded_by(name, companies(name))"
    )
    if search:
        q = q.ilike("summary", f"%{search}%")
    if company_id:
        q = q.eq("recorders.companies.id", company_id)

    offset = (page - 1) * page_size
    rows = q.order("created_at", desc=True).range(offset, offset + page_size - 1).execute().data or []

    return [
        IdeaResponse(
            id=row["id"],
            recorded_by=row["recorded_by"],
            summary=row["summary"],
            tags=row["tags"],
            created_at=row["created_at"],
            recorder_name=row["recorders"]["name"] if row.get("recorders") else None,
            company_name=(
                row["recorders"]["companies"]["name"]
                if row.get("recorders") and row["recorders"].get("companies")
                else None
            ),
        )
        for row in rows
    ]


@router.post("", response_model=IdeaResponse, status_code=201)
def create_idea(body: IdeaCreate, authorization: str = Header(...)):
    token = authorization.removeprefix("Bearer ").strip()
    auth_uid = _get_user_id_from_token(token)
    user = _get_user_row(auth_uid)

    client = get_client()
    row = (
        client.table("ideas")
        .insert({
            "recorded_by": user["id"],
            "summary": body.summary,
            "tags": body.tags,
        })
        .execute()
    )
    created = row.data[0]
    return IdeaResponse(
        id=created["id"],
        recorded_by=created["recorded_by"],
        summary=created["summary"],
        tags=created["tags"],
        created_at=created["created_at"],
        recorder_name=None,
        company_name=None,
    )
