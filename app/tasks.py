import json
import time

from celery.utils.log import get_task_logger

from app.database import SessionLocal
from app.models import Job
from app.worker import celery_app

logger = get_task_logger(__name__)


def _set_job_status(task_id: str, status: str, result: dict | None = None, error: str | None = None):
	db = SessionLocal()
	try:
		job = db.get(Job, task_id)
		if not job:
			return
		job.status = status
		if result is not None:
			job.result = json.dumps(result)
		if error is not None:
			job.error = error
		db.commit()
	finally:
		db.close()


@celery_app.task(
	bind=True,
	autoretry_for=(Exception,),
	retry_backoff=True,
	retry_kwargs={"max_retries": 5},
	rate_limit="10/m",
)
def process_job(self, job_id: str, task_type: str, payload: dict):
	_set_job_status(job_id, "STARTED")

	# Simulated processing to show async queue execution by task type.
	time.sleep(2)

	if payload.get("should_fail"):
		raise RuntimeError("Simulated task failure requested via payload.should_fail")

	result = {
		"message": f"Processed '{task_type}' task",
		"input": payload,
		"worker_task_id": self.request.id,
	}
	_set_job_status(job_id, "SUCCESS", result=result)
	logger.info("Completed job %s", job_id)
	return result
