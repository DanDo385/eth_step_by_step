// tx_decoder.go
// Decodes transaction input data to understand what the transaction is actually doing.
// Identifies token transfers, swaps, contract interactions, and extracts human-readable details.
package main

import (
	"encoding/hex"
	"encoding/json"
	"fmt"
	"math/big"
	"strings"
)

// Common method signatures we care about
var methodSignatures = map[string]string{
	// ERC20 Standard
	"0xa9059cbb": "transfer(address,uint256)",
	"0x23b872dd": "transferFrom(address,address,uint256)",
	"0x095ea7b3": "approve(address,uint256)",

	// Uniswap V2 / Sushiswap
	"0x38ed1739": "swapExactTokensForTokens(uint256,uint256,address[],address,uint256)",
	"0x7ff36ab5": "swapExactETHForTokens(uint256,address[],address,uint256)",
	"0x18cbafe5": "swapExactTokensForETH(uint256,uint256,address[],address,uint256)",
	"0xfb3bdb41": "swapETHForExactTokens(uint256,address[],address,uint256)",
	"0x8803dbee": "swapTokensForExactTokens(uint256,uint256,address[],address,uint256)",
	"0x791ac947": "swapExactTokensForTokensSupportingFeeOnTransferTokens(uint256,uint256,address[],address,uint256)",
	"0xb6f9de95": "swapExactETHForTokensSupportingFeeOnTransferTokens(uint256,address[],address,uint256)",
	"0x5c11d795": "swapExactTokensForETHSupportingFeeOnTransferTokens(uint256,uint256,address[],address,uint256)",

	// Deposit/Withdraw
	"0xd0e30db0": "deposit()",
	"0x2e1a7d4d": "withdraw(uint256)",
	"0xb6b55f25": "deposit(uint256)",
	"0x3ccfd60b": "withdraw()",

	// Staking/Rewards
	"0x4e71d92d": "claim()",
	"0x379607f5": "claim(uint256)",
	"0x2e7ba6ef": "claimReward()",
	"0xe6f1daf2": "claimRewards()",

	// NFT/Minting
	"0x40c10f19": "mint(address,uint256)",
	"0xa0712d68": "mint(uint256)",
	"0x6a627842": "mint(address)",
	"0x94bf804d": "mintWithSignature((address,uint256,string,uint256,uint256,bytes32,bytes))",

	// Execution/Operations
	"0xb61d27f6": "execute(address,uint256,bytes)",
	"0x1cff79cd": "execute(address,bytes)",
	"0x1fad948c": "handleOps((address,uint256,bytes,bytes,uint256,uint256,uint256,uint256,uint256,bytes,bytes)[],address)",

	// Refund
	"0x590e1ae3": "refund()",
	"0xfa89401a": "refund(address)",
}

// Well-known contract addresses
var knownContracts = map[string]string{
	"0x7a250d5630b4cf539739df2c5dacb4c659f2488d": "Uniswap V2 Router",
	"0xe592427a0aece92de3edee1f18e0157c05861564": "Uniswap V3 Router",
	"0x68b3465833fb72a70ecdf485e0e4c7bd8665fc45": "Uniswap V3 Router 2",
	"0xef1c6e67703c7bd7107eed8303fbe6ec2554bf6b": "Uniswap Universal Router",
	"0xd9e1ce17f2641f24ae83637ab66a2cca9c378b9f": "SushiSwap Router",
	"0x1111111254eeb25477b68fb85ed929f73a960582": "1inch V5 Router",
	"0xa5e0829caced8ffdd4de3c43696c57f7d7a678ff": "QuickSwap Router",
	"0xdac17f958d2ee523a2206206994597c13d831ec7": "Tether USD (USDT)",
	"0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48": "USD Coin (USDC)",
	"0x6b175474e89094c44da98b954eedeac495271d0f": "Dai Stablecoin (DAI)",
	"0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2": "Wrapped Ether (WETH)",
	"0x2260fac5e5542a773aa44fbcfedf7c193bc2c599": "Wrapped BTC (WBTC)",
}

// DecodedTx contains human-readable info about what a transaction does
type DecodedTx struct {
	MethodSignature string                 `json:"method_signature,omitempty"`
	MethodName      string                 `json:"method_name,omitempty"`
	ContractType    string                 `json:"contract_type,omitempty"`
	Action          string                 `json:"action,omitempty"`
	ActionType      string                 `json:"action_type,omitempty"` // withdraw, approve, transfer, swap, etc.
	Details         map[string]interface{} `json:"details,omitempty"`
}

