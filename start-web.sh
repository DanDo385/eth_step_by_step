#!/bin/bash

set -euo pipefail

# Resolve repo root regardless of where the script is run from
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$SCRIPT_DIR"

# Load environment variables from .env.local if present (repo root)
ENV_FILE="$REPO_ROOT/.env.local"
if [[ -f "$ENV_FILE" ]]; then
  echo "Loading environment from $ENV_FILE"
  set -a
  # shellcheck disable=SC1090
  source "$ENV_FILE"
  set +a
else
  echo "No .env.local found at repo root; using defaults."
fi

# Start the Next.js web server
echo "Starting Next.js web server on localhost:3000..."
cd "$SCRIPT_DIR/web"
npm run dev
