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
	Error *eduError `json:"error,omitempty"`
	Data  any       `json:"data,omitempty"`
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
	// Use the new WebSocket-based mempool endpoint
	handleMempoolWS(w, r)
}

func handleRelaysDelivered(w http.ResponseWriter, r *http.Request) {
	// Fetch real delivered payloads from MEV relays
	raw, err := relayGET("/relay/v1/data/bidtraces/proposer_payload_delivered?limit=200")
	if err != nil {
		writeErr(w, http.StatusBadGateway, "RELAY", "Failed to fetch delivered payloads", "MEV relays may be rate limiting or unavailable")
		return
	}

	var deliveredPayloads []map[string]interface{}
	if err := json.Unmarshal(raw, &deliveredPayloads); err != nil {
		writeErr(w, http.StatusInternalServerError, "RELAY_PARSE", "Failed to parse delivered payloads", "")
		return
	}

	response := map[string]interface{}{
		"delivered_payloads": deliveredPayloads,
		"count":              len(deliveredPayloads),
	}
	writeOK(w, response)
}

func handleRelaysReceived(w http.ResponseWriter, r *http.Request) {
	// Fetch real received blocks from MEV relays
	raw, err := relayGET("/relay/v1/data/bidtraces/builder_blocks_received?limit=200")
	if err != nil {
		writeErr(w, http.StatusBadGateway, "RELAY", "Failed to fetch received blocks", "MEV relays may be rate limiting or unavailable")
		return
	}

	var receivedBlocks []map[string]interface{}
	if err := json.Unmarshal(raw, &receivedBlocks); err != nil {
		writeErr(w, http.StatusInternalServerError, "RELAY_PARSE", "Failed to parse received blocks", "")
		return
	}

	response := map[string]interface{}{
		"received_blocks": receivedBlocks,
		"count":           len(receivedBlocks),
	}
	writeOK(w, response)
}

func handleBeaconHeaders(w http.ResponseWriter, r *http.Request) {
	// Attempt to fetch recent beacon headers from the configured beacon API
	// Spec: GET /eth/v1/beacon/headers (optionally supports slot param on many clients)
	raw, status, err := beaconGET("/eth/v1/beacon/headers")
	if err != nil || status/100 != 2 {
		writeErr(w, http.StatusBadGateway, "BEACON", "Beacon headers fetch failed", "Public beacon API may be rate limiting. Try again in a few minutes or point BEACON_API_URL to a local consensus client (e.g. http://localhost:5052).")
		return
	}
	w.Header().Set("content-type", "application/json")
	_, _ = w.Write(raw)
}

func handleFinality(w http.ResponseWriter, r *http.Request) {
	// Fetch Casper-FFG finality checkpoints from the beacon API
	// Spec: GET /eth/v1/beacon/states/finalized/finality_checkpoints
	raw, status, err := beaconGET("/eth/v1/beacon/states/finalized/finality_checkpoints")
	if err != nil || status/100 != 2 {
		writeErr(w, http.StatusBadGateway, "BEACON", "Finality checkpoints fetch failed", "Public beacon API may be rate limiting. Try again or configure BEACON_API_URL to a local consensus client.")
		return
	}
	w.Header().Set("content-type", "application/json")
	_, _ = w.Write(raw)
}

func handleBlock(w http.ResponseWriter, r *http.Request) {
	id := r.URL.Path[len("/api/block/"):]
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
	// Start mempool subscription
	startMempoolSubscription()

	mux := http.NewServeMux()
	mux.HandleFunc("/api/mempool", handleMempool)
	mux.HandleFunc("/api/relays/delivered", handleRelaysDelivered)
	mux.HandleFunc("/api/relays/received", handleRelaysReceived)
	mux.HandleFunc("/api/validators/head", handleBeaconHeaders)
	mux.HandleFunc("/api/finality", handleFinality)
	mux.HandleFunc("/api/block/", handleBlock)
	mux.HandleFunc("/api/mev/sandwich", handleSandwich)
	mux.HandleFunc("/api/track/tx/", handleTrackTx)

	// Allow overriding listen address via env: prefer GOAPI_ADDR, fallback to PORT.
	addr := envOr("GOAPI_ADDR", ":"+envOr("PORT", "8080"))

	log.Println("go-api listening on", addr)
	log.Fatal(http.ListenAndServe(addr, mux))
}
