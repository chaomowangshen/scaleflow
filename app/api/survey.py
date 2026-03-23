from __future__ import annotations

import hashlib
from typing import Any
from uuid import uuid4

from fastapi import APIRouter, Depends, Header, HTTPException, status
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import EventLog, Questionnaire, SurveyLink, SurveyResponse, SurveySession, utcnow
from ..schemas import ConsentRequest, SubmitItemRequest, SubmitItemResponse, SurveyItemPayload, SurveyStartResponse
from ..services.projects import PROJECT_ACTIVE
from ..services.questionnaire import (
    END_BLOCK_SENTINEL,
    FLOW_MODE_BRANCH,
    build_canonical_order,
    build_item_lookup,
    build_present_order,
    validate_answer,
)


router = APIRouter(prefix="/survey", tags=["survey"])

DEFAULT_CONSENT_TEXT = (
    "继续作答即表示你已知悉：本问卷用于研究分析，题目将逐一展示，系统会记录每题作答时间和交互事件。"
    "你可以选择同意并继续，或拒绝并结束本次作答。"
)


def _hash_fingerprint(raw: str | None) -> str | None:
    if not raw:
        return None
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


def _get_link_and_session(db: Session, token: str) -> tuple[SurveyLink, SurveySession, Questionnaire]:
    link = db.query(SurveyLink).filter(SurveyLink.token == token).first()
    if not link:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Invalid link")
    if link.project.delete_status != PROJECT_ACTIVE:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not available")
    if link.status == "completed":
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Link already completed")
    if link.status == "expired":
        raise HTTPException(status_code=status.HTTP_410_GONE, detail="Link expired")
    if link.expires_at and link.expires_at < utcnow():
        link.status = "expired"
        db.add(link)
        db.commit()
        raise HTTPException(status_code=status.HTTP_410_GONE, detail="Link expired")

    questionnaire = db.query(Questionnaire).filter(Questionnaire.id == link.questionnaire_id).first()
    if not questionnaire:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Questionnaire not found")

    session = db.query(SurveySession).filter(SurveySession.link_id == link.id).first()
    if not session:
        session_id = str(uuid4())
        structure = questionnaire.structure_json
        canonical_order = build_canonical_order(structure)
        present_order = build_present_order(
            structure,
            seed=session_id,
            randomize_groups=questionnaire.randomize_groups,
            randomize_items=questionnaire.randomize_items,
        )
        session = SurveySession(
            id=session_id,
            project_id=link.project_id,
            questionnaire_id=questionnaire.id,
            link_id=link.id,
            participant_id=f"P{uuid4().hex[:10]}",
            status="in_progress",
            consent_given=not questionnaire.consent_enabled,
            canonical_order_json=canonical_order,
            present_order_json=present_order,
            current_index=0,
            current_item_started_at=utcnow(),
            risk_flags_json=[],
        )
        db.add(session)
        db.flush()
        link.session_id = session.id
        db.add(link)
        db.commit()
        db.refresh(session)
    return link, session, questionnaire


def _questionnaire_consent_text(questionnaire: Questionnaire) -> str | None:
    if not questionnaire.consent_enabled:
        return None
    raw = (questionnaire.structure_json or {}).get("consent_text")
    if isinstance(raw, str):
        stripped = raw.strip()
        if stripped:
            return stripped
    return DEFAULT_CONSENT_TEXT


def _session_next_item(session: SurveySession, questionnaire: Questionnaire) -> SurveyItemPayload | None:
    if session.status != "in_progress":
        return None
    if questionnaire.consent_enabled and not session.consent_given:
        return None

    order = session.present_order_json or []
    if session.current_index >= len(order):
        return None

    next_item_id = order[session.current_index]
    lookup = build_item_lookup(questionnaire.structure_json)
    item = lookup[next_item_id]
    return SurveyItemPayload(
        item_id=item["item_id"],
        group_id=item["group_id"],
        group_flow_mode=item.get("group_flow_mode", "linear"),
        type=item["type"],
        stem=item["stem"],
        required=item.get("required", True),
        options=item.get("options"),
    )


