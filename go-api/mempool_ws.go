// mempool_ws.go
package main

import (
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/gorilla/websocket"
)

type PendingTx struct {
	Hash      string  `json:"hash"`
	From      string  `json:"from"`
	To        *string `json:"to"`
	Value     string  `json:"value"`
	GasPrice  *string `json:"gasPrice"`
	Gas       *string `json:"gas"`
	Nonce     string  `json:"nonce"`
	Input     string  `json:"input"`
	Timestamp int64   `json:"timestamp"`
}

type MempoolData struct {
	PendingTxs []PendingTx `json:"pendingTxs"`
	Count      int         `json:"count"`
	LastUpdate int64       `json:"lastUpdate"`
	Source     string      `json:"source"`
}

var (
	mempoolData  = MempoolData{PendingTxs: make([]PendingTx, 0), Source: "ws"}
	mempoolMutex sync.RWMutex
)

// handleMempoolWS returns a snapshot of the last observed pending transactions via WS subscription
func handleMempoolWS(w http.ResponseWriter, _ *http.Request) {
	mempoolMutex.RLock()
	data := mempoolData
	mempoolMutex.RUnlock()
	writeOK(w, data)
}

// GetMempoolData returns a copy of the current mempool data for use by other packages
func GetMempoolData() MempoolData {
	mempoolMutex.RLock()
	data := mempoolData
	mempoolMutex.RUnlock()
	return data
}

// startMempoolSubscription connects to RPC_WS_URL (if set) and subscribes to newPendingTransactions.
// It collects basic tx details via eth_getTransactionByHash and keeps a small rolling buffer.
func startMempoolSubscription() {
	if d := strings.ToLower(envOr("MEMPOOL_DISABLE", "")); d == "1" || d == "true" || d == "yes" || d == "on" {
		log.Println("mempool WS: disabled via MEMPOOL_DISABLE env")
		mempoolMutex.Lock()
		mempoolData.Source = "ws-disabled"
		// Add mock data for demonstration when disabled
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
	if rpcWS == "" {
		log.Println("mempool WS: RPC_WS_URL not set; skipping subscription")
		return
	}
	// Backoff tuning via env
	maxBackoff := 300 * time.Second
	if s := envOr("MEMPOOL_BACKOFF_MAX_SECONDS", ""); s != "" {
		if n, err := strconv.Atoi(s); err == nil && n > 0 && n <= 1800 {
			maxBackoff = time.Duration(n) * time.Second
		}
	}
	backoff := 3 * time.Second
	lastLog := time.Time{}
	go func() {
		for {
			ok := dialAndConsume()
			if ok {
				// reset backoff after a successful session
				backoff = 3 * time.Second
			} else {
				// exponential backoff up to max
				backoff *= 2
				if backoff > maxBackoff {
					backoff = maxBackoff
				}
			}
			// rate-limit logs to once every 30s to avoid spam
			if time.Since(lastLog) > 30*time.Second {
				log.Printf("mempool WS: reconnecting in %s\n", backoff)
				lastLog = time.Now()
			}
			time.Sleep(backoff)
		}
	}()
}

func dialAndConsume() bool {
	c, resp, err := websocket.DefaultDialer.Dial(rpcWS, nil)
	if err != nil {
		// Include status code when available to help debugging provider limitations
		if resp != nil {
			log.Printf("mempool WS dial error: %v (status %s)\n", err, resp.Status)
		} else {
			log.Println("mempool WS dial error:", err)
		}
		// mark source as unavailable but keep endpoint working
		mempoolMutex.Lock()
		mempoolData.Source = "ws-unavailable"
		mempoolMutex.Unlock()
		return false
	}
	defer c.Close()

	// Subscribe to newPendingTransactions
	sub := map[string]any{
		"jsonrpc": "2.0",
		"id":      1,
		"method":  "eth_subscribe",
		"params":  []any{"newPendingTransactions"},
	}
	if err := c.WriteJSON(sub); err != nil {
		log.Println("mempool WS subscribe write error:", err)
		return false
	}

	// Read ack
	var ack map[string]any
	if err := c.ReadJSON(&ack); err != nil {
		log.Println("mempool WS subscribe read error:", err)
		return false
	}

	// Consume notifications
	for {
		var msg struct {
			Params struct {
				Result string `json:"result"`
			} `json:"params"`
		}
		if err := c.ReadJSON(&msg); err != nil {
			log.Println("mempool WS read error:", err)
			return false
		}
		hash := msg.Params.Result
		if hash == "" {
			continue
		}
		// Fetch tx details via HTTP RPC
		raw, err := rpcCall("eth_getTransactionByHash", []any{hash})
		if err != nil || string(raw) == "null" {
			continue
		}
		var t struct {
			Hash     string  `json:"hash"`
			From     string  `json:"from"`
			To       *string `json:"to"`
			Value    string  `json:"value"`
			GasPrice *string `json:"gasPrice"`
			Gas      *string `json:"gas"`
			Nonce    string  `json:"nonce"`
			Input    string  `json:"input"`
		}
		if err := json.Unmarshal(raw, &t); err != nil {
			continue
		}
		now := time.Now().Unix()
		pt := PendingTx{Hash: t.Hash, From: t.From, To: t.To, Value: t.Value, GasPrice: t.GasPrice, Gas: t.Gas, Nonce: t.Nonce, Input: t.Input, Timestamp: now}
		mempoolMutex.Lock()
		mempoolData.PendingTxs = append([]PendingTx{pt}, mempoolData.PendingTxs...)
		// Keep only the most recent 10 transactions
		if len(mempoolData.PendingTxs) > 10 {
			mempoolData.PendingTxs = mempoolData.PendingTxs[:10]
		}
		mempoolData.Count = len(mempoolData.PendingTxs)
		mempoolData.LastUpdate = now
		mempoolData.Source = "ws"
		mempoolMutex.Unlock()
	}
	// unreachable
	// return true indicates a healthy loop which we don't reach here
	// but keep for completeness
	// return true
}
