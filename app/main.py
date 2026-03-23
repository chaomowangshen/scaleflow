from pathlib import Path

from fastapi import FastAPI
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from sqlalchemy.orm import Session

from .api.admin_auth import router as admin_auth_router
from .api.admin_batches import router as admin_batches_router
from .api.admin_exports import router as admin_exports_router
from .api.admin_projects import router as admin_projects_router
from .api.admin_questionnaires import router as admin_questionnaires_router
from .api.survey import router as survey_router
from . import database
from .config import settings
from .models import AdminUser
from .security import hash_password


def bootstrap_admin_user(db: Session) -> None:
    existing = db.query(AdminUser).filter(AdminUser.username == settings.admin_username).first()
    if existing:
        return
    admin = AdminUser(
        username=settings.admin_username,
        password_hash=hash_password(settings.admin_password),
        is_superuser=True,
    )
    db.add(admin)
    db.commit()


app = FastAPI(title=settings.app_name, version="0.1.0")
BASE_DIR = Path(__file__).resolve().parent
WEB_DIR = BASE_DIR / "web"


@app.on_event("startup")
def on_startup() -> None:
    database.Base.metadata.create_all(bind=database.engine)
    with database.SessionLocal() as db:
        bootstrap_admin_user(db)


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


if WEB_DIR.exists():
    app.mount("/admin-ui", StaticFiles(directory=str(WEB_DIR)), name="admin-ui")


@app.get("/admin", include_in_schema=False)
def admin_page() -> FileResponse:
    html_file = WEB_DIR / "admin.html"
    if not html_file.exists():
        raise RuntimeError("Admin UI file not found")
    return FileResponse(str(html_file))


@app.get("/take/{token}", include_in_schema=False)
def participant_page(token: str) -> FileResponse:
    html_file = WEB_DIR / "participant.html"
    if not html_file.exists():
        raise RuntimeError("Participant UI file not found")
    return FileResponse(str(html_file))


app.include_router(admin_auth_router)
app.include_router(admin_projects_router)
app.include_router(admin_questionnaires_router)
app.include_router(admin_batches_router)
app.include_router(admin_exports_router)
app.include_router(survey_router)
