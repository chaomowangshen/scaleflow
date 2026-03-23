from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import Project, Questionnaire, SurveyLink, SurveySession, utcnow
from ..schemas import (
    ProjectBulkDeleteResponse,
    ProjectBulkPurgeResponse,
    ProjectBulkRestoreResponse,
    ProjectBulkRequest,
    ProjectBulkSkippedItem,
    ProjectQuestionnairesResponse,
    ProjectDeleteRequest,
    ProjectDeleteResponse,
    ProjectImportRequest,
    ProjectImportResponse,
    ProjectListResponse,
    ProjectPurgeResponse,
    ProjectRestoreResponse,
    ProjectSummary,
    QuestionnaireSummary,
)
from ..security import get_current_admin, require_super_admin
from ..services.projects import (
    PROJECT_ACTIVE,
    PROJECT_PENDING_PURGE,
    PROJECT_PURGED,
    mark_project_pending_delete,
    purge_project_data,
    restore_project_to_active,
)
from ..services.questionnaire import normalize_questionnaire_structure, validate_questionnaire_structure


router = APIRouter(prefix="/admin/projects", tags=["admin-projects"], dependencies=[Depends(get_current_admin)])


@router.post("/import", response_model=ProjectImportResponse, status_code=status.HTTP_201_CREATED)
def import_project(payload: ProjectImportRequest, db: Session = Depends(get_db)) -> ProjectImportResponse:
    existing = db.query(Project).filter(Project.project_key == payload.project.project_key).first()
    if existing and existing.delete_status != PROJECT_PURGED:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="project_key already exists")

    questionnaire_payload = payload.questionnaire.model_dump(mode="json")
    questionnaire_payload = normalize_questionnaire_structure(questionnaire_payload)
    validate_questionnaire_structure(questionnaire_payload)

    project = Project(
        project_key=payload.project.project_key,
        name=payload.project.name,
        description=payload.project.description,
        delete_status=PROJECT_ACTIVE,
    )
    db.add(project)
    db.flush()

    questionnaire = Questionnaire(
        project_id=project.id,
        version=payload.questionnaire.version,
        title=payload.questionnaire.title,
        consent_enabled=payload.questionnaire.consent_enabled,
        randomize_groups=payload.questionnaire.randomization.randomize_groups,
        randomize_items=payload.questionnaire.randomization.randomize_items,
        structure_json=questionnaire_payload,
        is_published=True,
    )
    db.add(questionnaire)

    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Project import failed due to duplicate identifiers",
        ) from exc

    return ProjectImportResponse(
        project_id=project.id,
        questionnaire_id=questionnaire.id,
        project_key=project.project_key,
        randomize_groups=questionnaire.randomize_groups,
        randomize_items=questionnaire.randomize_items,
    )


@router.get("", response_model=ProjectListResponse)
def list_projects(
    include_purged: bool = Query(default=False),
    db: Session = Depends(get_db),
) -> ProjectListResponse:
    query = db.query(Project)
    if not include_purged:
        query = query.filter(Project.delete_status != PROJECT_PURGED)
    projects = query.order_by(Project.created_at.desc()).all()
    return ProjectListResponse(
        projects=[
            ProjectSummary(
                id=item.id,
                project_key=item.project_key,
                name=item.name,
                description=item.description,
                delete_status=item.delete_status,
                deleted_at=item.deleted_at,
                purge_after=item.purge_after,
                created_at=item.created_at,
            )
            for item in projects
        ]
    )


