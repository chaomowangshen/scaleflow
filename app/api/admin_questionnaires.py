from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import Project, Questionnaire
from ..schemas import (
    LinkBatchRequest,
    LinkBatchResponse,
    QuestionnaireSettingsResponse,
    QuestionnaireSettingsUpdateRequest,
)
from ..security import get_current_admin
from ..services.projects import PROJECT_ACTIVE
from ..services.batches import create_link_batch


router = APIRouter(
    prefix="/admin/questionnaires",
    tags=["admin-questionnaires"],
    dependencies=[Depends(get_current_admin)],
)

@router.post("/{questionnaire_id}/links/batch", response_model=LinkBatchResponse, status_code=status.HTTP_201_CREATED)
def create_links(
    questionnaire_id: str,
    payload: LinkBatchRequest,
    db: Session = Depends(get_db),
) -> LinkBatchResponse:
    questionnaire = db.query(Questionnaire).filter(Questionnaire.id == questionnaire_id).first()
    if not questionnaire:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Questionnaire not found")
    project = db.query(Project).filter(Project.id == questionnaire.project_id).first()
    if not project or questionnaire.project.delete_status != PROJECT_ACTIVE:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not available")

    _, tokens = create_link_batch(
        db,
        project=project,
        questionnaire=questionnaire,
        count=payload.count,
        expires_in_days=payload.expires_in_days,
    )
    return LinkBatchResponse(questionnaire_id=questionnaire_id, links=tokens)


@router.patch("/{questionnaire_id}/settings", response_model=QuestionnaireSettingsResponse)
def update_questionnaire_settings(
    questionnaire_id: str,
    payload: QuestionnaireSettingsUpdateRequest,
    db: Session = Depends(get_db),
) -> QuestionnaireSettingsResponse:
    questionnaire = db.query(Questionnaire).filter(Questionnaire.id == questionnaire_id).first()
    if not questionnaire:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Questionnaire not found")
    if questionnaire.project.delete_status != PROJECT_ACTIVE:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not available")

    structure = dict(questionnaire.structure_json or {})
    if payload.consent_enabled is not None:
        questionnaire.consent_enabled = payload.consent_enabled
        structure["consent_enabled"] = payload.consent_enabled
    if payload.consent_text is not None:
        structure["consent_text"] = payload.consent_text

    questionnaire.structure_json = structure
    db.add(questionnaire)
    db.commit()
    db.refresh(questionnaire)

    return QuestionnaireSettingsResponse(
        questionnaire_id=questionnaire.id,
        consent_enabled=questionnaire.consent_enabled,
        consent_text=(questionnaire.structure_json or {}).get("consent_text"),
    )
