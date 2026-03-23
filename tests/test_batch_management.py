from app import database
from app.models import LinkBatch, SurveyLink


def _import_project(client, auth_headers, *, key: str):
    payload = {
        "project": {
            "project_key": key,
            "name": f"项目-{key}",
            "description": "批次测试项目",
        },
        "questionnaire": {
            "id": "qset_batch",
            "version": "1.0.0",
            "title": "批次测试问卷",
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
                        }
                    ],
                }
            ],
        },
    }
    imported = client.post("/admin/projects/import", json=payload, headers=auth_headers)
    assert imported.status_code == 201, imported.text
    return imported.json()


def test_project_batch_create_list_and_link_details(client, auth_headers):
    imported = _import_project(client, auth_headers, key="batch_api_test")
    project_id = imported["project_id"]
    questionnaire_id = imported["questionnaire_id"]

    created = client.post(
        f"/admin/projects/{project_id}/batches",
        json={"questionnaire_id": questionnaire_id, "count": 3, "expires_in_days": 7},
        headers=auth_headers,
    )
    assert created.status_code == 201, created.text
    created_json = created.json()
    batch_id = created_json["batch_id"]
    assert len(created_json["links"]) == 3

    listed = client.get(f"/admin/projects/{project_id}/batches", headers=auth_headers)
    assert listed.status_code == 200, listed.text
    batches = listed.json()["batches"]
    assert len(batches) == 1
    assert batches[0]["batch_id"] == batch_id
    assert batches[0]["link_count"] == 3
    assert batches[0]["questionnaire_id"] == questionnaire_id

    details = client.get(f"/admin/batches/{batch_id}/links", headers=auth_headers)
    assert details.status_code == 200, details.text
    details_json = details.json()
    assert details_json["batch_id"] == batch_id
    assert details_json["project_id"] == project_id
    assert details_json["questionnaire_id"] == questionnaire_id
    assert len(details_json["links"]) == 3

    with database.SessionLocal() as db:
        links = db.query(SurveyLink).filter(SurveyLink.batch_id == batch_id).all()
        assert len(links) == 3
        assert all(link.project_id == project_id for link in links)


def test_legacy_batch_endpoint_still_creates_link_batch(client, auth_headers):
    imported = _import_project(client, auth_headers, key="batch_legacy_test")
    project_id = imported["project_id"]
    questionnaire_id = imported["questionnaire_id"]

    legacy = client.post(
        f"/admin/questionnaires/{questionnaire_id}/links/batch",
        json={"count": 2},
        headers=auth_headers,
    )
    assert legacy.status_code == 201, legacy.text
    tokens = legacy.json()["links"]
    assert len(tokens) == 2

    with database.SessionLocal() as db:
        batches = db.query(LinkBatch).filter(LinkBatch.project_id == project_id).all()
        assert len(batches) == 1
        batch_id = batches[0].id

        token_rows = db.query(SurveyLink).filter(SurveyLink.token.in_(tokens)).all()
        assert len(token_rows) == 2
        assert all(row.batch_id == batch_id for row in token_rows)
