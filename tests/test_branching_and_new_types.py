from io import BytesIO

import openpyxl


def make_branch_payload(project_key: str, *, randomize_items: bool = False):
    return {
        "project": {
            "project_key": project_key,
            "name": f"分支项目-{project_key}",
            "description": "分支与新题型测试",
        },
        "questionnaire": {
            "id": "branch_q",
            "version": "1.0.0",
            "title": "分支量表",
            "consent_enabled": False,
            "randomization": {"randomize_groups": False, "randomize_items": randomize_items},
            "groups": [
                {
                    "group_id": "g_branch",
                    "title": "分支块",
                    "flow_mode": "branch",
                    "items": [
                        {
                            "item_id": "q1",
                            "type": "single_choice",
                            "stem": "是否进入后续题？",
                            "required": False,
                            "options": [{"value": "yes", "label": "是"}, {"value": "no", "label": "否"}],
                            "routing": {"yes": "q3", "no": "__END_BLOCK__"},
                        },
                        {
                            "item_id": "q2",
                            "type": "blank",
                            "stem": "被跳过时应记为-1",
                            "required": False,
                        },
                        {
                            "item_id": "q3",
                            "type": "multiple_choice",
                            "stem": "多选题",
                            "required": False,
                            "options": [
                                {"value": "workload", "label": "工作量"},
                                {"value": "manager", "label": "管理关系"},
                                {"value": "commute", "label": "通勤"},
                            ],
                        },
                    ],
                },
                {
                    "group_id": "g_tail",
                    "title": "收尾块",
                    "flow_mode": "linear",
                    "items": [
                        {
                            "item_id": "q4",
                            "type": "text",
                            "stem": "补充描述",
                            "required": False,
                        }
                    ],
                },
            ],
        },
    }


def import_project_and_token(client, auth_headers, payload):
    imported = client.post("/admin/projects/import", json=payload, headers=auth_headers)
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


def test_invalid_branch_routing_is_rejected(client, auth_headers):
    payload_linear_with_routing = make_branch_payload("invalid_linear")
    payload_linear_with_routing["questionnaire"]["groups"][0]["flow_mode"] = "linear"
    imported_linear = client.post("/admin/projects/import", json=payload_linear_with_routing, headers=auth_headers)
    assert imported_linear.status_code == 400
    assert "routing requires branch flow_mode" in imported_linear.json()["detail"]

    payload_backward = make_branch_payload("invalid_backward")
    payload_backward["questionnaire"]["groups"][0]["items"][0]["routing"] = {"yes": "q1"}
    imported_backward = client.post("/admin/projects/import", json=payload_backward, headers=auth_headers)
    assert imported_backward.status_code == 400
    assert "routing target must be a later item" in imported_backward.json()["detail"]

    payload_cross_group = make_branch_payload("invalid_cross")
    payload_cross_group["questionnaire"]["groups"][0]["items"][0]["routing"] = {"yes": "q4"}
    imported_cross_group = client.post("/admin/projects/import", json=payload_cross_group, headers=auth_headers)
    assert imported_cross_group.status_code == 400
    assert "routing target q4 not in same group" in imported_cross_group.json()["detail"]


