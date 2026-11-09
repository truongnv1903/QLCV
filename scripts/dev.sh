#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
if [[ ! -x backend/.venv/bin/python || ! -d frontend/node_modules ]]; then
  echo "Cài dependencies theo README.md trước khi chạy scripts/dev.sh."
  exit 1
fi
# Local preview uses this project's .env instead of unrelated inherited DATABASE_URL values.
laban_database_url="$(backend/.venv/bin/python -c 'from dotenv import dotenv_values; print(dotenv_values(".env").get("DATABASE_URL") or "sqlite:///backend/data/laban.db")')"
export DATABASE_URL="$laban_database_url"
backend/.venv/bin/alembic -c backend/alembic.ini upgrade head
backend/.venv/bin/uvicorn app.main:app --app-dir backend --host 127.0.0.1 --port 8000 --reload --reload-dir backend/app &
api_pid=$!
trap 'kill "$api_pid" 2>/dev/null || true' EXIT INT TERM
npm --prefix frontend run dev
