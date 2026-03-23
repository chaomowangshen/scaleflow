from datetime import datetime
from uuid import uuid4

from sqlalchemy import JSON, Boolean, Column, DateTime, ForeignKey, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import relationship

from .database import Base


def utcnow() -> datetime:
    return datetime.utcnow()


class AdminUser(Base):
    __tablename__ = "admin_users"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid4()))
    username = Column(String(100), unique=True, index=True, nullable=False)
    password_hash = Column(String(255), nullable=False)
    is_superuser = Column(Boolean, default=True, nullable=False)
    created_at = Column(DateTime, default=utcnow, nullable=False)


class Project(Base):
    __tablename__ = "projects"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid4()))
    project_key = Column(String(120), unique=True, index=True, nullable=False)
    name = Column(String(255), nullable=False)
    description = Column(Text, nullable=True)
    delete_status = Column(String(32), default="active", index=True, nullable=False)
    deleted_at = Column(DateTime, nullable=True)
    purge_after = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=utcnow, nullable=False)
    updated_at = Column(DateTime, default=utcnow, onupdate=utcnow, nullable=False)

    questionnaires = relationship("Questionnaire", back_populates="project", cascade="all, delete-orphan")
    batches = relationship("LinkBatch", back_populates="project", cascade="all, delete-orphan")
    links = relationship("SurveyLink", back_populates="project", cascade="all, delete-orphan")
    sessions = relationship("SurveySession", back_populates="project", cascade="all, delete-orphan")
    responses = relationship("SurveyResponse", back_populates="project", cascade="all, delete-orphan")
    event_logs = relationship("EventLog", back_populates="project", cascade="all, delete-orphan")
    export_records = relationship("ExportRecord", back_populates="project", cascade="all, delete-orphan")


class Questionnaire(Base):
    __tablename__ = "questionnaires"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid4()))
    project_id = Column(String(36), ForeignKey("projects.id", ondelete="CASCADE"), index=True, nullable=False)
    version = Column(String(64), nullable=False)
    title = Column(String(255), nullable=False)
    consent_enabled = Column(Boolean, default=False, nullable=False)
    randomize_groups = Column(Boolean, default=True, nullable=False)
    randomize_items = Column(Boolean, default=True, nullable=False)
    structure_json = Column(JSON, nullable=False)
    is_published = Column(Boolean, default=True, nullable=False)
    created_at = Column(DateTime, default=utcnow, nullable=False)

    project = relationship("Project", back_populates="questionnaires")
    batches = relationship("LinkBatch", back_populates="questionnaire", cascade="all, delete-orphan")
    links = relationship("SurveyLink", back_populates="questionnaire", cascade="all, delete-orphan")
    sessions = relationship("SurveySession", back_populates="questionnaire", cascade="all, delete-orphan")


class LinkBatch(Base):
    __tablename__ = "link_batches"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid4()))
    project_id = Column(String(36), ForeignKey("projects.id", ondelete="CASCADE"), index=True, nullable=False)
    questionnaire_id = Column(String(36), ForeignKey("questionnaires.id", ondelete="CASCADE"), index=True, nullable=False)
    requested_count = Column(Integer, nullable=False)
    expires_in_days = Column(Integer, nullable=True)
    created_at = Column(DateTime, default=utcnow, nullable=False)

    project = relationship("Project", back_populates="batches")
    questionnaire = relationship("Questionnaire", back_populates="batches")
    links = relationship("SurveyLink", back_populates="batch")


class SurveyLink(Base):
    __tablename__ = "survey_links"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid4()))
    project_id = Column(String(36), ForeignKey("projects.id", ondelete="CASCADE"), index=True, nullable=False)
    questionnaire_id = Column(String(36), ForeignKey("questionnaires.id", ondelete="CASCADE"), index=True, nullable=False)
    batch_id = Column(String(36), ForeignKey("link_batches.id", ondelete="SET NULL"), index=True, nullable=True)
    token = Column(String(255), unique=True, index=True, nullable=False)
    status = Column(String(32), default="active", index=True, nullable=False)
    expires_at = Column(DateTime, nullable=True)
    session_id = Column(String(36), ForeignKey("survey_sessions.id", ondelete="SET NULL"), nullable=True)
    created_at = Column(DateTime, default=utcnow, nullable=False)

    project = relationship("Project", back_populates="links")
    questionnaire = relationship("Questionnaire", back_populates="links")
    batch = relationship("LinkBatch", back_populates="links")
    session = relationship("SurveySession", foreign_keys=[session_id], uselist=False)


