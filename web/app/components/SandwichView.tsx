/*
 * SandwichView.tsx
 * Detects and displays MEV sandwich attacks in Ethereum blocks.
 * Shows front-run → victim → back-run sequences where searchers profit from sandwich victims.
 * Real attacks happening on mainnet right now - educational for understanding MEV impact.
 */
import React from 'react';
import { weiToEth, hexToNumber, formatNumber, shortenHash } from '../utils/format';

interface SandwichViewProps {
  data: {
    sandwiches?: any[];
    block?: string;
    total_transactions?: number;
    scanned_transactions?: number;
  };
}

export default function SandwichView({ data }: SandwichViewProps) {
  if (!data) {
    return <p className="text-white/60">No sandwich detection data available</p>;
  }

  const sandwiches = data.sandwiches || [];
  const blockNum = data.block ? hexToNumber(data.block) : 0;
  const totalTxs = data.total_transactions || 0;
  const scannedTxs = data.scanned_transactions || 0;

  // Count unique victims and attackers
  const uniqueVictims = new Set(sandwiches.map(s => s.victim).filter(Boolean)).size;
  const uniqueAttackers = new Set(sandwiches.map(s => s.attacker).filter(Boolean)).size;
  const uniquePools = new Set(sandwiches.map(s => s.pool).filter(Boolean)).size;

  const hasSandwiches = sandwiches.length > 0;

  return (
    <div className="space-y-4">
      {/* Block Info */}
      <div className="bg-gradient-to-br from-orange-500/10 to-red-600/5 border border-orange-500/20 rounded-lg p-4">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-orange-400 text-xs font-medium mb-1">Scanning Block</div>
            <div className="text-white text-2xl font-bold">{blockNum > 0 ? formatNumber(blockNum) : data.block || 'Latest'}</div>
          </div>
          <div className="text-right">
            <div className="text-white/60 text-xs">Transactions Scanned</div>
            <div className="text-white text-lg font-bold">{scannedTxs} / {totalTxs}</div>
          </div>
        </div>
      </div>

      {/* Detection Summary */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
        <div className={`border rounded-lg p-4 ${
          hasSandwiches
            ? 'bg-gradient-to-br from-red-500/10 to-red-600/5 border-red-500/20'
            : 'bg-gradient-to-br from-green-500/10 to-green-600/5 border-green-500/20'
        }`}>
          <div className={`text-xs font-medium mb-1 ${hasSandwiches ? 'text-red-400' : 'text-green-400'}`}>
            Sandwiches Detected
          </div>
          <div className="text-white text-2xl font-bold">{sandwiches.length}</div>
          <div className="text-white/60 text-xs mt-1">
            {hasSandwiches ? '⚠️ MEV found' : '✅ None detected'}
          </div>
        </div>

        <div className="bg-gradient-to-br from-purple-500/10 to-purple-600/5 border border-purple-500/20 rounded-lg p-4">
          <div className="text-purple-400 text-xs font-medium mb-1">Unique Attackers</div>
          <div className="text-white text-2xl font-bold">{uniqueAttackers}</div>
          <div className="text-white/60 text-xs mt-1">searcher addresses</div>
        </div>

        <div className="bg-gradient-to-br from-yellow-500/10 to-yellow-600/5 border border-yellow-500/20 rounded-lg p-4">
          <div className="text-yellow-400 text-xs font-medium mb-1">Victims</div>
          <div className="text-white text-2xl font-bold">{uniqueVictims}</div>
          <div className="text-white/60 text-xs mt-1">affected traders</div>
        </div>

        <div className="bg-gradient-to-br from-blue-500/10 to-blue-600/5 border border-blue-500/20 rounded-lg p-4">
          <div className="text-blue-400 text-xs font-medium mb-1">Pools Targeted</div>
          <div className="text-white text-2xl font-bold">{uniquePools}</div>
          <div className="text-white/60 text-xs mt-1">liquidity pools</div>
        </div>
      </div>

      {/* Educational Info */}
      <div className="bg-orange-500/5 border border-orange-500/20 rounded-lg p-3 text-sm space-y-3">
        <div className="flex items-start gap-2">
          <span className="text-orange-400 text-lg">💡</span>
          <div className="text-white/80 space-y-2">
            <div>
              <strong className="text-white">Sandwich Attacks - Frontrunning as MEV:</strong> Searchers exploit the visibility of pending transactions to profit at victims' expense:
            </div>
            <ul className="list-disc list-inside space-y-1 text-xs ml-4">
              <li><strong>Step 1 - Front-run:</strong> Searcher sees your pending DEX trade, pays higher gas to get ordered first, and buys the same token</li>
              <li><strong>Step 2 - Victim Executes:</strong> Your trade executes at a worse price because the front-run already moved the price</li>
              <li><strong>Step 3 - Back-run:</strong> Searcher immediately sells at the inflated price, capturing the spread as profit</li>
              <li><strong>The Cost:</strong> You receive less tokens than expected (slippage). The searcher's profit comes directly from your worse execution price</li>
              <li><strong>Detection Method:</strong> We scan for same address → same pool → sandwich pattern (buy → victim → sell)</li>
              <li><strong>Protection:</strong> Use lower slippage tolerance, private mempools (Flashbots Protect), or MEV-aware wallets</li>
            </ul>
            <div className="text-orange-400 text-xs bg-orange-400/10 border border-orange-400/20 rounded p-2 mt-2">
              ⚡ <strong>MEV Reality:</strong> {hasSandwiches
                ? `Found ${sandwiches.length} sandwich attack${sandwiches.length !== 1 ? 's' : ''} affecting ${uniqueVictims} victim${uniqueVictims !== 1 ? 's' : ''}. This is real MEV extraction happening on Ethereum right now.`
                : 'This block is clean! But ~5-10% of blocks contain detectable sandwich attacks. Many traders lose money to MEV daily.'}
            </div>
          </div>
        </div>
      </div>

      {/* Sandwich Details */}
      {hasSandwiches ? (
        <div className="border border-white/10 rounded-lg overflow-hidden">
          <div className="bg-red-500/10 border-b border-white/10 p-3">
            <h4 className="text-red-400 font-semibold">⚠️ Detected Sandwich Attacks</h4>
          </div>
          <div className="divide-y divide-white/5">
            {sandwiches.map((sandwich, idx) => (
              <div key={idx} className="p-4 hover:bg-white/5">
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <div className="text-white font-medium mb-1">Sandwich #{idx + 1}</div>
                    <div className="text-white/60 text-xs">Pool: <span className="font-mono text-blue-400">{shortenHash(sandwich.pool)}</span></div>
                  </div>
                  <div className="text-right">
                    <div className="text-white/60 text-xs">Block</div>
                    <div className="text-white font-mono text-sm">{sandwich.block ? hexToNumber(sandwich.block) : 'N/A'}</div>
                  </div>
                </div>

                {/* Transaction Flow */}
                <div className="space-y-2 bg-black/40 rounded-lg p-3 border border-white/10">
                  {/* Front-run */}
                  <div className="flex items-start gap-3">
                    <div className="flex-shrink-0 w-20 text-red-400 text-xs font-medium">1. Front-run</div>
                    <div className="flex-1 min-w-0">
                      <div className="text-white/90 font-mono text-xs break-all">{sandwich.preTx}</div>
                      <div className="text-white/60 text-xs mt-1">
                        Attacker: <span className="text-red-400 font-mono">{shortenHash(sandwich.attacker)}</span>
                      </div>
                    </div>
                  </div>

                  {/* Arrow */}
                  <div className="flex items-center gap-2 pl-20">
                    <div className="text-orange-400">↓</div>
                    <div className="text-white/50 text-xs">Victim's transaction gets sandwiched</div>
                  </div>

                  {/* Victim */}
                  <div className="flex items-start gap-3">
                    <div className="flex-shrink-0 w-20 text-yellow-400 text-xs font-medium">2. Victim</div>
                    <div className="flex-1 min-w-0">
                      <div className="text-white/90 font-mono text-xs break-all">{sandwich.victimTx}</div>
                      <div className="text-white/60 text-xs mt-1">
                        Victim: <span className="text-yellow-400 font-mono">{shortenHash(sandwich.victim)}</span>
                      </div>
                    </div>
                  </div>

                  {/* Arrow */}
                  <div className="flex items-center gap-2 pl-20">
                    <div className="text-orange-400">↓</div>
                    <div className="text-white/50 text-xs">Attacker captures profit</div>
                  </div>

                  {/* Back-run */}
                  <div className="flex items-start gap-3">
                    <div className="flex-shrink-0 w-20 text-red-400 text-xs font-medium">3. Back-run</div>
                    <div className="flex-1 min-w-0">
                      <div className="text-white/90 font-mono text-xs break-all">{sandwich.postTx}</div>
                      <div className="text-white/60 text-xs mt-1">
                        Attacker: <span className="text-red-400 font-mono">{shortenHash(sandwich.attacker)}</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Impact Warning */}
                <div className="mt-3 bg-yellow-500/10 border border-yellow-500/20 rounded p-2 text-xs">
                  <span className="text-yellow-400 font-medium">⚠️ Impact:</span>
                  <span className="text-white/80 ml-2">
                    Victim received worse execution price due to artificial slippage created by the attacker
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="border border-green-500/20 rounded-lg p-6 text-center">
          <div className="text-4xl mb-2">✅</div>
          <div className="text-green-400 font-medium mb-1">No Sandwich Attacks Detected</div>
          <div className="text-white/60 text-sm">
            This block appears clean - no obvious sandwich attack patterns found in Uniswap V2/V3 swaps
          </div>
        </div>
      )}
    </div>
  );
}
