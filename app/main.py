import json
import os
import subprocess
import uuid
from pathlib import Path
from typing import Any, cast

from celery.result import AsyncResult
from fastapi import Depends, FastAPI, HTTPException
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from sqlalchemy.orm import Session

from app.database import engine, get_db
from app.models import Base, Job
from app.schemas import TaskStatusResponse, TaskSubmissionRequest, TaskSubmissionResponse
from app.tasks import process_job
from app.worker import celery_app

Base.metadata.create_all(bind=engine)

app = FastAPI(title="Job Processing Platform")

BASE_DIR = Path(__file__).resolve().parent
app.mount("/static", StaticFiles(directory=str(BASE_DIR / "static")), name="static")


@app.get("/")
def healthcheck():
	return {"status": "ok", "service": "job-processing-platform", "ui": "/ui"}


@app.get("/ui", include_in_schema=False)
def ui_page():
	return FileResponse(BASE_DIR / "static" / "index.html")


@app.post("/admin/services/stop", include_in_schema=False)
def stop_services():
	project_root = BASE_DIR.parent
	stop_ps1 = project_root / "scripts" / "stop-services.ps1"
	stop_sh = project_root / "scripts" / "stop-services.sh"

	try:
		if os.name == "nt":
			if not stop_ps1.exists():
				raise HTTPException(status_code=500, detail="Stop script not found for Windows")
			subprocess.Popen(
				[
					"powershell",
					"-ExecutionPolicy",
					"Bypass",
					"-File",
					str(stop_ps1),
				],
				cwd=str(project_root),
			)
		else:
			if not stop_sh.exists():
				raise HTTPException(status_code=500, detail="Stop script not found for Unix")
			subprocess.Popen(["bash", str(stop_sh)], cwd=str(project_root))
	except HTTPException:
		raise
	except Exception as exc:
		raise HTTPException(status_code=500, detail=f"Failed to initiate stop: {exc}")

	return {"status": "stopping", "message": "Stop signal sent for API worker and Redis container."}


@app.post("/tasks", response_model=TaskSubmissionResponse)
def submit_task(payload: TaskSubmissionRequest, db: Session = Depends(get_db)):
	task_id = str(uuid.uuid4())
	job = Job(
		task_id=task_id,
		task_type=payload.task_type,
		payload=json.dumps(payload.payload),
		status="PENDING",
	)
	db.add(job)
	db.commit()

	try:
		cast(Any, process_job).apply_async(
			kwargs={"job_id": task_id, "task_type": payload.task_type, "payload": payload.payload},
			task_id=task_id,
		)
	except Exception as exc:
		job.status = "FAILURE"
		job.error = f"Failed to enqueue task: {exc}"
		db.commit()
		raise HTTPException(status_code=503, detail="Task broker unavailable. Try again later.")

	return TaskSubmissionResponse(task_id=task_id, status="PENDING")


@app.get("/tasks/{task_id}", response_model=TaskStatusResponse)
def get_task_status(task_id: str, db: Session = Depends(get_db)):
	job = db.get(Job, task_id)
	if not job:
		raise HTTPException(status_code=404, detail="Task not found")

	async_result = AsyncResult(task_id, app=celery_app)
	backend_status = async_result.status

	if backend_status and backend_status != job.status:
		job.status = backend_status
		if async_result.successful():
			job.result = json.dumps(async_result.result)
			job.error = None
		elif async_result.failed():
			job.error = str(async_result.result)
		db.commit()
		db.refresh(job)

	parsed_result = None
	if job.result:
		try:
			parsed_result = json.loads(job.result)
		except json.JSONDecodeError:
			parsed_result = job.result

	return TaskStatusResponse(
		task_id=job.task_id,
		status=job.status,
		result=parsed_result,
		error=job.error,
		created_at=job.created_at,
		updated_at=job.updated_at,
	)