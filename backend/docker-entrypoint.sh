#!/bin/sh
set -e
case "$1" in
  api)
    alembic upgrade head
    if [ "${CHRONO_SEED_DEMO:-false}" = "true" ]; then python -m app.seed; else python -m app.seed --no-demo; fi
    exec uvicorn app.main:app --host 0.0.0.0 --port 8000 --proxy-headers --forwarded-allow-ips="*" --workers "${CHRONO_API_WORKERS:-2}"
    ;;
  worker)
    exec python -m app.worker
    ;;
  migrate)
    exec alembic upgrade head
    ;;
  benchmark)
    shift
    exec python -m app.benchmarks.harness "$@"
    ;;
  *)
    exec "$@"
    ;;
esac
