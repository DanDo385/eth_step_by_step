package main

import (
    "encoding/json"
    "net/http"
    "strconv"
    "strings"
)

type tx struct {
    Hash        string  `json:"hash"`
    From        string  `json:"from"`
    To          *string `json:"to"`
    BlockHash   *string `json:"blockHash"`
    BlockNumber *string `json:"blockNumber"`
    Nonce       string  `json:"nonce"`
    GasPrice    *string `json:"gasPrice"`
    MaxFeePerGas *string `json:"maxFeePerGas"`
}

func parseHexUint64(h string) (uint64, error) {
    return strconv.ParseUint(strings.TrimPrefix(h, "0x"), 16, 64)
}

func handleTrackTx(w http.ResponseWriter, r *http.Request) {
    hash := r.URL.Path[len("/api/track/tx/"):]
    if hash == "" {
        writeErr(w, http.StatusBadRequest, "BAD_REQUEST", "Missing transaction hash", "Invoke /api/track/tx/{hash}")
        return
    }

    rawTx, err := rpcCall("eth_getTransactionByHash", []interface{}{hash})
    if err != nil || string(rawTx) == "null" {
        writeErr(w, http.StatusNotFound, "TX_NOT_FOUND", "Transaction not visible on this execution node", "Pending txs propagate unevenly; ensure your node peers see it")
        return
    }

    var t tx
    if err := json.Unmarshal(rawTx, &t); err != nil {
        writeErr(w, http.StatusInternalServerError, "TX_DECODE", "Failed to decode transaction", "")
        return
    }

    pending := t.BlockNumber == nil

    resp := map[string]any{
        "hash":  t.Hash,
        "from":  t.From,
        "to":    t.To,
        "mempool": map[string]any{
            "pending":     pending,
            "explanation": "If pending, the tx has not been included in a block yet. Mempool visibility varies per node.",
        },
        "pbs_relay_bidtrace": nil,
        "beacon":             nil,
        "education":          "PBS is off-chain; we infer activity via relay bidtraces. Finality lags proposal by epochs.",
    }

    if !pending && t.BlockNumber != nil {
        inclusion := map[string]any{
            "blockNumber": *t.BlockNumber,
        }
        rawBlock, err := rpcCall("eth_getBlockByNumber", []interface{}{*t.BlockNumber, false})
        if err == nil && string(rawBlock) != "null" {
            var b struct {
                Hash      string `json:"hash"`
                Timestamp string `json:"timestamp"`
            }
            if json.Unmarshal(rawBlock, &b) == nil {
                inclusion["blockHash"] = b.Hash
                inclusion["timestamp"] = b.Timestamp

                // track relays by block number
                if n, err := parseHexUint64(*t.BlockNumber); err == nil {
                    rawRel, relErr := relayGET("/relay/v1/data/bidtraces/proposer_payload_delivered?limit=200")
                    if relErr == nil {
                        var entries []map[string]any
                        if json.Unmarshal(rawRel, &entries) == nil {
                            for _, entry := range entries {
                                if bn, ok := entry["block_number"].(string); ok && bn == strconv.FormatUint(n, 10) {
                                    resp["pbs_relay_bidtrace"] = entry
                                    break
                                }
                            }
                        }
                    }

                    // beacon finality approximation
                    if resp["pbs_relay_bidtrace"] == nil {
                        // even if relay search fails we still compute finality
                    }

                    if rawGenesis, _, err := beaconGET("/eth/v1/beacon/genesis"); err == nil {
                        var genesis struct {
                            Data struct {
                                GenesisTime string `json:"genesis_time"`
                            } `json:"data"`
                        }
                        if json.Unmarshal(rawGenesis, &genesis) == nil {
                            tsHex := strings.TrimPrefix(b.Timestamp, "0x")
                            blockTs, _ := strconv.ParseUint(tsHex, 16, 64)
                            genesisTs, _ := strconv.ParseUint(genesis.Data.GenesisTime, 10, 64)
                            var slot uint64
                            if blockTs >= genesisTs {
                                slot = (blockTs - genesisTs) / 12
                            }
                            rawFinality, _, err := beaconGET("/eth/v1/beacon/states/finalized/finality_checkpoints")
                            if err == nil {
                                var final struct {
                                    Data struct {
                                        Finalized struct {
                                            Epoch string `json:"epoch"`
                                        } `json:"finalized"`
                                    } `json:"data"`
                                }
                                if json.Unmarshal(rawFinality, &final) == nil {
                                    epoch, _ := strconv.ParseUint(final.Data.Finalized.Epoch, 10, 64)
                                    finalizedSlot := epoch*32 + 31
                                    resp["beacon"] = map[string]any{
                                        "slot":         slot,
                                        "is_finalized": slot <= finalizedSlot,
                                        "finalized_epoch": epoch,
                                        "note":         "Approximation: compares block slot against finalized epoch boundary.",
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
        resp["inclusion"] = inclusion
    }

    writeOK(w, resp)
}
