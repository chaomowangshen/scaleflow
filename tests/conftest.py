import os
from pathlib import Path

import pytest
from fastapi.testclient import TestClient


TEST_EXPORT_DIR = Path(__file__).resolve().parent / "test_outputs"
os.environ["DATABASE_URL"] = "sqlite:///:memory:"
os.environ["EXPORT_DIR"] = TEST_EXPORT_DIR.as_posix()
os.environ["ADMIN_USERNAME"] = "admin"
os.environ["ADMIN_PASSWORD"] = "admin123"

from app import database  # noqa: E402
from app.main import app  # noqa: E402


def _cleanup_artifacts() -> None:
    if TEST_EXPORT_DIR.exists():
        for child in sorted(TEST_EXPORT_DIR.glob("**/*"), reverse=True):
            if child.is_file():
                child.unlink(missing_ok=True)
            elif child.is_dir():
                child.rmdir()
        TEST_EXPORT_DIR.rmdir()


@pytest.fixture()
def client():
    _cleanup_artifacts()
    database.reset_database_engine(os.environ["DATABASE_URL"])
    database.Base.metadata.drop_all(bind=database.engine)
    database.Base.metadata.create_all(bind=database.engine)

    with TestClient(app) as test_client:
        yield test_client

    database.Base.metadata.drop_all(bind=database.engine)
    _cleanup_artifacts()


@pytest.fixture()
def auth_headers(client):
    response = client.post(
        "/admin/auth/login",
        json={"username": os.environ["ADMIN_USERNAME"], "password": os.environ["ADMIN_PASSWORD"]},
    )
    assert response.status_code == 200, response.text
    token = response.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}
