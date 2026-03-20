import json

from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.main import app
from app.main import get_db as app_get_db
from app.models import Base, Job

TEST_DATABASE_URL = "sqlite:///./test_jobs.db"

engine = create_engine(
    TEST_DATABASE_URL,
    connect_args={"check_same_thread": False},
)
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


def override_get_db():
    db = TestingSessionLocal()
    try:
        yield db
    finally:
        db.close()


app.dependency_overrides[app_get_db] = override_get_db
client = TestClient(app)


class DummyAsyncResult:
    def __init__(self, status="PENDING", result=None):
        self.status = status
        self.result = result

    def successful(self):
        return self.status == "SUCCESS"

    def failed(self):
        return self.status == "FAILURE"


def setup_function():
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)


def teardown_module():
    Base.metadata.drop_all(bind=engine)


def test_submit_task_success(monkeypatch):
    calls = []

    class DummyTask:
        def apply_async(self, kwargs, task_id):
            calls.append({"kwargs": kwargs, "task_id": task_id})

    monkeypatch.setattr("app.main.process_job", DummyTask())

    response = client.post(
        "/tasks",
        json={"task_type": "email", "payload": {"to": "dev@example.com"}},
    )

    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "PENDING"
    assert body["task_id"]
    assert len(calls) == 1
    assert calls[0]["task_id"] == body["task_id"]


def test_submit_task_returns_503_when_broker_unavailable(monkeypatch):
    class FailingTask:
        def apply_async(self, kwargs, task_id):
            raise ConnectionError("redis unavailable")

    monkeypatch.setattr("app.main.process_job", FailingTask())

    response = client.post(
        "/tasks",
        json={"task_type": "report", "payload": {"id": 1}},
    )

    assert response.status_code == 503
    assert response.json()["detail"] == "Task broker unavailable. Try again later."

    db = TestingSessionLocal()
    try:
        jobs = db.query(Job).all()
        assert len(jobs) == 1
        assert jobs[0].status == "FAILURE"
        assert "Failed to enqueue task" in (jobs[0].error or "")
    finally:
        db.close()


def test_get_task_status_not_found():
    response = client.get("/tasks/nonexistent")
    assert response.status_code == 404


def test_get_task_status_updates_from_backend(monkeypatch):
    task_id = "task-123"

    db = TestingSessionLocal()
    try:
        db.add(
            Job(
                task_id=task_id,
                task_type="email",
                payload=json.dumps({"to": "x@example.com"}),
                status="PENDING",
            )
        )
        db.commit()
    finally:
        db.close()

    monkeypatch.setattr(
        "app.main.AsyncResult",
        lambda *_args, **_kwargs: DummyAsyncResult(
            status="SUCCESS",
            result={"message": "done"},
        ),
    )

    response = client.get(f"/tasks/{task_id}")

    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "SUCCESS"
    assert body["result"] == {"message": "done"}
