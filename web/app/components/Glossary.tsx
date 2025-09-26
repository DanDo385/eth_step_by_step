"use client";

import "react-tooltip/dist/react-tooltip.css";
import { Tooltip } from "react-tooltip";

const terms: Array<{ term: string; definition: string }> = [
  {
    term: "Builder",
    definition: "Assembles blocks from bundles + public txs, bids to relays." 
  },
  {
    term: "Relay",
    definition: "Forwards builders' bids to proposers in MEV-Boost." 
  },
  {
    term: "MEV",
    definition: "Value captured via transaction ordering (arb, liquidations, sandwiches)." 
  },
  {
    term: "Sandwich attack",
    definition: "Attacker trades before & after a victim swap in the same pool." 
  },
  {
    term: "Finality",
    definition: "Casper-FFG finalizes epochs once validators attest." 
  }
];

export default function Glossary() {
  return (
    <aside className="rounded-xl bg-black/30 border border-white/10 p-4" aria-label="Glossary">
      <h3 className="font-semibold mb-2">Glossary</h3>
      <ul className="space-y-1 text-sm">
        {terms.map(({ term, definition }) => (
          <li key={term}>
            <span data-tooltip-id="glossary" data-tooltip-content={definition} className="underline decoration-dotted cursor-help">
              {term}
            </span>
          </li>
        ))}
      </ul>
      <Tooltip id="glossary" place="right" />
    </aside>
  );
}
