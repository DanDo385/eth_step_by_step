/*
 * FinalityView.tsx
 * Displays Casper-FFG finality checkpoints - the mechanism that makes transactions irreversible.
 * Shows justification → finalization process and explains why exchanges wait ~15 minutes for deposits.
 */
import React from 'react';
import { hexToNumber, formatNumber, slotToEpoch, slotToTime } from '../utils/format';

interface FinalityViewProps {
  data: any;
}

export default function FinalityView({ data }: FinalityViewProps) {
  if (!data || !data.data) {
    return <p className="text-white/60">No finality data available</p>;
  }

  const checkpoints = data.data;

  // Parse checkpoint data
  const previousJustified = checkpoints.previous_justified?.epoch ? parseInt(checkpoints.previous_justified.epoch) : 0;
  const currentJustified = checkpoints.current_justified?.epoch ? parseInt(checkpoints.current_justified.epoch) : 0;
  const finalized = checkpoints.finalized?.epoch ? parseInt(checkpoints.finalized.epoch) : 0;

  // Calculate slots (32 slots per epoch)
  const finalizedSlot = finalized * 32;
  const justifiedSlot = currentJustified * 32;
  const previousJustifiedSlot = previousJustified * 32;

  // Calculate epoch differences
  const epochsSinceFinality = currentJustified - finalized;
  const epochsSinceJustification = currentJustified - previousJustified;

  // Determine network health
  const isHealthy = epochsSinceFinality <= 2; // Normal is 2 epochs to finality
  const isCritical = epochsSinceFinality > 4;

  return (
    <div className="space-y-4">
      {/* Health Status Banner */}
      <div className={`border rounded-lg p-4 ${
        isCritical
          ? 'bg-red-500/10 border-red-500/30'
          : isHealthy
            ? 'bg-green-500/10 border-green-500/30'
            : 'bg-yellow-500/10 border-yellow-500/30'
      }`}>
        <div className="flex items-center gap-3">
          <span className="text-3xl">
            {isCritical ? '⚠️' : isHealthy ? '✅' : '⏳'}
          </span>
          <div>
            <div className={`text-lg font-bold ${
              isCritical ? 'text-red-400' : isHealthy ? 'text-green-400' : 'text-yellow-400'
            }`}>
              {isCritical ? 'Finality Issues Detected' : isHealthy ? 'Network Finalizing Normally' : 'Slow Finality'}
            </div>
            <div className="text-white/70 text-sm mt-1">
              {epochsSinceFinality} epoch{epochsSinceFinality !== 1 ? 's' : ''} between justified and finalized
              {isHealthy ? ' (normal)' : isCritical ? ' (critical)' : ' (delayed)'}
            </div>
          </div>
        </div>
      </div>

      {/* Summary Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div className="bg-gradient-to-br from-green-500/10 to-green-600/5 border border-green-500/20 rounded-lg p-4">
          <div className="text-green-400 text-xs font-medium mb-1">Finalized Epoch</div>
          <div className="text-white text-2xl font-bold">{formatNumber(finalized)}</div>
          <div className="text-white/60 text-xs mt-1">Slot {formatNumber(finalizedSlot)}</div>
        </div>

        <div className="bg-gradient-to-br from-blue-500/10 to-blue-600/5 border border-blue-500/20 rounded-lg p-4">
          <div className="text-blue-400 text-xs font-medium mb-1">Current Justified</div>
          <div className="text-white text-2xl font-bold">{formatNumber(currentJustified)}</div>
          <div className="text-white/60 text-xs mt-1">Slot {formatNumber(justifiedSlot)}</div>
        </div>

        <div className="bg-gradient-to-br from-purple-500/10 to-purple-600/5 border border-purple-500/20 rounded-lg p-4">
          <div className="text-purple-400 text-xs font-medium mb-1">Previous Justified</div>
          <div className="text-white text-2xl font-bold">{formatNumber(previousJustified)}</div>
          <div className="text-white/60 text-xs mt-1">Slot {formatNumber(previousJustifiedSlot)}</div>
        </div>
      </div>

      {/* Educational Info */}
      <div className="bg-cyan-500/5 border border-cyan-500/20 rounded-lg p-3 text-sm space-y-3">
        <div className="flex items-start gap-2">
          <span className="text-cyan-400 text-lg">💡</span>
          <div className="text-white/80 space-y-2">
            <div>
              <strong className="text-white">Casper FFG Finality - Making Blocks Irreversible:</strong> Ethereum uses a two-step process to make transactions permanent:
            </div>
            <ul className="list-disc list-inside space-y-1 text-xs ml-4">
              <li><strong>Step 1 - Justification:</strong> An epoch (32 blocks, ~6.4 min) becomes "justified" when 2/3 of validators vote for it</li>
              <li><strong>Step 2 - Finalization:</strong> When a justified epoch is followed by another justified epoch, the first becomes "finalized"</li>
              <li><strong>Economic Security:</strong> Finalized blocks cannot be reverted unless attackers are willing to burn ≥1/3 of ALL staked ETH (~14 million ETH = ~$30+ billion)</li>
              <li><strong>Normal Timing:</strong> Under healthy network conditions, finality occurs within 2-3 epochs (~12.8-19.2 minutes)</li>
              <li><strong>Why This Matters:</strong> Exchanges wait for finality before crediting large deposits. After finalization, your transaction is as permanent as Bitcoin's 6-block confirmation</li>
            </ul>
            <div className="text-cyan-400 text-xs bg-cyan-400/10 border border-cyan-400/20 rounded p-2 mt-2">
              🔒 <strong>Security Insight:</strong> Currently {epochsSinceFinality} epoch{epochsSinceFinality !== 1 ? 's' : ''} between justified and finalized.
              {isHealthy
                ? ' Network is healthy - transactions finalizing normally!'
                : isCritical
                  ? ' ⚠️ CRITICAL - Finality is delayed. Network may have participation issues.'
                  : ' Finality is slower than normal but not critical.'}
            </div>
          </div>
        </div>
      </div>

      {/* Checkpoint Timeline */}
      <div className="border border-white/10 rounded-lg p-4">
        <h4 className="text-white font-semibold mb-3">Finality Timeline</h4>
        <div className="space-y-3">
          {/* Finalized */}
          <div className="flex items-start gap-3 pb-3 border-b border-white/10">
            <div className="flex-shrink-0 w-24 text-green-400 font-medium text-sm">Finalized</div>
            <div className="flex-1">
              <div className="text-white font-mono text-sm">Epoch {formatNumber(finalized)}</div>
              <div className="text-white/60 text-xs mt-1">
                Root: <span className="font-mono">{checkpoints.finalized?.root?.slice(0, 18)}...</span>
              </div>
              <div className="text-white/50 text-xs mt-1">
                ✅ Safe - Cannot be reverted under normal network conditions
              </div>
            </div>
          </div>

          {/* Current Justified */}
          <div className="flex items-start gap-3 pb-3 border-b border-white/10">
            <div className="flex-shrink-0 w-24 text-blue-400 font-medium text-sm">Justified</div>
            <div className="flex-1">
              <div className="text-white font-mono text-sm">Epoch {formatNumber(currentJustified)}</div>
              <div className="text-white/60 text-xs mt-1">
                Root: <span className="font-mono">{checkpoints.current_justified?.root?.slice(0, 18)}...</span>
              </div>
              <div className="text-white/50 text-xs mt-1">
                ⏳ Awaiting finalization (needs 2/3 validator support in next epoch)
              </div>
            </div>
          </div>

          {/* Previous Justified */}
          <div className="flex items-start gap-3">
            <div className="flex-shrink-0 w-24 text-purple-400 font-medium text-sm">Prev Justified</div>
            <div className="flex-1">
              <div className="text-white font-mono text-sm">Epoch {formatNumber(previousJustified)}</div>
              <div className="text-white/60 text-xs mt-1">
                Root: <span className="font-mono">{checkpoints.previous_justified?.root?.slice(0, 18)}...</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Network Stats */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div className="bg-black/40 border border-white/10 rounded-lg p-3">
          <div className="text-white/60 text-xs mb-1">Time to Finality</div>
          <div className="text-white text-lg font-bold">
            ~{(epochsSinceFinality * 6.4).toFixed(1)} minutes
          </div>
          <div className="text-white/50 text-xs mt-1">
            ({epochsSinceFinality} epochs × 6.4 min/epoch)
          </div>
        </div>

        <div className="bg-black/40 border border-white/10 rounded-lg p-3">
          <div className="text-white/60 text-xs mb-1">Blocks Since Finality</div>
          <div className="text-white text-lg font-bold">
            {formatNumber((currentJustified - finalized) * 32)}
          </div>
          <div className="text-white/50 text-xs mt-1">
            slots (32 slots/epoch × {epochsSinceFinality} epochs)
          </div>
        </div>
      </div>
    </div>
  );
}
