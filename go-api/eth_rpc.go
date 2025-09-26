package main

import (
    "bytes"
    "encoding/json"
    "errors"
    "io"
    "net/http"
    "os"
    "strconv"
    "strings"
)

var rpcHTTP = envOr("RPC_HTTP_URL", "http://geth:8545")

func envOr(key, fallback string) string {
    if v := os.Getenv(key); v != "" {
        return v
    }
    return fallback
}

type rpcRequest struct {
    JSONRPC string      `json:"jsonrpc"`
    ID      int         `json:"id"`
    Method  string      `json:"method"`
    Params  interface{} `json:"params"`
}

type rpcResponse struct {
    Result json.RawMessage `json:"result"`
    Error  *struct {
        Code    int    `json:"code"`
        Message string `json:"message"`
    } `json:"error,omitempty"`
}

func rpcCall(method string, params interface{}) (json.RawMessage, error) {
    payload, _ := json.Marshal(rpcRequest{
        JSONRPC: "2.0",
        ID:      1,
        Method:  method,
        Params:  params,
    })
    res, err := http.Post(rpcHTTP, "application/json", bytes.NewReader(payload))
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

func toLower(s string) string { return strings.ToLower(s) }

func hexUint64(v uint64) string {
    return "0x" + strconv.FormatUint(v, 16)
}

func hexInt64(v int64) string {
    return "0x" + strconv.FormatInt(v, 16)
}
