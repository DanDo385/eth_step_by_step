package main

import (
    "encoding/json"
    "log"
    "net/http"
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
    mempoolData = MempoolData{PendingTxs: make([]PendingTx, 0), Source: "ws"}
    mempoolMutex sync.RWMutex
)

// handleMempoolWS returns a snapshot of the last observed pending transactions via WS subscription
func handleMempoolWS(w http.ResponseWriter, r *http.Request) {
    mempoolMutex.RLock()
    data := mempoolData
    mempoolMutex.RUnlock()
    writeOK(w, data)
}

// startMempoolSubscription connects to RPC_WS_URL (if set) and subscribes to newPendingTransactions.
// It collects basic tx details via eth_getTransactionByHash and keeps a small rolling buffer.
func startMempoolSubscription() {
    if rpcWS == "" {
        log.Println("mempool WS: RPC_WS_URL not set; skipping subscription")
        return
    }
    go func() {
        for {
            dialAndConsume()
            // backoff before reconnecting
            time.Sleep(3 * time.Second)
        }
    }()
}

func dialAndConsume() {
    c, _, err := websocket.DefaultDialer.Dial(rpcWS, nil)
    if err != nil {
        log.Println("mempool WS dial error:", err)
        return
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
        return
    }

    // Read ack
    var ack map[string]any
    if err := c.ReadJSON(&ack); err != nil {
        log.Println("mempool WS subscribe read error:", err)
        return
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
            return
        }
        hash := msg.Params.Result
        if hash == "" {
            continue
        }
        // Fetch tx details via HTTP RPC
        raw, err := rpcCall("eth_getTransactionByHash", []interface{}{hash})
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
        if len(mempoolData.PendingTxs) > 200 {
            mempoolData.PendingTxs = mempoolData.PendingTxs[:200]
        }
        mempoolData.Count = len(mempoolData.PendingTxs)
        mempoolData.LastUpdate = now
        mempoolMutex.Unlock()
    }
}
