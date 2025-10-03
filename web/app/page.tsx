// web/app/page.tsx
// Main page for the Ethereum transaction flow visualizer.
// Shows how transactions go from mempool → MEV auction → block proposal → finality.
"use client";

import React, { useMemo, useState } from "react";
import GlowButton from "./components/GlowButton";
import Panel from "./components/Panel";
import CaptureButton from "./components/CaptureButton";
import MermaidDiagram from "./components/MermaidDiagram";
import Alert from "./components/Alert";
import Glossary from "./components/Glossary";
import TransactionView from "./components/TransactionView";
import BuilderRelayView from "./components/BuilderRelayView";
import RelayDeliveredView from "./components/RelayDeliveredView";
import BeaconHeadersView from "./components/BeaconHeadersView";
import FinalityView from "./components/FinalityView";
import SandwichView from "./components/SandwichView";
import { weiToEth, formatNumber } from "./utils/format";

// Type aliases to make the code more readable
type Any = any; // TODO: replace with proper types when we have time
type ErrState = { title: string; message?: string; hint?: string } | null;

export default function Page() {
  // State for each data panel - mempool, relays, beacon, etc
  // These hold the raw data from our Go API endpoints
  const [mempool, setMempool] = useState<Any>(null);
  const [received, setReceived] = useState<Any>(null);
  const [delivered, setDelivered] = useState<Any>(null);
  const [headers, setHeaders] = useState<Any>(null);
  const [finality, setFinality] = useState<Any>(null);
  const [mev, setMev] = useState<Any>(null);
  const [mevBlock, setMevBlock] = useState<string>("latest"); // Block to analyze for MEV
  const [sources, setSources] = useState<Any>(null); // API endpoint info
  const [trackHash, setTrackHash] = useState<string>(""); // User input for tx tracking
  const [tracked, setTracked] = useState<Any>(null); // Result of tx tracking
  const [trackLoading, setTrackLoading] = useState(false);
  const [trackDetailsHidden, setTrackDetailsHidden] = useState(false);
  const [error, setError] = useState<ErrState>(null);

  // Client-side throttle for snapshot endpoint to avoid hammering the API
  // Users were clicking buttons too fast and overwhelming our poor Go server
  const [lastSnapAt, setLastSnapAt] = useState<number>(0);
  const SNAP_TTL_MS = 30_000; // wait 30s between snapshot calls

  // Track which panel is currently open (only one at a time)
  // This makes the UI cleaner and prevents information overload
  const [activePanel, setActivePanel] = useState<string | null>(null);

  // Compute which stages to highlight in the diagram based on active panel
  // This makes the Mermaid diagram interactive - highlights the current step
  const stages = useMemo(
    () => ({
      mempool: activePanel === "mempool",
      pbs: activePanel === "received" || activePanel === "delivered", // PBS = Proposer-Builder Separation
      relays: activePanel === "received" || activePanel === "delivered",
      proposal: activePanel === "headers",
      finality: activePanel === "finality"
    }),
    [activePanel]
  );


  // safeFetch wraps fetch with error handling and user-friendly messages
  // All our API calls go through this to provide consistent error UX
  // This was a pain point - users were seeing cryptic errors before we added this
  async function safeFetch(url: string, init?: RequestInit) {
    setError(null);
    try {
      const res = await fetch(url, init);
      const contentType = res.headers.get("content-type") || "";
      const isJSON = contentType.includes("application/json") || url.endsWith(".json");

      // Handle non-JSON responses (some endpoints return plain text)
      if (!isJSON) {
        if (!res.ok) {
          setError({ title: "Request failed", message: `${res.status} ${res.statusText}` });
          return null;
        }
        return await res.text();
      }

      const payload = await res.json();

      // Check for errors in the response
      if (!res.ok || payload?.error) {
        const errPayload = payload?.error ?? {};
        let errorMessage = errPayload.message || `${res.status} ${res.statusText}`;
        let errorHint = errPayload.hint;

        // Translate technical errors into user-friendly messages
        // These error types come from our Go API - we map them to helpful explanations
        if (errPayload.kind === "TXPOOL") {
          errorMessage = "Mempool data not available from public RPC";
          errorHint = "Public RPC providers may not expose txpool APIs. Try using a different RPC endpoint.";
        } else if (errPayload.kind === "RELAY") {
          errorMessage = "Relay API temporarily unavailable";
          errorHint = "This is normal - public relays may be rate limiting. Try again in a few minutes.";
        } else if (errPayload.kind === "BEACON") {
          errorMessage = "Beacon API temporarily unavailable";
          errorHint = "Public beacon API may be rate limiting. Try again in a few minutes.";
        }

        setError({
          title: errPayload.kind || "Request failed",
          message: errorMessage,
          hint: errorHint
        });
        return null;
      }

      return payload;
    } catch (err) {
      // Network errors, CORS issues, etc
      // This catches everything else that could go wrong
      setError({
        title: "Network error",
        message: err instanceof Error ? err.message : String(err),
        hint: "Ensure the Go API is reachable (default http://localhost:8080)"
      });
      return null;
    }
  }

  // loadSnapshot fetches a batch of data from the /api/snapshot endpoint.
  // This is more efficient than hitting each endpoint individually since
  // the Go server can parallelize the upstream calls and cache the result.
  // Originally we were making 5+ separate API calls - this is much better
  async function loadSnapshot(includeSandwich = false, block?: string) {
    // Throttle to avoid spamming the API when user clicks buttons rapidly
    // Users were clicking like crazy and our server was crying
    const now = Date.now();
    if (now - lastSnapAt < SNAP_TTL_MS) {
      return; // reuse existing state
    }

    // Build query string for optional MEV analysis
    // MEV analysis is expensive so we only do it when requested
    const qs = new URLSearchParams();
    if (includeSandwich) {
      qs.set("sandwich", "1");
      qs.set("block", block || mempool?.lastBlock || "latest");
    }

    const result = await safeFetch(`/api/snapshot${qs.toString() ? '?' + qs.toString() : ''}`);
    if (!result) return;

    const d = result.data ?? result; // Handle both wrapped and unwrapped responses

    // Update all our state from the snapshot response
    // This is where we populate all the UI panels with fresh data
    if (d.mempool) {
      setMempool(d.mempool);
    }

    if (d.relays) {
      // Split relay data into received vs delivered for different views
      const receivedBlocks = d.relays.received ?? [];
      const deliveredPayloads = d.relays.delivered ?? [];
      setReceived({ received_blocks: receivedBlocks, count: receivedBlocks.length });
      setDelivered({ delivered_payloads: deliveredPayloads, count: deliveredPayloads.length });
    }

    if (d.beacon) {
      // Beacon data includes both headers and finality checkpoints
      if (d.beacon.headers) setHeaders(d.beacon.headers);
      if (d.beacon.finality) setFinality(d.beacon.finality);
    }

    if (d.mev) {
      // MEV data is wrapped in a data property for consistency
      setMev({ data: d.mev });
    }

    if (d.sources) {
      // Track which APIs we're using for debugging
      setSources(d.sources);
    }

    setLastSnapAt(now); // Update throttle timestamp
  }

  return (
    <main className="max-w-6xl mx-auto px-4 pb-12">
      <header className="my-6 space-y-4">
        {/* Beginner-Friendly Introduction */}
        {/* This whole section was added after user feedback - people were confused */}
        <div className="bg-gradient-to-br from-blue-500/10 to-purple-500/10 border border-blue-500/30 rounded-lg p-6 space-y-4">
          <div className="text-center">
            <h2 className="text-2xl font-bold text-white mb-2">Welcome to Ethereum Transaction Visualizer</h2>
            <p className="text-blue-300 text-sm">An educational tool to understand how cryptocurrency transactions really work</p>
          </div>

          <div className="space-y-3 text-white/90">
            <div className="bg-black/30 rounded-lg p-4 border border-white/10">
              <h3 className="font-semibold text-white mb-2 flex items-center gap-2">
                <span className="text-xl">🤔</span> What is this tool?
              </h3>
              <p className="text-sm leading-relaxed">
                This visualizer shows you the <strong>real journey of an Ethereum transaction</strong> from the moment someone clicks "send"
                to when it becomes permanent and irreversible. Think of it like tracking a package through the postal system,
                but instead we're tracking digital money through a global computer network.
              </p>
            </div>

            <div className="bg-black/30 rounded-lg p-4 border border-white/10">
              <h3 className="font-semibold text-white mb-2 flex items-center gap-2">
                <span className="text-xl">💡</span> What you'll learn:
              </h3>
              <ul className="text-sm space-y-2 ml-4">
                <li className="flex items-start gap-2">
                  <span className="text-green-400 mt-0.5">✓</span>
                  <span><strong>How transactions work:</strong> What happens when you send cryptocurrency</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-green-400 mt-0.5">✓</span>
                  <span><strong>Gas fees explained:</strong> Why you pay fees and where that money goes</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-green-400 mt-0.5">✓</span>
                  <span><strong>MEV (Hidden profits):</strong> How professional traders extract value from transactions</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-green-400 mt-0.5">✓</span>
                  <span><strong>Security & Finality:</strong> How Ethereum prevents fraud and makes transactions permanent</span>
                </li>
              </ul>
            </div>

            <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-lg p-4">
              <h3 className="font-semibold text-yellow-300 mb-2 flex items-center gap-2">
                Complete Beginner? Start Here:
              </h3>
              <div className="text-sm space-y-2">
                <p><strong className="text-white">Ethereum</strong> = A global computer network where people can send digital money (ETH) and run programs</p>
                <p><strong className="text-white">Transaction</strong> = Sending money or interacting with a program on Ethereum (like withdrawing from your bank account)</p>
                <p><strong className="text-white">Validator</strong> = Computers that verify transactions are legitimate (like bank tellers checking your ID)</p>
                <p><strong className="text-white">Block</strong> = A batch of ~200-400 transactions bundled together every 12 seconds (like a box of packages)</p>
                <p className="text-yellow-200 text-xs mt-3 bg-yellow-500/10 p-2 rounded">
                  💡 <strong>Real-world analogy:</strong> Imagine Ethereum as a global post office. Transactions are letters, validators are postal workers,
                  and blocks are mail trucks that leave every 12 seconds. This tool shows you the entire journey of your letter!
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Status */}
        {/* This gives users confidence that they're seeing real data */}
        <div className="border rounded-lg p-4 text-center bg-green-400/10 border-green-400/30">
          <div className="font-semibold mb-2 text-green-200">
            ✅ Live Ethereum Data Connected
          </div>
          <div className="text-sm space-y-1 text-green-100">
            <div>• <strong>Real-time transactions</strong> from the Ethereum network</div>
            <div>• <strong>Live validator data</strong> showing actual block proposals</div>
            <div className="text-xs mt-2 opacity-75">
              All data is fetched from public APIs - you're seeing the real Ethereum network in action!
            </div>
          </div>
        </div>
      </header>

      {/* Global error display - shows at the top when something goes wrong */}
      {error ? <Alert title={error.title} message={error.message} hint={error.hint} /> : null}

      {/* Step-by-Step Walkthrough Guide */}
      {/* This guide was essential - users didn't know where to start */}
      <div className="my-6 bg-gradient-to-br from-green-500/10 to-cyan-500/10 border border-green-500/30 rounded-lg p-6">
        <h3 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
          How to Use This Tool - Beginner's Guide
        </h3>

        <div className="space-y-4 text-sm">
          <div className="bg-black/30 rounded-lg p-4 border border-white/10">
            <div className="flex items-start gap-3">
              <span className="text-2xl font-bold text-green-400">1</span>
              <div className="flex-1">
                <h4 className="font-semibold text-white mb-2">Start with the Mempool</h4>
                <p className="text-white/80 leading-relaxed">
                  Click <strong className="text-green-400">"1) Mempool"</strong> button below to see real transactions waiting to be processed.
                  This is like looking at mail waiting to be sorted at the post office. You'll see:
                </p>
                <ul className="mt-2 ml-4 space-y-1 text-white/70">
                  <li>• How many transactions are waiting</li>
                  <li>• Current gas prices (fees people are paying)</li>
                  <li>• Total value being transferred</li>
                </ul>
                <p className="mt-2 text-xs text-green-300 bg-green-500/10 p-2 rounded">
                  💡 <strong>What to notice:</strong> Gas prices change constantly based on how many people are using Ethereum. Higher prices = more competition!
                </p>
              </div>
            </div>
          </div>

          <div className="bg-black/30 rounded-lg p-4 border border-white/10">
            <div className="flex items-start gap-3">
              <span className="text-2xl font-bold text-purple-400">2-3</span>
              <div className="flex-1">
                <h4 className="font-semibold text-white mb-2">See the MEV Competition</h4>
                <p className="text-white/80 leading-relaxed">
                  Click <strong className="text-purple-400">"2) Builders → Relays"</strong> to see professional block builders competing.
                  Then <strong className="text-purple-400">"3) Relays → Validators"</strong> to see which blocks won. This shows:
                </p>
                <ul className="mt-2 ml-4 space-y-1 text-white/70">
                  <li>• Multiple builders creating competing blocks for the same slot</li>
                  <li>• How much they're bidding to have their block chosen</li>
                  <li>• Only one winner per slot actually gets included on-chain</li>
                </ul>
                <p className="mt-2 text-xs text-purple-300 bg-purple-500/10 p-2 rounded">
                  💡 <strong>Why this matters:</strong> Builders extract MEV (hidden profits) and share it with validators. This is how most validators earn extra income!
                </p>
              </div>
            </div>
          </div>

          <div className="bg-black/30 rounded-lg p-4 border border-white/10">
            <div className="flex items-start gap-3">
              <span className="text-2xl font-bold text-blue-400">4</span>
              <div className="flex-1">
                <h4 className="font-semibold text-white mb-2">Explore Proposed Blocks</h4>
                <p className="text-white/80 leading-relaxed">
                  Click <strong className="text-blue-400">"4) Proposed blocks + Builder payments"</strong> to see actual blocks that made it on-chain.
                  Compare MEV-Boost blocks (built by professionals) vs Vanilla blocks (built locally). You'll learn:
                </p>
                <ul className="mt-2 ml-4 space-y-1 text-white/70">
                  <li>• How validators earn money (base rewards + tips + builder payments)</li>
                  <li>• Block fullness and gas utilization</li>
                  <li>• Which builders are dominating the market</li>
                </ul>
              </div>
            </div>
          </div>

          <div className="bg-black/30 rounded-lg p-4 border border-white/10">
            <div className="flex items-start gap-3">
              <span className="text-2xl font-bold text-cyan-400">5</span>
              <div className="flex-1">
                <h4 className="font-semibold text-white mb-2">Understand Finality</h4>
                <p className="text-white/80 leading-relaxed">
                  Click <strong className="text-cyan-400">"5) Finality checkpoints"</strong> to see how transactions become permanent.
                  This explains Ethereum's security mechanism:
                </p>
                <ul className="mt-2 ml-4 space-y-1 text-white/70">
                  <li>• Justification → Finalization process</li>
                  <li>• Why exchanges wait ~15 minutes for large deposits</li>
                  <li>• Economic security ($30+ billion to reverse finalized blocks)</li>
                </ul>
              </div>
            </div>
          </div>

          <div className="bg-black/30 rounded-lg p-4 border border-white/10">
            <div className="flex items-start gap-3">
              <span className="text-2xl font-bold text-orange-400">6</span>
              <div className="flex-1">
                <h4 className="font-semibold text-white mb-2">Detect MEV Attacks</h4>
                <p className="text-white/80 leading-relaxed">
                  Click <strong className="text-orange-400">"6) Sandwich detector"</strong> and enter a block number (or use "latest").
                  This scans for sandwich attacks - a type of frontrunning where traders profit at victims' expense.
                </p>
                <p className="mt-2 text-xs text-orange-300 bg-orange-500/10 p-2 rounded">
                  ⚠️ <strong>Real MEV:</strong> ~5-10% of blocks contain detectable sandwich attacks. This shows how traders lose money to MEV every day!
                </p>
              </div>
            </div>
          </div>

          <div className="bg-gradient-to-r from-yellow-500/20 to-green-500/20 border border-yellow-500/40 rounded-lg p-4 mt-4">
            <h4 className="font-semibold text-yellow-300 mb-2 flex items-center gap-2">
              <span>✨</span> Pro Tip for Beginners
            </h4>
            <p className="text-white/90 text-sm">
              Don't worry if some terms are confusing at first! Hover over highlighted terms in the glossary (right sidebar) for instant definitions.
              Each panel has detailed explanations with real-world analogies. Take your time exploring each section - this is complex stuff,
              but understanding it gives you superpowers in the crypto world!
            </p>
          </div>
        </div>
      </div>

      {/* Main control buttons - these trigger data loading and panel display */}
      <div className="grid gap-4 grid-cols-1 md:grid-cols-3" role="group" aria-label="Data fetch controls">
        <GlowButton
          ariaLabel="Toggle mempool"
          onClick={async () => {
            // Toggle panel - close if open, open if closed
            if (activePanel === "mempool") {
              setActivePanel(null);
            } else {
              // Load data if we don't have it yet
              if (!mempool) {
                await loadSnapshot(false);
              }
              setActivePanel("mempool");
            }
          }}
          className={activePanel === "mempool" ? "ring-2 ring-blue-500" : ""}
        >
          1) Mempool
        </GlowButton>

        <GlowButton
          ariaLabel="Toggle builder blocks received"
          onClick={async () => {
            // Same pattern for all buttons - toggle and lazy load
            if (activePanel === "received") {
              setActivePanel(null);
            } else {
              if (!received) {
                await loadSnapshot(false);
              }
              setActivePanel("received");
            }
          }}
          className={activePanel === "received" ? "ring-2 ring-blue-500" : ""}
        >
          2) Builders → Relays (received)
        </GlowButton>

        <GlowButton
          ariaLabel="Toggle delivered payloads"
          onClick={async () => {
            if (activePanel === "delivered") {
              setActivePanel(null);
            } else {
              if (!delivered) {
                await loadSnapshot(false);
              }
              setActivePanel("delivered");
            }
          }}
          className={activePanel === "delivered" ? "ring-2 ring-blue-500" : ""}
        >
          3) Relays → Validators (delivered)
        </GlowButton>

        <GlowButton
          ariaLabel="Toggle beacon headers"
          onClick={async () => {
            if (activePanel === "headers") {
              setActivePanel(null);
            } else {
              if (!headers) {
                await loadSnapshot(false);
              }
              setActivePanel("headers");
            }
          }}
          className={activePanel === "headers" ? "ring-2 ring-blue-500" : ""}
        >
          4) Proposed blocks + Builder payments
        </GlowButton>

        <GlowButton
          ariaLabel="Toggle finality checkpoints"
          onClick={async () => {
            if (activePanel === "finality") {
              setActivePanel(null);
            } else {
              if (!finality) {
                await loadSnapshot(false);
              }
              setActivePanel("finality");
            }
          }}
          className={activePanel === "finality" ? "ring-2 ring-blue-500" : ""}
        >
          5) Finality checkpoints
        </GlowButton>

        <GlowButton
          ariaLabel="Toggle sandwich detector"
          onClick={async () => {
            if (activePanel === "mev") {
              setActivePanel(null);
            } else {
              if (!mev) {
                await loadSnapshot(true, mevBlock || "latest");
              }
              setActivePanel("mev");
            }
          }}
          className={activePanel === "mev" ? "ring-2 ring-blue-500" : ""}
        >
          6) Sandwich detector
        </GlowButton>
      </div>

      {/* Transaction Flow Diagram - Full Width */}
      {/* This is the heart of the app - shows the visual flow */}
      <div className="mb-8">
        <h2 className="text-2xl font-semibold text-neon-blue mb-4 text-center">Transaction Flow</h2>
        <MermaidDiagram stages={stages} />
      </div>

      {/* Transaction tracking feature - lets users follow a specific tx */}
      <Panel id="panel-tracker" title="Track a transaction">
        <p className="text-white/70">
          Enter a transaction hash to stitch together its journey: execution inclusion, relay bidtraces, and an
          approximate finality check using beacon checkpoints.
        </p>
        <div className="mt-3 flex flex-col md:flex-row gap-2">
          <input
            value={trackHash}
            onChange={(event) => setTrackHash(event.target.value)}
            placeholder="0x..."
            aria-label="Transaction hash"
            className="flex-1 bg-black/40 border border-white/10 rounded px-3 py-2 text-sm"
          />
          <GlowButton ariaLabel="Track transaction" onClick={async () => {
            // Basic validation before making API call
            if (!trackHash) {
              setError({ title: "Validation", message: "Enter a transaction hash" });
              return;
            }
            setTracked(null);
            setTrackLoading(true);
            setTrackDetailsHidden(false); // Show details when tracking new transaction
            const result = await safeFetch(`/api/track/tx/${trackHash}`);
            setTrackLoading(false);
            if (result) {
              // Unwrap API envelope if present
              setTracked(result.data ?? result);
            }
          }}>
            Track
          </GlowButton>
          {/* Toggle button for hiding/showing transaction details */}
          {tracked && (
            <GlowButton
              ariaLabel={trackDetailsHidden ? "Show transaction details" : "Hide transaction details"}
              onClick={() => setTrackDetailsHidden(!trackDetailsHidden)}
            >
              {trackDetailsHidden ? "Unhide" : "Hide"}
            </GlowButton>
          )}
          <CaptureButton targetId="panel-tracker" />
        </div>
        {/* Transaction details display - conditionally shown */}
        {!trackDetailsHidden && (
          <div className="mt-3 overflow-auto max-h-96 text-xs bg-black/40 p-3 rounded-lg border border-white/10">
            {trackLoading ? (
              <p className="text-white/60">Loading transaction data...</p>
            ) : tracked ? (
              <TransactionView data={tracked} />
            ) : (
              <p className="text-white/60">Enter a hash and click Track. {error ? "Check the error message above." : ""}</p>
            )}
          </div>
        )}
        {trackDetailsHidden && tracked && (
          <div className="mt-3 p-3 bg-black/20 border border-white/10 rounded-lg text-center">
            <p className="text-white/60 text-sm">Transaction details hidden. Click "Unhide" to view.</p>
          </div>
        )}
      </Panel>

      {/* Conditional panel rendering based on activePanel state */}
      {activePanel === "mempool" && (
        <Panel id="panel-mempool" title="Mempool (public txs seen by your Geth)">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2">
            <p className="text-white/70">
              Execution-layer mempool data from <code>txpool_status</code> and <code>txpool_content</code> (Geth-specific
              RPC namespace).
            </p>
            <CaptureButton targetId="panel-mempool" />
          </div>
          {/* Debug info showing which APIs we're connected to */}
          <div className="mt-2 text-xs text-white/60">
            Feeds: WS {sources?.rpc_ws || 'unset'}; HTTP {sources?.rpc_http || 'unset'}{mempool?.source ? ` (source=${mempool.source})` : ''}
          </div>

          {/* Mempool Metrics Summary - these cards show key stats at a glance */}
          {mempool?.metrics && (
            <div className="mt-4 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
              <div className="bg-gradient-to-br from-blue-500/10 to-blue-600/5 border border-blue-500/20 rounded-lg p-4">
                <div className="text-blue-400 text-xs font-medium mb-1">Total Transactions</div>
                <div className="text-white text-2xl font-bold">{formatNumber(mempool.count || 0)}</div>
              </div>
              <div className="bg-gradient-to-br from-purple-500/10 to-purple-600/5 border border-purple-500/20 rounded-lg p-4">
                <div className="text-purple-400 text-xs font-medium mb-1">Gas Requested</div>
                <div className="text-white text-2xl font-bold">{formatNumber(mempool.metrics.totalGasRequested || 0)}</div>
                <div className="text-white/60 text-xs mt-1">gas units</div>
              </div>
              <div className="bg-gradient-to-br from-green-500/10 to-green-600/5 border border-green-500/20 rounded-lg p-4">
                <div className="text-green-400 text-xs font-medium mb-1">Total Value</div>
                <div className="text-white text-2xl font-bold">{weiToEth(mempool.metrics.totalValueWei || '0x0')}</div>
                <div className="text-white/60 text-xs mt-1">ETH</div>
              </div>
              <div className="bg-gradient-to-br from-orange-500/10 to-orange-600/5 border border-orange-500/20 rounded-lg p-4">
                <div className="text-orange-400 text-xs font-medium mb-1">Avg Gas Price</div>
                <div className="text-white text-2xl font-bold">{mempool.metrics.avgGasPrice?.toFixed(2) || '0.00'}</div>
                <div className="text-white/60 text-xs mt-1">gwei</div>
              </div>
            </div>
          )}

          {/* High Priority Badge - shows when there are expensive transactions */}
          {mempool?.metrics?.highPriorityCount > 0 && (
            <div className="mt-3 inline-flex items-center gap-2 px-3 py-1.5 bg-red-500/10 border border-red-500/30 rounded-full text-sm">
              <span className="text-red-400">🔥</span>
              <span className="text-white/90">
                {mempool.metrics.highPriorityCount} high-priority tx{mempool.metrics.highPriorityCount !== 1 ? 's' : ''} (&gt;50 gwei)
              </span>
            </div>
          )}

          {/* Gas Economics Explainer - this helps users understand what they're seeing */}
          {mempool?.metrics && (
            <div className="mt-4 bg-blue-500/5 border border-blue-500/20 rounded-lg p-3 text-sm space-y-2">
              <div className="flex items-start gap-2">
                <span className="text-blue-400 text-lg">💡</span>
                <div className="text-white/80 space-y-2">
                  <div>
                    <strong className="text-white">Gas Economics - Base Fee vs Priority Fee (Tips):</strong>
                  </div>
                  <ul className="list-disc list-inside space-y-1 text-xs ml-4">
                    <li><strong>Base Fee (Burned):</strong> Minimum fee required, dynamically adjusted based on network congestion. This ETH is destroyed (deflationary)</li>
                    <li><strong>Priority Fee / Tip (To Validator):</strong> Extra payment to incentivize miners/validators to include your transaction sooner</li>
                    <li><strong>High Gas = Competition:</strong> Users pay higher priority fees during congestion to get included faster (like bidding in an auction)</li>
                    <li><strong>Total Cost:</strong> You pay (Base Fee + Priority Fee) × Gas Used. Higher tips = faster inclusion</li>
                    <li><strong>Avg {mempool.metrics.avgGasPrice?.toFixed(2)} gwei:</strong> Current average total gas price in mempool. Network is {mempool.metrics.avgGasPrice > 50 ? 'VERY congested' : mempool.metrics.avgGasPrice > 20 ? 'moderately busy' : 'relatively quiet'}</li>
                  </ul>
                  <div className="text-blue-400 text-xs bg-blue-400/10 border border-blue-400/20 rounded p-2 mt-2">
                    💰 <strong>Example:</strong> A simple ETH transfer (21,000 gas) at {mempool.metrics.avgGasPrice?.toFixed(2)} gwei costs ~{(21000 * (mempool.metrics.avgGasPrice || 0) / 1e9).toFixed(6)} ETH.
                    Complex DeFi transactions can use 10x more gas!
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Raw JSON data for developers who want to see the full response */}
          <pre className="mt-3 overflow-auto max-h-96 text-xs bg-black/40 p-3 rounded-lg border border-white/10">
            {mempool ? JSON.stringify(mempool, null, 2) : "Loading..."}
          </pre>
          <p className="text-white/60 text-sm mt-2">
            Tip: live feeds use WebSocket <code>eth_subscribe("newPendingTransactions")</code>.
          </p>
        </Panel>
      )}

      {/* Builder blocks received panel - shows MEV competition */}
      {activePanel === "received" && (
        <Panel id="panel-received" title="Builders → Relays (builder_blocks_received)">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2 mb-3">
            <p className="text-white/70">
              Shows which builders are submitting payloads to relays—this activity lives outside your execution client.
            </p>
            <CaptureButton targetId="panel-received" />
          </div>
          <div className="mb-3 text-xs text-white/60">
            Relays (configured): {Array.isArray(sources?.relays) ? sources.relays.join(', ') : 'n/a'}
          </div>
          {received ? <BuilderRelayView data={received} /> : <p className="text-white/60">Loading...</p>}
        </Panel>
      )}

      {/* Delivered payloads panel - shows which blocks actually won */}
      {activePanel === "delivered" && (
        <Panel id="panel-delivered" title="Relays → Validators (proposer_payload_delivered)">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2 mb-3">
            <p className="text-white/70">
              Delivers show which payload ultimately reached the proposer, including total value and transaction counts.
            </p>
            <CaptureButton targetId="panel-delivered" />
          </div>
          <div className="mb-3 text-xs text-white/60">
            Relays (configured): {Array.isArray(sources?.relays) ? sources.relays.join(', ') : 'n/a'}
          </div>
          {delivered ? <RelayDeliveredView data={delivered} /> : <p className="text-white/60">Loading...</p>}
        </Panel>
      )}

      {/* Beacon headers panel - shows actual blocks on-chain */}
      {activePanel === "headers" && (
        <Panel id="panel-headers" title="Proposed blocks + Builder payments">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2 mb-3">
            <p className="text-white/70">
              Consensus-layer head headers with builder payment data, gas usage, and block utilization metrics.
            </p>
            <CaptureButton targetId="panel-headers" />
          </div>
          <div className="mb-3 text-xs text-white/60">
            Beacon API: {sources?.beacon_api || 'unset'}
          </div>
          {headers ? <BeaconHeadersView data={headers} /> : <p className="text-white/60">Loading...</p>}
        </Panel>
      )}

      {/* Finality checkpoints panel - shows when blocks become permanent */}
      {activePanel === "finality" && (
        <Panel id="panel-finality" title="Finality checkpoints (Casper-FFG)">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2 mb-3">
            <p className="text-white/70">
              Finalized and justified checkpoints show when proposals become irreversible under Casper-FFG.
            </p>
            <CaptureButton targetId="panel-finality" />
          </div>
          <div className="mb-3 text-xs text-white/60">
            Beacon API: {sources?.beacon_api || 'unset'}
          </div>
          {finality ? <FinalityView data={finality} /> : <p className="text-white/60">Loading...</p>}
        </Panel>
      )}

      {/* MEV sandwich detector panel - this is the fun one! */}
      {activePanel === "mev" && (
        <Panel id="panel-sandwich" title="MEV: Sandwich detector (Uniswap V2/V3 heuristic)">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
            <div className="md:w-2/3 text-white/70">
              Scans a block for swaps where the same address wraps a victim trade in the same pool. Attackers are tinted
              orange, victims yellow—purely educational and not production-grade forensics.
            </div>
            <div className="flex items-center gap-2">
              <input
                value={mevBlock}
                onChange={(event) => setMevBlock(event.target.value)}
                placeholder="latest or 0x..."
                aria-label="Block number or tag"
                className="bg-black/40 border border-white/10 rounded px-2 py-1 text-sm"
              />
              <GlowButton ariaLabel="Analyze block" onClick={async () => {
                // MEV analysis is expensive so we only do it on demand
                const target = mevBlock || "latest";
                const result = await safeFetch(`/api/mev/sandwich?block=${encodeURIComponent(target)}`);
                if (result) {
                  setMev(result);
                }
              }}>
                Analyze
              </GlowButton>
              <CaptureButton targetId="panel-sandwich" />
            </div>
          </div>
          <div className="mb-3 text-xs text-white/60">
            RPC (block/receipts): {mev?.data?.sources?.rpc_http || sources?.rpc_http || 'unset'}
          </div>
          {mev?.data ? <SandwichView data={mev.data} /> : <p className="text-white/60">Run an analysis with the button above.</p>}
        </Panel>
      )}

      {/* Summary panel explaining the whole process */}
      <Panel id="panel-wrap" title="Wrap-up: how a tx becomes finalized">
        <ol className="list-decimal pl-5 space-y-1 text-white/80">
          <li>
            <strong>Broadcast</strong>: the transaction reaches public mempools. Visibility depends on which peers relay
            it to you.
          </li>
          <li>
            <strong>PBS off-chain</strong>: searchers craft bundles, builders assemble blocks, and relays auction them to
            validators (MEV-Boost).
          </li>
          <li>
            <strong>Proposal</strong>: a validator proposes the block at its slot, visible through beacon headers.
          </li>
          <li>
            <strong>Finality</strong>: Casper-FFG finalizes epochs once enough attestations confirm the block.
          </li>
        </ol>
      </Panel>

      {/* Glossary moved to bottom - contains definitions for all the crypto terms */}
      <div className="mt-8">
        <Glossary />
      </div>
    </main>
  );
}
