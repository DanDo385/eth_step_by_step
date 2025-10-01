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

type Any = any;

type ErrState = { title: string; message?: string; hint?: string } | null;

export default function Page() {
  // State for each data panel - mempool, relays, beacon, etc
  const [mempool, setMempool] = useState<Any>(null);
  const [received, setReceived] = useState<Any>(null);
  const [delivered, setDelivered] = useState<Any>(null);
  const [headers, setHeaders] = useState<Any>(null);
  const [finality, setFinality] = useState<Any>(null);
  const [mev, setMev] = useState<Any>(null);
  const [mevBlock, setMevBlock] = useState<string>("latest");
  const [sources, setSources] = useState<Any>(null);
  const [trackHash, setTrackHash] = useState<string>("");
  const [tracked, setTracked] = useState<Any>(null);
  const [trackLoading, setTrackLoading] = useState(false);
  const [error, setError] = useState<ErrState>(null);

  // Client-side throttle for snapshot endpoint to avoid hammering the API
  const [lastSnapAt, setLastSnapAt] = useState<number>(0);
  const SNAP_TTL_MS = 30_000; // wait 30s between snapshot calls

  // Track which panel is currently open (only one at a time)
  const [activePanel, setActivePanel] = useState<string | null>(null);

  // Compute which stages to highlight in the diagram based on active panel
  const stages = useMemo(
    () => ({
      mempool: activePanel === "mempool",
      pbs: activePanel === "received" || activePanel === "delivered",
      relays: activePanel === "received" || activePanel === "delivered",
      proposal: activePanel === "headers",
      finality: activePanel === "finality"
    }),
    [activePanel]
  );


  // safeFetch wraps fetch with error handling and user-friendly messages
  // All our API calls go through this to provide consistent error UX
  async function safeFetch(url: string, init?: RequestInit) {
    setError(null);
    try {
      const res = await fetch(url, init);
      const contentType = res.headers.get("content-type") || "";
      const isJSON = contentType.includes("application/json") || url.endsWith(".json");

      // Handle non-JSON responses
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
  async function loadSnapshot(includeSandwich = false, block?: string) {
    // Throttle to avoid spamming the API when user clicks buttons rapidly
    const now = Date.now();
    if (now - lastSnapAt < SNAP_TTL_MS) {
      return; // reuse existing state
    }

    // Build query string for optional MEV analysis
    const qs = new URLSearchParams();
    if (includeSandwich) {
      qs.set("sandwich", "1");
      qs.set("block", block || mempool?.lastBlock || "latest");
    }

    const result = await safeFetch(`/api/snapshot${qs.toString() ? '?' + qs.toString() : ''}`);
    if (!result) return;

    const d = result.data ?? result;

    // Update all our state from the snapshot response
    if (d.mempool) {
      setMempool(d.mempool);
    }

    if (d.relays) {
      const receivedBlocks = d.relays.received ?? [];
      const deliveredPayloads = d.relays.delivered ?? [];
      setReceived({ data: { received_blocks: receivedBlocks, count: receivedBlocks.length } });
      setDelivered({ data: { delivered_payloads: deliveredPayloads, count: deliveredPayloads.length } });
    }

    if (d.beacon) {
      if (d.beacon.headers) setHeaders(d.beacon.headers);
      if (d.beacon.finality) setFinality(d.beacon.finality);
    }

    if (d.mev) {
      setMev({ data: d.mev });
    }

    if (d.sources) {
      setSources(d.sources);
    }

    setLastSnapAt(now);
  }

  // highlightTx colors transactions in the MEV sandwich table
  // Attacker txs (front-run/back-run) get orange, victims get yellow
  const highlightTx = (hash: string) => {
    const sandwiches: Any = mev?.data?.sandwiches;
    if (!sandwiches || !hash) {
      return "";
    }
    const lower = hash.toLowerCase();
    for (const sw of sandwiches as Any[]) {
      if (sw.preTx?.toLowerCase?.() === lower) {
        return "bg-orange-300/20 border-orange-400/40"; // front-run tx
      }
      if (sw.victimTx?.toLowerCase?.() === lower) {
        return "bg-yellow-300/20 border-yellow-400/40"; // victim tx
      }
      if (sw.postTx?.toLowerCase?.() === lower) {
        return "bg-orange-300/20 border-orange-400/40"; // back-run tx
      }
    }
    return "";
  };

  return (
    <main className="max-w-6xl mx-auto px-4 pb-12">
      {/* Transaction Flow Diagram - Full Width */}
      <div className="mb-8">
        <h2 className="text-2xl font-semibold text-neon-blue mb-4 text-center">Transaction Flow</h2>
        <MermaidDiagram stages={stages} />
      </div>

      <header className="my-6 space-y-4">
        <p className="text-white/80 leading-relaxed text-center">
          Follow a transaction from the public <strong>mempool</strong>, through the off-chain proposer-builder market
          (<strong>PBS</strong>), into a proposed block and finally <strong>Casper-FFG</strong> finality. Relay bidtraces and
          beacon APIs fill in the gaps your execution client cannot show on its own.
        </p>
        
        {/* Status */}
        <div className="border rounded-lg p-4 text-center bg-green-400/10 border-green-400/30">
          <div className="font-semibold mb-2 text-green-200">
            ✅ Services Ready
          </div>
          <div className="text-sm space-y-1 text-green-100">
            <div>• <strong>Ethereum RPC</strong>: Connected to Alchemy (public)</div>
            <div>• <strong>Beacon API</strong>: Connected to Beaconcha.in (public)</div>
            <div className="text-xs mt-2 opacity-75">
              All data is fetched from public APIs - no local blockchain sync required!
            </div>
          </div>
        </div>
      </header>

      {error ? <Alert title={error.title} message={error.message} hint={error.hint} /> : null}

      <div className="grid gap-4 grid-cols-1 md:grid-cols-3" role="group" aria-label="Data fetch controls">
        <GlowButton
          ariaLabel="Toggle mempool"
          onClick={async () => {
            if (activePanel === "mempool") {
              setActivePanel(null);
            } else {
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

      <Panel id="panel-tracker" title="Track a transaction (personalized)">
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
            if (!trackHash) {
              setError({ title: "Validation", message: "Enter a transaction hash" });
              return;
            }
            setTracked(null);
            setTrackLoading(true);
            const result = await safeFetch(`/api/track/tx/${trackHash}`);
            setTrackLoading(false);
            if (result) {
              setTracked(result);
            }
          }}>
            Track
          </GlowButton>
          <CaptureButton targetId="panel-tracker" />
        </div>
        <div className="mt-3 overflow-auto max-h-96 text-xs bg-black/40 p-3 rounded-lg border border-white/10">
          {trackLoading ? (
            <p className="text-white/60">Loading transaction data...</p>
          ) : tracked ? (
            <pre>{JSON.stringify(tracked, null, 2)}</pre>
          ) : (
            <p className="text-white/60">Enter a hash and click Track. {error ? "Check the error message above." : ""}</p>
          )}
        </div>
      </Panel>

      {activePanel === "mempool" && (
        <Panel id="panel-mempool" title="Mempool (public txs seen by your Geth)">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2">
            <p className="text-white/70">
              Execution-layer mempool data from <code>txpool_status</code> and <code>txpool_content</code> (Geth-specific
              RPC namespace).
            </p>
            <CaptureButton targetId="panel-mempool" />
          </div>
          <div className="mt-2 text-xs text-white/60">
            Feeds: WS {sources?.rpc_ws || 'unset'}; HTTP {sources?.rpc_http || 'unset'}{mempool?.source ? ` (source=${mempool.source})` : ''}
          </div>
          <pre className="mt-3 overflow-auto max-h-96 text-xs bg-black/40 p-3 rounded-lg border border-white/10">
            {mempool ? JSON.stringify(mempool, null, 2) : "Loading..."}
          </pre>
          <p className="text-white/60 text-sm mt-2">
            Tip: live feeds use WebSocket <code>eth_subscribe("newPendingTransactions")</code>.
          </p>
        </Panel>
      )}

      {activePanel === "received" && (
        <Panel id="panel-received" title="Builders → Relays (builder_blocks_received)">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2">
            <p className="text-white/70">
              Shows which builders are submitting payloads to relays—this activity lives outside your execution client.
            </p>
            <CaptureButton targetId="panel-received" />
          </div>
          <div className="mt-2 text-xs text-white/60">
            Relays (configured): {Array.isArray(sources?.relays) ? sources.relays.join(', ') : 'n/a'}
          </div>
          <pre className="mt-3 overflow-auto max-h-96 text-xs bg-black/40 p-3 rounded-lg border border-white/10">
            {received ? JSON.stringify(received, null, 2) : "Loading..."}
          </pre>
        </Panel>
      )}

      {activePanel === "delivered" && (
        <Panel id="panel-delivered" title="Relays → Validators (proposer_payload_delivered)">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2">
            <p className="text-white/70">
              Delivers show which payload ultimately reached the proposer, including total value and transaction counts.
            </p>
            <CaptureButton targetId="panel-delivered" />
          </div>
          <div className="mt-2 text-xs text-white/60">
            Relays (configured): {Array.isArray(sources?.relays) ? sources.relays.join(', ') : 'n/a'}
          </div>
          <pre className="mt-3 overflow-auto max-h-96 text-xs bg-black/40 p-3 rounded-lg border border-white/10">
            {delivered ? JSON.stringify(delivered, null, 2) : "Loading..."}
          </pre>
        </Panel>
      )}

      {activePanel === "headers" && (
        <Panel id="panel-headers" title="Proposed blocks + Builder payments">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2">
            <p className="text-white/70">
              Consensus-layer head headers with builder payment data, gas usage, and block utilization metrics.
            </p>
            <CaptureButton targetId="panel-headers" />
          </div>
          <div className="mt-2 text-xs text-white/60">
            Beacon API: {sources?.beacon_api || 'unset'}
          </div>
          <pre className="mt-3 overflow-auto max-h-96 text-xs bg-black/40 p-3 rounded-lg border border-white/10">
            {headers ? JSON.stringify(headers, null, 2) : "Loading..."}
          </pre>
        </Panel>
      )}

      {activePanel === "finality" && (
        <Panel id="panel-finality" title="Finality checkpoints (Casper-FFG)">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2">
            <p className="text-white/70">
              Finalized and justified checkpoints show when proposals become irreversible under Casper-FFG.
            </p>
            <CaptureButton targetId="panel-finality" />
          </div>
          <div className="mt-2 text-xs text-white/60">
            Beacon API: {sources?.beacon_api || 'unset'}
          </div>
          <pre className="mt-3 overflow-auto max-h-96 text-xs bg-black/40 p-3 rounded-lg border border-white/10">
            {finality ? JSON.stringify(finality, null, 2) : "Loading..."}
          </pre>
        </Panel>
      )}

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
          <div className="mt-2 text-xs text-white/60">
            RPC (block/receipts): {mev?.data?.sources?.rpc_http || sources?.rpc_http || 'unset'}
          </div>
          <div className="mt-3 text-white/70 text-sm">
            Use the transaction tracker above to inspect any highlighted hashes for inclusion, relay involvement, and
            finality.
          </div>
          <div className="mt-3 overflow-auto max-h-[28rem] border border-white/10 rounded-lg">
            {mev?.data?.sandwiches?.length ? (
              <table className="w-full text-xs">
                <thead className="bg-black/40 sticky top-0">
                  <tr>
                    <th className="text-left p-2">Pool</th>
                    <th className="text-left p-2">Attacker</th>
                    <th className="text-left p-2">Victim</th>
                    <th className="text-left p-2">Transactions (pre / victim / post)</th>
                  </tr>
                </thead>
                <tbody>
                  {mev.data.sandwiches.map((row: Any, idx: number) => (
                    <tr key={`${row.pool}-${idx}`} className="border-t border-white/10">
                      <td className="p-2">{row.pool}</td>
                      <td className="p-2">{row.attacker}</td>
                      <td className="p-2">{row.victim}</td>
                      <td className="p-2">
                        <div className="flex flex-col gap-1">
                          {[row.preTx, row.victimTx, row.postTx].map((hash: string, index: number) => (
                            <code
                              key={`${hash}-${index}`}
                              className={`block px-2 py-1 rounded border ${highlightTx(hash)}`}
                            >
                              {hash}
                            </code>
                          ))}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <pre className="text-xs bg-black/40 p-3">
                {mev ? JSON.stringify(mev, null, 2) : "Run an analysis with the button above."}
              </pre>
            )}
          </div>
        </Panel>
      )}

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

      {/* Glossary moved to bottom */}
      <div className="mt-8">
        <Glossary />
      </div>
    </main>
  );
}
