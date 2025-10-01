// mempool_ws.go
// Monitors pending transactions using HTTP polling.
// We use eth_getBlockByNumber("pending") which works with all RPC providers,
// unlike WebSocket subscriptions which are not supported by most public providers.
package main

import (
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"strings"
	"sync"
	"time"
)

// PendingTx is a simplified view of a transaction before it's included in a block
type PendingTx struct {
	Hash      string  `json:"hash"`
	From      string  `json:"from"`
	To        *string `json:"to"`        // can be null for contract creation
	Value     string  `json:"value"`     // in wei, hex encoded
	GasPrice  *string `json:"gasPrice"`  // legacy gas price
	Gas       *string `json:"gas"`       // gas limit
	Nonce     string  `json:"nonce"`     // sender's transaction count
	Input     string  `json:"input"`     // calldata
	Timestamp int64   `json:"timestamp"` // when we saw it
}

// MempoolData holds our current snapshot of pending transactions
type MempoolData struct {
	PendingTxs []PendingTx `json:"pendingTxs"`
	Count      int         `json:"count"`
	LastUpdate int64       `json:"lastUpdate"`
	Source     string      `json:"source"` // "ws", "http-polling", etc
}

var (
	mempoolData  = MempoolData{PendingTxs: make([]PendingTx, 0), Source: "ws"}
	mempoolMutex sync.RWMutex // protects mempoolData from concurrent access
)

// handleMempoolWS returns current mempool snapshot to the HTTP client
func handleMempoolWS(w http.ResponseWriter, _ *http.Request) {
	mempoolMutex.RLock()
	data := mempoolData
	mempoolMutex.RUnlock()
	writeOK(w, data)
}

// GetMempoolData lets other parts of the code grab mempool state safely
func GetMempoolData() MempoolData {
	mempoolMutex.RLock()
	data := mempoolData
	mempoolMutex.RUnlock()
	return data
}

// startMempoolSubscription kicks off our mempool monitoring.
// We use HTTP polling instead of WebSocket because most public RPC providers
// don't support the eth_subscribe("newPendingTransactions") method.
func startMempoolSubscription() {
	// Check if user explicitly disabled mempool monitoring
	if d := strings.ToLower(envOr("MEMPOOL_DISABLE", "")); d == "1" || d == "true" || d == "yes" || d == "on" {
		log.Println("mempool WS: disabled via MEMPOOL_DISABLE env")
		mempoolMutex.Lock()
		mempoolData.Source = "ws-disabled"
		// Generate some fake data for demo purposes
		mempoolData.Count = 10
		mempoolData.LastUpdate = time.Now().Unix()
		mockTxs := make([]PendingTx, 10)
		for i := range 10 {
			mockTxs[i] = PendingTx{
				Hash:      fmt.Sprintf("0x%064x", i+1),
				From:      fmt.Sprintf("0x%040x", i*1000),
				Value:     fmt.Sprintf("0x%x", (i+1)*1e18),
				Timestamp: time.Now().Unix() - int64(i*10),
			}
			to := fmt.Sprintf("0x%040x", i*2000)
			mockTxs[i].To = &to
		}
		mempoolData.PendingTxs = mockTxs
		mempoolMutex.Unlock()
		return
	}

	// Use HTTP polling as our primary approach
	// WebSocket would be nicer but doesn't work reliably with Infura/Alchemy
	log.Println("mempool: starting HTTP polling for pending transactions")
	go startHTTPPolling()
}

// startHTTPPolling fetches the "pending" block every few seconds.
// The pending block contains transactions that are waiting to be mined.
// This works with all RPC providers, unlike WebSocket subscriptions.
func startHTTPPolling() {
	log.Println("mempool HTTP: starting polling of pending block")
	ticker := time.NewTicker(5 * time.Second)
	defer ticker.Stop()

	for range ticker.C {
		// Ask for the "pending" pseudo-block with full tx objects
		raw, err := rpcCall("eth_getBlockByNumber", []any{"pending", true})
		if err != nil {
			log.Printf("mempool HTTP: failed to fetch pending block: %v\n", err)
			continue
		}

		// Parse the block response
		var block struct {
			Transactions []struct {
				Hash     string  `json:"hash"`
				From     string  `json:"from"`
				To       *string `json:"to"`
				Value    string  `json:"value"`
				GasPrice *string `json:"gasPrice"`
				Gas      *string `json:"gas"`
				Nonce    string  `json:"nonce"`
				Input    string  `json:"input"`
			} `json:"transactions"`
		}

		if err := json.Unmarshal(raw, &block); err != nil {
			log.Printf("mempool HTTP: failed to parse pending block: %v\n", err)
			continue
		}

		// Sometimes the pending block is empty, that's fine
		if len(block.Transactions) == 0 {
			continue
		}

		// Grab the first 10 transactions for display
		limit := 10
		if len(block.Transactions) < limit {
			limit = len(block.Transactions)
		}

		now := time.Now().Unix()
		pendingTxs := make([]PendingTx, limit)
		for i := 0; i < limit; i++ {
			tx := block.Transactions[i]
			pendingTxs[i] = PendingTx{
				Hash:      tx.Hash,
				From:      tx.From,
				To:        tx.To,
				Value:     tx.Value,
				GasPrice:  tx.GasPrice,
				Gas:       tx.Gas,
				Nonce:     tx.Nonce,
				Input:     tx.Input,
				Timestamp: now,
			}
		}

		// Update our shared state
		mempoolMutex.Lock()
		mempoolData.PendingTxs = pendingTxs
		mempoolData.Count = len(pendingTxs)
		mempoolData.LastUpdate = now
		mempoolData.Source = "http-polling"
		mempoolMutex.Unlock()

		log.Printf("mempool HTTP: fetched %d pending transactions\n", len(pendingTxs))
	}
}
