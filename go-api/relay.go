package main

import (
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"strings"
)

var relayBases = func() []string {
	raw := envOr("RELAY_URLS", "https://0xa15b5…401aab7e@aestus.live,https://0xa7ab7…7d69561@agnostic-relay.net,https://0x8b5d2…896b8f@bloxroute.max-profit.blxrbdn.com,https://0xb0b07…658fe88@bloxroute.regulated.blxrbdn.com,https://0xac6e7…1b41a37ae@boost-relay.flashbots.net,https://0x98650…01c9135@mainnet-relay.securerpc.com,https://0xa1559…3327a62@relay.ultrasound.money,https://0x8c7d3…c3dae2@relay.wenmerge.com,https://0x8c4ed…5ab677d@titanrelay.xyz")
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

func relayGET(path string) (json.RawMessage, error) {
	for _, base := range relayBases {
		url := strings.TrimRight(base, "/") + path
		resp, err := http.Get(url)
		if err != nil {
			continue
		}
		defer resp.Body.Close()
		if resp.StatusCode/100 != 2 {
			continue
		}
		body, _ := io.ReadAll(resp.Body)
		return json.RawMessage(body), nil
	}
	return nil, errors.New("all relays failed")
}
