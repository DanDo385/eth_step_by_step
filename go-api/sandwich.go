// sandwich.go
//
// This file detects MEV sandwich attacks on Ethereum blocks. A sandwich attack happens when
// a bot (the "attacker") spots a pending swap transaction and wraps it with their own trades:
//   1. Buy tokens BEFORE the victim's swap (frontrun) - drives price up
//   2. Victim's swap executes at worse price (they get sandwiched)
//   3. Sell tokens AFTER the victim's swap (backrun) - attacker profits
//
// We detect this by scanning transaction receipts for Uniswap V2/V3 Swap events and looking
// for the pattern: same address swaps in the same pool immediately before AND after a different
// address. This is a heuristic - not all detected "sandwiches" are malicious (could be legit MEV
// or arbitrage), but it gives you a sense of how prevalent this behavior is.
//
// Educational note: Sandwich attacks are controversial. They extract value from regular users
// but also provide liquidity and keep DEX prices in line with centralized exchanges. Whether
// they're "good" or "bad" is hotly debated in the Ethereum community.

package main

import (
    "encoding/hex"
    "encoding/json"
    "net/http"
    "sort"
    "strconv"
    "strings"

    "golang.org/x/crypto/sha3"
)

// block represents the Ethereum block structure we get from eth_getBlockByNumber.
// We only care about a few fields here - number, hash, timestamp, and the list of transactions.
// Note: we request full transaction objects (second param = true), so each tx has a "from" field.
type block struct {
    Number       string `json:"number"`
    Hash         string `json:"hash"`
    Timestamp    string `json:"timestamp"`
    Transactions []struct {
        Hash string `json:"hash"`
        From string `json:"from"`
    } `json:"transactions"`
}

// receipt is the transaction receipt structure from eth_getTransactionReceipt.
// Receipts contain event logs which tell us what actually happened during the transaction.
// For sandwich detection, we're hunting for Swap events in the logs.
type receipt struct {
    TransactionHash string `json:"transactionHash"`
    Logs            []struct {
        Address string   `json:"address"` // Contract that emitted the event (the liquidity pool)
        Topics  []string `json:"topics"`  // First topic is the event signature hash
    } `json:"logs"`
}

// swapEvent represents a single swap we found in the block. We track which transaction
// it came from, who initiated it, which pool it happened in, and its position in the block.
// Position matters because sandwich attacks rely on transaction ordering!
type swapEvent struct {
    TxHash   string // Transaction hash that contains this swap
    TxFrom   string // Address that sent the transaction (potential attacker or victim)
    Pool     string // Liquidity pool contract address (e.g., WETH/USDC pair)
    TxIndex  int    // Position of the transaction in the block (critical for ordering)
    LogIndex int    // Position of the log within the transaction (for tie-breaking)
}

// sandwich represents a detected sandwich attack with all the juicy details.
// The attacker's address appears in both preTx and postTx, while the victim is in the middle.
// This gets returned to the frontend so users can see who got sandwiched and by whom.
type sandwich struct {
    Pool     string `json:"pool"`     // Which liquidity pool was targeted
    Attacker string `json:"attacker"` // Address that executed the sandwich
    Victim   string `json:"victim"`   // Address that got sandwiched (poor soul)
    PreTx    string `json:"preTx"`    // Frontrun transaction hash
    VictimTx string `json:"victimTx"` // The sandwiched transaction
    PostTx   string `json:"postTx"`   // Backrun transaction hash
    Block    string `json:"block"`    // Block number where this happened
}

// keccakTopic computes the Keccak-256 hash of an event signature to get the topic0.
// In Ethereum, event signatures are hashed using Keccak (not SHA-256!) and the result
// is stored as the first topic in event logs. This is how we identify specific events
// like "Swap" vs "Transfer" vs "Mint" etc.
//
// Example: keccakTopic("Swap(address,uint256,uint256,uint256,uint256,address)")
// returns "0xd78ad95f..." which we then compare against log topics.
func keccakTopic(signature string) string {
    h := sha3.NewLegacyKeccak256() // Legacy Keccak is what Ethereum uses (not the official SHA-3)
    h.Write([]byte(signature))
    var out [32]byte
    h.Sum(out[:0])
    return "0x" + hex.EncodeToString(out[:])
}

