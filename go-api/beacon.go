// beacon.go
package main

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strconv"
	"strings"
	"sync"
	"time"
)

var beaconBase = envOr("BEACON_API_URL", "https://beacon.prylabs.net")

func beaconGET(path string) (json.RawMessage, int, error) {
	if body, status, ok := beaconCacheGet(path); ok {
		return body, status, nil
	}
	url := strings.TrimRight(beaconBase, "/") + path
	resp, err := beaconHTTPClient.Get(url)
	if err != nil {
		// Update health status on error
		if beaconHealth != nil {
			beaconHealth.SetError(err)
		}
		return nil, 0, err
	}
	defer resp.Body.Close()
	body, _ := io.ReadAll(resp.Body)
	beaconCacheSet(path, json.RawMessage(body), resp.StatusCode)

	// Update health status on success
	if beaconHealth != nil && resp.StatusCode/100 == 2 {
		beaconHealth.SetSuccess()
	} else if beaconHealth != nil {
		beaconHealth.SetError(fmt.Errorf("HTTP %d", resp.StatusCode))
	}

	return json.RawMessage(body), resp.StatusCode, nil
}

// --- simple in-memory cache for beaconGET ---

type beaconEntry struct {
	body    json.RawMessage
	status  int
	expires time.Time
}

var (
	beaconMu    sync.RWMutex
	beaconMemo  = map[string]beaconEntry{}
	beaconOkTTL = func() time.Duration {
		s := envOr("CACHE_TTL_SECONDS", "20")
		if n, err := strconv.Atoi(s); err == nil && n > 0 && n <= 300 {
			return time.Duration(n) * time.Second
		}
		return 20 * time.Second
	}()
	beaconErrTTL = func() time.Duration {
		s := envOr("ERROR_CACHE_TTL_SECONDS", "10")
		if n, err := strconv.Atoi(s); err == nil && n > 0 && n <= 120 {
			return time.Duration(n) * time.Second
		}
		return 10 * time.Second
	}()
)

func beaconCacheGet(key string) (json.RawMessage, int, bool) {
	now := time.Now()
	beaconMu.RLock()
	e, ok := beaconMemo[key]
	beaconMu.RUnlock()
	if ok && now.Before(e.expires) {
		return e.body, e.status, true
	}
	if ok {
		beaconMu.Lock()
		delete(beaconMemo, key)
		beaconMu.Unlock()
	}
	return nil, 0, false
}

var beaconHTTPClient = &http.Client{Timeout: func() time.Duration {
	if s := envOr("UPSTREAM_TIMEOUT_SECONDS", ""); s != "" {
		if n, err := strconv.Atoi(s); err == nil && n > 0 && n <= 30 {
			return time.Duration(n) * time.Second
		}
	}
	return 3 * time.Second
}()}

func beaconCacheSet(key string, body json.RawMessage, status int) {
	beaconMu.Lock()
	ttl := beaconOkTTL
	if status/100 != 2 {
		ttl = beaconErrTTL
	}
	beaconMemo[key] = beaconEntry{body: body, status: status, expires: time.Now().Add(ttl)}
	beaconMu.Unlock()
}
