import secrets
from datetime import timedelta

from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from ..models import LinkBatch, Project, Questionnaire, SurveyLink, utcnow
from .projects import PROJECT_ACTIVE


def _new_token() -> str:
    return secrets.token_urlsafe(24)


def create_link_batch(
    db: Session,
    *,
    project: Project,
    questionnaire: Questionnaire,
    count: int,
    expires_in_days: int | None,
) -> tuple[LinkBatch, list[str]]:
    if project.delete_status != PROJECT_ACTIVE:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not available")
    if questionnaire.project_id != project.id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Questionnaire does not belong to project")
    if count < 1:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="count must be >= 1")

    expires_at = None
    if expires_in_days:
        expires_at = utcnow() + timedelta(days=expires_in_days)

    batch = LinkBatch(
        project_id=project.id,
        questionnaire_id=questionnaire.id,
        requested_count=count,
        expires_in_days=expires_in_days,
    )
    db.add(batch)
    db.flush()

    tokens: list[str] = []
    for _ in range(count):
        token = _new_token()
        while db.query(SurveyLink).filter(SurveyLink.token == token).first() is not None:
            token = _new_token()
        link = SurveyLink(
            project_id=project.id,
            questionnaire_id=questionnaire.id,
            batch_id=batch.id,
            token=token,
            status="active",
            expires_at=expires_at,
        )
        db.add(link)
        tokens.append(token)

    db.commit()
    db.refresh(batch)
    return batch, tokens