var (
    // swapTopicV2 is the Keccak hash of the Uniswap V2 Swap event signature.
    // V2 uses: Swap(address indexed sender, uint amount0In, uint amount1In, uint amount0Out, uint amount1Out, address indexed to)
    swapTopicV2 = strings.ToLower(keccakTopic("Swap(address,uint256,uint256,uint256,uint256,address)"))

    // swapTopicV3 is the Keccak hash of the Uniswap V3 Swap event signature.
    // V3 uses: Swap(address indexed sender, address indexed recipient, int256 amount0, int256 amount1, uint160 sqrtPriceX96, uint128 liquidity, int24 tick)
    // Note: V3 is more complex because it uses concentrated liquidity and tick math
    swapTopicV3 = strings.ToLower(keccakTopic("Swap(address,address,int256,int256,uint160,uint128,int24)"))
)

// sandwichMaxTx limits how many transactions we'll scan per block to avoid timeouts.
// Blocks can have 300+ transactions, and fetching receipts for each one is SLOW (lots of RPC calls).
// We default to 120 txs which should catch most sandwiches while keeping response time reasonable.
// You can override this with SANDWICH_MAX_TX env var, but don't go crazy - 1000 txs = very slow!
var sandwichMaxTx = func() int {
    s := envOr("SANDWICH_MAX_TX", "120")
    n, err := strconv.Atoi(s)
    if err != nil {
        return 120 // If someone puts "banana" in the env var, just use default
    }
    // Clamp to reasonable range - we don't want to timeout or scan forever
    if n < 10 {
        n = 10
    }
    if n > 1000 {
        n = 1000
    }
    return n
}()

// fetchBlockFull grabs the full block including all transaction details from the RPC node.
// The second parameter (true) tells the node to include full tx objects, not just hashes.
// This is critical because we need the "from" address of each transaction to detect attackers.
func fetchBlockFull(tag string) (*block, error) {
    raw, err := rpcCall("eth_getBlockByNumber", []any{tag, true})
    if err != nil {
        return nil, err
    }
    var b block
    if err := json.Unmarshal(raw, &b); err != nil {
        return nil, err
    }
    return &b, nil
}

// fetchReceipt gets the transaction receipt which contains event logs.
// This is where the actual Swap events are stored - the transaction itself just has calldata,
// but the receipt tells you what actually happened (events emitted, gas used, etc).
// Fun fact: receipts are stored in a separate Merkle tree from transactions!
func fetchReceipt(txHash string) (*receipt, error) {
    raw, err := rpcCall("eth_getTransactionReceipt", []any{txHash})
    if err != nil {
        return nil, err
    }
    var r receipt
    if err := json.Unmarshal(raw, &r); err != nil {
        return nil, err
    }
    return &r, nil
}

// collectSwaps scans through the block's transactions and extracts all Uniswap V2/V3 swap events.
// This is the heavy lifting function - it makes a LOT of RPC calls (one per transaction) to get receipts.
// That's why we limit it with sandwichMaxTx. On mainnet, this can take 5-10 seconds for a full block!
//
// We're looking for event logs where topic[0] matches either the V2 or V3 Swap event signature.
// Each swap gets recorded with its position in the block (txIndex, logIndex) because ordering
// is CRITICAL for detecting sandwiches. If tx #5 and tx #7 are from the same address with tx #6
// in between, that's a potential sandwich!
func collectSwaps(b *block) ([]swapEvent, error) {
    var swaps []swapEvent
    maxN := len(b.Transactions)
    if sandwichMaxTx < maxN {
        maxN = sandwichMaxTx // Don't scan more than our limit
    }

    // Loop through transactions in order - ORDER MATTERS for sandwich detection!
    for idx := 0; idx < maxN; idx++ {
        tx := b.Transactions[idx]
        // Fetch the receipt to see what events were emitted
        rcpt, err := fetchReceipt(tx.Hash)
        if err != nil || rcpt == nil {
            continue // Skip if receipt fetch fails (might be pending or node issue)
        }

        // Scan through all event logs in this transaction
        for logIdx, lg := range rcpt.Logs {
            if len(lg.Topics) == 0 {
                continue // Malformed log, skip it
            }

            // topic[0] is the event signature hash - check if it's a Swap event
            topic := strings.ToLower(lg.Topics[0])
            if topic != swapTopicV2 && topic != swapTopicV3 {
                continue // Not a swap, we don't care about it
            }

            // Found a swap! Record all the details we need for sandwich detection
            swaps = append(swaps, swapEvent{
                TxHash:   strings.ToLower(tx.Hash),
                TxFrom:   strings.ToLower(tx.From),        // Who sent this tx?
                Pool:     strings.ToLower(lg.Address),     // Which pool did they swap in?
                TxIndex:  idx,                             // Where in the block?
                LogIndex: logIdx,                          // Where in the transaction?
            })
        }
    }

    // Sort by position in block (txIndex first, then logIndex for ties).
    // This ensures we can detect sandwiches by checking if swaps are adjacent.
    sort.Slice(swaps, func(i, j int) bool {
        if swaps[i].TxIndex == swaps[j].TxIndex {
            return swaps[i].LogIndex < swaps[j].LogIndex
        }
        return swaps[i].TxIndex < swaps[j].TxIndex
    })

    return swaps, nil
}

