// relay.go
package main

import (
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"strconv"
	"strings"
	"sync"
	"time"
)

var relayBases = func() []string {
	raw := envOr("RELAY_URLS", "https://0xa15b5e1a7e51010198401aab7e@aestus.live,https://0xa7ab7e550200401aab7e@agnostic-relay.net,https://0x8b5d2e1a7e51010198401aab7e@bloxroute.max-profit.blxrbdn.com,https://0xb0b07e550200401aab7e@bloxroute.regulated.blxrbdn.com,https://0xac6e7e51010198401aab7e@boost-relay.flashbots.net,https://0x98650e550200401aab7e@mainnet-relay.securerpc.com,https://0xa1559e51010198401aab7e@relay.ultrasound.money,https://0x8c7d3e550200401aab7e@relay.wenmerge.com,https://0x8c4edc51010198401aab7e@titanrelay.xyz")
	parts := strings.Split(raw, ",")
	out := make([]string, 0, len(parts))
	for _, p := range parts {
		trimmed := strings.TrimSpace(p)
		if trimmed != "" {
			out = append(out, trimmed)
		}
	}
	if len(out) == 0 {
		out = append(out, "https://boost-relay.flashbots.net")
	}
	return out
}()

var relayHTTPClient = &http.Client{Timeout: func() time.Duration {
	if s := envOr("UPSTREAM_TIMEOUT_SECONDS", ""); s != "" {
		if n, err := strconv.Atoi(s); err == nil && n > 0 && n <= 30 {
			return time.Duration(n) * time.Second
		}
	}
	return 3 * time.Second
}()}

var relayBudget = func() time.Duration {
	if s := envOr("RELAY_BUDGET_MS", ""); s != "" {
		if n, err := strconv.Atoi(s); err == nil && n > 100 && n <= 20000 {
			return time.Duration(n) * time.Millisecond
		}
	}
	return 2500 * time.Millisecond
}()

func relayGET(path string) (json.RawMessage, error) {
	// Short-circuit if we recently failed this path (negative cache)
	if relayFailRecently(path) {
		err := errors.New("relay recently failed; backing off")
		if relayHealth != nil {
			relayHealth.SetError(err)
		}
		return nil, err
	}
	// Cache key is just the requested path (includes query string like ?limit=10)
	if body, ok := relayCacheGet(path); ok {
		return body, nil
	}
	started := time.Now()
	var lastErr error
	successCount := 0

	for _, base := range relayBases {
		if time.Since(started) > relayBudget {
			fmt.Printf("relay: budget exceeded after trying %d relays\n", successCount)
			break
		}
		url := strings.TrimRight(base, "/") + path

		req, err := http.NewRequest("GET", url, nil)
		if err != nil {
			lastErr = fmt.Errorf("request creation failed: %w", err)
			continue
		}
		req.Header.Set("Accept", "application/json")
		resp, err := relayHTTPClient.Do(req)
		if err != nil {
			lastErr = fmt.Errorf("request failed for %s: %w", base, err)
			continue
		}
		func() {
			defer resp.Body.Close()
			if resp.StatusCode/100 != 2 {
				lastErr = fmt.Errorf("non-2xx status %d from %s", resp.StatusCode, base)
				return
			}
			body, _ := io.ReadAll(resp.Body)
			// Some relays may reply 200 with an empty body; ignore those
			if len(strings.TrimSpace(string(body))) == 0 {
				lastErr = fmt.Errorf("empty response from %s", base)
				return
			}
			relayCacheSet(path, json.RawMessage(body))
			successCount++
		}()
		if body, ok := relayCacheGet(path); ok {
			fmt.Printf("relay: success from %s after %s\n", base, time.Since(started))
			// Update health status on success
			if relayHealth != nil {
				relayHealth.SetSuccess()
			}
			return body, nil
		}
	}
	relayCacheMarkFail(path)
	if lastErr != nil {
		err := fmt.Errorf("all %d relays failed, last error: %w", len(relayBases), lastErr)
		if relayHealth != nil {
			relayHealth.SetError(err)
		}
		return nil, err
	}
	return nil, fmt.Errorf("all %d relays failed or timed out", len(relayBases))
}

// --- simple in-memory cache for relayGET ---

type relayEntry struct {
	body    json.RawMessage
	expires time.Time
}

var (
	relayMu   sync.RWMutex
	relayMemo = map[string]relayEntry{}
	relayTTL  = func() time.Duration {
		s := envOr("CACHE_TTL_SECONDS", "20")
		if n, err := strconv.Atoi(s); err == nil && n > 0 && n <= 300 {
			return time.Duration(n) * time.Second
		}
		return 20 * time.Second
	}()
)

func relayCacheGet(key string) (json.RawMessage, bool) {
	now := time.Now()
	relayMu.RLock()
	e, ok := relayMemo[key]
	relayMu.RUnlock()
	if ok && now.Before(e.expires) {
		return e.body, true
	}
	if ok {
		relayMu.Lock()
		delete(relayMemo, key)
		relayMu.Unlock()
	}
	return nil, false
}

func relayCacheSet(key string, body json.RawMessage) {
	relayMu.Lock()
	relayMemo[key] = relayEntry{body: body, expires: time.Now().Add(relayTTL)}
	relayMu.Unlock()
}

// Negative cache for failed requests to avoid hammering relays during rate limits
type relayFailEntry struct{ expires time.Time }

var (
	relayFailMu   sync.RWMutex
	relayFailMemo = map[string]relayFailEntry{}
	relayErrTTL   = func() time.Duration {
		s := envOr("ERROR_CACHE_TTL_SECONDS", "10")
		if n, err := strconv.Atoi(s); err == nil && n > 0 && n <= 120 {
			return time.Duration(n) * time.Second
		}
		return 10 * time.Second
	}()
)

func relayCacheMarkFail(key string) {
	relayFailMu.Lock()
	relayFailMemo[key] = relayFailEntry{expires: time.Now().Add(relayErrTTL)}
	relayFailMu.Unlock()
}

func relayFailRecently(key string) bool {
	now := time.Now()
	relayFailMu.RLock()
	e, ok := relayFailMemo[key]
	relayFailMu.RUnlock()
	if ok && now.Before(e.expires) {
		return true
	}
	if ok {
		relayFailMu.Lock()
		delete(relayFailMemo, key)
		relayFailMu.Unlock()
	}
	return false
}
