// BuilderRelayView - Displays builder blocks received by relays (MEV auction submissions)
import React from 'react';
import { weiToEth, hexToNumber, formatNumber, shortenHash, getBuilderName, slotToTime } from '../utils/format';

interface BuilderRelayViewProps {
  data: {
    received_blocks?: any[];
    count?: number;
  };
}

export default function BuilderRelayView({ data }: BuilderRelayViewProps) {
  if (!data || !data.received_blocks || data.received_blocks.length === 0) {
    return <p className="text-white/60">No builder block submissions found</p>;
  }

  const blocks = data.received_blocks;

  // Calculate aggregate metrics
  const totalValue = blocks.reduce((sum, block) => {
    const value = block.value ? BigInt(block.value) : BigInt(0);
    return sum + value;
  }, BigInt(0));

  const avgValue = Number(totalValue) / blocks.length / 1e18;

  const totalGasUsed = blocks.reduce((sum, block) => {
    return sum + (block.gas_used ? hexToNumber(block.gas_used) : 0);
  }, 0);

  const totalNumTx = blocks.reduce((sum, block) => {
    return sum + (block.num_tx ? hexToNumber(block.num_tx) : 0);
  }, 0);

  // Get unique builders
  const uniqueBuilders = new Set(blocks.map(b => b.builder_pubkey).filter(Boolean));

  // Find highest bid
  const highestBid = blocks.reduce((max, block) => {
    const value = block.value ? BigInt(block.value) : BigInt(0);
    return value > max ? value : max;
  }, BigInt(0));

  return (
    <div className="space-y-4">
      {/* Summary Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="bg-gradient-to-br from-purple-500/10 to-purple-600/5 border border-purple-500/20 rounded-lg p-4">
          <div className="text-purple-400 text-xs font-medium mb-1">Block Submissions</div>
          <div className="text-white text-2xl font-bold">{formatNumber(blocks.length)}</div>
          <div className="text-white/60 text-xs mt-1">from {uniqueBuilders.size} builders</div>
        </div>

        <div className="bg-gradient-to-br from-blue-500/10 to-blue-600/5 border border-blue-500/20 rounded-lg p-4">
          <div className="text-blue-400 text-xs font-medium mb-1">Avg Bid Value</div>
          <div className="text-white text-2xl font-bold">{avgValue.toFixed(4)}</div>
          <div className="text-white/60 text-xs mt-1">ETH per block</div>
        </div>

        <div className="bg-gradient-to-br from-green-500/10 to-green-600/5 border border-green-500/20 rounded-lg p-4">
          <div className="text-green-400 text-xs font-medium mb-1">Highest Bid</div>
          <div className="text-white text-2xl font-bold">{weiToEth(highestBid.toString())}</div>
          <div className="text-white/60 text-xs mt-1">ETH</div>
        </div>

        <div className="bg-gradient-to-br from-orange-500/10 to-orange-600/5 border border-orange-500/20 rounded-lg p-4">
          <div className="text-orange-400 text-xs font-medium mb-1">Total Transactions</div>
          <div className="text-white text-2xl font-bold">{formatNumber(totalNumTx)}</div>
          <div className="text-white/60 text-xs mt-1">across all blocks</div>
        </div>
      </div>

      {/* Educational Info */}
      <div className="bg-blue-500/5 border border-blue-500/20 rounded-lg p-3 text-sm space-y-3">
        <div className="flex items-start gap-2">
          <span className="text-blue-400 text-lg">💡</span>
          <div className="text-white/80 space-y-2">
            <div>
              <strong className="text-white">The Builder Competition:</strong> Multiple builders compete for EACH slot by submitting different block proposals to relays.
            </div>
            <ul className="list-disc list-inside space-y-1 text-xs ml-4">
              <li><strong>Same Slot, Multiple Bids:</strong> You'll see several blocks with the same slot number - these are competing bids from different builders</li>
              <li><strong>Overlapping Transactions:</strong> Many transactions appear in multiple competing blocks. Total tx count is inflated because builders include the same popular transactions</li>
              <li><strong>Only One Wins:</strong> Per slot, only the highest bid gets delivered to the validator. The rest are discarded</li>
              <li><strong>MEV Extraction:</strong> Builders include sandwich attacks, arbitrage, and optimal ordering to maximize profits and bid higher</li>
            </ul>
            <div className="text-yellow-400 text-xs bg-yellow-400/10 border border-yellow-400/20 rounded p-2 mt-2">
              ⚠️ <strong>Key Insight:</strong> If you see {formatNumber(totalNumTx)} transactions across {blocks.length} submissions from {uniqueBuilders.size} builders,
              most transactions are duplicated across competing blocks. Only ~200-400 unique transactions per slot actually make it on-chain.
            </div>
          </div>
        </div>
      </div>

      {/* Recent Submissions Table */}
      <div className="border border-white/10 rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-white/5 border-b border-white/10">
              <tr>
                <th className="text-left p-3 text-white/80 font-medium">Slot</th>
                <th className="text-left p-3 text-white/80 font-medium">Block #</th>
                <th className="text-left p-3 text-white/80 font-medium">Builder</th>
                <th className="text-right p-3 text-white/80 font-medium">Bid Value</th>
                <th className="text-right p-3 text-white/80 font-medium">Gas Used</th>
                <th className="text-right p-3 text-white/80 font-medium">Txs</th>
              </tr>
            </thead>
            <tbody>
              {blocks.slice(0, 20).map((block, idx) => {
                const bidValue = block.value ? weiToEth(block.value) : '0';
                const gasUsed = block.gas_used ? hexToNumber(block.gas_used) : 0;
                const gasLimit = block.gas_limit ? hexToNumber(block.gas_limit) : 0;
                const gasPercent = gasLimit > 0 ? Math.round((gasUsed / gasLimit) * 100) : 0;
                const numTx = block.num_tx ? hexToNumber(block.num_tx) : 0;

                return (
                  <tr key={idx} className="border-b border-white/5 hover:bg-white/5">
                    <td className="p-3 text-white/90 font-mono">{block.slot || 'N/A'}</td>
                    <td className="p-3 text-white/90 font-mono">{block.block_number ? hexToNumber(block.block_number).toLocaleString() : 'N/A'}</td>
                    <td className="p-3 text-white/90">
                      <span className="text-purple-400">{getBuilderName(block.builder_pubkey || '')}</span>
                    </td>
                    <td className="p-3 text-right">
                      <span className="text-green-400 font-medium">{bidValue} ETH</span>
                    </td>
                    <td className="p-3 text-right text-white/80">
                      {formatNumber(gasUsed)} <span className="text-white/50">({gasPercent}%)</span>
                    </td>
                    <td className="p-3 text-right text-white/80">{numTx}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {blocks.length > 20 && (
        <p className="text-white/50 text-xs text-center">Showing 20 of {blocks.length} submissions</p>
      )}
    </div>
  );
}