// detectSandwiches analyzes the list of swaps and finds sandwich attack patterns.
// The algorithm is pretty simple but effective:
//   1. Group swaps by pool (attackers sandwich in the same pool)
//   2. For each pool, look for sequences where address A swaps, then address B swaps, then address A swaps again
//   3. If we find this pattern, it's likely a sandwich (A frontran B, then backran B)
//
// This is a heuristic! Not every detected "sandwich" is malicious:
//   - Could be arbitrage (buying low in one pool, selling high in another)
//   - Could be market making (providing liquidity by trading both sides)
//   - Could be a coincidence (two unrelated users trading in the same block)
//
// But in practice, most of these patterns ARE sandwiches. The MEV bots are VERY active.
func detectSandwiches(swaps []swapEvent, blockNum string) []sandwich {
    // Group swaps by pool address - we only care about swaps in the same pool
    grouped := map[string][]swapEvent{}
    for _, s := range swaps {
        grouped[s.Pool] = append(grouped[s.Pool], s)
    }

    var out []sandwich

    // For each pool, scan through the swap sequence looking for sandwich patterns
    for pool, seq := range grouped {
        // We need at least 3 swaps to have a sandwich (pre, victim, post)
        for i := 0; i+2 < len(seq); i++ {
            pre := seq[i]       // Potential frontrun
            victim := seq[i+1]  // Potential victim
            post := seq[i+2]    // Potential backrun

            // Sanity check - all three should be in the same pool (they are, by construction, but be safe)
            if pre.Pool != victim.Pool || victim.Pool != post.Pool {
                continue
            }

            // Make sure we have valid addresses (shouldn't happen, but handle gracefully)
            if pre.TxFrom == "" || post.TxFrom == "" || victim.TxFrom == "" {
                continue
            }

            // THE SANDWICH PATTERN: pre and post from same address, victim from different address
            // This is the smoking gun! If address X swaps before and after address Y, X probably sandwiched Y.
            if pre.TxFrom == post.TxFrom && pre.TxFrom != victim.TxFrom {
                out = append(out, sandwich{
                    Pool:     pool,
                    Attacker: pre.TxFrom,
                    Victim:   victim.TxFrom,
                    PreTx:    pre.TxHash,
                    VictimTx: victim.TxHash,
                    PostTx:   post.TxHash,
                    Block:    blockNum,
                })
                // Skip ahead by 2 since we just consumed these swaps
                // This prevents detecting overlapping sandwiches (which would double-count)
                i += 2
            }
        }
    }

    return out
}

// handleSandwich is the HTTP handler for GET /api/mev/sandwich?block=<number|latest>
// This endpoint lets users scan any block for sandwich attacks. It's educational - showing
// how prevalent MEV extraction is on Ethereum. Most blocks with significant DEX activity
// will have at least one sandwich!
//
// The response includes all detected sandwiches with attacker/victim addresses and transaction hashes.
// Users can then explore these on Etherscan to see the exact profit extracted.
func handleSandwich(w http.ResponseWriter, r *http.Request) {
    // Get the block number from query params, default to "latest"
    blockTag := r.URL.Query().Get("block")
    if blockTag == "" {
        blockTag = "latest"
    }

    // Step 1: Fetch the full block with all transactions
    b, err := fetchBlockFull(blockTag)
    if err != nil {
        writeErr(w, http.StatusInternalServerError, "EL_BLOCK_FETCH", "Failed to fetch block", "Check RPC_HTTP_URL and node sync state")
        return
    }

    // Step 2: Scan through transactions and collect all Swap events
    // This is the slow part - we're making tons of RPC calls here
    swaps, err := collectSwaps(b)
    if err != nil {
        writeErr(w, http.StatusInternalServerError, "EL_RECEIPTS", "Failed to scan receipts", "Node may still be syncing or pruning receipts")
        return
    }

    // Step 3: Analyze the swaps and detect sandwich patterns
    sandwiches := detectSandwiches(swaps, b.Number)

    // Return the results with some helpful context
    writeOK(w, map[string]any{
        "block":      b.Number,
        "blockHash":  b.Hash,
        "swapCount":  len(swaps), // Total swaps found
        "sandwiches": sandwiches,  // Detected sandwiches (could be empty array)
        "sources":    sourcesInfo(),
        "note":       "Heuristic: same address swaps before and after a victim in the same pool (Uniswap V2/V3).",
    })
}
