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
  const [mempool, setMempool] = useState<Any>(null);
  const [received, setReceived] = useState<Any>(null);
  const [delivered, setDelivered] = useState<Any>(null);
  const [headers, setHeaders] = useState<Any>(null);
  const [finality, setFinality] = useState<Any>(null);
  const [mev, setMev] = useState<Any>(null);
  const [mevBlock, setMevBlock] = useState<string>("latest");
  const [trackHash, setTrackHash] = useState<string>("");
  const [tracked, setTracked] = useState<Any>(null);
  const [error, setError] = useState<ErrState>(null);
  const [syncStatus, setSyncStatus] = useState<Any>(null);

  const stages = useMemo(
    () => ({
      mempool: Boolean(mempool),
      pbs: Boolean(received) || Boolean(delivered),
      relays: Boolean(delivered),
      proposal: Boolean(headers),
      finality: Boolean(finality)
    }),
    [delivered, finality, headers, mempool, received]
  );

  // Fetch sync status on component mount
  React.useEffect(() => {
    const fetchSyncStatus = async () => {
      const result = await safeFetch("/api/sync-status");
      if (result) {
        setSyncStatus(result);
      }
    };
    fetchSyncStatus();
  }, []);

  async function safeFetch(url: string, init?: RequestInit) {
    setError(null);
    try {
      const res = await fetch(url, init);
      const contentType = res.headers.get("content-type") || "";
      const isJSON = contentType.includes("application/json") || url.endsWith(".json");
      if (!isJSON) {
        if (!res.ok) {
          setError({ title: "Request failed", message: `${res.status} ${res.statusText}` });
          return null;
        }
        return await res.text();
      }
      const payload = await res.json();
      if (!res.ok || payload?.error) {
        const errPayload = payload?.error ?? {};
        // Show more helpful error messages
        let errorMessage = errPayload.message || `${res.status} ${res.statusText}`;
        let errorHint = errPayload.hint;
        
        if (errPayload.kind === "TXPOOL") {
          errorMessage = "Geth is still syncing - mempool data not available yet";
          errorHint = "Wait for Geth to finish syncing (2-4 hours). Check sync progress with: docker logs geth";
        } else if (errPayload.kind === "RELAY") {
          errorMessage = "Relay API temporarily unavailable";
          errorHint = "This is normal - public relays may be rate limiting. Try again in a few minutes.";
        } else if (errPayload.kind === "BEACON") {
          errorMessage = "Lighthouse is still syncing - consensus data not available yet";
          errorHint = "Wait for Lighthouse to finish checkpoint sync (~30 minutes).";
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
      setError({ 
        title: "Network error", 
        message: err instanceof Error ? err.message : String(err),
        hint: "Check if all services are running: docker compose ps"
      });
      return null;
    }
  }

  const highlightTx = (hash: string) => {
    const sandwiches: Any = mev?.data?.sandwiches;
    if (!sandwiches || !hash) {
      return "";
    }
    const lower = hash.toLowerCase();
    for (const sw of sandwiches as Any[]) {
      if (sw.preTx?.toLowerCase?.() === lower) {
        return "bg-orange-300/20 border-orange-400/40";
      }
      if (sw.victimTx?.toLowerCase?.() === lower) {
        return "bg-yellow-300/20 border-yellow-400/40";
      }
      if (sw.postTx?.toLowerCase?.() === lower) {
        return "bg-orange-300/20 border-orange-400/40";
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
        
        {/* Sync Status */}
        {syncStatus && (
          <div className={`border rounded-lg p-4 text-center ${
            syncStatus.geth?.synced && syncStatus.lighthouse?.synced 
              ? 'bg-green-400/10 border-green-400/30' 
              : 'bg-yellow-400/10 border-yellow-400/30'
          }`}>
            <div className={`font-semibold mb-2 ${
              syncStatus.geth?.synced && syncStatus.lighthouse?.synced 
                ? 'text-green-200' 
                : 'text-yellow-200'
            }`}>
              {syncStatus.geth?.synced && syncStatus.lighthouse?.synced 
                ? '✅ Services Ready' 
                : '⚠️ Services Syncing'
              }
            </div>
            <div className={`text-sm space-y-1 ${
              syncStatus.geth?.synced && syncStatus.lighthouse?.synced 
                ? 'text-green-100' 
                : 'text-yellow-100'
            }`}>
              <div>• <strong>Geth</strong>: {syncStatus.geth?.synced ? 'Synced ✅' : 'Syncing mainnet blockchain (2-4 hours)'}</div>
              <div>• <strong>Lighthouse</strong>: {syncStatus.lighthouse?.synced ? 'Synced ✅' : 'Syncing consensus layer (~30 minutes)'}</div>
              {!(syncStatus.geth?.synced && syncStatus.lighthouse?.synced) && (
                <div className="text-xs mt-2 opacity-75">
                  Buttons will work once sync completes. Check progress: <code className="bg-black/30 px-1 rounded">docker logs geth</code>
                </div>
              )}
            </div>
          </div>
        )}
      </header>

      {error ? <Alert title={error.title} message={error.message} hint={error.hint} /> : null}

      <div className="grid gap-4 grid-cols-1 md:grid-cols-3" role="group" aria-label="Data fetch controls">
        <GlowButton ariaLabel="Fetch mempool" onClick={async () => {
          const result = await safeFetch("/api/mempool");
          if (result) {
            setMempool(result.data ?? result);
          }
        }}>
          1) Mempool
        </GlowButton>

        <GlowButton ariaLabel="Fetch builder blocks received" onClick={async () => {
          const result = await safeFetch("/api/relays/received?limit=25");
          if (result) {
            setReceived(result);
          }
        }}>
          2) Builders → Relays (received)
        </GlowButton>

        <GlowButton ariaLabel="Fetch delivered payloads" onClick={async () => {
          const result = await safeFetch("/api/relays/delivered?limit=25");
          if (result) {
            setDelivered(result);
          }
        }}>
          3) Relays → Validators (delivered)
        </GlowButton>

        <GlowButton ariaLabel="Fetch beacon headers" onClick={async () => {
          const result = await safeFetch("/api/validators/head");
          if (result) {
            setHeaders(result);
          }
        }}>
          4) Proposed blocks (headers)
        </GlowButton>

        <GlowButton ariaLabel="Fetch finality checkpoints" onClick={async () => {
          const result = await safeFetch("/api/finality");
          if (result) {
            setFinality(result);
          }
        }}>
          5) Finality checkpoints
        </GlowButton>

        <GlowButton ariaLabel="Analyze sandwiches" onClick={async () => {
          const result = await safeFetch(`/api/mev/sandwich?block=${encodeURIComponent(mevBlock || "latest")}`);
          if (result) {
            setMev(result);
          }
        }}>
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
            const result = await safeFetch(`/api/track/tx/${trackHash}`);
            if (result) {
              setTracked(result);
            }
          }}>
            Track
          </GlowButton>
          <CaptureButton targetId="panel-tracker" />
        </div>
        <div className="mt-3 overflow-auto max-h-96 text-xs bg-black/40 p-3 rounded-lg border border-white/10">
          {tracked ? <pre>{JSON.stringify(tracked, null, 2)}</pre> : "Enter a hash and click Track."}
        </div>
      </Panel>

      <Panel id="panel-mempool" title="Mempool (public txs seen by your Geth)">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2">
          <p className="text-white/70">
            Execution-layer mempool data from <code>txpool_status</code> and <code>txpool_content</code> (Geth-specific
            RPC namespace).
          </p>
          <CaptureButton targetId="panel-mempool" />
        </div>
        <pre className="mt-3 overflow-auto max-h-96 text-xs bg-black/40 p-3 rounded-lg border border-white/10">
          {mempool ? JSON.stringify(mempool, null, 2) : "Click the button above."}
        </pre>
        <p className="text-white/60 text-sm mt-2">
          Tip: live feeds use WebSocket <code>eth_subscribe("newPendingTransactions")</code>.
        </p>
      </Panel>

      <Panel id="panel-received" title="Builders → Relays (builder_blocks_received)">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2">
          <p className="text-white/70">
            Shows which builders are submitting payloads to relays—this activity lives outside your execution client.
          </p>
          <CaptureButton targetId="panel-received" />
        </div>
        <pre className="mt-3 overflow-auto max-h-96 text-xs bg-black/40 p-3 rounded-lg border border-white/10">
          {received ? JSON.stringify(received, null, 2) : "Click the button."}
        </pre>
      </Panel>

      <Panel id="panel-delivered" title="Relays → Validators (proposer_payload_delivered)">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2">
          <p className="text-white/70">
            Delivers show which payload ultimately reached the proposer, including total value and transaction counts.
          </p>
          <CaptureButton targetId="panel-delivered" />
        </div>
        <pre className="mt-3 overflow-auto max-h-96 text-xs bg-black/40 p-3 rounded-lg border border-white/10">
          {delivered ? JSON.stringify(delivered, null, 2) : "Click the button."}
        </pre>
      </Panel>

      <Panel id="panel-headers" title="Proposed blocks (beacon headers)">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2">
          <p className="text-white/70">
            Consensus-layer head headers expose proposers and the canonical chain tip for the latest slots.
          </p>
          <CaptureButton targetId="panel-headers" />
        </div>
        <pre className="mt-3 overflow-auto max-h-96 text-xs bg-black/40 p-3 rounded-lg border border-white/10">
          {headers ? JSON.stringify(headers, null, 2) : "Click the button."}
        </pre>
      </Panel>

      <Panel id="panel-finality" title="Finality checkpoints (Casper-FFG)">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2">
          <p className="text-white/70">
            Finalized and justified checkpoints show when proposals become irreversible under Casper-FFG.
          </p>
          <CaptureButton targetId="panel-finality" />
        </div>
        <pre className="mt-3 overflow-auto max-h-96 text-xs bg-black/40 p-3 rounded-lg border border-white/10">
          {finality ? JSON.stringify(finality, null, 2) : "Click the button."}
        </pre>
      </Panel>

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