// decodeTransactionInput tries to extract meaningful info from tx input data
func decodeTransactionInput(input string, to *string, value string, receipt json.RawMessage) *DecodedTx {
	if input == "" || input == "0x" {
		// Simple ETH transfer
		return &DecodedTx{
			Action: "ETH Transfer",
			Details: map[string]interface{}{
				"type":        "native_transfer",
				"description": "Simple Ether transfer (no contract interaction)",
			},
		}
	}

	// Extract method signature (first 4 bytes / 8 hex chars after 0x)
	if len(input) < 10 {
		return nil
	}

	methodSig := input[:10]
	methodName, known := methodSignatures[methodSig]

	decoded := &DecodedTx{
		MethodSignature: methodSig,
		MethodName:      methodName,
		Details:         make(map[string]interface{}),
	}

	// Identify contract type if known
	if to != nil {
		toAddr := strings.ToLower(*to)
		if contractName, ok := knownContracts[toAddr]; ok {
			decoded.ContractType = contractName
			decoded.Details["contract_name"] = contractName
			decoded.Details["contract_address"] = toAddr
		}
	}

	// Decode based on method
	if !known {
		decoded.Action = "Contract Interaction"
		decoded.ActionType = "unknown"
		decoded.Details["type"] = "unknown_method"
		decoded.Details["description"] = "Unknown method call - possibly a custom contract function"
		return decoded
	}

	// Decode known methods based on action type
	if strings.HasPrefix(methodName, "transfer(") {
		decoded.ActionType = "transfer"
		decodeTransfer(decoded, input)
	} else if strings.HasPrefix(methodName, "transferFrom(") {
		decoded.ActionType = "transferFrom"
		decodeTransferFrom(decoded, input)
	} else if strings.Contains(methodName, "swap") || strings.Contains(methodName, "Swap") {
		decoded.ActionType = "swap"
		decodeSwap(decoded, input, value, receipt)
	} else if strings.HasPrefix(methodName, "approve(") {
		decoded.ActionType = "approve"
		decodeApprove(decoded, input)
	} else if strings.HasPrefix(methodName, "deposit(") {
		decoded.ActionType = "deposit"
		decodeDeposit(decoded, input, value)
	} else if strings.HasPrefix(methodName, "withdraw(") {
		decoded.ActionType = "withdraw"
		decodeWithdraw(decoded, input)
	} else if strings.HasPrefix(methodName, "mint(") || strings.Contains(methodName, "mint") {
		decoded.ActionType = "mint"
		decodeMint(decoded, input)
	} else if strings.HasPrefix(methodName, "claim(") || strings.Contains(methodName, "claim") || strings.Contains(methodName, "Claim") {
		decoded.ActionType = "claim"
		decodeClaim(decoded, input, receipt)
	} else if strings.HasPrefix(methodName, "execute(") {
		decoded.ActionType = "execute"
		decodeExecute(decoded, input)
	} else if strings.Contains(methodName, "handleOps") {
		decoded.ActionType = "handleOps"
		decodeHandleOps(decoded, input)
	} else if strings.HasPrefix(methodName, "refund(") {
		decoded.ActionType = "refund"
		decodeRefund(decoded, input, receipt)
	}

	return decoded
}

// decodeTransfer extracts details from ERC20 transfer/transferFrom
func decodeTransfer(decoded *DecodedTx, input string) {
	decoded.Action = "Token Transfer"
	decoded.Details["type"] = "erc20_transfer"

	if len(input) < 74 {
		return
	}

	// Parse recipient (bytes 4-35, skip 0x and 4-byte selector)
	recipientHex := input[10:74]
	recipient := "0x" + recipientHex[24:] // Last 20 bytes

	// Parse amount (bytes 36-67)
	if len(input) >= 138 {
		amountHex := input[74:138]
		if amount, ok := new(big.Int).SetString(amountHex, 16); ok {
			decoded.Details["recipient"] = strings.ToLower(recipient)
			decoded.Details["amount_wei"] = "0x" + amount.Text(16)
			decoded.Details["description"] = fmt.Sprintf("Transfer tokens to %s", shortenHash(recipient))
		}
	}
}

