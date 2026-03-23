from __future__ import annotations

from datetime import timedelta
from pathlib import Path

from fastapi import HTTPException, status
from sqlalchemy import delete
from sqlalchemy.orm import Session

from ..config import settings
from ..models import EventLog, ExportRecord, Project, Questionnaire, SurveyLink, SurveyResponse, SurveySession, utcnow

PROJECT_ACTIVE = "active"
PROJECT_PENDING_PURGE = "pending_purge"
PROJECT_PURGED = "purged"


def ensure_project_is_active(project: Project | None) -> Project:
    if not project or project.delete_status != PROJECT_ACTIVE:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not available")
    return project


def mark_project_pending_delete(db: Session, project: Project) -> Project:
    now = utcnow()
    project.delete_status = PROJECT_PENDING_PURGE
    project.deleted_at = now
    project.purge_after = now + timedelta(days=settings.purge_grace_days)
    db.add(project)
    db.commit()
    db.refresh(project)
    return project


def purge_project_data(db: Session, project: Project) -> dict[str, int]:
    export_rows = db.query(ExportRecord).filter(ExportRecord.project_id == project.id).all()
    removed_files = 0
    for row in export_rows:
        if row.file_path:
            path = Path(row.file_path)
            if path.exists():
                path.unlink(missing_ok=True)
                removed_files += 1

    counts = {
        "event_logs": db.execute(delete(EventLog).where(EventLog.project_id == project.id)).rowcount or 0,
        "responses": db.execute(delete(SurveyResponse).where(SurveyResponse.project_id == project.id)).rowcount or 0,
        "sessions": db.execute(delete(SurveySession).where(SurveySession.project_id == project.id)).rowcount or 0,
        "links": db.execute(delete(SurveyLink).where(SurveyLink.project_id == project.id)).rowcount or 0,
        "questionnaires": db.execute(delete(Questionnaire).where(Questionnaire.project_id == project.id)).rowcount or 0,
        "export_records": db.execute(delete(ExportRecord).where(ExportRecord.project_id == project.id)).rowcount or 0,
        "export_files_removed": removed_files,
    }

    project.delete_status = PROJECT_PURGED
    db.add(project)
    db.commit()
    db.refresh(project)
    return counts