def test_branch_jump_and_export_with_logic_skip_minus_one(client, auth_headers):
    payload = make_branch_payload("branch_export")
    project_id, questionnaire_id, token = import_project_and_token(client, auth_headers, payload)

    start = client.get(f"/survey/{token}/start")
    assert start.status_code == 200, start.text
    assert start.json()["next_item"]["item_id"] == "q1"

    jump = client.post(
        f"/survey/{token}/items/q1/submit",
        json={"answer": "yes", "events": [{"event_type": "change"}]},
    )
    assert jump.status_code == 200, jump.text
    assert jump.json()["next_item"]["item_id"] == "q3"

    wrong_multi = client.post(
        f"/survey/{token}/items/q3/submit",
        json={"answer": "workload", "events": []},
    )
    assert wrong_multi.status_code == 422

    multi_ok = client.post(
        f"/survey/{token}/items/q3/submit",
        json={"answer": ["workload"], "events": [{"event_type": "change"}]},
    )
    assert multi_ok.status_code == 200, multi_ok.text
    assert multi_ok.json()["next_item"]["item_id"] == "q4"

    done = client.post(
        f"/survey/{token}/items/q4/submit",
        json={"answer": "补充说明", "events": [{"event_type": "change"}]},
    )
    assert done.status_code == 200, done.text
    assert done.json()["completed"] is True
    assert done.json()["next_item"] is None

    exported = client.get(f"/admin/exports/{project_id}?questionnaire_id={questionnaire_id}", headers=auth_headers)
    assert exported.status_code == 200, exported.text
    wb = openpyxl.load_workbook(BytesIO(exported.content))

    ws_answer = wb["答题"]
    ws_duration = wb["时长"]
    ws_order = wb["顺序"]

    answer_header = [cell.value for cell in ws_answer[1]]
    assert answer_header[5:] == ["q1", "q2", "q3", "q4"]

    answer_row = [cell.value for cell in ws_answer[2]][5:]
    duration_row = [cell.value for cell in ws_duration[2]][5:]
    order_row = [cell.value for cell in ws_order[2]][5:]

    assert answer_row[0] == "yes"
    assert answer_row[1] == -1
    assert isinstance(answer_row[2], str) and "workload" in answer_row[2]
    assert answer_row[3] == "补充说明"

    assert duration_row[1] == -1
    assert all(isinstance(value, int) and value >= 0 for idx, value in enumerate(duration_row) if idx != 1)

    assert order_row == [1, -1, 2, 3]


def test_branch_optional_single_choice_empty_answer_ends_block(client, auth_headers):
    payload = make_branch_payload("branch_null_skip")
    _, _, token = import_project_and_token(client, auth_headers, payload)

    start = client.get(f"/survey/{token}/start")
    assert start.status_code == 200
    assert start.json()["next_item"]["item_id"] == "q1"

    skip_block = client.post(
        f"/survey/{token}/items/q1/submit",
        json={"answer": None, "events": [{"event_type": "skip"}]},
    )
    assert skip_block.status_code == 200, skip_block.text
    assert skip_block.json()["next_item"]["item_id"] == "q4"


def test_branch_group_keeps_item_order_when_randomize_items_enabled(client, auth_headers):
    payload = {
        "project": {
            "project_key": "branch_randomize_guard",
            "name": "分支随机保护",
            "description": "分支块内顺序固定",
        },
        "questionnaire": {
            "id": "branch_keep_order_q",
            "version": "1.0.0",
            "title": "分支顺序测试",
            "consent_enabled": False,
            "randomization": {"randomize_groups": False, "randomize_items": True},
            "groups": [
                {
                    "group_id": "g_branch",
                    "title": "分支块",
                    "flow_mode": "branch",
                    "items": [
                        {
                            "item_id": "b1",
                            "type": "likert",
                            "stem": "题1",
                            "required": True,
                            "options": [{"value": 1, "label": "低"}, {"value": 2, "label": "高"}],
                        },
                        {
                            "item_id": "b2",
                            "type": "likert",
                            "stem": "题2",
                            "required": True,
                            "options": [{"value": 1, "label": "低"}, {"value": 2, "label": "高"}],
                        },
                        {
                            "item_id": "b3",
                            "type": "likert",
                            "stem": "题3",
                            "required": True,
                            "options": [{"value": 1, "label": "低"}, {"value": 2, "label": "高"}],
                        },
                    ],
                }
            ],
        },
    }
    imported = client.post("/admin/projects/import", json=payload, headers=auth_headers)
    assert imported.status_code == 201, imported.text
    questionnaire_id = imported.json()["questionnaire_id"]

    links = client.post(
        f"/admin/questionnaires/{questionnaire_id}/links/batch",
        json={"count": 3},
        headers=auth_headers,
    )
    assert links.status_code == 201, links.text
    tokens = links.json()["links"]

    for token in tokens:
        start = client.get(f"/survey/{token}/start")
        assert start.status_code == 200, start.text
        current_item = start.json()["next_item"]
        seen_order = []
        while current_item is not None:
            seen_order.append(current_item["item_id"])
            submit = client.post(
                f"/survey/{token}/items/{current_item['item_id']}/submit",
                json={"answer": 1, "events": [{"event_type": "change"}]},
            )
            assert submit.status_code == 200, submit.text
            current_item = submit.json()["next_item"]

        assert seen_order == ["b1", "b2", "b3"]
