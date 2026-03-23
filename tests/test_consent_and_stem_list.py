def test_likert_stem_list_expands_into_multiple_items(client, auth_headers):
    payload = {
        "project": {
            "project_key": "stem_list_expand_demo",
            "name": "Stem 列表扩展测试",
            "description": "验证 likert stem 列表扩展",
        },
        "questionnaire": {
            "id": "stem_list_q",
            "version": "1.0.0",
            "title": "Stem 列表问卷",
            "consent_enabled": False,
            "randomization": {"randomize_groups": False, "randomize_items": False},
            "groups": [
                {
                    "group_id": "g1",
                    "title": "量表块",
                    "flow_mode": "linear",
                    "items": [
                        {
                            "item_id": "q_likert_batch",
                            "type": "likert",
                            "stem": ["陈述A", "陈述B", "陈述C"],
                            "required": True,
                            "options": [{"value": 1, "label": "低"}, {"value": 2, "label": "高"}],
                        }
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
        json={"count": 1},
        headers=auth_headers,
    )
    assert links.status_code == 201, links.text
    token = links.json()["links"][0]

    start = client.get(f"/survey/{token}/start")
    assert start.status_code == 200, start.text
    body = start.json()
    assert body["total_items"] == 3
    assert body["next_item"]["item_id"] == "q_likert_batch_1"

    submit_1 = client.post(f"/survey/{token}/items/q_likert_batch_1/submit", json={"answer": 1, "events": []})
    assert submit_1.status_code == 200, submit_1.text
    assert submit_1.json()["next_item"]["item_id"] == "q_likert_batch_2"


def test_admin_can_update_consent_text_from_project_detail(client, auth_headers):
    payload = {
        "project": {
            "project_key": "consent_edit_demo",
            "name": "同意文案编辑测试",
            "description": "验证管理端编辑同意文案",
        },
        "questionnaire": {
            "id": "consent_q",
            "version": "1.0.0",
            "title": "同意页问卷",
            "consent_enabled": True,
            "consent_text": "初始文案",
            "randomization": {"randomize_groups": False, "randomize_items": False},
            "groups": [
                {
                    "group_id": "g1",
                    "title": "基本块",
                    "flow_mode": "linear",
                    "items": [
                        {
                            "item_id": "q1",
                            "type": "blank",
                            "stem": "请输入任意内容",
                            "required": False,
                        }
                    ],
                }
            ],
        },
    }

    imported = client.post("/admin/projects/import", json=payload, headers=auth_headers)
    assert imported.status_code == 201, imported.text
    project_id = imported.json()["project_id"]
    questionnaire_id = imported.json()["questionnaire_id"]

    listed = client.get(f"/admin/projects/{project_id}/questionnaires", headers=auth_headers)
    assert listed.status_code == 200, listed.text
    q = listed.json()["questionnaires"][0]
    assert q["consent_enabled"] is True
    assert q["consent_text"] == "初始文案"

    updated = client.patch(
        f"/admin/questionnaires/{questionnaire_id}/settings",
        json={"consent_enabled": True, "consent_text": "这是新的知情同意文案"},
        headers=auth_headers,
    )
    assert updated.status_code == 200, updated.text
    assert updated.json()["consent_text"] == "这是新的知情同意文案"

    links = client.post(
        f"/admin/questionnaires/{questionnaire_id}/links/batch",
        json={"count": 1},
        headers=auth_headers,
    )
    assert links.status_code == 201, links.text
    token = links.json()["links"][0]

    start = client.get(f"/survey/{token}/start")
    assert start.status_code == 200, start.text
    start_body = start.json()
    assert start_body["requires_consent"] is True
    assert start_body["consent_text"] == "这是新的知情同意文案"
