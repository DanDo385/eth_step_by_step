# Ethereum Step-by-Step Visualizer

An educational tool that visualizes the journey of Ethereum transactions from mempool to finality, demonstrating the interaction between Execution Layer (EL), Proposer-Builder Separation (PBS), and Consensus Layer (CL).

## Features

- **Transaction Tracking**: Follow any transaction hash through its complete lifecycle
- **Interactive Diagram**: Mermaid-based visualization that lights up as data flows through each stage
- **MEV Detection**: Sandwich attack detection using Uniswap V2/V3 heuristics
- **Educational Tooltips**: Built-in glossary and explanations for complex concepts
- **Real-time Data**: Live data from public Ethereum APIs (Alchemy, Beaconcha.in, Flashbots)
- **Responsive UI**: Dark/light theme toggle with accessibility features

## Architecture

- **Go API**: Handles all Ethereum data fetching and processing
- **Next.js Frontend**: Modern React-based UI with TypeScript
- **Public APIs**: Uses Alchemy for Ethereum RPC and Beaconchain for consensus data

## Quick Start

### Prerequisites

- Go 1.21+ (for the API server)
- Node.js 18+ (for the web frontend)
- macOS/Linux/Windows

### Setup

1. **Clone and navigate to the project**:
   ```bash
   cd /Users/danmagro/Desktop/Code/portfolio_projects/eth_step_by_step
   ```

2. **Install dependencies**:
   ```bash
   # Install Go dependencies
   cd go-api
   go mod tidy
   cd ..
   
   # Install Node.js dependencies
   cd web
   npm install
   cd ..
   ```

3. **Start the services** (in separate terminals):
   ```bash
   # Terminal 1: Start Go API server
   ./start-go-api.sh
   
   # Terminal 2: Start Next.js web server
   ./start-web.sh
   ```

4. **Access the application**:
   - **Web UI**: http://localhost:3000
   - **Go API**: http://localhost:8081

### No Blockchain Sync Required!

This version uses public APIs, so there's no need to sync a local blockchain:
- **Ethereum RPC**: Alchemy (public endpoint)
- **Beacon API**: Beaconcha.in (public endpoint)
- **Relay Data**: Flashbots public relays

## Usage

### 1. Mempool Data
Click "1) Mempool" to see pending transactions from the public mempool.

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

- `GET /api/mempool` - Mempool data from public RPC
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
5. **API Integration**: How different Ethereum services work together

## Development

### Project Structure

```
├── go-api/                     # Go backend service
│   ├── main.go                # HTTP routes and handlers
│   ├── eth_rpc.go             # Ethereum JSON-RPC client
│   ├── relay.go               # Flashbots relay client
│   ├── beacon.go              # Beacon chain client
│   ├── sandwich.go            # MEV detection logic
│   └── track_tx.go            # Transaction tracking
├── web/                       # Next.js frontend
│   ├── app/
│   │   ├── page.tsx           # Main application
│   │   ├── layout.tsx         # Root layout
│   │   └── components/        # React components
│   └── package.json           # Dependencies
├── start-go-api.sh            # Start Go API server
└── start-web.sh               # Start Next.js server
```

### Environment Variables

The application uses these default public endpoints:
- `RPC_HTTP_URL`: https://eth-mainnet.g.alchemy.com/v2/demo
- `BEACON_API_URL`: https://beaconcha.in/api/v1
- `RELAY_URLS`: https://boost-relay.flashbots.net

You can override these by setting environment variables before starting the services.

### Stopping Services

Use `Ctrl+C` in each terminal to stop the services.

## Troubleshooting

### Common Issues

1. **"Mempool data not available"**: Public RPC may not expose txpool APIs
2. **"Relay fetch failed"**: Network connectivity or rate limiting
3. **"Beacon API temporarily unavailable"**: Public API may be rate limiting

### Checking Service Status

- Go API: http://localhost:8081/api/mempool
- Web UI: http://localhost:3000

### Port Conflicts

If ports 3000 or 8081 are in use:
- Go API: Set `GOAPI_ADDR` (or `PORT`) in `.env.local`, e.g. `GOAPI_ADDR=:8081`, and update `GOAPI_ORIGIN` accordingly (e.g. `http://localhost:8081`). Then restart the servers.
- Web UI: Change the dev port in `web/package.json` scripts if needed.

## Contributing

This is an educational project. Feel free to:
- Add more MEV detection patterns
- Improve the UI/UX
- Add more educational content
- Optimize performance
- Add support for other RPC providers

## License

Educational use only. Not for production use.
