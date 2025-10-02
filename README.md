# Ethereum Transaction Visualizer

**An educational tool for understanding how Ethereum really works** - from your first "send" click to permanent blockchain finality.

Perfect for beginners with zero cryptocurrency knowledge! This visualizer shows real-time data from the Ethereum network with detailed explanations, analogies, and interactive learning tools.

## 🎯 What You'll Learn

- **How cryptocurrency transactions work** - Complete journey from mempool to finality
- **Gas fees explained** - Base fees vs priority fees (tips), and where your money goes
- **MEV (Maximal Extractable Value)** - How professional traders profit from transaction ordering
- **Validator economics** - How block proposers earn money
- **Blockchain security** - How Ethereum makes transactions irreversible
- **Real MEV attacks** - Actual sandwich attacks happening on the network right now

## ✨ Features

### For Complete Beginners
- **📚 Interactive Glossary** - 40+ terms organized by category with hover definitions
- **🎯 Step-by-Step Guide** - Numbered walkthrough explaining each panel
- **🏢 Real-World Analogies** - Post office metaphors, concert ticket scalpers, bank comparisons
- **💡 Educational Tooltips** - Detailed explanations throughout with "why this matters" sections
- **📊 Visual Metrics** - User-friendly cards showing gas prices, transaction counts, validator earnings

### Advanced Features
- **Real-Time Data** - Live transactions, blocks, and validator data from Ethereum mainnet
- **Transaction Tracking** - Follow any transaction hash through its complete lifecycle
- **MEV Detection** - Scan blocks for sandwich attacks using Uniswap heuristics
- **Builder Competition** - See multiple builders bidding for the same block slot
- **Finality Monitoring** - Watch Casper-FFG checkpoints in action

### Technical
- **No Local Node Required** - Uses public APIs (Alchemy, Beaconcha.in, Flashbots)
- **Responsive Design** - Works on desktop, tablet, mobile
- **Dark Theme** - Easy on the eyes for extended learning sessions
- **Data Caching** - Smart caching reduces API calls and improves performance

## 🚀 Quick Start

### Prerequisites

