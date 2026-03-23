from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, Field, ValidationInfo, field_validator


QuestionType = Literal["likert", "blank", "text", "single_choice", "multiple_choice", "ranking"]
GroupFlowMode = Literal["linear", "branch"]


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"


class AdminLoginRequest(BaseModel):
    username: str = Field(min_length=1, max_length=100)
    password: str = Field(min_length=1, max_length=255)


class ProjectMeta(BaseModel):
    project_key: str = Field(min_length=1, max_length=120)
    name: str = Field(min_length=1, max_length=255)
    description: str | None = None


class RandomizationConfig(BaseModel):
    randomize_groups: bool = True
    randomize_items: bool = True


class ItemOption(BaseModel):
    value: Any
    label: str = Field(min_length=1, max_length=255)


class ItemDefinition(BaseModel):
    item_id: str = Field(min_length=1, max_length=120)
    type: QuestionType
    stem: str | list[str]
    required: bool = True
    options: list[ItemOption] | None = None
    routing: dict[str, str] | None = None
    constraints: dict[str, Any] | None = None

    @field_validator("stem")
    @classmethod
    def ensure_stem_valid(cls, value: str | list[str]):
        if isinstance(value, str):
            if not value.strip():
                raise ValueError("stem must not be empty")
            return value
        if not value:
            raise ValueError("stem list must not be empty")
        for row in value:
            if not isinstance(row, str) or not row.strip():
                raise ValueError("each stem in stem list must be non-empty string")
        return value

    @field_validator("options")
    @classmethod
    def ensure_choice_has_options(cls, value: list[ItemOption] | None, info: ValidationInfo):
        if info.data.get("type") in {"likert", "single_choice", "multiple_choice", "ranking"} and (not value or len(value) == 0):
            raise ValueError("Choice-like item requires non-empty options")
        return value

    @field_validator("routing")
    @classmethod
    def ensure_routing_only_on_single_choice(cls, value: dict[str, str] | None, info: ValidationInfo):
        if value is None:
            return value
        if info.data.get("type") != "single_choice":
            raise ValueError("routing is only supported for single_choice")
        return value


class GroupDefinition(BaseModel):
    group_id: str = Field(min_length=1, max_length=120)
    title: str = Field(min_length=1, max_length=255)
    flow_mode: GroupFlowMode = "linear"
    items: list[ItemDefinition] = Field(min_length=1)


class QuestionnaireDefinition(BaseModel):
    id: str = Field(min_length=1, max_length=120)
    version: str = Field(min_length=1, max_length=64)
    title: str = Field(min_length=1, max_length=255)
    consent_enabled: bool = False
    consent_text: str | None = None
    randomization: RandomizationConfig = Field(default_factory=RandomizationConfig)
    groups: list[GroupDefinition] = Field(min_length=1)


class ProjectImportRequest(BaseModel):
    project: ProjectMeta
    questionnaire: QuestionnaireDefinition


class ProjectImportResponse(BaseModel):
    project_id: str
    questionnaire_id: str
    project_key: str
    randomize_groups: bool
    randomize_items: bool


class ProjectSummary(BaseModel):
    id: str
    project_key: str
    name: str
    description: str | None
    delete_status: str
    deleted_at: datetime | None
    purge_after: datetime | None
    created_at: datetime


class ProjectListResponse(BaseModel):
    projects: list[ProjectSummary]


class ProjectDeleteRequest(BaseModel):
    confirm_project_name: str = Field(min_length=1, max_length=255)


class ProjectBulkRequest(BaseModel):
    project_ids: list[str] = Field(min_length=1)

    @field_validator("project_ids")
    @classmethod
    def normalize_project_ids(cls, value: list[str]) -> list[str]:
        normalized: list[str] = []
        seen: set[str] = set()
        for raw in value:
            item = str(raw).strip()
            if not item or item in seen:
                continue
            seen.add(item)
            normalized.append(item)
        if not normalized:
            raise ValueError("project_ids must contain at least one valid id")
        return normalized


class ProjectBulkSkippedItem(BaseModel):
    project_id: str
    reason: str


