#!/usr/bin/env bash
set -euo pipefail

REDIS_CONTAINER="${REDIS_CONTAINER:-job-platform-redis}"
API_PORT="${API_PORT:-8000}"

sleep 1

pkill -f "uvicorn app.main:app" >/dev/null 2>&1 || true
pkill -f "celery -A app.worker.celery_app worker" >/dev/null 2>&1 || true
pkill -f "celery -A app.worker.celery_app flower" >/dev/null 2>&1 || true

if command -v docker >/dev/null 2>&1; then
  if docker ps --format '{{.Names}}' | grep -q "^${REDIS_CONTAINER}$"; then
    docker stop "$REDIS_CONTAINER" >/dev/null || true
  fi
fi

echo "Stop sequence completed for API worker and Redis."
