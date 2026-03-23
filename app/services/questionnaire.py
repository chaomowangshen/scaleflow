from __future__ import annotations

from copy import deepcopy
import random
from typing import Any

from fastapi import HTTPException, status

FLOW_MODE_LINEAR = "linear"
FLOW_MODE_BRANCH = "branch"
END_BLOCK_SENTINEL = "__END_BLOCK__"
CHOICE_TYPES = {"likert", "single_choice", "multiple_choice"}
SUPPORTED_ITEM_TYPES = {"likert", "blank", "text", "single_choice", "multiple_choice"}


def normalize_questionnaire_structure(questionnaire: dict) -> dict:
    normalized = deepcopy(questionnaire)
    groups = normalized.get("groups") or []
    for group in groups:
        items = group.get("items") or []
        expanded_items: list[dict[str, Any]] = []
        for item in items:
            item_type = item.get("type")
            stem = item.get("stem")
            if item_type == "likert" and isinstance(stem, list):
                base_item_id = item.get("item_id")
                for idx, stem_text in enumerate(stem, start=1):
                    cloned = dict(item)
                    cloned["item_id"] = f"{base_item_id}_{idx}"
                    cloned["stem"] = stem_text
                    expanded_items.append(cloned)
            else:
                expanded_items.append(item)
        group["items"] = expanded_items
    return normalized


def validate_questionnaire_structure(questionnaire: dict) -> None:
    groups = questionnaire.get("groups") or []
    seen_group_ids: set[str] = set()
    seen_item_ids: set[str] = set()

    if not groups:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Questionnaire requires groups")

    for group in groups:
        group_id = group.get("group_id")
        if not group_id:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="group_id is required")
        if group_id in seen_group_ids:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Duplicate group_id: {group_id}",
            )
        seen_group_ids.add(group_id)

        flow_mode = group.get("flow_mode") or FLOW_MODE_LINEAR
        if flow_mode not in {FLOW_MODE_LINEAR, FLOW_MODE_BRANCH}:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Unsupported flow_mode for group {group_id}: {flow_mode}",
            )

        items = group.get("items") or []
        if not items:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Group {group_id} has no items",
            )

        local_item_order: list[str] = []
        for item in items:
            item_id = item.get("item_id")
            if not item_id:
                raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="item_id is required")
            if item_id in seen_item_ids:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Duplicate item_id: {item_id}",
                )
            seen_item_ids.add(item_id)
            local_item_order.append(item_id)

            item_type = item.get("type")
            if item_type not in SUPPORTED_ITEM_TYPES:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Unsupported item type for {item_id}: {item_type}",
                )
            if item_type != "likert" and isinstance(item.get("stem"), list):
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"stem list is only supported for likert ({item_id})",
                )
            if item_type in CHOICE_TYPES and not item.get("options"):
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Choice item {item_id} requires options",
                )
            routing = item.get("routing")
            if routing and item_type != "single_choice":
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"routing is only supported on single_choice ({item_id})",
                )

        local_index = {item_id: idx for idx, item_id in enumerate(local_item_order)}
        local_item_set = set(local_item_order)
        for idx, item in enumerate(items):
            if item.get("type") != "single_choice":
                continue

            routing = item.get("routing") or {}
            if routing and flow_mode != FLOW_MODE_BRANCH:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"routing requires branch flow_mode ({item['item_id']})",
                )
            if not isinstance(routing, dict):
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"routing must be an object ({item['item_id']})",
                )
            option_values = {str(opt.get("value")) for opt in (item.get("options") or [])}
            for route_key, route_target in routing.items():
                if str(route_key) not in option_values:
                    raise HTTPException(
                        status_code=status.HTTP_400_BAD_REQUEST,
                        detail=f"routing key {route_key} is not a valid option for {item['item_id']}",
                    )
                if route_target == END_BLOCK_SENTINEL:
                    continue
                if route_target not in local_item_set:
                    raise HTTPException(
                        status_code=status.HTTP_400_BAD_REQUEST,
                        detail=f"routing target {route_target} not in same group for {item['item_id']}",
                    )
                if local_index[route_target] <= idx:
                    raise HTTPException(
                        status_code=status.HTTP_400_BAD_REQUEST,
                        detail=f"routing target must be a later item for {item['item_id']}",
                    )


def build_canonical_order(questionnaire: dict) -> list[str]:
    order: list[str] = []
    for group in questionnaire.get("groups", []):
        for item in group.get("items", []):
            order.append(item["item_id"])
    return order


def build_present_order(
    questionnaire: dict,
    *,
    seed: str,
    randomize_groups: bool,
    randomize_items: bool,
) -> list[str]:
    rng = random.Random(seed)
    groups = list(questionnaire.get("groups", []))
    if randomize_groups:
        rng.shuffle(groups)

    result: list[str] = []
    for group in groups:
        items = list(group.get("items", []))
        flow_mode = group.get("flow_mode") or FLOW_MODE_LINEAR
        if randomize_items and flow_mode != FLOW_MODE_BRANCH:
            rng.shuffle(items)
        for item in items:
            result.append(item["item_id"])
    return result


def build_item_lookup(questionnaire: dict) -> dict[str, dict[str, Any]]:
    lookup: dict[str, dict[str, Any]] = {}
    for group in questionnaire.get("groups", []):
        group_id = group["group_id"]
        group_flow_mode = group.get("flow_mode") or FLOW_MODE_LINEAR
        for item in group.get("items", []):
            payload = dict(item)
            payload["group_id"] = group_id
            payload["group_flow_mode"] = group_flow_mode
            lookup[item["item_id"]] = payload
    return lookup


def validate_answer(item: dict, answer: Any) -> None:
    item_type = item.get("type")
    required = bool(item.get("required", True))
    if required and (answer is None or answer == "" or (item_type == "multiple_choice" and isinstance(answer, list) and len(answer) == 0)):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Item {item['item_id']} is required",
        )

    if item_type in {"likert", "single_choice"}:
        if answer is None or answer == "":
            return
        options = item.get("options", [])
        allowed = {str(opt["value"]) for opt in options}
        if str(answer) not in allowed:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=f"Invalid option for item {item['item_id']}",
            )
        return

    if item_type == "multiple_choice":
        if answer is None:
            selections = []
        elif isinstance(answer, list):
            selections = answer
        else:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=f"Answer for item {item['item_id']} must be an array",
            )

        normalized = [str(value) for value in selections]
        if len(normalized) != len(set(normalized)):
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=f"Duplicate options for item {item['item_id']}",
            )

        options = item.get("options", [])
        allowed = {str(opt["value"]) for opt in options}
        invalid_values = [value for value in normalized if value not in allowed]
        if invalid_values:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=f"Invalid option for item {item['item_id']}",
            )

        constraints = item.get("constraints") or {}
        min_choices = constraints.get("min_choices")
        max_choices = constraints.get("max_choices")
        if min_choices is None:
            min_choices = 1 if required else 0
        if max_choices is None:
            max_choices = len(allowed)
        if not isinstance(min_choices, int) or not isinstance(max_choices, int):
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=f"Invalid choice constraints for item {item['item_id']}",
            )
        if min_choices < 0 or max_choices < 0 or min_choices > max_choices:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=f"Invalid choice constraints for item {item['item_id']}",
            )
        if len(normalized) < min_choices or len(normalized) > max_choices:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=f"Invalid number of selections for item {item['item_id']}",
            )
        return

    if item_type in {"blank", "text"} and answer is not None and not isinstance(answer, str):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Answer for item {item['item_id']} must be text",
        )