def _resolve_next_index(
    *,
    order: list[str],
    current_index: int,
    item_def: dict[str, Any],
    answer: Any,
    lookup: dict[str, dict[str, Any]],
) -> tuple[int, str | None, list[str]]:
    default_next = current_index + 1
    if item_def.get("type") != "single_choice" or item_def.get("group_flow_mode") != FLOW_MODE_BRANCH:
        return default_next, None, []

    group_id = item_def.get("group_id")
    block_end = current_index
    while block_end + 1 < len(order):
        next_item_id = order[block_end + 1]
        next_item_def = lookup.get(next_item_id) or {}
        if next_item_def.get("group_id") != group_id:
            break
        block_end += 1

    routing = item_def.get("routing") or {}
    if answer is None or answer == "":
        route_target = END_BLOCK_SENTINEL
    else:
        route_target = routing.get(str(answer), END_BLOCK_SENTINEL)

    if route_target == END_BLOCK_SENTINEL:
        next_index = block_end + 1
    else:
        try:
            next_index = order.index(route_target)
        except ValueError as exc:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Invalid routing target at runtime for item {item_def.get('item_id')}",
            ) from exc
        if next_index <= current_index:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Invalid routing direction for item {item_def.get('item_id')}",
            )

    skipped_item_ids = order[current_index + 1 : next_index]
    return next_index, route_target, skipped_item_ids


@router.get("/{token}/start", response_model=SurveyStartResponse)
def start_survey(
    token: str,
    x_device_fingerprint: str | None = Header(default=None),
    db: Session = Depends(get_db),
) -> SurveyStartResponse:
    link, session, questionnaire = _get_link_and_session(db, token)
    now = utcnow()

    if session.status == "completed":
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Session already completed")

    fingerprint_hash = _hash_fingerprint(x_device_fingerprint)
    if fingerprint_hash:
        if not session.device_fingerprint_hash:
            session.device_fingerprint_hash = fingerprint_hash
        elif session.device_fingerprint_hash != fingerprint_hash:
            flags = list(session.risk_flags_json or [])
            if "fingerprint_changed" not in flags:
                flags.append("fingerprint_changed")
                session.risk_flags_json = flags
                db.add(
                    EventLog(
                        project_id=session.project_id,
                        session_id=session.id,
                        item_id=None,
                        event_type="risk_fingerprint_changed",
                        payload_json={"note": "Fingerprint changed for same link/session"},
                    )
                )

    session.last_seen_at = now
    if session.status == "in_progress":
        # Re-entering should restart timing from current display moment.
        session.current_item_started_at = now
    db.add(session)
    db.commit()
    db.refresh(session)

    next_item = _session_next_item(session, questionnaire)
    return SurveyStartResponse(
        session_id=session.id,
        participant_id=session.participant_id,
        status=session.status,
        requires_consent=questionnaire.consent_enabled,
        consent_given=session.consent_given,
        consent_text=_questionnaire_consent_text(questionnaire),
        current_index=session.current_index,
        total_items=len(session.present_order_json or []),
        next_item=next_item,
    )


@router.post("/{token}/consent", response_model=SurveyStartResponse)
def submit_consent(
    token: str,
    payload: ConsentRequest,
    db: Session = Depends(get_db),
) -> SurveyStartResponse:
    link, session, questionnaire = _get_link_and_session(db, token)
    if not questionnaire.consent_enabled:
        return SurveyStartResponse(
            session_id=session.id,
            participant_id=session.participant_id,
            status=session.status,
            requires_consent=False,
            consent_given=True,
            consent_text=_questionnaire_consent_text(questionnaire),
            current_index=session.current_index,
            total_items=len(session.present_order_json or []),
            next_item=_session_next_item(session, questionnaire),
        )

    if session.status != "in_progress":
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Session is not active")

    if not payload.accepted:
        session.status = "abandoned"
        session.completed_at = utcnow()
        link.status = "completed"
    else:
        session.consent_given = True
        session.current_item_started_at = utcnow()

    db.add(session)
    db.add(link)
    db.commit()
    db.refresh(session)

    return SurveyStartResponse(
        session_id=session.id,
        participant_id=session.participant_id,
        status=session.status,
        requires_consent=questionnaire.consent_enabled,
        consent_given=session.consent_given,
        consent_text=_questionnaire_consent_text(questionnaire),
        current_index=session.current_index,
        total_items=len(session.present_order_json or []),
        next_item=_session_next_item(session, questionnaire),
    )


