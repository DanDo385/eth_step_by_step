// RelayDeliveredView - Displays winning blocks delivered from relays to validators
import React from 'react';
import { weiToEth, hexToNumber, formatNumber, shortenHash, getBuilderName, slotToTime } from '../utils/format';

interface RelayDeliveredViewProps {
  data: {
    delivered_payloads?: any[];
    count?: number;
  };
}

export default function RelayDeliveredView({ data }: RelayDeliveredViewProps) {
  if (!data || !data.delivered_payloads || data.delivered_payloads.length === 0) {
    return <p className="text-white/60">No delivered payloads found</p>;
  }

  const payloads = data.delivered_payloads;

  // Calculate aggregate metrics
  const totalValue = payloads.reduce((sum, payload) => {
    const value = payload.value ? BigInt(payload.value) : BigInt(0);
    return sum + value;
  }, BigInt(0));

  const avgValue = Number(totalValue) / payloads.length / 1e18;

  const totalGasUsed = payloads.reduce((sum, payload) => {
    return sum + (payload.gas_used ? hexToNumber(payload.gas_used) : 0);
  }, 0);

  const totalNumTx = payloads.reduce((sum, payload) => {
    return sum + (payload.num_tx ? hexToNumber(payload.num_tx) : 0);
  }, 0);

  const avgGasPerTx = totalNumTx > 0 ? totalGasUsed / totalNumTx : 0;

  // Calculate total validator earnings
  const totalEarnings = weiToEth(totalValue.toString());

  // Get unique builders (winning builders)
  const uniqueBuilders = new Set(payloads.map(p => p.builder_pubkey).filter(Boolean));

  return (
    <div className="space-y-4">
      {/* Summary Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="bg-gradient-to-br from-cyan-500/10 to-cyan-600/5 border border-cyan-500/20 rounded-lg p-4">
          <div className="text-cyan-400 text-xs font-medium mb-1">Blocks Delivered</div>
          <div className="text-white text-2xl font-bold">{formatNumber(payloads.length)}</div>
          <div className="text-white/60 text-xs mt-1">to validators</div>
        </div>

        <div className="bg-gradient-to-br from-green-500/10 to-green-600/5 border border-green-500/20 rounded-lg p-4">
          <div className="text-green-400 text-xs font-medium mb-1">Total Validator Earnings</div>
          <div className="text-white text-2xl font-bold">{parseFloat(totalEarnings).toFixed(3)}</div>
          <div className="text-white/60 text-xs mt-1">ETH from builders</div>
        </div>

        <div className="bg-gradient-to-br from-blue-500/10 to-blue-600/5 border border-blue-500/20 rounded-lg p-4">
          <div className="text-blue-400 text-xs font-medium mb-1">Avg Payment</div>
          <div className="text-white text-2xl font-bold">{avgValue.toFixed(4)}</div>
          <div className="text-white/60 text-xs mt-1">ETH per block</div>
        </div>

        <div className="bg-gradient-to-br from-purple-500/10 to-purple-600/5 border border-purple-500/20 rounded-lg p-4">
          <div className="text-purple-400 text-xs font-medium mb-1">Winning Builders</div>
          <div className="text-white text-2xl font-bold">{uniqueBuilders.size}</div>
          <div className="text-white/60 text-xs mt-1">unique winners</div>
        </div>
      </div>

      {/* Educational Info */}
      <div className="bg-green-500/5 border border-green-500/20 rounded-lg p-3 text-sm space-y-3">
        <div className="flex items-start gap-2">
          <span className="text-green-400 text-lg">💡</span>
          <div className="text-white/80 space-y-2">
            <div>
              <strong className="text-white">Winning Blocks Only:</strong> These blocks WON the auction and were actually proposed on-chain.
            </div>
            <ul className="list-disc list-inside space-y-1 text-xs ml-4">
              <li><strong>One Winner Per Slot:</strong> Unlike the "received" view which shows all competing bids, this shows only the blocks that validators actually selected</li>
              <li><strong>Payment = MEV Share:</strong> The "Payment to Validator" is the builder's bid - their share of extracted MEV profits given to the validator</li>
              <li><strong>These Transactions Are Final:</strong> These transactions made it into the canonical Ethereum blockchain (subject to finalization)</li>
              <li><strong>Payment per Transaction:</strong> Shows how much the builder paid per included transaction - higher values indicate more MEV was extracted</li>
            </ul>
            <div className="text-green-400 text-xs bg-green-400/10 border border-green-400/20 rounded p-2 mt-2">
              ✅ <strong>Comparison:</strong> The "Builders → Relays" panel showed ALL bids (including losers). This panel shows ONLY the {payloads.length} blocks
              that won the auction and appeared on-chain. Total validator earnings: {totalEarnings} ETH
            </div>
          </div>
        </div>
      </div>

      {/* Delivered Payloads Table */}
      <div className="border border-white/10 rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-white/5 border-b border-white/10">
              <tr>
                <th className="text-left p-3 text-white/80 font-medium">Slot</th>
                <th className="text-left p-3 text-white/80 font-medium">Block #</th>
                <th className="text-left p-3 text-white/80 font-medium">Winning Builder</th>
                <th className="text-right p-3 text-white/80 font-medium">Payment to Validator</th>
                <th className="text-right p-3 text-white/80 font-medium">Gas Used</th>
                <th className="text-right p-3 text-white/80 font-medium">Txs</th>
                <th className="text-right p-3 text-white/80 font-medium">$/Tx</th>
              </tr>
            </thead>
            <tbody>
              {payloads.slice(0, 20).map((payload, idx) => {
                const payment = payload.value ? weiToEth(payload.value) : '0';
                const paymentNum = parseFloat(payment);
                const gasUsed = payload.gas_used ? hexToNumber(payload.gas_used) : 0;
                const gasLimit = payload.gas_limit ? hexToNumber(payload.gas_limit) : 0;
                const gasPercent = gasLimit > 0 ? Math.round((gasUsed / gasLimit) * 100) : 0;
                const numTx = payload.num_tx ? hexToNumber(payload.num_tx) : 0;
                const paymentPerTx = numTx > 0 ? paymentNum / numTx : 0;

                return (
                  <tr key={idx} className="border-b border-white/5 hover:bg-white/5">
                    <td className="p-3 text-white/90 font-mono">{payload.slot || 'N/A'}</td>
                    <td className="p-3 text-white/90 font-mono">{payload.block_number ? hexToNumber(payload.block_number).toLocaleString() : 'N/A'}</td>
                    <td className="p-3 text-white/90">
                      <span className="text-purple-400">{getBuilderName(payload.builder_pubkey || '')}</span>
                    </td>
                    <td className="p-3 text-right">
                      <span className="text-green-400 font-medium">{payment} ETH</span>
                    </td>
                    <td className="p-3 text-right text-white/80">
                      {formatNumber(gasUsed)} <span className="text-white/50">({gasPercent}%)</span>
                    </td>
                    <td className="p-3 text-right text-white/80">{numTx}</td>
                    <td className="p-3 text-right text-cyan-400 font-medium">{paymentPerTx.toFixed(6)} ETH</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {payloads.length > 20 && (
        <p className="text-white/50 text-xs text-center">Showing 20 of {payloads.length} delivered payloads</p>
      )}
    </div>
  );
}