@router.post("/bulk-delete", response_model=ProjectBulkDeleteResponse)
def bulk_delete_projects(payload: ProjectBulkRequest, db: Session = Depends(get_db)) -> ProjectBulkDeleteResponse:
    project_rows = db.query(Project).filter(Project.id.in_(payload.project_ids)).all()
    project_map = {row.id: row for row in project_rows}

    updated_ids: list[str] = []
    skipped: list[ProjectBulkSkippedItem] = []
    for project_id in payload.project_ids:
        project = project_map.get(project_id)
        if not project or project.delete_status == PROJECT_PURGED:
            skipped.append(ProjectBulkSkippedItem(project_id=project_id, reason="Project not found"))
            continue
        if project.delete_status == PROJECT_PENDING_PURGE:
            skipped.append(ProjectBulkSkippedItem(project_id=project_id, reason="Project already pending purge"))
            continue
        if project.delete_status != PROJECT_ACTIVE:
            skipped.append(
                ProjectBulkSkippedItem(
                    project_id=project_id,
                    reason=f"Project status {project.delete_status} cannot be soft-deleted",
                )
            )
            continue

        project = mark_project_pending_delete(db, project)
        updated_ids.append(project.id)

    return ProjectBulkDeleteResponse(
        requested_count=len(payload.project_ids),
        updated_count=len(updated_ids),
        updated_ids=updated_ids,
        skipped=skipped,
    )


@router.post("/bulk-purge", response_model=ProjectBulkPurgeResponse)
def bulk_purge_projects(
    payload: ProjectBulkRequest,
    db: Session = Depends(get_db),
    _super_admin=Depends(require_super_admin),
) -> ProjectBulkPurgeResponse:
    project_rows = db.query(Project).filter(Project.id.in_(payload.project_ids)).all()
    project_map = {row.id: row for row in project_rows}

    purged_ids: list[str] = []
    skipped: list[ProjectBulkSkippedItem] = []
    for project_id in payload.project_ids:
        project = project_map.get(project_id)
        if not project:
            skipped.append(ProjectBulkSkippedItem(project_id=project_id, reason="Project not found"))
            continue
        if project.delete_status == PROJECT_PURGED:
            skipped.append(ProjectBulkSkippedItem(project_id=project_id, reason="Project already purged"))
            continue
        if project.delete_status != PROJECT_PENDING_PURGE:
            skipped.append(ProjectBulkSkippedItem(project_id=project_id, reason="Project must be pending purge"))
            continue

        purge_project_data(db, project)
        purged_ids.append(project.id)

    return ProjectBulkPurgeResponse(
        requested_count=len(payload.project_ids),
        purged_count=len(purged_ids),
        purged_ids=purged_ids,
        skipped=skipped,
    )


@router.post("/bulk-restore", response_model=ProjectBulkRestoreResponse)
def bulk_restore_projects(payload: ProjectBulkRequest, db: Session = Depends(get_db)) -> ProjectBulkRestoreResponse:
    project_rows = db.query(Project).filter(Project.id.in_(payload.project_ids)).all()
    project_map = {row.id: row for row in project_rows}

    restored_ids: list[str] = []
    skipped: list[ProjectBulkSkippedItem] = []
    for project_id in payload.project_ids:
        project = project_map.get(project_id)
        if not project:
            skipped.append(ProjectBulkSkippedItem(project_id=project_id, reason="Project not found"))
            continue
        if project.delete_status == PROJECT_PURGED:
            skipped.append(ProjectBulkSkippedItem(project_id=project_id, reason="Project cannot be restored once purged"))
            continue
        if project.delete_status == PROJECT_ACTIVE:
            skipped.append(ProjectBulkSkippedItem(project_id=project_id, reason="Project is already active"))
            continue
        if project.delete_status != PROJECT_PENDING_PURGE:
            skipped.append(
                ProjectBulkSkippedItem(
                    project_id=project_id,
                    reason=f"Project status {project.delete_status} cannot be restored",
                )
            )
            continue

        project = restore_project_to_active(db, project)
        restored_ids.append(project.id)

    return ProjectBulkRestoreResponse(
        requested_count=len(payload.project_ids),
        restored_count=len(restored_ids),
        restored_ids=restored_ids,
        skipped=skipped,
    )


