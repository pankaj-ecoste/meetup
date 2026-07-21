from fastapi import APIRouter, Header, Query
from services.supabase import get_client
from routers.auth import _get_user_id_from_token
from models.schemas import UserBrief

router = APIRouter(prefix="/users", tags=["users"])


@router.get("", response_model=list[UserBrief])
def list_users(
    authorization: str = Header(...),
    search: str = Query(default=""),
):
    """Returns all active users for the Doer / Report To dropdowns.
    Shows Name + Company so same-name people across companies are distinguishable.
    """
    _get_user_id_from_token(authorization.removeprefix("Bearer ").strip())

    client = get_client()
    q = (
        client.table("users")
        .select("id, name, email, company_id, companies(name)")
        .eq("is_active", True)
        .order("name")
    )
    if search:
        q = q.ilike("name", f"%{search}%")

    rows = q.execute().data or []
    return [
        UserBrief(
            id=row["id"],
            name=row["name"],
            email=row["email"],
            company_id=row["company_id"],
            company_name=row["companies"]["name"] if row.get("companies") else "",
        )
        for row in rows
    ]
