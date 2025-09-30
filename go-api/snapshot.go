// snapshot.go
package main

import (
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"strconv"
	"sync"
	"time"
)

// Aggregated snapshot endpoint that consolidates multiple upstream calls.
// Results are cached for SNAPSHOT_TTL_SECONDS (default 30s) to reduce rate limits.

type snapshotEntry struct {
	body    []byte
	expires time.Time
}

var (
	snapshotMu   sync.RWMutex
	snapshotMemo = map[string]snapshotEntry{}
	snapshotTTL  = func() time.Duration {
		// Prefer explicit snapshot TTL, fallback to CACHE_TTL_SECONDS, default 30s
		if s := envOr("SNAPSHOT_TTL_SECONDS", ""); s != "" {
			if n, err := strconv.Atoi(s); err == nil && n > 0 && n <= 600 {
				return time.Duration(n) * time.Second
			}
		}
		if s := envOr("CACHE_TTL_SECONDS", ""); s != "" {
			if n, err := strconv.Atoi(s); err == nil && n > 0 && n <= 600 {
				return time.Duration(n) * time.Second
			}
		}
		return 30 * time.Second
	}()
)

func snapshotCacheGet(key string) ([]byte, bool) {
	now := time.Now()
	snapshotMu.RLock()
	e, ok := snapshotMemo[key]
	snapshotMu.RUnlock()
	if ok && now.Before(e.expires) {
		return e.body, true
	}
	if ok {
		snapshotMu.Lock()
		delete(snapshotMemo, key)
		snapshotMu.Unlock()
	}
	return nil, false
}

func snapshotCacheSet(key string, body []byte) {
	snapshotMu.Lock()
	snapshotMemo[key] = snapshotEntry{body: body, expires: time.Now().Add(snapshotTTL)}
	snapshotMu.Unlock()
}

