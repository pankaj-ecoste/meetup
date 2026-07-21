from fastapi import APIRouter, HTTPException, Header
from services.supabase import get_client
from models.schemas import UserProfile

router = APIRouter(prefix="/auth", tags=["auth"])


def _get_user_id_from_token(token: str) -> str:
    """Verify JWT and return the auth.uid."""
    client = get_client()
    try:
        user = client.auth.get_user(token)
        return user.user.id
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid or expired token")


@router.get("/me", response_model=UserProfile)
def get_me(authorization: str = Header(...)):
    token = authorization.removeprefix("Bearer ").strip()
    auth_uid = _get_user_id_from_token(token)

    client = get_client()
    result = (
        client.table("users")
        .select("*, companies(name), designations(capability_tier)")
        .eq("auth_id", auth_uid)
        .eq("is_active", True)
        .single()
        .execute()
    )
    if not result.data:
        raise HTTPException(status_code=404, detail="User profile not found")

    row = result.data
    return UserProfile(
        id=row["id"],
        name=row["name"],
        email=row["email"],
        phone=row.get("phone"),
        company_id=row["company_id"],
        company_name=row["companies"]["name"] if row.get("companies") else "",
        designation_id=row.get("designation_id"),
        capability_tier=row["designations"]["capability_tier"] if row.get("designations") else None,
        is_active=row["is_active"],
    )
