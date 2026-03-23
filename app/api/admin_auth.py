from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import AdminUser
from ..schemas import AdminLoginRequest, TokenResponse
from ..security import create_access_token, verify_password


router = APIRouter(prefix="/admin/auth", tags=["admin-auth"])


@router.post("/login", response_model=TokenResponse)
def login(payload: AdminLoginRequest, db: Session = Depends(get_db)) -> TokenResponse:
    admin = db.query(AdminUser).filter(AdminUser.username == payload.username).first()
    if not admin or not verify_password(payload.password, admin.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid username or password",
        )

    token = create_access_token(username=admin.username, is_superuser=admin.is_superuser)
    return TokenResponse(access_token=token)

