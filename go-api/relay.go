package main

import (
    "encoding/json"
    "errors"
    "io"
    "net/http"
    "strings"
)

var relayBases = func() []string {
    raw := envOr("RELAY_URLS", "https://boost-relay.flashbots.net")
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
