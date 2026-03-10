#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "Running migrations with Node runner (no local psql required)..."
node "${SCRIPT_DIR}/migrate.mjs"
