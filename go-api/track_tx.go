// track_tx.go
package main

import (
    "encoding/json"
    "net/http"
    "strconv"
    "strings"
)

type tx struct {
    Hash             string  `json:"hash"`
    From             string  `json:"from"`
    To               *string `json:"to"`
    BlockHash        *string `json:"blockHash"`
    BlockNumber      *string `json:"blockNumber"`
    Nonce            string  `json:"nonce"`
    GasPrice         *string `json:"gasPrice"`
    MaxFeePerGas     *string `json:"maxFeePerGas"`
    MaxPriorityFeePerGas *string `json:"maxPriorityFeePerGas"`
    Gas              string  `json:"gas"`
    Value            string  `json:"value"`
    Input            string  `json:"input"`
    TransactionIndex *string `json:"transactionIndex"`
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

    rawTx, err := rpcCall("eth_getTransactionByHash", []any{hash})
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

    // Economic details
    economics := map[string]any{
        "value": t.Value,
        "gas_limit": t.Gas,
    }
    if t.GasPrice != nil {
        economics["gas_price"] = *t.GasPrice
    }
    if t.MaxFeePerGas != nil {
        economics["max_fee_per_gas"] = *t.MaxFeePerGas
    }
    if t.MaxPriorityFeePerGas != nil {
        economics["max_priority_fee_per_gas"] = *t.MaxPriorityFeePerGas
    }

    resp := map[string]any{
        "hash":       t.Hash,
        "from":       t.From,
        "to":         t.To,
        "economics":  economics,
        "status":     map[string]any{"pending": pending},
        "pbs_relay":  nil,
        "beacon":     nil,
    }

    // Get receipt for actual gas used and status
    if !pending {
        rawReceipt, err := rpcCall("eth_getTransactionReceipt", []any{t.Hash})
        if err == nil && string(rawReceipt) != "null" {
            var receipt struct {
                Status          string `json:"status"`
                GasUsed         string `json:"gasUsed"`
                EffectiveGasPrice string `json:"effectiveGasPrice"`
            }
            if json.Unmarshal(rawReceipt, &receipt) == nil {
                economics["gas_used"] = receipt.GasUsed
                economics["effective_gas_price"] = receipt.EffectiveGasPrice
                resp["status"] = map[string]any{
                    "pending": false,
                    "success": receipt.Status == "0x1",
                }
            }
        }
    }

    if !pending && t.BlockNumber != nil {
        inclusion := map[string]any{
            "block_number": *t.BlockNumber,
        }
        if t.TransactionIndex != nil {
            inclusion["transaction_index"] = *t.TransactionIndex
        }

        rawBlock, err := rpcCall("eth_getBlockByNumber", []any{*t.BlockNumber, true})
        if err == nil && string(rawBlock) != "null" {
            var b struct {
                Hash         string `json:"hash"`
                Timestamp    string `json:"timestamp"`
                Miner        string `json:"miner"`
                GasUsed      string `json:"gasUsed"`
                GasLimit     string `json:"gasLimit"`
                Transactions []map[string]any `json:"transactions"`
            }
            if json.Unmarshal(rawBlock, &b) == nil {
                inclusion["block_hash"] = b.Hash
                inclusion["timestamp"] = b.Timestamp
                inclusion["miner"] = b.Miner
                inclusion["block_gas_used"] = b.GasUsed
                inclusion["block_gas_limit"] = b.GasLimit
                inclusion["total_transactions"] = len(b.Transactions)

                // Get neighboring transactions (before and after this one)
                if t.TransactionIndex != nil {
                    txIdx, _ := parseHexUint64(*t.TransactionIndex)
                    neighbors := []map[string]any{}

                    // Add up to 2 transactions before
                    start := int(txIdx) - 2
                    if start < 0 {
                        start = 0
                    }

                    // Add up to 2 transactions after
                    end := int(txIdx) + 3
                    if end > len(b.Transactions) {
                        end = len(b.Transactions)
                    }

                    for i := start; i < end; i++ {
                        tx := b.Transactions[i]
                        neighbors = append(neighbors, map[string]any{
                            "index": i,
                            "hash":  tx["hash"],
                            "from":  tx["from"],
                            "to":    tx["to"],
                            "value": tx["value"],
                        })
                    }
                    inclusion["neighboring_transactions"] = neighbors
                }

                // track relays by block number
                if n, err := parseHexUint64(*t.BlockNumber); err == nil {
                    rawRel, relErr := relayGET("/relay/v1/data/bidtraces/proposer_payload_delivered?limit=200")
                    if relErr == nil {
                        var entries []map[string]any
                        if json.Unmarshal(rawRel, &entries) == nil {
                            for _, entry := range entries {
                                if bn, ok := entry["block_number"].(string); ok && bn == strconv.FormatUint(n, 10) {
                                    resp["pbs_relay"] = map[string]any{
                                        "builder_pubkey": entry["builder_pubkey"],
                                        "proposer_pubkey": entry["proposer_pubkey"],
                                        "value": entry["value"],
                                        "relay": entry["relay"],
                                    }
                                    break
                                }
                            }
                        }
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
                                        "slot":            slot,
                                        "is_finalized":    slot <= finalizedSlot,
                                        "finalized_epoch": epoch,
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
