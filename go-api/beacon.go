package main

import (
	"encoding/json"
	"io"
	"net/http"
	"strings"
)

var beaconBase = envOr("BEACON_API_URL", "https://beacon.prylabs.net")

func beaconGET(path string) (json.RawMessage, int, error) {
	url := strings.TrimRight(beaconBase, "/") + path
	resp, err := http.Get(url)
	if err != nil {
		return nil, 0, err
	}
	defer resp.Body.Close()
	body, _ := io.ReadAll(resp.Body)
	return json.RawMessage(body), resp.StatusCode, nil
}
