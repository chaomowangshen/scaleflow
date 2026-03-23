from io import BytesIO

import openpyxl
import pytest


CANONICAL_ORDER = ["q1", "q2", "q3", "q4"]


def make_payload(project_key: str, randomize_groups: bool, randomize_items: bool):
    return {
        "project": {
            "project_key": project_key,
            "name": f"项目-{project_key}",
            "description": "随机化测试",
        },
        "questionnaire": {
            "id": "rand_q",
            "version": "1.0.0",
            "title": "随机量表",
            "consent_enabled": False,
            "randomization": {
                "randomize_groups": randomize_groups,
                "randomize_items": randomize_items,
            },
            "groups": [
                {
                    "group_id": "g1",
                    "title": "组1",
                    "items": [
                        {
                            "item_id": "q1",
                            "type": "likert",
                            "stem": "题1",
                            "required": True,
                            "options": [{"value": 1, "label": "低"}, {"value": 2, "label": "高"}],
                        },
                        {
                            "item_id": "q2",
                            "type": "likert",
                            "stem": "题2",
                            "required": True,
                            "options": [{"value": 1, "label": "低"}, {"value": 2, "label": "高"}],
                        },
                    ],
                },
                {
                    "group_id": "g2",
                    "title": "组2",
                    "items": [
                        {
                            "item_id": "q3",
                            "type": "likert",
                            "stem": "题3",
                            "required": True,
                            "options": [{"value": 1, "label": "低"}, {"value": 2, "label": "高"}],
                        },
                        {
                            "item_id": "q4",
                            "type": "likert",
                            "stem": "题4",
                            "required": True,
                            "options": [{"value": 1, "label": "低"}, {"value": 2, "label": "高"}],
                        },
                    ],
                },
            ],
        },
    }


def create_project_and_link(client, auth_headers, *, randomize_groups: bool, randomize_items: bool, key: str):
    imported = client.post(
        "/admin/projects/import",
        json=make_payload(key, randomize_groups=randomize_groups, randomize_items=randomize_items),
        headers=auth_headers,
    )
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


def test_resume_and_no_backtracking(client, auth_headers):
    _, _, token = create_project_and_link(
        client,
        auth_headers,
        randomize_groups=True,
        randomize_items=True,
        key="resume_test",
    )

    first_start = client.get(f"/survey/{token}/start")
    assert first_start.status_code == 200
    first_item = first_start.json()["next_item"]["item_id"]

    second_start = client.get(f"/survey/{token}/start")
    assert second_start.status_code == 200
    assert second_start.json()["next_item"]["item_id"] == first_item

    submit_first = client.post(
        f"/survey/{token}/items/{first_item}/submit",
        json={"answer": 1, "events": [{"event_type": "focus"}]},
    )
    assert submit_first.status_code == 200, submit_first.text
    next_item = submit_first.json()["next_item"]["item_id"]
    assert next_item != first_item

    backtrack = client.post(
        f"/survey/{token}/items/{first_item}/submit",
        json={"answer": 1, "events": []},
    )
    assert backtrack.status_code == 409


@pytest.mark.parametrize(
    ("randomize_groups", "randomize_items"),
    [(False, False), (True, False), (False, True), (True, True)],
)
def test_randomization_and_export_matrix(client, auth_headers, randomize_groups, randomize_items):
    project_id, questionnaire_id, token = create_project_and_link(
        client,
        auth_headers,
        randomize_groups=randomize_groups,
        randomize_items=randomize_items,
        key=f"rand_{int(randomize_groups)}_{int(randomize_items)}",
    )

    presented_order: list[str] = []
    start = client.get(f"/survey/{token}/start")
    assert start.status_code == 200, start.text
    payload = start.json()
    assert payload["total_items"] == 4

    current_item = payload["next_item"]
    while current_item is not None:
        item_id = current_item["item_id"]
        presented_order.append(item_id)
        submit = client.post(
            f"/survey/{token}/items/{item_id}/submit",
            json={"answer": 1, "events": [{"event_type": "change"}]},
        )
        assert submit.status_code == 200, submit.text
        current_item = submit.json()["next_item"]

    assert sorted(presented_order) == sorted(CANONICAL_ORDER)

    exported = client.get(f"/admin/exports/{project_id}?questionnaire_id={questionnaire_id}", headers=auth_headers)
    assert exported.status_code == 200, exported.text

    wb = openpyxl.load_workbook(BytesIO(exported.content))
    assert wb.sheetnames == ["答题", "时长", "顺序"]

    ws_answer = wb["答题"]
    ws_duration = wb["时长"]
    ws_order = wb["顺序"]

    answer_header = [cell.value for cell in ws_answer[1]]
    duration_header = [cell.value for cell in ws_duration[1]]
    order_header = [cell.value for cell in ws_order[1]]

    assert answer_header == duration_header == order_header
    assert answer_header[5:] == CANONICAL_ORDER

    answer_row = [cell.value for cell in ws_answer[2]]
    duration_row = [cell.value for cell in ws_duration[2]]
    order_row = [cell.value for cell in ws_order[2]]

    expected_positions = [presented_order.index(item_id) + 1 for item_id in CANONICAL_ORDER]
    assert order_row[5:] == expected_positions
    assert all(value == 1 for value in answer_row[5:])
    assert all((value is None) or (isinstance(value, int) and value >= 0) for value in duration_row[5:])

