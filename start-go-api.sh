#!/bin/bash
# start-go-api.sh
# Starts the Go API server that fetches data from Ethereum execution layer,
# beacon chain, and MEV relays. This is the backend for the educational visualizer.

set -euo pipefail

# Figure out where we are so we can find .env.local and the go-api folder
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$SCRIPT_DIR"

# Load config from .env.local if it exists (custom RPC endpoints, relay URLs, etc)
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

# Default to port 8080 if not specified in .env.local
ADDR_TO_USE=${GOAPI_ADDR:-:8080}
echo "Starting Go API server on ${ADDR_TO_USE}..."
cd "$SCRIPT_DIR/go-api"

# Show which data sources we're using (helpful for debugging)
echo "Using RPC_HTTP_URL=${RPC_HTTP_URL:-(default)}"
echo "Using RELAY_URLS=${RELAY_URLS:-(default)}"

# Start the server with go run (compiles and runs in one step)
GOAPI_ADDR="$ADDR_TO_USE" go run .
