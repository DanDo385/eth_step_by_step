/*
 * BeaconHeadersView.tsx
 * Shows proposed blocks enriched with MEV-Boost builder payment data.
 * Explains validator economics: base rewards + transaction tips + builder payments.
 * Separates MEV-Boost blocks (built by professionals) from vanilla blocks (built locally).
 */
import React from 'react';
import { weiToEth, hexToNumber, formatNumber, shortenHash, getBuilderName, slotToEpoch } from '../utils/format';

interface BeaconHeadersViewProps {
  data: {
    headers?: any[];
    count?: number;
  };
}

export default function BeaconHeadersView({ data }: BeaconHeadersViewProps) {
  if (!data || !data.headers || data.headers.length === 0) {
    return <p className="text-white/60">No beacon headers found</p>;
  }

  const headers = data.headers;

  // Separate blocks with and without MEV payments
  const mevBlocks = headers.filter(h => h.builder_payment_eth);
  const vanillaBlocks = headers.filter(h => !h.builder_payment_eth);

  // Calculate metrics for MEV blocks
  const totalMevPayments = mevBlocks.reduce((sum, header) => {
    const value = header.builder_payment_eth ? BigInt(header.builder_payment_eth) : BigInt(0);
    return sum + value;
  }, BigInt(0));

  const avgMevPayment = mevBlocks.length > 0 ? Number(totalMevPayments) / mevBlocks.length / 1e18 : 0;

  const totalGasUsed = mevBlocks.reduce((sum, header) => {
    return sum + (header.gas_used ? hexToNumber(header.gas_used) : 0);
  }, 0);

  const totalTxs = mevBlocks.reduce((sum, header) => {
    return sum + (header.num_tx ? hexToNumber(header.num_tx) : 0);
  }, 0);

  const avgBlockFullness = mevBlocks.length > 0
    ? mevBlocks.reduce((sum, header) => {
        const gasUsed = header.gas_used ? hexToNumber(header.gas_used) : 0;
        const gasLimit = header.gas_limit ? hexToNumber(header.gas_limit) : 30000000;
        return sum + (gasLimit > 0 ? (gasUsed / gasLimit) * 100 : 0);
      }, 0) / mevBlocks.length
    : 0;

  return (
    <div className="space-y-4">
      {/* Summary Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="bg-gradient-to-br from-indigo-500/10 to-indigo-600/5 border border-indigo-500/20 rounded-lg p-4">
          <div className="text-indigo-400 text-xs font-medium mb-1">Proposed Blocks</div>
          <div className="text-white text-2xl font-bold">{formatNumber(headers.length)}</div>
          <div className="text-white/60 text-xs mt-1">
            {mevBlocks.length} MEV / {vanillaBlocks.length} vanilla
          </div>
        </div>

        <div className="bg-gradient-to-br from-green-500/10 to-green-600/5 border border-green-500/20 rounded-lg p-4">
          <div className="text-green-400 text-xs font-medium mb-1">Total Builder Payments</div>
          <div className="text-white text-2xl font-bold">{weiToEth(totalMevPayments.toString())}</div>
          <div className="text-white/60 text-xs mt-1">ETH to validators</div>
        </div>

        <div className="bg-gradient-to-br from-blue-500/10 to-blue-600/5 border border-blue-500/20 rounded-lg p-4">
          <div className="text-blue-400 text-xs font-medium mb-1">Avg MEV Payment</div>
          <div className="text-white text-2xl font-bold">{avgMevPayment.toFixed(4)}</div>
          <div className="text-white/60 text-xs mt-1">ETH per block</div>
        </div>

        <div className="bg-gradient-to-br from-orange-500/10 to-orange-600/5 border border-orange-500/20 rounded-lg p-4">
          <div className="text-orange-400 text-xs font-medium mb-1">Avg Block Fullness</div>
          <div className="text-white text-2xl font-bold">{avgBlockFullness.toFixed(1)}%</div>
          <div className="text-white/60 text-xs mt-1">gas utilization</div>
        </div>
      </div>

      {/* Educational Info */}
      <div className="bg-indigo-500/5 border border-indigo-500/20 rounded-lg p-3 text-sm space-y-3">
        <div className="flex items-start gap-2">
          <span className="text-indigo-400 text-lg">💡</span>
          <div className="text-white/80 space-y-2">
            <div>
              <strong className="text-white">Block Proposals & Validator Earnings:</strong> Every 12 seconds, a validator is selected to propose a block.
            </div>
            <ul className="list-disc list-inside space-y-1 text-xs ml-4">
              <li><strong>MEV-Boost Blocks (purple badge):</strong> Built by external builders who bid to have their block chosen. Payment shown is the builder's bid</li>
              <li><strong>Vanilla Blocks (gray badge):</strong> Built locally by the validator without MEV-Boost. No external builder payment</li>
              <li><strong>Gas Economics:</strong> Each transaction pays a base fee (burned) + priority fee (tip to validator). Builders add extra payments on top</li>
              <li><strong>Block Fullness:</strong> Shows gas utilization. Higher % means more transactions competing for block space, driving up fees</li>
              <li><strong>Why Builders Pay:</strong> Builders extract MEV (sandwich attacks, arbitrage) and share profits with validators to win the auction</li>
            </ul>
            <div className="text-indigo-400 text-xs bg-indigo-400/10 border border-indigo-400/20 rounded p-2 mt-2">
              💰 <strong>Validator Income:</strong> For MEV-Boost blocks, validators earn: base rewards (~0.01-0.02 ETH) + transaction tips + builder payment ({avgMevPayment.toFixed(4)} ETH average).
              In this sample, {Math.round((mevBlocks.length / headers.length) * 100)}% of blocks used MEV-Boost.
            </div>
          </div>
        </div>
      </div>

      {/* Headers Table */}
      <div className="border border-white/10 rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-white/5 border-b border-white/10">
              <tr>
                <th className="text-left p-3 text-white/80 font-medium">Slot</th>
                <th className="text-left p-3 text-white/80 font-medium">Epoch</th>
                <th className="text-left p-3 text-white/80 font-medium">Block #</th>
                <th className="text-left p-3 text-white/80 font-medium">Type</th>
                <th className="text-left p-3 text-white/80 font-medium">Builder</th>
                <th className="text-right p-3 text-white/80 font-medium">Payment</th>
                <th className="text-right p-3 text-white/80 font-medium">Gas</th>
                <th className="text-right p-3 text-white/80 font-medium">Txs</th>
              </tr>
            </thead>
            <tbody>
              {headers.slice(0, 20).map((header, idx) => {
                const slot = header.slot ? parseInt(header.slot) : 0;
                const epoch = slotToEpoch(slot);
                const payment = header.builder_payment_eth ? weiToEth(header.builder_payment_eth) : null;
                const gasUsed = header.gas_used ? hexToNumber(header.gas_used) : 0;
                const gasLimit = header.gas_limit ? hexToNumber(header.gas_limit) : 0;
                const gasPercent = gasLimit > 0 ? Math.round((gasUsed / gasLimit) * 100) : 0;
                const numTx = header.num_tx ? hexToNumber(header.num_tx) : 0;
                const isMev = !!header.builder_payment_eth;

                return (
                  <tr key={idx} className="border-b border-white/5 hover:bg-white/5">
                    <td className="p-3 text-white/90 font-mono">{header.slot || 'N/A'}</td>
                    <td className="p-3 text-white/70 font-mono">{epoch}</td>
                    <td className="p-3 text-white/90 font-mono">
                      {header.block_number ? hexToNumber(header.block_number).toLocaleString() : 'N/A'}
                    </td>
                    <td className="p-3">
                      {isMev ? (
                        <span className="inline-flex items-center px-2 py-0.5 rounded bg-purple-500/20 text-purple-300 text-xs font-medium">
                          MEV
                        </span>
                      ) : (
                        <span className="inline-flex items-center px-2 py-0.5 rounded bg-gray-500/20 text-gray-400 text-xs font-medium">
                          Vanilla
                        </span>
                      )}
                    </td>
                    <td className="p-3 text-white/90">
                      {header.builder_pubkey ? (
                        <span className="text-purple-400">{getBuilderName(header.builder_pubkey)}</span>
                      ) : (
                        <span className="text-white/50">Local</span>
                      )}
                    </td>
                    <td className="p-3 text-right">
                      {payment ? (
                        <span className="text-green-400 font-medium">{payment} ETH</span>
                      ) : (
                        <span className="text-white/30">—</span>
                      )}
                    </td>
                    <td className="p-3 text-right text-white/80">
                      {gasUsed > 0 ? (
                        <>
                          {formatNumber(gasUsed)} <span className="text-white/50">({gasPercent}%)</span>
                        </>
                      ) : (
                        <span className="text-white/30">—</span>
                      )}
                    </td>
                    <td className="p-3 text-right text-white/80">{numTx > 0 ? numTx : '—'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {headers.length > 20 && (
        <p className="text-white/50 text-xs text-center">Showing 20 of {headers.length} headers</p>
      )}
    </div>
  );
}
