def make_import_payload(project_key: str = "project_alpha"):
    return {
        "project": {
            "project_key": project_key,
            "name": "项目A",
            "description": "测试项目",
        },
        "questionnaire": {
            "id": "qset_v1",
            "version": "1.0.0",
            "title": "测试量表",
            "consent_enabled": False,
            "randomization": {"randomize_groups": True, "randomize_items": True},
            "groups": [
                {
                    "group_id": "g1",
                    "title": "组1",
                    "items": [
                        {
                            "item_id": "q1",
                            "type": "likert",
                            "stem": "问题1",
                            "required": True,
                            "options": [{"value": 1, "label": "低"}, {"value": 2, "label": "高"}],
                        },
                        {
                            "item_id": "q2",
                            "type": "likert",
                            "stem": "问题2",
                            "required": True,
                            "options": [{"value": 1, "label": "低"}, {"value": 2, "label": "高"}],
                        },
                    ],
                }
            ],
        },
    }


def test_project_import_and_delete_lifecycle(client, auth_headers):
    payload = make_import_payload()

    imported = client.post("/admin/projects/import", json=payload, headers=auth_headers)
    assert imported.status_code == 201, imported.text
    imported_json = imported.json()
    project_id = imported_json["project_id"]
    questionnaire_id = imported_json["questionnaire_id"]

    duplicate = client.post("/admin/projects/import", json=payload, headers=auth_headers)
    assert duplicate.status_code == 409

    links_resp = client.post(
        f"/admin/questionnaires/{questionnaire_id}/links/batch",
        json={"count": 1},
        headers=auth_headers,
    )
    assert links_resp.status_code == 201, links_resp.text
    token = links_resp.json()["links"][0]

    start_ok = client.get(f"/survey/{token}/start")
    assert start_ok.status_code == 200, start_ok.text

    wrong_confirm = client.delete(
        f"/admin/projects/{project_id}",
        json={"confirm_project_name": "不是这个项目"},
        headers=auth_headers,
    )
    assert wrong_confirm.status_code == 400

    deleted = client.delete(
        f"/admin/projects/{project_id}",
        json={"confirm_project_name": "项目A"},
        headers=auth_headers,
    )
    assert deleted.status_code == 200, deleted.text
    assert deleted.json()["delete_status"] == "pending_purge"

    start_after_delete = client.get(f"/survey/{token}/start")
    assert start_after_delete.status_code == 404

    purged = client.post(f"/admin/projects/{project_id}/purge", headers=auth_headers)
    assert purged.status_code == 200, purged.text
    assert purged.json()["delete_status"] == "purged"
    assert purged.json()["deleted_counts"]["questionnaires"] >= 1

    projects = client.get("/admin/projects", headers=auth_headers)
    assert projects.status_code == 200
    ids = {row["id"] for row in projects.json()["projects"]}
    assert project_id not in ids

