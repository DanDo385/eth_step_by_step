// main.go
// HTTP server that provides educational endpoints about Ethereum transaction flow.
// Fetches data from execution layer (via JSON-RPC), consensus layer (beacon API),
// and MEV relays to show the full journey of a transaction.
package main

import (
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"strconv"
)

// eduError wraps error info with hints for the frontend
type eduError struct {
	Kind    string `json:"kind"`
	Message string `json:"message"`
	Hint    string `json:"hint,omitempty"`
}

// eduEnvelope is our standard response wrapper - either data or error, never both
type eduEnvelope struct {
	Error *eduError `json:"error,omitempty"`
	Data  any       `json:"data,omitempty"`
}

// writeErr sends a JSON error response with helpful hints for debugging
func writeErr(w http.ResponseWriter, status int, kind, message, hint string) {
	w.Header().Set("content-type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(eduEnvelope{Error: &eduError{Kind: kind, Message: message, Hint: hint}})
}

// writeOK sends a successful JSON response with the payload wrapped in our envelope
func writeOK(w http.ResponseWriter, payload any) {
	w.Header().Set("content-type", "application/json")
	_ = json.NewEncoder(w).Encode(eduEnvelope{Data: payload})
}

// handleMempool delegates to the WebSocket/HTTP polling implementation
func handleMempool(w http.ResponseWriter, r *http.Request) {
	handleMempoolWS(w, r)
}

// handleRelaysDelivered shows which blocks actually made it to proposers via MEV-Boost.
// This is the "winning" block that gets proposed on-chain.
func handleRelaysDelivered(w http.ResponseWriter, r *http.Request) {
	// Parse limit from query string, default 10, clamp between 1-200
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

	// Hit the relay API for delivered payload data
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

// handleRelaysReceived shows blocks submitted by builders to relays.
// Most of these don't get selected - only the highest bid per slot wins.
func handleRelaysReceived(w http.ResponseWriter, r *http.Request) {
	// Same limit parsing logic as delivered endpoint
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

// handleBeaconHeaders fetches recent proposed blocks from the consensus layer,
// then enriches them with MEV payment data from relays. This shows validator
// earnings and which builders are winning block auctions.
func handleBeaconHeaders(w http.ResponseWriter, r *http.Request) {
	// Grab beacon chain headers (these are proposed blocks)
	headersRaw, status, err := beaconGET("/eth/v1/beacon/headers?limit=20")
	if err != nil || status/100 != 2 {
		writeErr(w, http.StatusTooManyRequests, "BEACON", "Beacon headers fetch failed", "Public beacon API may be rate limiting. Try again in a few minutes or point BEACON_API_URL to a local consensus client (e.g. http://localhost:5052).")
		return
	}

	// Also grab relay data so we can show builder payments
	// We fetch more here (50) to increase chance of matching slots
	relayRaw, relayErr := relayGET("/relay/v1/data/bidtraces/proposer_payload_delivered?limit=50")

	// Parse beacon headers response
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
		// If we can't parse it, just pass through the raw response
		w.Header().Set("content-type", "application/json")
		_, _ = w.Write(headersRaw)
		return
	}

	// Build a lookup map of relay bids by slot for fast matching
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

	// Merge beacon data with relay payment info
	enriched := make([]map[string]any, 0, len(headersObj.Data))
	for _, h := range headersObj.Data {
		slot := h.Header.Message.Slot
		item := map[string]any{
			"slot":           slot,
			"proposer_index": h.Header.Message.ProposerIndex,
		}

		// If we have relay data for this slot, add it
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

// handleFinality returns Casper-FFG checkpoints showing which epochs are finalized.
// Once a block is finalized, it's basically impossible to reorg.
func handleFinality(w http.ResponseWriter, r *http.Request) {
	raw, status, err := beaconGET("/eth/v1/beacon/states/finalized/finality_checkpoints")
	if err != nil || status/100 != 2 {
		writeErr(w, http.StatusTooManyRequests, "BEACON", "Finality checkpoints fetch failed", "Public beacon API may be rate limiting. Try again or configure BEACON_API_URL to a local consensus client.")
		return
	}
	// Just pass through the beacon API response directly
	w.Header().Set("content-type", "application/json")
	_, _ = w.Write(raw)
}

// handleBlock grabs a full block with all transactions from the execution layer.
// Useful for looking at what's actually in a block.
func handleBlock(w http.ResponseWriter, r *http.Request) {
	// Extract block number/tag from URL path
	id := r.URL.Path[len("/api/block/"):]
	if id == "" {
		id = "latest"
	}

	// Fetch the block with full transaction details (true flag)
	raw, err := rpcCall("eth_getBlockByNumber", []any{id, true})
	if err != nil {
		writeErr(w, http.StatusInternalServerError, "EL_BLOCK", "Block fetch failed", "Check RPC_HTTP_URL and execution client state")
		return
	}
	w.Header().Set("content-type", "application/json")
	_, _ = w.Write(raw)
}

// corsMiddleware adds CORS headers so the Next.js frontend can call us.
// In production you'd want to lock this down to specific origins.
func corsMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		origin := envOr("GOAPI_ORIGIN", "http://localhost:3000")
		w.Header().Set("Access-Control-Allow-Origin", origin)
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type")

		// Handle preflight requests
		if r.Method == "OPTIONS" {
			w.WriteHeader(http.StatusOK)
			return
		}

		next.ServeHTTP(w, r)
	})
}

func main() {
	// Kick off mempool monitoring in background
	startMempoolSubscription()

	// Set up all our routes
	mux := http.NewServeMux()
	mux.HandleFunc("/api/mempool", handleMempool)
	mux.HandleFunc("/api/relays/delivered", handleRelaysDelivered)
	mux.HandleFunc("/api/relays/received", handleRelaysReceived)
	mux.HandleFunc("/api/validators/head", handleBeaconHeaders)
	mux.HandleFunc("/api/finality", handleFinality)
	mux.HandleFunc("/api/snapshot", handleSnapshot) // batch endpoint for efficiency
	mux.HandleFunc("/api/block/", handleBlock)
	mux.HandleFunc("/api/mev/sandwich", handleSandwich)
	mux.HandleFunc("/api/track/tx/", handleTrackTx) // follow a tx through its lifecycle

	// Check env for custom port
	addr := envOr("GOAPI_ADDR", ":"+envOr("PORT", "8080"))

	log.Println("go-api listening on", addr)
	log.Fatal(http.ListenAndServe(addr, corsMiddleware(mux)))
}
