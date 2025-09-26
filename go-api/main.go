package main

import (
    "encoding/json"
    "log"
    "net/http"
)

type eduError struct {
    Kind    string `json:"kind"`
    Message string `json:"message"`
    Hint    string `json:"hint,omitempty"`
}

type eduEnvelope struct {
    Error *eduError  `json:"error,omitempty"`
    Data  any        `json:"data,omitempty"`
}

func writeErr(w http.ResponseWriter, status int, kind, message, hint string) {
    w.Header().Set("content-type", "application/json")
    w.WriteHeader(status)
    _ = json.NewEncoder(w).Encode(eduEnvelope{Error: &eduError{Kind: kind, Message: message, Hint: hint}})
}

func writeOK(w http.ResponseWriter, payload any) {
    w.Header().Set("content-type", "application/json")
    _ = json.NewEncoder(w).Encode(eduEnvelope{Data: payload})
}

func handleMempool(w http.ResponseWriter, r *http.Request) {
    status, err1 := rpcCall("txpool_status", []interface{}{})
    content, err2 := rpcCall("txpool_content", []interface{}{})
    if err1 != nil || err2 != nil {
        writeErr(w, http.StatusInternalServerError, "TXPOOL", "Failed to query txpool_*", "Ensure Geth exposes txpool on the HTTP interface")
        return
    }
    writeOK(w, map[string]any{
        "status":  json.RawMessage(status),
        "content": json.RawMessage(content),
    })
}

func handleRelaysDelivered(w http.ResponseWriter, r *http.Request) {
    limit := r.URL.Query().Get("limit")
    if limit == "" {
        limit = "25"
    }
    raw, err := relayGET("/relay/v1/data/bidtraces/proposer_payload_delivered?limit=" + limit)
    if err != nil {
        writeErr(w, http.StatusBadGateway, "RELAY", "Relay fetch failed", "Public relays may rate-limit; try again or configure a private relay")
        return
    }
    w.Header().Set("content-type", "application/json")
    _, _ = w.Write(raw)
}

func handleRelaysReceived(w http.ResponseWriter, r *http.Request) {
    limit := r.URL.Query().Get("limit")
    if limit == "" {
        limit = "25"
    }
    raw, err := relayGET("/relay/v1/data/bidtraces/builder_blocks_received?limit=" + limit)
    if err != nil {
        writeErr(w, http.StatusBadGateway, "RELAY", "Relay fetch failed", "Public relays may rate-limit; consider aggregating multiple relays")
        return
    }
    w.Header().Set("content-type", "application/json")
    _, _ = w.Write(raw)
}

func handleBeaconHeaders(w http.ResponseWriter, r *http.Request) {
    raw, code, err := beaconGET("/eth/v1/beacon/headers")
    if err != nil {
        writeErr(w, code, "BEACON", "Beacon fetch failed", "Run Lighthouse locally or point BEACON_API_URL to a provider")
        return
    }
    w.Header().Set("content-type", "application/json")
    _, _ = w.Write(raw)
}

func handleFinality(w http.ResponseWriter, r *http.Request) {
    raw, code, err := beaconGET("/eth/v1/beacon/states/finalized/finality_checkpoints")
    if err != nil {
        writeErr(w, code, "BEACON", "Finality fetch failed", "Consensus client may be syncing; ensure BEACON_API_URL is reachable")
        return
    }
    w.Header().Set("content-type", "application/json")
    _, _ = w.Write(raw)
}

func handleBlock(w http.ResponseWriter, r *http.Request) {
    id := r.PathValue("id")
    if id == "" {
        id = "latest"
    }
    raw, err := rpcCall("eth_getBlockByNumber", []interface{}{id, true})
    if err != nil {
        writeErr(w, http.StatusInternalServerError, "EL_BLOCK", "Block fetch failed", "Check RPC_HTTP_URL and execution client state")
        return
    }
    w.Header().Set("content-type", "application/json")
    _, _ = w.Write(raw)
}

func main() {
    mux := http.NewServeMux()
    mux.HandleFunc("GET /api/mempool", handleMempool)
    mux.HandleFunc("GET /api/relays/delivered", handleRelaysDelivered)
    mux.HandleFunc("GET /api/relays/received", handleRelaysReceived)
    mux.HandleFunc("GET /api/validators/head", handleBeaconHeaders)
    mux.HandleFunc("GET /api/finality", handleFinality)
    mux.HandleFunc("GET /api/block/{id}", handleBlock)
    mux.HandleFunc("GET /api/mev/sandwich", handleSandwich)
    mux.HandleFunc("GET /api/track/tx/{hash}", handleTrackTx)

    log.Println("go-api listening on :8080")
    log.Fatal(http.ListenAndServe(":8080", mux))
}
