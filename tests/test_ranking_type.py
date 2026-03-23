from io import BytesIO

import openpyxl


def make_ranking_payload(project_key: str):
    return {
        "project": {
            "project_key": project_key,
            "name": f"排序题项目-{project_key}",
            "description": "ranking 题型测试",
        },
        "questionnaire": {
            "id": "ranking_q",
            "version": "1.0.0",
            "title": "排序题测试量表",
            "consent_enabled": False,
            "randomization": {"randomize_groups": False, "randomize_items": False},
            "groups": [
                {
                    "group_id": "g1",
                    "title": "排序块",
                    "items": [
                        {
                            "item_id": "q_rank_required",
                            "type": "ranking",
                            "stem": "请对以下因素按重要性排序",
                            "required": True,
                            "options": [
                                {"value": "workload", "label": "工作量"},
                                {"value": "manager", "label": "管理关系"},
                                {"value": "commute", "label": "通勤"},
                            ],
                        },
                        {
                            "item_id": "q_rank_optional",
                            "type": "ranking",
                            "stem": "可选排序：若愿意请继续排序",
                            "required": False,
                            "options": [
                                {"value": "salary", "label": "薪资"},
                                {"value": "growth", "label": "成长"},
                                {"value": "culture", "label": "文化"},
                            ],
                        },
                        {
                            "item_id": "q_tail",
                            "type": "text",
                            "stem": "补充",
                            "required": False,
                        },
                    ],
                }
            ],
        },
    }


def import_project_and_token(client, auth_headers, project_key: str):
    imported = client.post("/admin/projects/import", json=make_ranking_payload(project_key), headers=auth_headers)
    assert imported.status_code == 201, imported.text
    body = imported.json()
    project_id = body["project_id"]
    questionnaire_id = body["questionnaire_id"]
    links = client.post(
        f"/admin/questionnaires/{questionnaire_id}/links/batch",
        json={"count": 1},
        headers=auth_headers,
    )
    assert links.status_code == 201, links.text
    token = links.json()["links"][0]
    return project_id, questionnaire_id, token


def start_and_assert_required_item(client, token: str):
    start = client.get(f"/survey/{token}/start")
    assert start.status_code == 200, start.text
    payload = start.json()
    assert payload["next_item"]["item_id"] == "q_rank_required"


def test_ranking_import_validation(client, auth_headers):
    payload_missing_options = make_ranking_payload("ranking_missing_options")
    payload_missing_options["questionnaire"]["groups"][0]["items"][0].pop("options")
    missing_options = client.post("/admin/projects/import", json=payload_missing_options, headers=auth_headers)
    assert missing_options.status_code == 422

    payload_with_routing = make_ranking_payload("ranking_with_routing")
    payload_with_routing["questionnaire"]["groups"][0]["items"][0]["routing"] = {"workload": "q_tail"}
    routing_invalid = client.post("/admin/projects/import", json=payload_with_routing, headers=auth_headers)
    assert routing_invalid.status_code == 422


def test_ranking_submit_validation_rules(client, auth_headers):
    _, _, token = import_project_and_token(client, auth_headers, "ranking_submit_rules")
    start_and_assert_required_item(client, token)

    invalid_type = client.post(
        f"/survey/{token}/items/q_rank_required/submit",
        json={"answer": "workload", "events": []},
    )
    assert invalid_type.status_code == 422

    duplicate_values = client.post(
        f"/survey/{token}/items/q_rank_required/submit",
        json={"answer": ["workload", "workload", "manager"], "events": []},
    )
    assert duplicate_values.status_code == 422

    invalid_option = client.post(
        f"/survey/{token}/items/q_rank_required/submit",
        json={"answer": ["workload", "unknown", "manager"], "events": []},
    )
    assert invalid_option.status_code == 422

    required_not_full = client.post(
        f"/survey/{token}/items/q_rank_required/submit",
        json={"answer": ["workload", "manager"], "events": []},
    )
    assert required_not_full.status_code == 422

    required_ok = client.post(
        f"/survey/{token}/items/q_rank_required/submit",
        json={"answer": ["workload", "manager", "commute"], "events": [{"event_type": "ranking_changed"}]},
    )
    assert required_ok.status_code == 200, required_ok.text
    assert required_ok.json()["next_item"]["item_id"] == "q_rank_optional"

    optional_empty = client.post(
        f"/survey/{token}/items/q_rank_optional/submit",
        json={"answer": [], "events": [{"event_type": "ranking_changed"}]},
    )
    assert optional_empty.status_code == 200, optional_empty.text
    assert optional_empty.json()["next_item"]["item_id"] == "q_tail"

    finish = client.post(
        f"/survey/{token}/items/q_tail/submit",
        json={"answer": "done", "events": []},
    )
    assert finish.status_code == 200, finish.text
    assert finish.json()["completed"] is True


def test_ranking_export_mapping_string_and_partial(client, auth_headers):
    project_id, questionnaire_id, token = import_project_and_token(client, auth_headers, "ranking_export")
    start_and_assert_required_item(client, token)

    submit_required = client.post(
        f"/survey/{token}/items/q_rank_required/submit",
        json={"answer": ["workload", "manager", "commute"], "events": [{"event_type": "ranking_changed"}]},
    )
    assert submit_required.status_code == 200, submit_required.text
    assert submit_required.json()["next_item"]["item_id"] == "q_rank_optional"

    submit_optional_partial = client.post(
        f"/survey/{token}/items/q_rank_optional/submit",
        json={"answer": ["growth", "salary"], "events": [{"event_type": "ranking_changed"}]},
    )
    assert submit_optional_partial.status_code == 200, submit_optional_partial.text
    assert submit_optional_partial.json()["next_item"]["item_id"] == "q_tail"

    submit_tail = client.post(
        f"/survey/{token}/items/q_tail/submit",
        json={"answer": "end", "events": []},
    )
    assert submit_tail.status_code == 200, submit_tail.text
    assert submit_tail.json()["completed"] is True

    exported = client.get(f"/admin/exports/{project_id}?questionnaire_id={questionnaire_id}", headers=auth_headers)
    assert exported.status_code == 200, exported.text

    workbook = openpyxl.load_workbook(BytesIO(exported.content))
    answer_sheet = workbook["答题"]
    header = [cell.value for cell in answer_sheet[1]]
    row = [cell.value for cell in answer_sheet[2]]

    required_idx = header.index("q_rank_required")
    optional_idx = header.index("q_rank_optional")
    tail_idx = header.index("q_tail")

    assert row[required_idx] == "workload:1 | manager:2 | commute:3"
    assert row[optional_idx] == "growth:1 | salary:2"
    assert row[tail_idx] == "end"
