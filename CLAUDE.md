# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is an educational Ethereum visualization tool that demonstrates the journey of transactions from mempool to finality. The system consists of a Go API backend and a Next.js frontend that work together to fetch and display real-time Ethereum data.

## Architecture

The project follows a clean separation between data fetching (Go) and presentation (React/Next.js):

- **Go API** (`go-api/`): Handles all Ethereum data fetching, processing, and API endpoints
- **Next.js Frontend** (`web/`): Modern React application with TypeScript, Tailwind CSS, and interactive visualizations
- **Data Sources**: Uses public APIs (Alchemy, Beaconcha.in, Flashbots) - no local blockchain sync required

### Go API Structure

The Go backend is organized into specialized modules:

- `main.go`: HTTP server with CORS handling and route definitions
- `eth_rpc.go`: Ethereum JSON-RPC client for mempool and transaction data
- `beacon.go`: Beacon chain API client for consensus layer data
- `relay.go`: MEV relay client for PBS (Proposer-Builder Separation) data
- `mempool_ws.go`: WebSocket-based mempool monitoring
- `track_tx.go`: Transaction lifecycle tracking across all layers
- `sandwich.go`: MEV sandwich attack detection using Uniswap heuristics
- `snapshot.go`: Caching layer for API responses

### Frontend Structure

The Next.js app uses the App Router pattern:

- `app/page.tsx`: Main application with interactive Mermaid diagram
- `app/components/`: React components including MermaidDiagram, Panels, Alerts
- `app/api/[...path]/route.ts`: API proxy to Go backend
- Styling: Tailwind CSS with dark/light theme support

## Development Commands

### Starting Services

Always use the provided scripts which handle environment loading:

```bash
# Start Go API server (runs on :8080 by default, or GOAPI_ADDR from .env.local)
./start-go-api.sh

# Start Next.js development server (runs on :3000 by default, or WEB_PORT from .env.local)
./start-web.sh
```

### Build Commands

```bash
# Build Go API binary
cd go-api && go build -o eth-edu-goapi

# Build Next.js for production
cd web && npm run build

# Start production Next.js server
cd web && npm run start
```

### Testing and Linting

The project does not currently have automated tests or linting configured.

## Environment Configuration

Configuration is handled through `.env.local` at the repository root. Key variables:

- `RPC_HTTP_URL`: Ethereum RPC endpoint (defaults to public Alchemy)
- `BEACON_API_URL`: Beacon chain API endpoint
- `RELAY_URLS`: Comma-separated list of MEV relay endpoints
- `WEB_PORT`: Next.js development server port (default: 3000)
- `GOAPI_ADDR`: Go API server address (default: :8080)
- `GOAPI_ORIGIN`: Go API origin for CORS (should match GOAPI_ADDR)

## Key Dependencies

### Go Dependencies
- `github.com/gorilla/websocket`: WebSocket support for real-time mempool data
- Standard library only - minimal external dependencies

### Frontend Dependencies
- `next`: Next.js 14 with App Router and TypeScript
- `react` + `react-dom`: React 18
- `tailwindcss`: Utility-first CSS framework
- `react-tooltip`: Interactive tooltips for education
- `html2canvas`: Diagram export functionality

## API Endpoints

The Go API exposes these educational endpoints:

- `GET /api/mempool`: Real-time mempool data via WebSocket
- `GET /api/relays/received`: Builder blocks received by relays
- `GET /api/relays/delivered`: Payloads delivered to proposers
- `GET /api/validators/head`: Beacon chain headers
- `GET /api/finality`: Casper-FFG finality checkpoints
- `GET /api/track/tx/{hash}`: Transaction lifecycle tracking
- `GET /api/mev/sandwich?block={id}`: MEV sandwich detection

## Common Development Patterns

### Adding New API Endpoints

1. Add handler function in `go-api/main.go`
2. Implement data fetching logic in appropriate module (eth_rpc.go, beacon.go, etc.)
3. Use `writeOK()` and `writeErr()` helpers for consistent JSON responses
4. Add frontend integration in `web/app/page.tsx`

### Working with Real-time Data

The system uses WebSocket connections for live mempool data and implements caching for expensive API calls. Check `mempool_ws.go` and `snapshot.go` for patterns.

### Frontend State Management

The main application uses React state with useEffect hooks for data fetching. The interactive diagram updates based on API responses and user interactions.

## Port Configuration

Default ports:
- Go API: `:8080` (configurable via `GOAPI_ADDR`)
- Next.js: `:3000` (configurable via `WEB_PORT`)

Both start scripts check for port conflicts and load configuration from `.env.local`.