@router.post("/{token}/items/{item_id}/submit", response_model=SubmitItemResponse)
def submit_item(
    token: str,
    item_id: str,
    payload: SubmitItemRequest,
    db: Session = Depends(get_db),
) -> SubmitItemResponse:
    link, session, questionnaire = _get_link_and_session(db, token)
    if session.status != "in_progress":
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Session is not active")
    if questionnaire.consent_enabled and not session.consent_given:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Consent required before answering")

    order = session.present_order_json or []
    if session.current_index >= len(order):
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="No remaining items to submit")

    expected_item_id = order[session.current_index]
    if expected_item_id != item_id:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Out-of-order submit. Expected item: {expected_item_id}",
        )

    lookup = build_item_lookup(questionnaire.structure_json)
    item_def = lookup.get(item_id)
    if not item_def:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Item not found")
    validate_answer(item_def, payload.answer)
    answer_value = payload.answer
    if item_def.get("type") == "multiple_choice" and answer_value is None:
        answer_value = []

    now = utcnow()
    if session.current_item_started_at is None:
        session.current_item_started_at = now

    elapsed = now - session.current_item_started_at
    duration_ms = max(0, int(elapsed.total_seconds() * 1000))
    answered_count = db.query(SurveyResponse).filter(SurveyResponse.session_id == session.id).count()
    present_position = answered_count + 1

    next_index, route_target, skipped_item_ids = _resolve_next_index(
        order=order,
        current_index=session.current_index,
        item_def=item_def,
        answer=answer_value,
        lookup=lookup,
    )

    response_row = SurveyResponse(
        project_id=session.project_id,
        session_id=session.id,
        item_id=item_id,
        answer_json=answer_value,
        duration_ms=duration_ms,
        present_position=present_position,
        submitted_at=now,
    )
    db.add(response_row)

    for event in payload.events:
        db.add(
            EventLog(
                project_id=session.project_id,
                session_id=session.id,
                item_id=item_id,
                event_type=event.event_type,
                client_ts=event.client_ts,
                payload_json=event.payload,
            )
        )

    db.add(
        EventLog(
            project_id=session.project_id,
            session_id=session.id,
            item_id=item_id,
            event_type="submit",
            payload_json={"duration_ms": duration_ms, "present_position": present_position},
        )
    )

    if route_target is not None and next_index != session.current_index + 1:
        db.add(
            EventLog(
                project_id=session.project_id,
                session_id=session.id,
                item_id=item_id,
                event_type="logic_jump",
                payload_json={
                    "from_item_id": item_id,
                    "to_item_id": route_target,
                    "skipped_item_ids": skipped_item_ids,
                },
            )
        )

    session.current_index = next_index
    session.last_seen_at = now

    completed = session.current_index >= len(order)
    if completed:
        session.status = "completed"
        session.completed_at = now
        session.current_item_started_at = None
        link.status = "completed"
    else:
        session.current_item_started_at = now

    db.add(session)
    db.add(link)
    db.commit()
    db.refresh(session)

    return SubmitItemResponse(
        session_id=session.id,
        submitted_item_id=item_id,
        duration_ms=duration_ms,
        present_position=present_position,
        completed=completed,
        next_item=_session_next_item(session, questionnaire),
        current_index=session.current_index,
    )


@router.post("/{token}/complete")
def complete_session(token: str, db: Session = Depends(get_db)) -> dict[str, Any]:
    link, session, questionnaire = _get_link_and_session(db, token)
    order = session.present_order_json or []
    if session.current_index < len(order):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="There are unanswered items")

    now = utcnow()
    session.status = "completed"
    session.completed_at = now
    link.status = "completed"
    db.add(session)
    db.add(link)
    db.commit()

    return {"session_id": session.id, "status": session.status, "completed_at": session.completed_at}
