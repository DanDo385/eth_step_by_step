// eth_rpc.go
// This file handles talking to the Ethereum execution layer (where all the transactions live).
// We use JSON-RPC over HTTP to grab blocks, transactions, and mempool data.
package main

import (
	"bufio"
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"os"
	"strconv"
	"strings"
	"time"
)

var rpcHTTP string
var rpcWS string
var rpcHTTPClient *http.Client

func init() {
	// Load .env.local first so we can use custom RPC endpoints
	loadEnvFile(".env.local")

	// Default to Alchemy's public demo endpoint (works but has rate limits)
	rpcHTTP = envOr("RPC_HTTP_URL", "https://eth-mainnet.g.alchemy.com/v2/demo")
	rpcWS = envOr("RPC_WS_URL", "")

	// Debug output to help troubleshoot mempool issues
	fmt.Printf("DEBUG: RPC_WS_URL = %s\n", rpcWS)
	fmt.Printf("DEBUG: MEMPOOL_DISABLE = %s\n", os.Getenv("MEMPOOL_DISABLE"))

	// Set up HTTP client with a reasonable timeout
	// If your RPC is slow, bump RPC_TIMEOUT_SECONDS in .env.local
	to := 5 * time.Second
	if s := os.Getenv("RPC_TIMEOUT_SECONDS"); s != "" {
		if n, err := strconv.Atoi(s); err == nil && n > 0 && n <= 60 {
			to = time.Duration(n) * time.Second
		}
	}
	rpcHTTPClient = &http.Client{Timeout: to}
}

// loadEnvFile reads a .env file and loads all KEY=VALUE pairs into environment variables.
// Skips comments (#) and blank lines. If the file doesn't exist, that's fine - we just use defaults.
func loadEnvFile(filename string) {
	file, err := os.Open(filename)
	if err != nil {
		return // No .env file? No problem, we'll use defaults
	}
	defer file.Close()

	scanner := bufio.NewScanner(file)
	for scanner.Scan() {
		line := strings.TrimSpace(scanner.Text())
		// Skip empty lines and comments
		if line == "" || strings.HasPrefix(line, "#") {
			continue
		}
		parts := strings.SplitN(line, "=", 2)
		if len(parts) == 2 {
			key := strings.TrimSpace(parts[0])
			value := strings.TrimSpace(parts[1])
			os.Setenv(key, value)
		}
	}
}

// envOr grabs an environment variable, or returns a fallback if it's not set
func envOr(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}

// rpcRequest is the structure we send to Ethereum nodes via JSON-RPC
type rpcRequest struct {
	JSONRPC string `json:"jsonrpc"`
	ID      int    `json:"id"`
	Method  string `json:"method"`
	Params  any    `json:"params"`
}

// rpcResponse is what comes back from the RPC endpoint
type rpcResponse struct {
	Result json.RawMessage `json:"result"`
	Error  *struct {
		Code    int    `json:"code"`
		Message string `json:"message"`
	} `json:"error,omitempty"`
}

// rpcCall does the actual work of calling the Ethereum JSON-RPC endpoint.
// It handles errors, updates health status, and returns the raw result.
func rpcCall(method string, params any) (json.RawMessage, error) {
	payload, _ := json.Marshal(rpcRequest{
		JSONRPC: "2.0",
		ID:      1,
		Method:  method,
		Params:  params,
	})

	res, err := rpcHTTPClient.Post(rpcHTTP, "application/json", bytes.NewReader(payload))
	if err != nil {
		// Let the health monitor know this failed
		if rpcHealth != nil {
			rpcHealth.SetError(err)
		}
		return nil, err
	}
	defer res.Body.Close()

	body, _ := io.ReadAll(res.Body)
	var parsed rpcResponse
	if err := json.Unmarshal(body, &parsed); err != nil {
		if rpcHealth != nil {
			rpcHealth.SetError(err)
		}
		return nil, err
	}

	// RPC can return errors inside a 200 OK response, so check for those
	if parsed.Error != nil {
		err := errors.New(parsed.Error.Message)
		if rpcHealth != nil {
			rpcHealth.SetError(err)
		}
		return nil, err
	}

	// Success! Update health check
	if rpcHealth != nil {
		rpcHealth.SetSuccess()
	}

	return parsed.Result, nil
}
