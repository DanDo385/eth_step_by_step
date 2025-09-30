# start-web.sh
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

# Determine desired web port (defaults to 3000). Fail if busy to encourage freeing 3000.
DESIRED_PORT=${WEB_PORT:-3000}
if lsof -nP -iTCP:${DESIRED_PORT} -sTCP:LISTEN >/dev/null 2>&1; then
  echo "ERROR: Port ${DESIRED_PORT} is in use. Please free it or set WEB_PORT to a different port in .env.local."
  exit 1
fi

# Start the Next.js web server
echo "Starting Next.js web server on localhost:${DESIRED_PORT}..."
cd "$SCRIPT_DIR/web"
# Use local Next.js binary directly so we can pass the chosen port
npx next dev -p "${DESIRED_PORT}"
