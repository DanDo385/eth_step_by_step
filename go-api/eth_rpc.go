// eth_rpc.go
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
	// Load environment variables from .env.local
	loadEnvFile(".env.local")

	// Initialize variables after loading env
	rpcHTTP = envOr("RPC_HTTP_URL", "https://eth-mainnet.g.alchemy.com/v2/demo")
	rpcWS = envOr("RPC_WS_URL", "")

	// Debug output
	fmt.Printf("DEBUG: RPC_WS_URL = %s\n", rpcWS)
	fmt.Printf("DEBUG: MEMPOOL_DISABLE = %s\n", os.Getenv("MEMPOOL_DISABLE"))
	// HTTP client with timeout for JSON-RPC
	to := 5 * time.Second
	if s := os.Getenv("RPC_TIMEOUT_SECONDS"); s != "" {
		if n, err := strconv.Atoi(s); err == nil && n > 0 && n <= 60 {
			to = time.Duration(n) * time.Second
		}
	}
	rpcHTTPClient = &http.Client{Timeout: to}
}

func loadEnvFile(filename string) {
	file, err := os.Open(filename)
	if err != nil {
		return // File doesn't exist, skip
	}
	defer file.Close()

	scanner := bufio.NewScanner(file)
	for scanner.Scan() {
		line := strings.TrimSpace(scanner.Text())
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

func envOr(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}

type rpcRequest struct {
	JSONRPC string `json:"jsonrpc"`
	ID      int    `json:"id"`
	Method  string `json:"method"`
	Params  any    `json:"params"`
}

type rpcResponse struct {
	Result json.RawMessage `json:"result"`
	Error  *struct {
		Code    int    `json:"code"`
		Message string `json:"message"`
	} `json:"error,omitempty"`
}

func rpcCall(method string, params any) (json.RawMessage, error) {
	payload, _ := json.Marshal(rpcRequest{
		JSONRPC: "2.0",
		ID:      1,
		Method:  method,
		Params:  params,
	})
	res, err := rpcHTTPClient.Post(rpcHTTP, "application/json", bytes.NewReader(payload))
	if err != nil {
		return nil, err
	}
	defer res.Body.Close()
	body, _ := io.ReadAll(res.Body)
	var parsed rpcResponse
	if err := json.Unmarshal(body, &parsed); err != nil {
		return nil, err
	}
	if parsed.Error != nil {
		return nil, errors.New(parsed.Error.Message)
	}
	return parsed.Result, nil
}