@router.delete("/{project_id}", response_model=ProjectDeleteResponse)
def delete_project(project_id: str, payload: ProjectDeleteRequest, db: Session = Depends(get_db)) -> ProjectDeleteResponse:
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project or project.delete_status == PROJECT_PURGED:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found")
    if payload.confirm_project_name.strip() != project.name:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Project name confirmation mismatch")
    if project.delete_status == PROJECT_PENDING_PURGE:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Project already pending purge")

    project = mark_project_pending_delete(db, project)
    return ProjectDeleteResponse(
        project_id=project.id,
        delete_status=project.delete_status,
        deleted_at=project.deleted_at,
        purge_after=project.purge_after,
    )


@router.post("/{project_id}/restore", response_model=ProjectRestoreResponse)
def restore_project(project_id: str, db: Session = Depends(get_db)) -> ProjectRestoreResponse:
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found")
    if project.delete_status == PROJECT_PURGED:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Project cannot be restored once purged",
        )
    if project.delete_status == PROJECT_ACTIVE:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Project is already active")
    if project.delete_status != PROJECT_PENDING_PURGE:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Project status {project.delete_status} cannot be restored",
        )

    project = restore_project_to_active(db, project)
    return ProjectRestoreResponse(
        project_id=project.id,
        delete_status=project.delete_status,
        deleted_at=project.deleted_at,
        purge_after=project.purge_after,
    )


@router.post("/{project_id}/purge", response_model=ProjectPurgeResponse)
def purge_project(
    project_id: str,
    db: Session = Depends(get_db),
    _super_admin=Depends(require_super_admin),
) -> ProjectPurgeResponse:
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found")
    if project.delete_status == PROJECT_PURGED:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Project already purged")
    if project.delete_status != PROJECT_PENDING_PURGE:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Project must be pending purge")

    deleted_counts = purge_project_data(db, project)
    return ProjectPurgeResponse(project_id=project.id, delete_status=project.delete_status, deleted_counts=deleted_counts)


@router.post("/purge_due", response_model=list[ProjectPurgeResponse])
def purge_due_projects(
    db: Session = Depends(get_db),
    _super_admin=Depends(require_super_admin),
) -> list[ProjectPurgeResponse]:
    now = utcnow()
    due_projects = (
        db.query(Project)
        .filter(Project.delete_status == PROJECT_PENDING_PURGE)
        .filter(Project.purge_after.is_not(None))
        .filter(Project.purge_after <= now)
        .all()
    )

    responses: list[ProjectPurgeResponse] = []
    for project in due_projects:
        deleted_counts = purge_project_data(db, project)
        responses.append(
            ProjectPurgeResponse(project_id=project.id, delete_status=project.delete_status, deleted_counts=deleted_counts)
        )
    return responses


@router.get("/{project_id}/stats")
def get_project_stats(project_id: str, db: Session = Depends(get_db)):
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found")

    questionnaires = db.query(Questionnaire).filter(Questionnaire.project_id == project_id).count()
    links = db.query(SurveyLink).filter(SurveyLink.project_id == project_id).count()
    sessions = db.query(SurveySession).filter(SurveySession.project_id == project_id).count()
    return {
        "project_id": project_id,
        "delete_status": project.delete_status,
        "questionnaires": questionnaires,
        "links": links,
        "sessions": sessions,
    }


@router.get("/{project_id}/questionnaires", response_model=ProjectQuestionnairesResponse)
def list_project_questionnaires(project_id: str, db: Session = Depends(get_db)) -> ProjectQuestionnairesResponse:
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found")

    questionnaires = (
        db.query(Questionnaire)
        .filter(Questionnaire.project_id == project_id)
        .order_by(Questionnaire.created_at.desc())
        .all()
    )
    return ProjectQuestionnairesResponse(
        project_id=project_id,
        questionnaires=[
            QuestionnaireSummary(
                id=item.id,
                version=item.version,
                title=item.title,
                consent_enabled=item.consent_enabled,
                consent_text=(item.structure_json or {}).get("consent_text"),
                randomize_groups=item.randomize_groups,
                randomize_items=item.randomize_items,
                created_at=item.created_at,
            )
            for item in questionnaires
        ],
    )
