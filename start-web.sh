#!/bin/bash
# start-web.sh
# Starts the Next.js frontend (the educational web interface).
# This talks to the Go API backend to fetch and display live Ethereum data.

set -euo pipefail

# Figure out where we are so we can find .env.local and the web folder
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$SCRIPT_DIR"

# Load config from .env.local if it exists (mainly for custom port)
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

# Default to port 3000 (standard Next.js port)
DESIRED_PORT=${WEB_PORT:-3000}

# Check if the port is already in use - better to fail fast than silently use a different port
if lsof -nP -iTCP:${DESIRED_PORT} -sTCP:LISTEN >/dev/null 2>&1; then
  echo "ERROR: Port ${DESIRED_PORT} is in use. Please free it or set WEB_PORT to a different port in .env.local."
  exit 1
fi

# Fire up Next.js in development mode
echo "Starting Next.js web server on localhost:${DESIRED_PORT}..."
cd "$SCRIPT_DIR/web"
# Use npx to run the local Next.js binary with our chosen port
npx next dev -p "${DESIRED_PORT}"
