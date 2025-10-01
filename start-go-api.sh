# start-go-api.sh
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

ADDR_TO_USE=${GOAPI_ADDR:-:8080}
echo "Starting Go API server on ${ADDR_TO_USE}..."
cd "$SCRIPT_DIR/go-api"

echo "Using RPC_HTTP_URL=${RPC_HTTP_URL:-(default)}"
echo "Using RELAY_URLS=${RELAY_URLS:-(default)}"

GOAPI_ADDR="$ADDR_TO_USE" go run .
