#!/usr/bin/env bash
set -euo pipefail

DB_URL="${DATABASE_URL:-postgresql://app_user:app_password@localhost:5432/app_db}"

for f in infra/postgres/migrations/*.sql; do
  echo "Applying ${f}"
  psql "${DB_URL}" -v ON_ERROR_STOP=1 -f "${f}"
done