// decodeApprove extracts details from ERC20 approve
func decodeApprove(decoded *DecodedTx, input string) {
	decoded.Action = "Token Approval"
	decoded.Details["type"] = "erc20_approval"

	if len(input) < 74 {
		return
	}

	// Parse spender address
	spenderHex := input[10:74]
	spender := "0x" + spenderHex[24:]

	// Parse amount
	if len(input) >= 138 {
		amountHex := input[74:138]
		if amount, ok := new(big.Int).SetString(amountHex, 16); ok {
			decoded.Details["spender"] = strings.ToLower(spender)
			decoded.Details["amount_wei"] = "0x" + amount.Text(16)

			// Check if it's unlimited approval
			maxUint256 := new(big.Int)
			maxUint256.SetString("ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff", 16)
			if amount.Cmp(maxUint256) == 0 {
				decoded.Details["description"] = fmt.Sprintf("Grant unlimited approval to %s", shortenHash(spender))
				decoded.Details["unlimited"] = true
			} else {
				decoded.Details["description"] = fmt.Sprintf("Approve %s to spend tokens", shortenHash(spender))
			}
		}
	}
}

// decodeTransferFrom extracts details from ERC20 transferFrom
func decodeTransferFrom(decoded *DecodedTx, input string) {
	decoded.Action = "Token Transfer From"
	decoded.Details["type"] = "erc20_transfer_from"

	if len(input) < 138 {
		return
	}

	// Parse from (bytes 4-35)
	fromHex := input[10:74]
	from := "0x" + fromHex[24:]

	// Parse to (bytes 36-67)
	toHex := input[74:138]
	to := "0x" + toHex[24:]

	// Parse amount (bytes 68-99)
	if len(input) >= 202 {
		amountHex := input[138:202]
		if amount, ok := new(big.Int).SetString(amountHex, 16); ok {
			decoded.Details["from"] = strings.ToLower(from)
			decoded.Details["to"] = strings.ToLower(to)
			decoded.Details["amount_wei"] = "0x" + amount.Text(16)
			decoded.Details["description"] = fmt.Sprintf("Transfer tokens from %s to %s", shortenHash(from), shortenHash(to))
		}
	}
}

// decodeSwap extracts swap details from Uniswap-like DEX calls
func decodeSwap(decoded *DecodedTx, input string, value string, receipt json.RawMessage) {
	decoded.Action = "Token Swap"
	decoded.Details["type"] = "dex_swap"

	// Try to extract path from input (varies by method)
	// Most swap methods have: amountIn, amountOutMin, path[], recipient, deadline
	if len(input) >= 200 {
		decoded.Details["description"] = "Swap tokens via DEX (Uniswap/SushiSwap/etc)"

		// If there's ETH value, it's likely an ETH->Token swap
		if value != "" && value != "0x0" && value != "0x" {
			valueBig, _ := new(big.Int).SetString(strings.TrimPrefix(value, "0x"), 16)
			if valueBig.Cmp(big.NewInt(0)) > 0 {
				decoded.Details["swap_type"] = "eth_to_token"
				decoded.Details["eth_in"] = value
			}
		}
	}

	// Extract transfer events from receipt for actual amounts and calculate prices
	if receipt != nil {
		extractTransferEvents(decoded, receipt)
		calculateSwapPrice(decoded)
	}
}

// decodeDeposit extracts details from deposit calls
func decodeDeposit(decoded *DecodedTx, input string, value string) {
	decoded.Action = "Deposit"
	decoded.Details["type"] = "deposit"

	// Check if ETH was sent
	if value != "" && value != "0x0" && value != "0x" {
		decoded.Details["eth_amount"] = value
		decoded.Details["description"] = fmt.Sprintf("Deposit %s ETH", weiToEthString(value))
	} else if len(input) >= 74 {
		// Try to parse amount parameter
		amountHex := input[10:74]
		if amount, ok := new(big.Int).SetString(amountHex, 16); ok && amount.Cmp(big.NewInt(0)) > 0 {
			decoded.Details["amount_wei"] = "0x" + amount.Text(16)
			decoded.Details["description"] = "Deposit tokens"
		} else {
			decoded.Details["description"] = "Deposit"
		}
	} else {
		decoded.Details["description"] = "Deposit"
	}
}

