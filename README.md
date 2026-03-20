# Job Processing Platform

A backend system that accepts tasks (e.g., image processing, email sending, report generation), queues them, and processes them asynchronously.
It will use the FastAPI framework for the API layer, integrate Celery with Redis for queueing, and persist job metadata in PostgreSQL.
This project will include retry logic, job status tracking, and rate limiting. This project demonstrates concurrency, distributed systems thinking, and production patterns.

## Project Blueprint & Implementation Guide

1. The API Layer (FastAPI)
2. The Worker Layer (Celery)
3. Scalability & Monitoring

### The API Layer

The API shouldn't do the work; it should just "take the order."

- **Task Submission:** Use .delay() or .apply_async() to push tasks to the broker.
- **Status Endpoint:** Use AsyncResult(task_id) to query the status from your PostgreSQL backend.

### The Worker Layer (Celery)

This is where the business logic lives. To handle my specific requirements:

- **Retry Logic:** Use the bind=True argument in your task decorator to access self.retry.
- **Tip:** Set retry_backoff=True to implement exponential backoff automatically.
- **Rate Limiting:** Use @app.task(rate_limit='10/m') to restrict a task to 10 executions per minute.
- **Persistence:** Configure result_backend to your PostgreSQL URL (e.g., db+postgresql://user:pass@localhost/dbname).

### Scalability & Monitoring

- **Flower:** This is a real-time web-based monitoring tool for Celery. It lets us see task progress, success rates, and worker health.

- **Horizontal Scaling:** Since workers are decoupled, 1 worker can run on a laptop or 100 workers on a Kubernetes cluster without changing a single line of code.

## Environment Setup (Redis + PostgreSQL)

1. Copy `.env.example` to `.env` and adjust credentials/hosts as needed.
2. Ensure Redis is reachable at `CELERY_BROKER_URL`.
3. Ensure PostgreSQL contains two databases:

- `job_processing` for API/job metadata
- `celery_results` for Celery result backend

### Example `.env`

```env
DATABASE_URL=postgresql+psycopg2://postgres:postgres@localhost:5432/job_processing
REDIS_URL=redis://localhost:6379/0
CELERY_BROKER_URL=redis://localhost:6379/0
CELERY_RESULT_BACKEND=db+postgresql://postgres:postgres@localhost:5432/celery_results
```

## Run the Platform

Install dependencies:

```bash
pip install -r requirements.txt
```

Start FastAPI:

```bash
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

Open the browser UI:

```text
http://localhost:8000/ui
```

The UI lets you submit tasks and poll task status without using curl/Postman.

Start Celery worker:

```bash
celery -A app.worker.celery_app worker --loglevel=info
```

## Quick curl/Postman Test Flow

1. Submit a task.

```bash
curl -X POST "http://localhost:8000/tasks" \
 -H "Content-Type: application/json" \
 -d '{"task_type":"email","payload":{"to":"dev@example.com","subject":"Hello"}}'
```

Expected response shape:

```json
{
 "task_id": "<uuid>",
 "status": "PENDING"
}
```

1. Poll task status with the returned `task_id`.

```bash
curl "http://localhost:8000/tasks/<task_id>"
```

Expected progression: `PENDING` -> `STARTED` -> `SUCCESS`.

1. Optional retry/failure test.

```bash
curl -X POST "http://localhost:8000/tasks" \
 -H "Content-Type: application/json" \
 -d '{"task_type":"report","payload":{"should_fail":true}}'
```

This triggers retries (exponential backoff) before ending in `FAILURE`.

Postman equivalent:

1. Create `POST /tasks` with JSON body.
2. Save `task_id` from the response.
3. Create `GET /tasks/{{task_id}}` and run until terminal state.

## Flower Launch Config and Monitoring

Flower configuration is provided in `flowerconfig.py`.

Start Flower:

```bash
celery -A app.worker.celery_app flower --conf=flowerconfig.py
```

Open monitoring UI:

```text
http://localhost:5555/flower
```

In Flower you can monitor:

- Worker availability/health
- Queue depth and throughput
- Task success/failure rate
- Task runtime and retry behavior
