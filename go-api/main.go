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

func handleSyncStatus(w http.ResponseWriter, r *http.Request) {
	log.Printf("Sync status endpoint called")

	// Check Geth sync status
	gethSyncing, err1 := rpcCall("eth_syncing", []interface{}{})
	if err1 != nil {
		log.Printf("Geth RPC error: %v", err1)
		writeErr(w, http.StatusInternalServerError, "GETH_SYNC", "Failed to check Geth sync status", "Ensure Geth is running and accessible")
		return
	}

	// Check Lighthouse sync status
	beaconStatus, code, err2 := beaconGET("/eth/v1/node/syncing")
	if err2 != nil {
		log.Printf("Lighthouse API error: %v", err2)
		writeErr(w, code, "BEACON_SYNC", "Failed to check Lighthouse sync status", "Ensure Lighthouse is running and accessible")
		return
	}

	// Parse Geth sync status
	var gethSyncResult interface{}
	if err := json.Unmarshal(gethSyncing, &gethSyncResult); err != nil {
		writeErr(w, http.StatusInternalServerError, "GETH_PARSE", "Failed to parse Geth sync status", "Invalid response from Geth")
		return
	}

	// Parse Lighthouse sync status
	var beaconSyncResult map[string]interface{}
	if err := json.Unmarshal(beaconStatus, &beaconSyncResult); err != nil {
		writeErr(w, http.StatusInternalServerError, "BEACON_PARSE", "Failed to parse Lighthouse sync status", "Invalid response from Lighthouse")
		return
	}

	// Determine if services are synced
	gethIsSynced := gethSyncResult == false // eth_syncing returns false when synced
	beaconIsSynced := beaconSyncResult["data"] != nil &&
		beaconSyncResult["data"].(map[string]interface{})["is_syncing"] == false

	writeOK(w, map[string]interface{}{
		"geth": map[string]interface{}{
			"synced":  gethIsSynced,
			"syncing": gethSyncResult,
		},
		"lighthouse": map[string]interface{}{
			"synced":  beaconIsSynced,
			"syncing": beaconSyncResult,
		},
	})
}

func main() {
	mux := http.NewServeMux()
	mux.HandleFunc("/api/mempool", handleMempool)
	mux.HandleFunc("/api/relays/delivered", handleRelaysDelivered)
	mux.HandleFunc("/api/relays/received", handleRelaysReceived)
	mux.HandleFunc("/api/validators/head", handleBeaconHeaders)
	mux.HandleFunc("/api/finality", handleFinality)
	mux.HandleFunc("/api/block/", handleBlock)
	mux.HandleFunc("/api/mev/sandwich", handleSandwich)
	mux.HandleFunc("/api/track/tx/", handleTrackTx)
	mux.HandleFunc("/api/sync-status", handleSyncStatus)

	log.Println("go-api listening on :8080")
	log.Fatal(http.ListenAndServe(":8080", mux))
}