class ProjectDeleteResponse(BaseModel):
    project_id: str
    delete_status: str
    deleted_at: datetime
    purge_after: datetime


class ProjectBulkDeleteResponse(BaseModel):
    requested_count: int
    updated_count: int
    updated_ids: list[str]
    skipped: list[ProjectBulkSkippedItem]


class ProjectPurgeResponse(BaseModel):
    project_id: str
    delete_status: str
    deleted_counts: dict[str, int]


class ProjectBulkPurgeResponse(BaseModel):
    requested_count: int
    purged_count: int
    purged_ids: list[str]
    skipped: list[ProjectBulkSkippedItem]


class ProjectRestoreResponse(BaseModel):
    project_id: str
    delete_status: str
    deleted_at: datetime | None
    purge_after: datetime | None


class ProjectBulkRestoreResponse(BaseModel):
    requested_count: int
    restored_count: int
    restored_ids: list[str]
    skipped: list[ProjectBulkSkippedItem]


class QuestionnaireSummary(BaseModel):
    id: str
    version: str
    title: str
    consent_enabled: bool
    consent_text: str | None = None
    randomize_groups: bool
    randomize_items: bool
    created_at: datetime


class ProjectQuestionnairesResponse(BaseModel):
    project_id: str
    questionnaires: list[QuestionnaireSummary]


class LinkBatchRequest(BaseModel):
    count: int = Field(ge=1, le=5000)
    expires_in_days: int | None = Field(default=None, ge=1, le=365)


class LinkBatchResponse(BaseModel):
    questionnaire_id: str
    links: list[str]


class ProjectBatchCreateRequest(BaseModel):
    questionnaire_id: str = Field(min_length=1, max_length=120)
    count: int = Field(ge=1, le=5000)
    expires_in_days: int | None = Field(default=None, ge=1, le=365)


class ProjectBatchCreateResponse(BaseModel):
    batch_id: str
    project_id: str
    questionnaire_id: str
    count: int
    expires_in_days: int | None
    created_at: datetime
    links: list[str]


class BatchSummary(BaseModel):
    batch_id: str
    project_id: str
    questionnaire_id: str
    questionnaire_title: str
    requested_count: int
    link_count: int
    expires_in_days: int | None
    created_at: datetime


class ProjectBatchesResponse(BaseModel):
    project_id: str
    batches: list[BatchSummary]


class BatchLinkRow(BaseModel):
    token: str
    status: str
    expires_at: datetime | None
    created_at: datetime


class BatchLinksResponse(BaseModel):
    batch_id: str
    project_id: str
    questionnaire_id: str
    questionnaire_title: str
    created_at: datetime
    links: list[BatchLinkRow]


class BatchDeleteResponse(BaseModel):
    batch_id: str
    deleted: bool


class SurveyItemPayload(BaseModel):
    item_id: str
    group_id: str
    group_flow_mode: GroupFlowMode = "linear"
    type: QuestionType
    stem: str
    required: bool
    options: list[ItemOption] | None = None


class SurveyStartResponse(BaseModel):
    session_id: str
    participant_id: str
    status: str
    requires_consent: bool
    consent_given: bool
    consent_text: str | None = None
    current_index: int
    total_items: int
    next_item: SurveyItemPayload | None


class QuestionnaireSettingsUpdateRequest(BaseModel):
    consent_enabled: bool | None = None
    consent_text: str | None = None


class QuestionnaireSettingsResponse(BaseModel):
    questionnaire_id: str
    consent_enabled: bool
    consent_text: str | None


class ConsentRequest(BaseModel):
    accepted: bool


class EventInput(BaseModel):
    event_type: str = Field(min_length=1, max_length=80)
    client_ts: datetime | None = None
    payload: dict[str, Any] | None = None


class SubmitItemRequest(BaseModel):
    answer: Any
    events: list[EventInput] = Field(default_factory=list)


class SubmitItemResponse(BaseModel):
    session_id: str
    submitted_item_id: str
    duration_ms: int
    present_position: int
    completed: bool
    next_item: SurveyItemPayload | None
    current_index: int
