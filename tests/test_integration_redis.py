import json
import os
import socket
from urllib.parse import urlparse

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.config import settings
from app.main import app
from app.main import get_db as app_get_db
from app.models import Base


def _redis_reachable() -> bool:
    parsed = urlparse(settings.CELERY_BROKER_URL)
    host = parsed.hostname or "localhost"
    port = parsed.port or 6379
    try:
        with socket.create_connection((host, port), timeout=1):
            return True
    except OSError:
        return False


requires_redis = pytest.mark.skipif(
    os.getenv("RUN_REDIS_TESTS") != "1" or not _redis_reachable(),
    reason="Set RUN_REDIS_TESTS=1 and ensure Redis is reachable to run this test.",
)


TEST_DATABASE_URL = "sqlite:///./test_jobs_integration.db"
engine = create_engine(TEST_DATABASE_URL, connect_args={"check_same_thread": False})
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


def override_get_db():
    db = TestingSessionLocal()
    try:
        yield db
    finally:
        db.close()

client = TestClient(app)


@pytest.fixture(autouse=True)
def setup_integration_db():
    app.dependency_overrides[app_get_db] = override_get_db
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)
    yield
    app.dependency_overrides.clear()
    Base.metadata.drop_all(bind=engine)


@requires_redis
def test_submit_task_enqueues_when_redis_is_available():
    response = client.post(
        "/tasks",
        json={"task_type": "email", "payload": {"to": "redis@example.com"}},
    )

    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "PENDING"
    assert body["task_id"]

    status = client.get(f"/tasks/{body['task_id']}")
    assert status.status_code == 200
    status_body = status.json()
    assert status_body["status"] in {"PENDING", "STARTED", "SUCCESS", "RETRY"}

    # Ensure API contract remains JSON-serializable for result details.
    json.dumps(status_body)
