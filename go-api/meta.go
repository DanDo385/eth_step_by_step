// meta.go
package main

import (
	"net/url"
	"strings"
)

// sanitizeURL removes API keys and sensitive parameters from URLs
func sanitizeURL(rawURL string) string {
	if rawURL == "" {
		return ""
	}

	// Parse the URL
	u, err := url.Parse(rawURL)
	if err != nil {
		// If parsing fails, try to redact common patterns
		return redactAPIKey(rawURL)
	}

	// Remove userinfo (username:password)
	u.User = nil

	// Remove sensitive query parameters
	q := u.Query()
	for key := range q {
		lowerKey := strings.ToLower(key)
		if strings.Contains(lowerKey, "key") || strings.Contains(lowerKey, "token") || strings.Contains(lowerKey, "secret") {
			q.Del(key)
		}
	}
	u.RawQuery = q.Encode()

	// Redact API keys in path
	u.Path = redactAPIKey(u.Path)

	return u.String()
}

// redactAPIKey removes common API key patterns from a string
func redactAPIKey(s string) string {
	// Redact Infura, Alchemy, and similar API keys (typically 32-40 character hex strings)
	// Pattern: /v3/[hex], /v2/[hex], /ws/v3/[hex]
	s = strings.ReplaceAll(s, "/v3/", "/v3/[REDACTED]")
	s = strings.ReplaceAll(s, "/v2/", "/v2/[REDACTED]")

	// Remove the actual key after redaction markers
	parts := strings.Split(s, "/[REDACTED]")
	if len(parts) > 1 {
		// Keep everything before [REDACTED], drop everything after
		return parts[0] + "/[REDACTED]"
	}

	return s
}

// sourcesInfo returns a summary of configured upstream feeds so the UI can display
// which services are backing each panel. Values come from package-level vars.
// API keys and sensitive credentials are sanitized.
func sourcesInfo() map[string]any {
	sanitizedRelays := make([]string, len(relayBases))
	for i, relay := range relayBases {
		sanitizedRelays[i] = sanitizeURL(relay)
	}

	return map[string]any{
		"rpc_http":   sanitizeURL(rpcHTTP),
		"rpc_ws":     sanitizeURL(rpcWS),
		"beacon_api": sanitizeURL(beaconBase),
		"relays":     sanitizedRelays,
	}
}

