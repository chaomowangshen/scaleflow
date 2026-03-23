from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import LinkBatch, Project, Questionnaire
from ..schemas import (
    BatchLinkRow,
    BatchLinksResponse,
    BatchSummary,
    ProjectBatchCreateRequest,
    ProjectBatchCreateResponse,
    ProjectBatchesResponse,
)
from ..security import get_current_admin
from ..services.batches import create_link_batch
from ..services.projects import PROJECT_PURGED


router = APIRouter(prefix="/admin", tags=["admin-batches"], dependencies=[Depends(get_current_admin)])


@router.post("/projects/{project_id}/batches", response_model=ProjectBatchCreateResponse, status_code=status.HTTP_201_CREATED)
def create_project_batch(
    project_id: str,
    payload: ProjectBatchCreateRequest,
    db: Session = Depends(get_db),
) -> ProjectBatchCreateResponse:
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project or project.delete_status == PROJECT_PURGED:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found")

    questionnaire = (
        db.query(Questionnaire)
        .filter(Questionnaire.id == payload.questionnaire_id, Questionnaire.project_id == project_id)
        .first()
    )
    if not questionnaire:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Questionnaire not found")

    batch, tokens = create_link_batch(
        db,
        project=project,
        questionnaire=questionnaire,
        count=payload.count,
        expires_in_days=payload.expires_in_days,
    )
    return ProjectBatchCreateResponse(
        batch_id=batch.id,
        project_id=project.id,
        questionnaire_id=questionnaire.id,
        count=batch.requested_count,
        expires_in_days=batch.expires_in_days,
        created_at=batch.created_at,
        links=tokens,
    )


@router.get("/projects/{project_id}/batches", response_model=ProjectBatchesResponse)
def list_project_batches(
    project_id: str,
    questionnaire_id: str | None = Query(default=None),
    db: Session = Depends(get_db),
) -> ProjectBatchesResponse:
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project or project.delete_status == PROJECT_PURGED:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found")

    query = db.query(LinkBatch).filter(LinkBatch.project_id == project_id)
    if questionnaire_id:
        query = query.filter(LinkBatch.questionnaire_id == questionnaire_id)
    batches = query.order_by(LinkBatch.created_at.desc()).all()
    summary_rows: list[BatchSummary] = []
    for batch in batches:
        summary_rows.append(
            BatchSummary(
                batch_id=batch.id,
                project_id=batch.project_id,
                questionnaire_id=batch.questionnaire_id,
                questionnaire_title=batch.questionnaire.title if batch.questionnaire else "",
                requested_count=batch.requested_count,
                link_count=len(batch.links or []),
                expires_in_days=batch.expires_in_days,
                created_at=batch.created_at,
            )
        )
    return ProjectBatchesResponse(project_id=project_id, batches=summary_rows)


@router.get("/batches/{batch_id}/links", response_model=BatchLinksResponse)
def get_batch_links(batch_id: str, db: Session = Depends(get_db)) -> BatchLinksResponse:
    batch = db.query(LinkBatch).filter(LinkBatch.id == batch_id).first()
    if not batch:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Batch not found")
    if batch.project.delete_status == PROJECT_PURGED:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found")

    links = sorted(batch.links or [], key=lambda row: row.created_at)
    return BatchLinksResponse(
        batch_id=batch.id,
        project_id=batch.project_id,
        questionnaire_id=batch.questionnaire_id,
        questionnaire_title=batch.questionnaire.title if batch.questionnaire else "",
        created_at=batch.created_at,
        links=[
            BatchLinkRow(
                token=link.token,
                status=link.status,
                expires_at=link.expires_at,
                created_at=link.created_at,
            )
            for link in links
        ],
    )
