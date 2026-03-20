#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PYTHON_BIN="$REPO_ROOT/.venv/bin/python"
REDIS_CONTAINER="job-platform-redis"
REDIS_IMAGE="redis:7-alpine"
API_PORT="8000"
START_FLOWER="${START_FLOWER:-0}"

if [[ ! -x "$PYTHON_BIN" ]]; then
  echo "Python virtual environment not found at $PYTHON_BIN"
  exit 1
fi

if ! command -v docker >/dev/null 2>&1; then
  echo "Docker CLI is required to start Redis automatically."
  exit 1
fi

if ! docker info >/dev/null 2>&1; then
  echo "Docker daemon is not running."
  exit 1
fi

if docker ps -a --format '{{.Names}}' | grep -q "^${REDIS_CONTAINER}$"; then
  docker start "$REDIS_CONTAINER" >/dev/null || true
else
  docker run -d --name "$REDIS_CONTAINER" -p 6379:6379 "$REDIS_IMAGE" >/dev/null
fi

echo "Redis is ready via container ${REDIS_CONTAINER}."

mkdir -p "$REPO_ROOT/.run"

if ! lsof -iTCP:"$API_PORT" -sTCP:LISTEN >/dev/null 2>&1; then
  nohup "$PYTHON_BIN" -m uvicorn app.main:app --host 0.0.0.0 --port "$API_PORT" >"$REPO_ROOT/.run/api.log" 2>&1 &
  echo "Started API on http://127.0.0.1:${API_PORT}"
else
  echo "API appears to already be running on port ${API_PORT}."
fi

if pgrep -f "celery -A app.worker.celery_app worker" >/dev/null 2>&1; then
  echo "Celery worker appears to already be running."
else
  nohup "$PYTHON_BIN" -m celery -A app.worker.celery_app worker --loglevel=info >"$REPO_ROOT/.run/worker.log" 2>&1 &
  echo "Started Celery worker."
fi

if [[ "$START_FLOWER" == "1" ]]; then
  if pgrep -f "celery -A app.worker.celery_app flower" >/dev/null 2>&1; then
    echo "Flower appears to already be running."
  else
    nohup "$PYTHON_BIN" -m celery -A app.worker.celery_app flower --conf=flowerconfig.py >"$REPO_ROOT/.run/flower.log" 2>&1 &
    echo "Started Flower at http://127.0.0.1:5555/flower"
  fi
fi

echo "All requested services started."
