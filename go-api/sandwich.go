// sandwich.go
package main

import (
    "encoding/hex"
    "encoding/json"
    "net/http"
    "sort"
    "strconv"
    "strings"

    "golang.org/x/crypto/sha3"
)

type block struct {
    Number       string `json:"number"`
    Hash         string `json:"hash"`
    Timestamp    string `json:"timestamp"`
    Transactions []struct {
        Hash string `json:"hash"`
        From string `json:"from"`
    } `json:"transactions"`
}

type receipt struct {
    TransactionHash string `json:"transactionHash"`
    Logs            []struct {
        Address string   `json:"address"`
        Topics  []string `json:"topics"`
    } `json:"logs"`
}

type swapEvent struct {
    TxHash   string
    TxFrom   string
    Pool     string
    TxIndex  int
    LogIndex int
}

type sandwich struct {
    Pool     string `json:"pool"`
    Attacker string `json:"attacker"`
    Victim   string `json:"victim"`
    PreTx    string `json:"preTx"`
    VictimTx string `json:"victimTx"`
    PostTx   string `json:"postTx"`
    Block    string `json:"block"`
}

func keccakTopic(signature string) string {
    h := sha3.NewLegacyKeccak256()
    h.Write([]byte(signature))
    var out [32]byte
    h.Sum(out[:0])
    return "0x" + hex.EncodeToString(out[:])
}

var (
    swapTopicV2 = strings.ToLower(keccakTopic("Swap(address,uint256,uint256,uint256,uint256,address)"))
    swapTopicV3 = strings.ToLower(keccakTopic("Swap(address,address,int256,int256,uint160,uint128,int24)"))
)

var sandwichMaxTx = func() int {
    s := envOr("SANDWICH_MAX_TX", "120")
    n, err := strconv.Atoi(s)
    if err != nil {
        return 120
    }
    if n < 10 {
        n = 10
    }
    if n > 1000 {
        n = 1000
    }
    return n
}()

func fetchBlockFull(tag string) (*block, error) {
    raw, err := rpcCall("eth_getBlockByNumber", []any{tag, true})
    if err != nil {
        return nil, err
    }
    var b block
    if err := json.Unmarshal(raw, &b); err != nil {
        return nil, err
    }
    return &b, nil
}

func fetchReceipt(txHash string) (*receipt, error) {
    raw, err := rpcCall("eth_getTransactionReceipt", []any{txHash})
    if err != nil {
        return nil, err
    }
    var r receipt
    if err := json.Unmarshal(raw, &r); err != nil {
        return nil, err
    }
    return &r, nil
}

func collectSwaps(b *block) ([]swapEvent, error) {
    var swaps []swapEvent
    maxN := len(b.Transactions)
    if sandwichMaxTx < maxN {
        maxN = sandwichMaxTx
    }
    for idx := 0; idx < maxN; idx++ {
        tx := b.Transactions[idx]
        rcpt, err := fetchReceipt(tx.Hash)
        if err != nil || rcpt == nil {
            continue
        }
        for logIdx, lg := range rcpt.Logs {
            if len(lg.Topics) == 0 {
                continue
            }
            topic := strings.ToLower(lg.Topics[0])
            if topic != swapTopicV2 && topic != swapTopicV3 {
                continue
            }
            swaps = append(swaps, swapEvent{
                TxHash:   strings.ToLower(tx.Hash),
                TxFrom:   strings.ToLower(tx.From),
                Pool:     strings.ToLower(lg.Address),
                TxIndex:  idx,
                LogIndex: logIdx,
            })
        }
    }
    sort.Slice(swaps, func(i, j int) bool {
        if swaps[i].TxIndex == swaps[j].TxIndex {
            return swaps[i].LogIndex < swaps[j].LogIndex
        }
        return swaps[i].TxIndex < swaps[j].TxIndex
    })
    return swaps, nil
}

func detectSandwiches(swaps []swapEvent, blockNum string) []sandwich {
    grouped := map[string][]swapEvent{}
    for _, s := range swaps {
        grouped[s.Pool] = append(grouped[s.Pool], s)
    }
    var out []sandwich
    for pool, seq := range grouped {
        for i := 0; i+2 < len(seq); i++ {
            pre := seq[i]
            victim := seq[i+1]
            post := seq[i+2]
            if pre.Pool != victim.Pool || victim.Pool != post.Pool {
                continue
            }
            if pre.TxFrom == "" || post.TxFrom == "" || victim.TxFrom == "" {
                continue
            }
            if pre.TxFrom == post.TxFrom && pre.TxFrom != victim.TxFrom {
                out = append(out, sandwich{
                    Pool:     pool,
                    Attacker: pre.TxFrom,
                    Victim:   victim.TxFrom,
                    PreTx:    pre.TxHash,
                    VictimTx: victim.TxHash,
                    PostTx:   post.TxHash,
                    Block:    blockNum,
                })
                i += 2
            }
        }
    }
    return out
}

func handleSandwich(w http.ResponseWriter, r *http.Request) {
    blockTag := r.URL.Query().Get("block")
    if blockTag == "" {
        blockTag = "latest"
    }
    b, err := fetchBlockFull(blockTag)
    if err != nil {
        writeErr(w, http.StatusInternalServerError, "EL_BLOCK_FETCH", "Failed to fetch block", "Check RPC_HTTP_URL and node sync state")
        return
    }
    swaps, err := collectSwaps(b)
    if err != nil {
        writeErr(w, http.StatusInternalServerError, "EL_RECEIPTS", "Failed to scan receipts", "Node may still be syncing or pruning receipts")
        return
    }
    writeOK(w, map[string]any{
        "block":      b.Number,
        "blockHash":  b.Hash,
        "swapCount":  len(swaps),
        "sandwiches": detectSandwiches(swaps, b.Number),
        "sources":    sourcesInfo(),
        "note":       "Heuristic: same address swaps before and after a victim in the same pool (Uniswap V2/V3).",
    })
}
