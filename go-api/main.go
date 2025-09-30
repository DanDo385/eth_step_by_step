// main.go
package main

import (
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"strconv"
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
	// Respect optional ?limit query param; default to 10 and clamp 1..200
	limit := 10
	if s := r.URL.Query().Get("limit"); s != "" {
		if n, err := strconv.Atoi(s); err == nil {
			if n < 1 {
				n = 1
			}
			if n > 200 {
				n = 200
			}
			limit = n
		}
	}
	raw, err := relayGET(fmt.Sprintf("/relay/v1/data/bidtraces/proposer_payload_delivered?limit=%d", limit))
	if err != nil {
		writeErr(w, http.StatusTooManyRequests, "RELAY", "Failed to fetch delivered payloads", "MEV relays may be rate limiting or unavailable")
		return
	}

	var deliveredPayloads []map[string]any
	if err := json.Unmarshal(raw, &deliveredPayloads); err != nil {
		writeErr(w, http.StatusInternalServerError, "RELAY_PARSE", "Failed to parse delivered payloads", "")
		return
	}

	response := map[string]any{
		"delivered_payloads": deliveredPayloads,
		"count":              len(deliveredPayloads),
	}
	writeOK(w, response)
}

func handleRelaysReceived(w http.ResponseWriter, r *http.Request) {
	// Fetch real received blocks from MEV relays
	// Respect optional ?limit query param; default to 10 and clamp 1..200
	limit := 10
	if s := r.URL.Query().Get("limit"); s != "" {
		if n, err := strconv.Atoi(s); err == nil {
			if n < 1 {
				n = 1
			}
			if n > 200 {
				n = 200
			}
			limit = n
		}
	}
	raw, err := relayGET(fmt.Sprintf("/relay/v1/data/bidtraces/builder_blocks_received?limit=%d", limit))
	if err != nil {
		writeErr(w, http.StatusTooManyRequests, "RELAY", "Failed to fetch received blocks", "MEV relays may be rate limiting or unavailable")
		return
	}

	var receivedBlocks []map[string]any
	if err := json.Unmarshal(raw, &receivedBlocks); err != nil {
		writeErr(w, http.StatusInternalServerError, "RELAY_PARSE", "Failed to parse received blocks", "")
		return
	}

	response := map[string]any{
		"received_blocks": receivedBlocks,
		"count":           len(receivedBlocks),
	}
	writeOK(w, response)
}

func handleBeaconHeaders(w http.ResponseWriter, r *http.Request) {
	// Fetch beacon headers
	headersRaw, status, err := beaconGET("/eth/v1/beacon/headers?limit=20")
	if err != nil || status/100 != 2 {
		writeErr(w, http.StatusTooManyRequests, "BEACON", "Beacon headers fetch failed", "Public beacon API may be rate limiting. Try again in a few minutes or point BEACON_API_URL to a local consensus client (e.g. http://localhost:5052).")
		return
	}

	// Fetch relay bid data to enrich with builder payments
	relayRaw, relayErr := relayGET("/relay/v1/data/bidtraces/proposer_payload_delivered?limit=50")

	// Parse beacon headers
	var headersObj struct {
		Data []struct {
			Header struct {
				Message struct {
					Slot          string `json:"slot"`
					ProposerIndex string `json:"proposer_index"`
				} `json:"message"`
			} `json:"header"`
		} `json:"data"`
	}
	if err := json.Unmarshal(headersRaw, &headersObj); err != nil {
		w.Header().Set("content-type", "application/json")
		_, _ = w.Write(headersRaw)
		return
	}

	// Parse relay bids
	relayBids := make(map[string]map[string]any)
	if relayErr == nil && relayRaw != nil {
		var bids []map[string]any
		if err := json.Unmarshal(relayRaw, &bids); err == nil {
			for _, bid := range bids {
				if slot, ok := bid["slot"].(string); ok {
					relayBids[slot] = bid
				}
			}
		}
	}

	// Enrich headers with relay bid data
	enriched := make([]map[string]any, 0, len(headersObj.Data))
	for _, h := range headersObj.Data {
		slot := h.Header.Message.Slot
		item := map[string]any{
			"slot":           slot,
			"proposer_index": h.Header.Message.ProposerIndex,
		}

		if bid, found := relayBids[slot]; found {
			item["builder_payment_eth"] = bid["value"]
			item["block_number"] = bid["block_number"]
			item["gas_used"] = bid["gas_used"]
			item["gas_limit"] = bid["gas_limit"]
			item["num_tx"] = bid["num_tx"]
			item["builder_pubkey"] = bid["builder_pubkey"]
			item["proposer_fee_recipient"] = bid["proposer_fee_recipient"]
		}

		enriched = append(enriched, item)
	}

	writeOK(w, map[string]any{
		"headers": enriched,
		"count":   len(enriched),
	})
}

func handleFinality(w http.ResponseWriter, r *http.Request) {
	// Fetch Casper-FFG finality checkpoints from the beacon API
	// Spec: GET /eth/v1/beacon/states/finalized/finality_checkpoints
	raw, status, err := beaconGET("/eth/v1/beacon/states/finalized/finality_checkpoints")
	if err != nil || status/100 != 2 {
		writeErr(w, http.StatusTooManyRequests, "BEACON", "Finality checkpoints fetch failed", "Public beacon API may be rate limiting. Try again or configure BEACON_API_URL to a local consensus client.")
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
	raw, err := rpcCall("eth_getBlockByNumber", []any{id, true})
	if err != nil {
		writeErr(w, http.StatusInternalServerError, "EL_BLOCK", "Block fetch failed", "Check RPC_HTTP_URL and execution client state")
		return
	}
	w.Header().Set("content-type", "application/json")
	_, _ = w.Write(raw)
}

// CORS middleware
func corsMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		origin := envOr("GOAPI_ORIGIN", "http://localhost:3000")
		w.Header().Set("Access-Control-Allow-Origin", origin)
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type")

		if r.Method == "OPTIONS" {
			w.WriteHeader(http.StatusOK)
			return
		}

		next.ServeHTTP(w, r)
	})
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
	mux.HandleFunc("/api/snapshot", handleSnapshot)
	mux.HandleFunc("/api/block/", handleBlock)
	mux.HandleFunc("/api/mev/sandwich", handleSandwich)
	mux.HandleFunc("/api/track/tx/", handleTrackTx)

	// Allow overriding listen address via env: prefer GOAPI_ADDR, fallback to PORT.
	addr := envOr("GOAPI_ADDR", ":"+envOr("PORT", "8081"))

	log.Println("go-api listening on", addr)
	log.Fatal(http.ListenAndServe(addr, corsMiddleware(mux)))
}
