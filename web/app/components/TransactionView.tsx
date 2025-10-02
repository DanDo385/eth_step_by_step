// TransactionView - Displays transaction data in a structured, human-readable format
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

  return (
    <div className="space-y-4 text-sm">
      {/* Overview Section */}
      <div className="border-l-4 border-blue-500 pl-4">
        <h3 className="font-semibold text-white mb-2 flex items-center gap-2">
          📊 Transaction Overview
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
        </div>
      </div>

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
