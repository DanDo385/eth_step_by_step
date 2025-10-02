/*
 * TransactionView.tsx
 * Human-readable display of a single transaction's complete lifecycle.
 * Shows economics (gas fees, value), MEV/PBS data (builder, relay), and finality journey.
 * Converts all hex values to decimal and wei/gwei to ETH for readability.
 */
import React from 'react';
import { weiToEth, hexToGwei, hexToNumber, shortenHash, formatNumber, slotToEpoch } from '../utils/format';

interface TransactionViewProps {
  data: any;
}

export default function TransactionView({ data }: TransactionViewProps) {
  if (!data) return null;

  const isPending = data.status?.pending ?? true;
  const inclusion = data.inclusion;
  const economics = data.economics;
  const beacon = data.beacon;
  const pbsRelay = data.pbs_relay;
  const decoded = data.decoded;

  return (
    <div className="space-y-4 text-sm">
      {/* Overview Section */}
      <div className="border-l-4 border-blue-500 pl-4">
        <h3 className="font-semibold text-white mb-2 flex items-center gap-2">
          📊 Transaction Overview
          {decoded?.action_type && (
            <span className="ml-2 px-2 py-0.5 bg-blue-500/20 text-blue-300 text-xs rounded">
              {decoded.action_type.toUpperCase()}
            </span>
          )}
        </h3>
        <div className="space-y-1 text-white/80">
          <div className="flex justify-between">
            <span className="text-white/60">Status:</span>
            <span className="font-medium">
              {isPending ? (
                <span className="text-yellow-400">⏳ Pending</span>
              ) : (
                <span className="text-green-400">
                  ✅ Confirmed in Block {hexToNumber(inclusion?.block_number || '0x0').toLocaleString()}
                </span>
              )}
            </span>
          </div>
          {!isPending && inclusion?.timestamp && (
            <div className="flex justify-between">
              <span className="text-white/60">Block Time:</span>
              <span>{new Date(hexToNumber(inclusion.timestamp) * 1000).toLocaleString()}</span>
            </div>
          )}
          <div className="flex justify-between">
            <span className="text-white/60">From:</span>
            <span className="font-mono text-xs">{data.from}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-white/60">To:</span>
            <span className="font-mono text-xs">{data.to || '(Contract Creation)'}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-white/60">Value:</span>
            <span className="font-medium">{weiToEth(economics?.value || '0x0')} ETH</span>
          </div>

          {/* Transaction-Type Specific Fields */}
          {decoded?.action_type === 'swap' && decoded.details?.swap_from_amount_formatted && (
            <>
              <div className="border-t border-white/10 my-2 pt-2">
                <div className="text-white/60 text-xs mb-1">Swap Details:</div>
              </div>
              <div className="flex justify-between">
                <span className="text-white/60">From:</span>
                <span className="font-medium text-purple-400">
                  {decoded.details.swap_from_amount_formatted} {decoded.details.swap_from_token_name || 'tokens'}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-white/60">To:</span>
                <span className="font-medium text-green-400">
                  {decoded.details.swap_to_amount_formatted} {decoded.details.swap_to_token_name || 'tokens'}
                </span>
              </div>
              {decoded.details.price_per_token && (
                <div className="flex justify-between">
                  <span className="text-white/60">Exchange Rate:</span>
                  <span className="text-xs">{decoded.details.price_per_token}</span>
                </div>
              )}
            </>
          )}

          {decoded?.action_type === 'transfer' && decoded.details?.amount_wei && (
            <>
              <div className="border-t border-white/10 my-2 pt-2">
                <div className="text-white/60 text-xs mb-1">Transfer Details:</div>
              </div>
              <div className="flex justify-between">
                <span className="text-white/60">Amount:</span>
                <span className="font-medium">{weiToEth(decoded.details.amount_wei as string)} tokens</span>
              </div>
              {decoded.details.recipient && (
                <div className="flex justify-between">
                  <span className="text-white/60">Recipient:</span>
                  <span className="font-mono text-xs">{shortenHash(decoded.details.recipient as string)}</span>
                </div>
              )}
            </>
          )}

          {decoded?.action_type === 'transferFrom' && decoded.details?.amount_wei && (
            <>
              <div className="border-t border-white/10 my-2 pt-2">
                <div className="text-white/60 text-xs mb-1">Transfer Details:</div>
              </div>
              <div className="flex justify-between">
                <span className="text-white/60">Amount:</span>
                <span className="font-medium">{weiToEth(decoded.details.amount_wei as string)} tokens</span>
              </div>
              {decoded.details.from && (
                <div className="flex justify-between">
                  <span className="text-white/60">From:</span>
                  <span className="font-mono text-xs">{shortenHash(decoded.details.from as string)}</span>
                </div>
              )}
              {decoded.details.to && (
                <div className="flex justify-between">
                  <span className="text-white/60">To:</span>
                  <span className="font-mono text-xs">{shortenHash(decoded.details.to as string)}</span>
                </div>
              )}
            </>
          )}

          {decoded?.action_type === 'approve' && decoded.details?.amount_wei && (
            <>
              <div className="border-t border-white/10 my-2 pt-2">
                <div className="text-white/60 text-xs mb-1">Approval Details:</div>
              </div>
              {decoded.details.spender && (
                <div className="flex justify-between">
                  <span className="text-white/60">Spender:</span>
                  <span className="font-mono text-xs">{shortenHash(decoded.details.spender as string)}</span>
                </div>
              )}
              <div className="flex justify-between">
                <span className="text-white/60">Amount:</span>
                <span className="font-medium">
                  {decoded.details.unlimited ? (
                    <span className="text-yellow-400">Unlimited ⚠️</span>
                  ) : (
                    weiToEth(decoded.details.amount_wei as string) + ' tokens'
                  )}
                </span>
              </div>
            </>
          )}

          {(decoded?.action_type === 'deposit' || decoded?.action_type === 'withdraw') && (
            <>
              <div className="border-t border-white/10 my-2 pt-2">
                <div className="text-white/60 text-xs mb-1">{decoded.action_type === 'deposit' ? 'Deposit' : 'Withdraw'} Details:</div>
              </div>
              {decoded.details?.amount_wei && (
                <div className="flex justify-between">
                  <span className="text-white/60">Amount:</span>
                  <span className="font-medium">{weiToEth(decoded.details.amount_wei as string)} tokens/ETH</span>
                </div>
              )}
              {decoded.details?.eth_amount && (
                <div className="flex justify-between">
                  <span className="text-white/60">ETH Amount:</span>
                  <span className="font-medium">{weiToEth(decoded.details.eth_amount as string)} ETH</span>
                </div>
              )}
            </>
          )}

          {decoded?.action_type === 'mint' && (
            <>
              <div className="border-t border-white/10 my-2 pt-2">
                <div className="text-white/60 text-xs mb-1">Mint Details:</div>
              </div>
              {decoded.details?.to_address && (
                <div className="flex justify-between">
                  <span className="text-white/60">Recipient:</span>
                  <span className="font-mono text-xs">{shortenHash(decoded.details.to_address as string)}</span>
                </div>
              )}
              {decoded.details?.amount && (
                <div className="flex justify-between">
                  <span className="text-white/60">Amount:</span>
                  <span className="font-medium">{weiToEth(decoded.details.amount as string)}</span>
                </div>
              )}
            </>
          )}

          {decoded?.action_type === 'claim' && decoded.details?.claimed_amount && (
            <>
              <div className="border-t border-white/10 my-2 pt-2">
                <div className="text-white/60 text-xs mb-1">Claim Details:</div>
              </div>
              <div className="flex justify-between">
                <span className="text-white/60">Claimed:</span>
                <span className="font-medium text-green-400">{weiToEth(decoded.details.claimed_amount as string)} {decoded.details.claimed_token_name || 'tokens'}</span>
              </div>
            </>
          )}

          {decoded?.action_type === 'execute' && decoded.details?.target && (
            <>
              <div className="border-t border-white/10 my-2 pt-2">
                <div className="text-white/60 text-xs mb-1">Execute Details:</div>
              </div>
              <div className="flex justify-between">
                <span className="text-white/60">Target:</span>
                <span className="font-mono text-xs">{shortenHash(decoded.details.target as string)}</span>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Decoded Transaction Section */}
      {decoded && (
        <div className="border-l-4 border-indigo-500 pl-4">
          <h3 className="font-semibold text-white mb-2 flex items-center gap-2">
            🔍 What This Transaction Does
          </h3>
          <div className="space-y-2 text-white/80">
            <div className="flex justify-between items-start">
              <span className="text-white/60">Action:</span>
              <span className="font-medium text-indigo-400">{decoded.action}</span>
            </div>

            {decoded.contract_type && (
              <div className="flex justify-between items-start">
                <span className="text-white/60">Contract:</span>
                <span className="text-white">{decoded.contract_type}</span>
              </div>
            )}

            {decoded.method_name && (
              <div className="flex justify-between items-start">
                <span className="text-white/60">Method:</span>
                <span className="font-mono text-xs text-purple-400">{decoded.method_name}</span>
              </div>
            )}

            {decoded.details?.description && (
              <div className="mt-2 p-2 bg-indigo-500/10 border border-indigo-500/20 rounded text-sm">
                {decoded.details.description}
              </div>
            )}

            {/* Token Transfers */}
            {decoded.details?.transfers && Array.isArray(decoded.details.transfers) && (
              <div className="mt-3">
                <div className="text-white/60 text-xs mb-2">Token Transfers ({decoded.details.transfer_count}):</div>
                <div className="space-y-2">
                  {(decoded.details.transfers as any[]).map((transfer: any, idx: number) => (
                    <div key={idx} className="bg-white/5 rounded p-2 text-xs">
                      <div className="flex justify-between">
                        <span className="text-white/60">Token:</span>
                        <span className="font-medium">{transfer.token_name || shortenHash(transfer.token)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-white/60">Amount:</span>
                        <span>{weiToEth(transfer.amount)} tokens</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-white/60">From:</span>
                        <span className="font-mono">{shortenHash(transfer.from)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-white/60">To:</span>
                        <span className="font-mono">{shortenHash(transfer.to)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Swap Details */}
            {decoded.details?.swap_type && (
              <div className="mt-2 p-2 bg-purple-500/10 border border-purple-500/20 rounded text-xs">
                <div className="font-medium text-purple-400 mb-1">DEX Swap Detected</div>
                <div className="text-white/80">
                  Type: {decoded.details.swap_type === 'eth_to_token' ? 'ETH → Token' : 'Token Swap'}
                </div>
                {decoded.details.eth_in && (
                  <div className="text-white/80">
                    ETH In: {weiToEth(decoded.details.eth_in as string)} ETH
                  </div>
                )}
              </div>
            )}

            {/* Approval Details */}
            {decoded.details?.spender && (
              <div className="mt-2 space-y-1">
                <div className="flex justify-between">
                  <span className="text-white/60">Spender:</span>
                  <span className="font-mono text-xs">{shortenHash(decoded.details.spender as string)}</span>
                </div>
                {decoded.details.amount_wei && !decoded.details.unlimited && (
                  <div className="flex justify-between">
                    <span className="text-white/60">Amount:</span>
                    <span>{weiToEth(decoded.details.amount_wei as string)} tokens</span>
                  </div>
                )}
                {decoded.details.unlimited && (
                  <div className="p-2 bg-yellow-500/10 border border-yellow-500/20 rounded text-xs text-yellow-400">
                    ⚠️ Unlimited approval granted
                  </div>
                )}
              </div>
            )}

            {/* Recipient for transfers */}
            {decoded.details?.recipient && (
              <div className="flex justify-between">
                <span className="text-white/60">Recipient:</span>
                <span className="font-mono text-xs">{shortenHash(decoded.details.recipient as string)}</span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Economics Section */}
      <div className="border-l-4 border-green-500 pl-4">
        <h3 className="font-semibold text-white mb-2 flex items-center gap-2">
          💰 Economics
        </h3>
        <div className="space-y-1 text-white/80">
          <div className="flex justify-between">
            <span className="text-white/60">Gas Limit:</span>
            <span>{formatNumber(hexToNumber(economics?.gas_limit || '0x0'))} gas</span>
          </div>
          {economics?.gas_used && (
            <div className="flex justify-between">
              <span className="text-white/60">Gas Used:</span>
              <span>{formatNumber(hexToNumber(economics.gas_used))} gas ({Math.round((hexToNumber(economics.gas_used) / hexToNumber(economics.gas_limit)) * 100)}%)</span>
            </div>
          )}
          {economics?.gas_price && (
            <div className="flex justify-between">
              <span className="text-white/60">Gas Price:</span>
              <span>{hexToGwei(economics.gas_price).toFixed(2)} gwei</span>
            </div>
          )}
          {economics?.max_fee_per_gas && (
            <div className="flex justify-between">
              <span className="text-white/60">Max Fee:</span>
              <span>{hexToGwei(economics.max_fee_per_gas).toFixed(2)} gwei</span>
            </div>
          )}
          {economics?.effective_gas_price && (
            <div className="flex justify-between">
              <span className="text-white/60">Effective Price:</span>
              <span>{hexToGwei(economics.effective_gas_price).toFixed(2)} gwei</span>
            </div>
          )}
        </div>
      </div>

      {/* Block Context Section */}
      {!isPending && inclusion && (
        <div className="border-l-4 border-purple-500 pl-4">
          <h3 className="font-semibold text-white mb-2 flex items-center gap-2">
            🏗️ Block Context
          </h3>
          <div className="space-y-1 text-white/80">
            {inclusion.transaction_index && (
              <div className="flex justify-between">
                <span className="text-white/60">Position:</span>
                <span>#{hexToNumber(inclusion.transaction_index)} {inclusion.total_transactions && `of ${inclusion.total_transactions}`}</span>
              </div>
            )}
            {inclusion.miner && (
              <div className="flex justify-between">
                <span className="text-white/60">Miner/Builder:</span>
                <span className="font-mono text-xs">{shortenHash(inclusion.miner)}</span>
              </div>
            )}
            {inclusion.block_gas_used && inclusion.block_gas_limit && (
              <div className="flex justify-between">
                <span className="text-white/60">Block Fullness:</span>
                <span>
                  {Math.round((hexToNumber(inclusion.block_gas_used) / hexToNumber(inclusion.block_gas_limit)) * 100)}%
                </span>
              </div>
            )}
          </div>

          {/* Neighboring Transactions */}
          {inclusion.neighboring_transactions && inclusion.neighboring_transactions.length > 0 && (
            <div className="mt-3">
              <div className="text-white/60 text-xs mb-2">Neighboring Transactions:</div>
              <div className="space-y-1">
                {inclusion.neighboring_transactions.map((neighbor: any, idx: number) => (
                  <div
                    key={idx}
                    className={`text-xs font-mono p-2 rounded ${
                      neighbor.hash === data.hash
                        ? 'bg-blue-500/20 border border-blue-500/40'
                        : 'bg-white/5'
                    }`}
                  >
                    #{neighbor.index}: {shortenHash(neighbor.hash)}
                    {neighbor.hash === data.hash && ' ← Your Transaction'}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* PBS/MEV Section */}
      {pbsRelay && (
        <div className="border-l-4 border-orange-500 pl-4">
          <h3 className="font-semibold text-white mb-2 flex items-center gap-2">
            ⚡ MEV / PBS Info
          </h3>
          <div className="space-y-1 text-white/80">
            {pbsRelay.builder_pubkey && (
              <div className="flex justify-between">
                <span className="text-white/60">Builder:</span>
                <span className="font-mono text-xs">{shortenHash(pbsRelay.builder_pubkey)}</span>
              </div>
            )}
            {pbsRelay.value && (
              <div className="flex justify-between">
                <span className="text-white/60">Builder Payment:</span>
                <span className="font-medium">{weiToEth(pbsRelay.value)} ETH</span>
              </div>
            )}
            {!pbsRelay && !isPending && (
              <div className="text-white/60 text-xs">No MEV bundle detected - standalone transaction</div>
            )}
          </div>
        </div>
      )}

      {/* Finality Section */}
      {beacon && (
        <div className="border-l-4 border-cyan-500 pl-4">
          <h3 className="font-semibold text-white mb-2 flex items-center gap-2">
            🎯 Finality Journey
          </h3>
          <div className="space-y-2 text-white/80">
            <div className="flex items-center gap-2">
              <span className="text-green-400">✅</span>
              <span>Included: Slot {beacon.slot}</span>
            </div>
            {beacon.is_finalized !== undefined && (
              <div className="flex items-center gap-2">
                {beacon.is_finalized ? (
                  <>
                    <span className="text-green-400">✅</span>
                    <span>Finalized: Epoch {beacon.finalized_epoch} <span className="text-green-400 font-semibold">(SAFE)</span></span>
                  </>
                ) : (
                  <>
                    <span className="text-yellow-400">⏳</span>
                    <span>Waiting for finality (current epoch: {beacon.finalized_epoch})</span>
                  </>
                )}
              </div>
            )}
            <div className="text-white/60 text-xs mt-2">
              💡 Finalized blocks are irreversible under normal network conditions
            </div>
          </div>
        </div>
      )}

      {/* Raw Data Collapsible */}
      <details className="mt-4">
        <summary className="cursor-pointer text-white/60 text-xs hover:text-white/80">
          Show raw JSON data
        </summary>
        <pre className="mt-2 text-xs bg-black/60 p-3 rounded overflow-auto max-h-64">
          {JSON.stringify(data, null, 2)}
        </pre>
      </details>
    </div>
  );
}