- **Go 1.21+** (for the API server) - [Download Go](https://go.dev/dl/)
- **Node.js 18+** (for the web frontend) - [Download Node.js](https://nodejs.org/)
- **5 minutes** of your time!

### Installation

1. **Clone the repository**:
   ```bash
   git clone https://github.com/yourusername/eth-step-by-step
   cd eth-step-by-step
   ```

2. **Install dependencies**:
   ```bash
   # Install Go dependencies (backend)
   cd go-api
   go mod tidy
   cd ..

   # Install Node.js dependencies (frontend)
   cd web
   npm install
   cd ..
   ```

3. **Start both servers** (in separate terminals):
   ```bash
   # Terminal 1: Start Go API server (port 8080)
   ./start-go-api.sh

   # Terminal 2: Start Next.js web server (port 3000)
   ./start-web.sh
   ```

4. **Open your browser**:
   ```
   http://localhost:3000
   ```

That's it! You're now connected to live Ethereum data. 🎉

## 📖 How to Use (Beginner's Guide)

### Step 1: Start with the Mempool
Click **"1) Mempool"** to see real transactions waiting to be processed. This is like watching mail waiting to be sorted at the post office.

**What you'll see:**
- How many transactions are waiting (could be thousands!)
- Current gas prices (fees people are paying)
- Total value being transferred
- Explanation of base fees vs priority fees (tips)

**Key insight**: Gas prices change constantly based on network demand. Higher prices = more competition for block space!

### Step 2-3: See the MEV Competition
Click **"2) Builders → Relays"** to see professional block builders competing, then **"3) Relays → Validators"** to see which blocks won.

**What you'll see:**
- Multiple builders creating different blocks for the same 12-second slot
- How much they're bidding to have their block chosen
- Only one winner per slot gets included on-chain
- Builder payments to validators (MEV profit sharing)

**Key insight**: The total transaction count is inflated because the same transactions appear in multiple competing blocks!

### Step 4: Explore Proposed Blocks
Click **"4) Proposed blocks + Builder payments"** to see actual blocks that made it on-chain.

**What you'll see:**
- MEV-Boost blocks (built by professionals) vs Vanilla blocks (built locally)
- Complete breakdown of validator earnings
- Block fullness and gas utilization
- Which builders dominate the market

**Key insight**: Most validators use MEV-Boost because it significantly increases their income!

### Step 5: Understand Finality
Click **"5) Finality checkpoints"** to see how transactions become permanent and irreversible.

**What you'll see:**
- Justification → Finalization process (2-step security)
- Current network health status
- Economic security ($30+ billion to reverse finalized blocks)
- Why exchanges wait ~15 minutes for large deposits

**Key insight**: After finality, your transaction is as secure as Bitcoin's 6-block confirmation!

### Step 6: Detect MEV Attacks
Click **"6) Sandwich detector"** and enter "latest" or a specific block number to scan for attacks.

**What you'll see:**
- Real sandwich attacks where traders lost money
- Front-run → Victim → Back-run transaction sequences
- Attacker addresses and victim addresses
- Impact on victims (worse execution prices)

**Key insight**: About 5-10% of blocks contain detectable sandwich attacks. Real money is being extracted!

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────────┐
│                  Browser (localhost:3000)                │
│                                                          │
│  Next.js Frontend with Educational Components           │
│  - Interactive Glossary (40+ terms)                     │
│  - Step-by-step Walkthrough                            │
│  - User-friendly Metric Cards                          │
│  - Real-world Analogies                                │
└──────────────────────┬──────────────────────────────────┘
                       │ API Calls
                       ▼
┌─────────────────────────────────────────────────────────┐
│              Go API Server (localhost:8080)              │
│                                                          │
│  - Mempool Monitoring (WebSocket + HTTP polling)        │
│  - Transaction Tracking                                 │
│  - MEV Detection                                        │
│  - Data Aggregation & Caching                          │
└───┬─────────────┬─────────────┬──────────────┬─────────┘
    │             │             │              │
    ▼             ▼             ▼              ▼
┌─────────┐ ┌──────────┐ ┌───────────┐ ┌──────────────┐
│ Alchemy │ │Beaconcha │ │ Flashbots │ │ Other Relays │
│   RPC   │ │   .in    │ │   Relay   │ │              │
└─────────┘ └──────────┘ └───────────┘ └──────────────┘
```

### Why This Architecture?

- **Go Backend**: Fast, concurrent data fetching from multiple APIs
- **Next.js Frontend**: Modern React with server-side rendering for SEO
- **Public APIs**: No blockchain sync required (saves 500+ GB disk space!)
- **Caching Layer**: Reduces API calls and improves responsiveness

## 📂 Project Structure

```
eth-step-by-step/
├── go-api/                          # Go backend service
│   ├── main.go                      # HTTP routes & request handlers
│   ├── eth_rpc.go                   # Ethereum JSON-RPC client
│   ├── mempool_ws.go               # Mempool monitoring (WebSocket + polling)
│   ├── relay.go                     # MEV relay client (Flashbots, etc.)
│   ├── beacon.go                    # Beacon chain consensus client
│   ├── track_tx.go                  # Transaction lifecycle tracking
│   ├── sandwich.go                  # MEV sandwich attack detection
│   └── snapshot.go                  # Data aggregation & caching
│
├── web/                             # Next.js frontend
│   ├── app/
│   │   ├── page.tsx                 # Main application with intro & guides
│   │   ├── layout.tsx               # Root layout & global styles
│   │   ├── components/              # React components
│   │   │   ├── TransactionView.tsx  # Human-readable transaction display
│   │   │   ├── BuilderRelayView.tsx # Builder competition visualization
│   │   │   ├── RelayDeliveredView.tsx  # Winning blocks display
│   │   │   ├── BeaconHeadersView.tsx   # Block proposals & validator earnings
│   │   │   ├── FinalityView.tsx     # Casper-FFG finality checkpoints
│   │   │   ├── SandwichView.tsx     # MEV attack detection results
│   │   │   ├── Glossary.tsx         # Interactive glossary (40+ terms)
│   │   │   ├── MermaidDiagram.tsx   # Transaction flow diagram
│   │   │   └── ...                  # Other UI components
│   │   └── utils/
│   │       └── format.ts            # Data formatting utilities (hex→decimal, wei→ETH, etc.)
│   └── package.json                 # Frontend dependencies
│
├── start-go-api.sh                  # Script to start Go API server
├── start-web.sh                     # Script to start Next.js server
├── .env.local                       # Environment configuration
├── CLAUDE.md                        # Developer documentation
└── README.md                        # This file!
```

## 🔌 API Endpoints

### Data Endpoints
- `GET /api/mempool` - Real-time mempool data with metrics
- `GET /api/relays/received` - Builder blocks submitted to relays
- `GET /api/relays/delivered` - Winning blocks delivered to validators
- `GET /api/validators/head` - Beacon chain block headers
- `GET /api/finality` - Casper-FFG finality checkpoints
- `GET /api/snapshot` - Aggregated data from all sources (cached)

### Tracking & Analysis
- `GET /api/track/tx/{hash}` - Complete transaction lifecycle
- `GET /api/mev/sandwich?block={id}` - MEV sandwich detection for specific block

### Health & Meta
- `GET /api/health/sources` - Check status of all data sources

## ⚙️ Configuration

The application uses `.env.local` for configuration. Here are the key variables:

```bash
# Ethereum RPC (execution layer)
RPC_HTTP_URL=https://eth-mainnet.g.alchemy.com/v2/YOUR_KEY
RPC_WS_URL=wss://eth-mainnet.g.alchemy.com/ws/v2/YOUR_KEY

# Beacon API (consensus layer)
BEACON_API_URL=https://beaconcha.in/api/v1

# MEV Relays (comma-separated)
RELAY_URLS=https://boost-relay.flashbots.net,https://agnostic-relay.net

# Server Configuration
GOAPI_ADDR=:8080
GOAPI_ORIGIN=http://localhost:8080
WEB_PORT=3000

# Caching
CACHE_TTL_SECONDS=30
ERROR_CACHE_TTL_SECONDS=10
```

**Note**: The default public endpoints work fine for learning! You only need to change these if you want to use your own API keys or local nodes.

## 🎓 Educational Value

### For Students & Developers
- **Learn by Seeing**: Watch real blockchain data instead of reading documentation
- **Understand MEV**: See actual profit extraction happening in real-time
- **Grasp Economics**: Learn how validators earn money and why gas fees exist
- **Security Concepts**: Understand finality, attestations, and economic security

### For Crypto Enthusiasts
- **Deep Dive into PBS**: See the proposer-builder separation market in action
- **Track Your Transactions**: Follow your own transactions through the full lifecycle
- **Detect MEV**: Scan for sandwich attacks and understand MEV impact
- **Real Data**: Everything is live from Ethereum mainnet, not simulated

### For Educators
- **Interactive Teaching Tool**: Students can click and explore at their own pace
- **Built-in Glossary**: 40+ terms with beginner-friendly definitions
- **Step-by-Step Guides**: Structured learning path from basics to advanced concepts
- **Real-World Analogies**: Post office, concert tickets, bank accounts - familiar concepts!

## 🐛 Troubleshooting

### Common Issues

**"No builder block submissions found"**
- The relay API may be rate limiting
- Try again in a few minutes
- This is normal - public relays protect against abuse

**"Mempool data not available from public RPC"**
- Some RPC providers don't expose txpool APIs
- The tool will work with limited mempool data
- For full mempool access, use your own Alchemy API key

**"Beacon API temporarily unavailable"**
- Public beacon APIs rate limit
- Wait a minute and try again
- Consider running a local beacon node for unlimited access

**Port already in use**
- Change `GOAPI_ADDR` in `.env.local` for Go API
- Change `WEB_PORT` in `.env.local` for Next.js
- Or kill the process using: `lsof -ti:8080 | xargs kill`

### Checking Service Health

```bash
# Test Go API
curl http://localhost:8080/api/health/sources

# Test mempool endpoint
curl http://localhost:8080/api/mempool

# Check web server
curl http://localhost:3000
```

## 🤝 Contributing

This is an educational project and contributions are welcome! Here are some ideas:

### Beginner-Friendly Improvements
- Add more real-world analogies
- Create video tutorials
- Add quiz questions to test understanding
- Translate educational content to other languages

### Technical Improvements
- Add more MEV detection patterns (liquidations, arbitrage)
- Implement historical data viewing
- Add L2 (Layer 2) transaction tracking
- Create mobile app version

### Data & Analytics
- Add statistics and charts
- Track MEV over time
- Compare different builders
- Show validator profitability rankings

**How to contribute:**
1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request with detailed description

## 📜 License

MIT License - Educational use encouraged!

This tool is for learning purposes. Not financial advice. Use at your own risk.

## 🙏 Acknowledgments

- **Ethereum Foundation** - For building this amazing technology
- **Flashbots** - For pioneering MEV research and transparency
- **Alchemy** - For reliable public RPC endpoints
- **Beaconcha.in** - For free beacon chain API access

## 📞 Support & Community

- **Questions?** Open an issue on GitHub
- **Found a bug?** Please report it!
- **Want to chat?** Join our discussions

---

**Happy Learning!** 🚀 Understanding Ethereum makes you a better crypto user, developer, and investor.