class SurveySession(Base):
    __tablename__ = "survey_sessions"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid4()))
    project_id = Column(String(36), ForeignKey("projects.id", ondelete="CASCADE"), index=True, nullable=False)
    questionnaire_id = Column(String(36), ForeignKey("questionnaires.id", ondelete="CASCADE"), index=True, nullable=False)
    link_id = Column(String(36), ForeignKey("survey_links.id", ondelete="CASCADE"), unique=True, index=True, nullable=False)
    participant_id = Column(String(64), index=True, nullable=False)
    status = Column(String(32), default="in_progress", index=True, nullable=False)
    consent_given = Column(Boolean, default=False, nullable=False)
    started_at = Column(DateTime, default=utcnow, nullable=False)
    completed_at = Column(DateTime, nullable=True)
    last_seen_at = Column(DateTime, default=utcnow, nullable=False)
    canonical_order_json = Column(JSON, default=list, nullable=False)
    present_order_json = Column(JSON, default=list, nullable=False)
    current_index = Column(Integer, default=0, nullable=False)
    current_item_started_at = Column(DateTime, nullable=True)
    device_fingerprint_hash = Column(String(128), nullable=True)
    risk_flags_json = Column(JSON, nullable=True)

    project = relationship("Project", back_populates="sessions")
    questionnaire = relationship("Questionnaire", back_populates="sessions")
    responses = relationship("SurveyResponse", back_populates="session", cascade="all, delete-orphan")
    events = relationship("EventLog", back_populates="session", cascade="all, delete-orphan")


class SurveyResponse(Base):
    __tablename__ = "survey_responses"
    __table_args__ = (UniqueConstraint("session_id", "item_id", name="uq_session_item"),)

    id = Column(String(36), primary_key=True, default=lambda: str(uuid4()))
    project_id = Column(String(36), ForeignKey("projects.id", ondelete="CASCADE"), index=True, nullable=False)
    session_id = Column(String(36), ForeignKey("survey_sessions.id", ondelete="CASCADE"), index=True, nullable=False)
    item_id = Column(String(120), index=True, nullable=False)
    answer_json = Column(JSON, nullable=True)
    duration_ms = Column(Integer, nullable=False)
    present_position = Column(Integer, nullable=False)
    submitted_at = Column(DateTime, default=utcnow, nullable=False)

    project = relationship("Project", back_populates="responses")
    session = relationship("SurveySession", back_populates="responses")


class EventLog(Base):
    __tablename__ = "event_logs"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid4()))
    project_id = Column(String(36), ForeignKey("projects.id", ondelete="CASCADE"), index=True, nullable=False)
    session_id = Column(String(36), ForeignKey("survey_sessions.id", ondelete="CASCADE"), index=True, nullable=False)
    item_id = Column(String(120), nullable=True, index=True)
    event_type = Column(String(80), index=True, nullable=False)
    client_ts = Column(DateTime, nullable=True)
    server_ts = Column(DateTime, default=utcnow, index=True, nullable=False)
    payload_json = Column(JSON, nullable=True)

    project = relationship("Project", back_populates="event_logs")
    session = relationship("SurveySession", back_populates="events")


class ExportRecord(Base):
    __tablename__ = "export_records"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid4()))
    project_id = Column(String(36), ForeignKey("projects.id", ondelete="CASCADE"), index=True, nullable=False)
    file_name = Column(String(255), nullable=False)
    file_path = Column(String(500), nullable=True)
    generated_at = Column(DateTime, default=utcnow, nullable=False)

    project = relationship("Project", back_populates="export_records")
