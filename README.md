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