// decodeWithdraw extracts details from withdraw calls
func decodeWithdraw(decoded *DecodedTx, input string) {
	decoded.Action = "Withdraw"
	decoded.Details["type"] = "withdraw"

	if len(input) >= 74 {
		// Parse amount parameter
		amountHex := input[10:74]
		if amount, ok := new(big.Int).SetString(amountHex, 16); ok && amount.Cmp(big.NewInt(0)) > 0 {
			decoded.Details["amount_wei"] = "0x" + amount.Text(16)
			decoded.Details["description"] = fmt.Sprintf("Withdraw %s tokens/ETH", weiToEthString("0x"+amount.Text(16)))
		} else {
			decoded.Details["description"] = "Withdraw"
		}
	} else {
		decoded.Details["description"] = "Withdraw all"
	}
}

// decodeMint extracts details from mint calls
func decodeMint(decoded *DecodedTx, input string) {
	decoded.Action = "Mint"
	decoded.Details["type"] = "mint"

	if len(input) >= 74 {
		// Could be mint(address) or mint(uint256)
		// Try to parse as address first
		addrHex := input[10:74]
		addr := "0x" + addrHex[24:]
		if len(addrHex) == 64 {
			decoded.Details["to_address"] = strings.ToLower(addr)
		}

		// If there's more data, could be amount
		if len(input) >= 138 {
			amountHex := input[74:138]
			if amount, ok := new(big.Int).SetString(amountHex, 16); ok {
				decoded.Details["amount"] = "0x" + amount.Text(16)
			}
		}
	}

	if strings.Contains(decoded.MethodName, "Signature") {
		decoded.Details["description"] = "Mint with Signature (gasless mint)"
	} else {
		decoded.Details["description"] = "Mint tokens/NFT"
	}
}

// decodeClaim extracts details from claim calls
func decodeClaim(decoded *DecodedTx, input string, receipt json.RawMessage) {
	decoded.Action = "Claim"
	decoded.Details["type"] = "claim"

	// Try to extract amount from transfer events in receipt
	if receipt != nil {
		extractTransferEvents(decoded, receipt)
		if transfers, ok := decoded.Details["transfers"].([]map[string]interface{}); ok && len(transfers) > 0 {
			// Use the first transfer as the claimed amount
			decoded.Details["claimed_amount"] = transfers[0]["amount"]
			decoded.Details["claimed_token"] = transfers[0]["token"]
			if tokenName, ok := transfers[0]["token_name"].(string); ok && tokenName != "" {
				decoded.Details["description"] = fmt.Sprintf("Claim %s rewards", tokenName)
			} else {
				decoded.Details["description"] = "Claim rewards"
			}
		} else {
			decoded.Details["description"] = "Claim rewards"
		}
	} else {
		decoded.Details["description"] = "Claim rewards/tokens"
	}
}

// decodeExecute extracts details from execute calls
func decodeExecute(decoded *DecodedTx, input string) {
	decoded.Action = "Execute"
	decoded.Details["type"] = "execute"
	decoded.Details["description"] = "Execute transaction via smart contract wallet/multisig"

	if len(input) >= 74 {
		// Parse target address
		targetHex := input[10:74]
		target := "0x" + targetHex[24:]
		decoded.Details["target"] = strings.ToLower(target)
	}
}

// decodeHandleOps extracts details from ERC-4337 account abstraction
func decodeHandleOps(decoded *DecodedTx, input string) {
	decoded.Action = "Handle Operations"
	decoded.Details["type"] = "handle_ops"
	decoded.Details["description"] = "Process bundled user operations (ERC-4337 Account Abstraction)"
}

// decodeRefund extracts details from refund calls
func decodeRefund(decoded *DecodedTx, input string, receipt json.RawMessage) {
	decoded.Action = "Refund"
	decoded.Details["type"] = "refund"

	// Try to extract transfer events to see refund amount
	if receipt != nil {
		extractTransferEvents(decoded, receipt)
	}

	decoded.Details["description"] = "Refund ETH/tokens"
}