func handleSnapshot(w http.ResponseWriter, r *http.Request) {
	started := time.Now()
	defer func() {
		if rec := recover(); rec != nil {
			log.Printf("snapshot: panic: %v\n", rec)
			writeErr(w, http.StatusInternalServerError, "INTERNAL", "Snapshot handler panic", "Check server logs for details")
		} else {
			log.Printf("snapshot: served in %s\n", time.Since(started))
		}
	}()
	log.Println("snapshot: begin request")
	// Limit for list outputs (default 10)
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

	// Optional sandwich include and block param
	includeSandwich := false
	if s := r.URL.Query().Get("sandwich"); s != "" {
		if s == "1" || s == "true" || s == "yes" {
			includeSandwich = true
		}
	}
	blockTag := r.URL.Query().Get("block")
	if blockTag == "" {
		blockTag = "latest"
	}

	cacheKey := fmt.Sprintf("limit=%d|sandwich=%v|block=%s", limit, includeSandwich, blockTag)
	if body, ok := snapshotCacheGet(cacheKey); ok && len(body) > 0 {
		w.Header().Set("content-type", "application/json")
		_, _ = w.Write(body)
		return
	}

	// Build snapshot
	type R = map[string]any

	// Mempool snapshot (already in-memory)
	mp := GetMempoolData()
	if len(mp.PendingTxs) > limit {
		mp.PendingTxs = mp.PendingTxs[:limit]
		if mp.Count > limit {
			mp.Count = limit
		}
	}

	// Fetch upstream in parallel with a soft overall budget
	// Expected individual timeouts are enforced in respective HTTP clients (3s default)
	type arrR = []R
	recCh := make(chan arrR, 1)
	delCh := make(chan arrR, 1)
	hdrCh := make(chan json.RawMessage, 1)
	finCh := make(chan json.RawMessage, 1)

	go func() {
		var out []R
		// Note: builder_blocks_received endpoint often returns empty or is unavailable
		// Use delivered payloads as a proxy for received blocks since they're the same data
		if raw, err := relayGET(fmt.Sprintf("/relay/v1/data/bidtraces/proposer_payload_delivered?limit=%d", limit)); err == nil && raw != nil {
			_ = json.Unmarshal(raw, &out)
		}
		recCh <- out
	}()
	go func() {
		var out []R
		if raw, err := relayGET(fmt.Sprintf("/relay/v1/data/bidtraces/proposer_payload_delivered?limit=%d", limit)); err == nil && raw != nil {
			_ = json.Unmarshal(raw, &out)
		}
		delCh <- out
	}()
	go func() {
		var out json.RawMessage
		// Use relay data as primary source since beacon API only returns 1 header
		// Relay data includes all the info we need: slot, proposer, gas, payments, etc.
		if relayRaw, relayErr := relayGET(fmt.Sprintf("/relay/v1/data/bidtraces/proposer_payload_delivered?limit=%d", limit)); relayErr == nil && relayRaw != nil {
			var bids []map[string]any
			if err := json.Unmarshal(relayRaw, &bids); err == nil {
				log.Printf("snapshot: got %d relay bids for proposed blocks\n", len(bids))
				// Build enriched response directly from relay data
				enriched := make([]R, 0, len(bids))
				for _, bid := range bids {
					item := R{
						"slot":                bid["slot"],
						"proposer_pubkey":     bid["proposer_pubkey"],
						"proposer_index":      "", // Not in relay data, but we have pubkey
						"builder_payment_eth": bid["value"],
						"block_number":        bid["block_number"],
						"gas_used":            bid["gas_used"],
						"gas_limit":           bid["gas_limit"],
						"num_tx":              bid["num_tx"],
						"builder_pubkey":      bid["builder_pubkey"],
						"block_hash":          bid["block_hash"],
					}
					enriched = append(enriched, item)
					if len(enriched) >= limit {
						break
					}
				}
				log.Printf("snapshot: returning %d proposed blocks with full data\n", len(enriched))
				out, _ = json.Marshal(R{"headers": enriched, "count": len(enriched)})
			}
		} else if relayErr != nil {
			log.Printf("snapshot: relay fetch failed: %v\n", relayErr)
		}
		hdrCh <- out
	}()
	go func() {
		var out json.RawMessage
		if raw, _, err := beaconGET("/eth/v1/beacon/states/finalized/finality_checkpoints"); err == nil && raw != nil {
			out = raw
		}
		finCh <- out
	}()

	// Soft overall wait with fallback defaults
	timeout := time.After(4500 * time.Millisecond)
	var (
		receivedBlocks                 []R
		deliveredPayloads              []R
		headersOut                     json.RawMessage
		finalityOut                    json.RawMessage
		gotRec, gotDel, gotHdr, gotFin bool
	)
	for !(gotRec && gotDel && gotHdr && gotFin) {
		select {
		case v := <-recCh:
			receivedBlocks, gotRec = v, true
		case v := <-delCh:
			deliveredPayloads, gotDel = v, true
		case v := <-hdrCh:
			headersOut, gotHdr = v, true
		case v := <-finCh:
			finalityOut, gotFin = v, true
		case <-timeout:
			// give up waiting; use whatever we have (nil maps are fine)
			gotRec, gotDel, gotHdr, gotFin = true, true, true, true
		}
	}

	// Build response with status indicators - ensure non-nil values
	if receivedBlocks == nil {
		receivedBlocks = []R{}
	}
	if deliveredPayloads == nil {
		deliveredPayloads = []R{}
	}

	relaysData := R{
		"received":  receivedBlocks,
		"delivered": deliveredPayloads,
	}

	beaconData := R{}
	if len(headersOut) > 0 {
		var headersObj any
		if err := json.Unmarshal(headersOut, &headersObj); err == nil {
			beaconData["headers"] = headersObj
		}
	}
	if len(finalityOut) > 0 {
		var finalityObj any
		if err := json.Unmarshal(finalityOut, &finalityObj); err == nil {
			beaconData["finality"] = finalityObj
		}
	}

	response := R{
		"timestamp": time.Now().Unix(),
		"limit":     limit,
		"mempool":   mp,
		"relays":    relaysData,
		"beacon":    beaconData,
	}

	if includeSandwich {
		// Sandwich computation can be heavy; run with a soft budget and don't block the whole snapshot
		mevCh := make(chan R, 1)
		go func() {
			b, err := fetchBlockFull(blockTag)
			mev := R{}
			if err == nil && b != nil {
				if swaps, err2 := collectSwaps(b); err2 == nil {
					s := detectSandwiches(swaps, b.Number)
					if len(s) > limit {
						s = s[:limit]
					}
					mev = R{
						"block":      b.Number,
						"blockHash":  b.Hash,
						"swapCount":  len(swaps),
						"sandwiches": s,
					}
				} else {
					mev = R{"error": "receipt scan failed"}
				}
			} else {
				mev = R{"error": "block fetch failed"}
			}
			mevCh <- mev
		}()
		select {
		case mev := <-mevCh:
			response["mev"] = mev
		case <-time.After(6 * time.Second):
			response["mev"] = R{"error": "mev analysis timeout"}
		}
	}

	// Wrap in standard envelope and cache the bytes
	body, err := json.Marshal(eduEnvelope{Data: response})
	if err != nil {
		log.Printf("snapshot: JSON marshal error: %v\n", err)
		writeErr(w, http.StatusInternalServerError, "SNAPSHOT_MARSHAL", "Failed to serialize snapshot", "")
		return
	}
	if len(body) == 0 {
		log.Println("snapshot: WARNING - marshaled body is empty")
		writeOK(w, response)
		return
	}
	log.Printf("snapshot: returning %d bytes\n", len(body))
	snapshotCacheSet(cacheKey, body)
	w.Header().Set("content-type", "application/json")
	_, _ = w.Write(body)
}
