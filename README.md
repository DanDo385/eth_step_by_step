# Ethereum Step-by-Step Visualizer

An educational tool that visualizes the journey of Ethereum transactions from mempool to finality, demonstrating the interaction between Execution Layer (EL), Proposer-Builder Separation (PBS), and Consensus Layer (CL).

## Features

- **Transaction Tracking**: Follow any transaction hash through its complete lifecycle
- **Interactive Diagram**: Mermaid-based visualization that lights up as data flows through each stage
- **MEV Detection**: Sandwich attack detection using Uniswap V2/V3 heuristics
- **Educational Tooltips**: Built-in glossary and explanations for complex concepts
- **Real-time Data**: Live data from Geth, Lighthouse, and Flashbots relays
- **Responsive UI**: Dark/light theme toggle with accessibility features

## Architecture

- **Go API**: Handles all Ethereum data fetching and processing
- **Next.js Frontend**: Modern React-based UI with TypeScript
- **Docker Compose**: Orchestrates all services (Geth, Lighthouse, API, Web)

## Quick Start

### Prerequisites

- Docker and Docker Compose
- macOS (tested on macOS 24.6.0)

### Setup

1. **Clone and navigate to the project**:
   ```bash
   cd /Users/danmagro/Desktop/Code/portfolio_projects/eth_step_by_step
   ```

2. **Start all services**:
   ```bash
   docker compose up -d --build
   ```

3. **Access the application**:
   - **Web UI**: http://localhost:3000
   - **Go API**: http://localhost:8080
   - **Geth RPC**: http://localhost:8545
   - **Lighthouse**: http://localhost:5052

### Initial Sync

The services will take time to sync:
- **Geth**: ~2-4 hours for mainnet sync
- **Lighthouse**: ~30 minutes for checkpoint sync

You can monitor progress with:
```bash
docker logs geth --tail 20
docker logs lighthouse --tail 20
```

## Usage

### 1. Mempool Data
Click "1) Mempool" to see pending transactions from your local Geth node.

### 2. PBS (Proposer-Builder Separation)
- "2) Builders → Relays" shows which builders submit blocks to relays
- "3) Relays → Validators" shows which payloads reach proposers

### 3. Consensus Layer
- "4) Proposed blocks" shows beacon headers and proposers
- "5) Finality checkpoints" shows Casper-FFG finality status

### 4. Transaction Tracking
Enter any transaction hash in the tracker to see its complete journey across all layers.

### 5. MEV Detection
Use the sandwich detector to analyze blocks for potential MEV attacks.

## API Endpoints

- `GET /api/mempool` - Geth mempool data
- `GET /api/relays/received` - Builder blocks received by relays
- `GET /api/relays/delivered` - Payloads delivered to proposers
- `GET /api/validators/head` - Beacon chain headers
- `GET /api/finality` - Finality checkpoints
- `GET /api/track/tx/{hash}` - Transaction lifecycle tracking
- `GET /api/mev/sandwich?block={id}` - MEV sandwich detection

## Educational Value

This tool demonstrates:

1. **Transaction Lifecycle**: From broadcast to finality
2. **PBS Architecture**: How MEV-Boost works off-chain
3. **Consensus Mechanics**: Casper-FFG finality process
4. **MEV Detection**: Real-world sandwich attack patterns
5. **API Integration**: How different Ethereum clients work together

## Development

### Project Structure

```
├── docker-compose.yml          # Service orchestration
├── .env                        # Environment variables
├── jwt/                        # JWT secrets for Geth-Lighthouse
├── go-api/                     # Go backend service
│   ├── main.go                # HTTP routes and handlers
│   ├── eth_rpc.go             # Geth JSON-RPC client
│   ├── relay.go               # Flashbots relay client
│   ├── beacon.go              # Lighthouse beacon client
│   ├── sandwich.go            # MEV detection logic
│   └── track_tx.go            # Transaction tracking
└── web/                       # Next.js frontend
    ├── app/
    │   ├── page.tsx           # Main application
    │   ├── layout.tsx         # Root layout
    │   └── components/        # React components
    └── package.json           # Dependencies
```

### Stopping Services

```bash
docker compose down
```

### Viewing Logs

```bash
docker compose logs -f [service_name]
```

## Troubleshooting

### Common Issues

1. **"Failed to query txpool_*"**: Geth is still syncing
2. **"Relay fetch failed"**: Network connectivity or rate limiting
3. **"Beacon fetch failed"**: Lighthouse is still syncing

### Checking Service Status

```bash
docker compose ps
```

### Restarting Services

```bash
docker compose restart [service_name]
```

## Contributing

This is an educational project. Feel free to:
- Add more MEV detection patterns
- Improve the UI/UX
- Add more educational content
- Optimize performance

## License

Educational use only. Not for production use.