// extractTransferEvents parses receipt logs to find Transfer events
func extractTransferEvents(decoded *DecodedTx, receipt json.RawMessage) {
	var rec struct {
		Logs []struct {
			Address string   `json:"address"`
			Topics  []string `json:"topics"`
			Data    string   `json:"data"`
		} `json:"logs"`
	}

	if err := json.Unmarshal(receipt, &rec); err != nil {
		return
	}

	// Transfer event signature: 0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef
	transferSig := "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef"

	transfers := []map[string]interface{}{}
	for _, log := range rec.Logs {
		if len(log.Topics) >= 3 && log.Topics[0] == transferSig {
			// Parse from/to/value from topics and data
			from := "0x" + log.Topics[1][26:]
			to := "0x" + log.Topics[2][26:]

			// Value is in data field
			valueHex := strings.TrimPrefix(log.Data, "0x")
			if len(valueHex) == 0 {
				valueHex = "0"
			}

			transfer := map[string]interface{}{
				"token":     strings.ToLower(log.Address),
				"from":      strings.ToLower(from),
				"to":        strings.ToLower(to),
				"amount":    "0x" + valueHex,
				"token_name": knownContracts[strings.ToLower(log.Address)],
			}

			transfers = append(transfers, transfer)
		}
	}

	if len(transfers) > 0 {
		decoded.Details["transfers"] = transfers
		decoded.Details["transfer_count"] = len(transfers)

		// If we have 2+ transfers, it's likely a swap
		if len(transfers) >= 2 {
			decoded.Details["description"] = fmt.Sprintf("Swapped via DEX (%d token transfers detected)", len(transfers))
		}
	}
}

// shortenHash truncates an address for display
func shortenHash(addr string) string {
	if len(addr) <= 10 {
		return addr
	}
	return addr[:6] + "..." + addr[len(addr)-4:]
}

// calculateSwapPrice tries to calculate the exchange rate from swap transfers
func calculateSwapPrice(decoded *DecodedTx) {
	transfers, ok := decoded.Details["transfers"].([]map[string]interface{})
	if !ok || len(transfers) < 2 {
		return
	}

	// For a simple swap, we should have at least 2 transfers
	// Typically: token A out, token B in (or vice versa)
	var tokenIn, tokenOut map[string]interface{}
	var amountIn, amountOut *big.Float

	// Try to identify input and output tokens
	for i, transfer := range transfers {
		amount := transfer["amount"].(string)
		amountBig, ok := new(big.Int).SetString(strings.TrimPrefix(amount, "0x"), 16)
		if !ok {
			continue
		}

		amountFloat := new(big.Float).SetInt(amountBig)
		amountFloat.Quo(amountFloat, big.NewFloat(1e18)) // Convert to human readable

		if i == 0 {
			tokenIn = transfer
			amountIn = amountFloat
		} else {
			tokenOut = transfer
			amountOut = amountFloat
		}
	}

	if tokenIn != nil && tokenOut != nil && amountIn != nil && amountOut != nil {
		// Calculate price (how much of tokenOut per 1 tokenIn)
		price := new(big.Float).Quo(amountOut, amountIn)

		decoded.Details["swap_from_token"] = tokenIn["token"]
		decoded.Details["swap_from_token_name"] = tokenIn["token_name"]
		decoded.Details["swap_from_amount"] = tokenIn["amount"]
		decoded.Details["swap_from_amount_formatted"] = amountIn.Text('f', 6)

		decoded.Details["swap_to_token"] = tokenOut["token"]
		decoded.Details["swap_to_token_name"] = tokenOut["token_name"]
		decoded.Details["swap_to_amount"] = tokenOut["amount"]
		decoded.Details["swap_to_amount_formatted"] = amountOut.Text('f', 6)

		decoded.Details["exchange_rate"] = price.Text('f', 6)
		decoded.Details["price_per_token"] = fmt.Sprintf("1 %v = %s %v",
			firstNonEmpty(tokenIn["token_name"], shortenHash(tokenIn["token"].(string))),
			price.Text('f', 6),
			firstNonEmpty(tokenOut["token_name"], shortenHash(tokenOut["token"].(string))),
		)
	}
}

// weiToEthString converts wei (hex string) to ETH string
func weiToEthString(weiHex string) string {
	wei, ok := new(big.Int).SetString(strings.TrimPrefix(weiHex, "0x"), 16)
	if !ok {
		return "0"
	}

	eth := new(big.Float).SetInt(wei)
	eth.Quo(eth, big.NewFloat(1e18))

	return eth.Text('f', 6)
}

// firstNonEmpty returns the first non-empty string
func firstNonEmpty(vals ...interface{}) string {
	for _, v := range vals {
		if s, ok := v.(string); ok && s != "" {
			return s
		}
	}
	return ""
}

// Helper to decode hex string to []byte
func decodeHex(s string) []byte {
	s = strings.TrimPrefix(s, "0x")
	b, _ := hex.DecodeString(s)
	return b
}
