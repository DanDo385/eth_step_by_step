/*
 * Glossary.tsx
 * Interactive glossary component with 40+ Ethereum terms organized by category.
 * Uses react-tooltip to show definitions on hover. Perfect for beginners learning crypto concepts.
 */
"use client";

import "react-tooltip/dist/react-tooltip.css";
import { Tooltip } from "react-tooltip";

const terms: Array<{ term: string; definition: string; category?: string }> = [
  // Cryptocurrency Basics
  {
    term: "Ethereum",
    definition: "A global computer network (blockchain) where people can send digital money (ETH) and run programs. Think of it as the internet, but for money and apps that no single company controls.",
    category: "basics"
  },
  {
    term: "Transaction (TX)",
    definition: "Sending money or interacting with a program on Ethereum. Like writing a check or making a bank transfer, but it happens on a global computer network instead of through a bank.",
    category: "basics"
  },
  {
    term: "ETH (Ether)",
    definition: "The native cryptocurrency of Ethereum. It's digital money you can send, receive, or use to pay for transactions. 1 ETH ≈ $2,000-$4,000 USD (varies with market).",
    category: "basics"
  },
  {
    term: "Wallet",
    definition: "A digital app (like MetaMask) that stores your ETH and lets you send transactions. Like a digital bank account, but you control the password (private key) instead of a bank.",
    category: "basics"
  },
  {
    term: "Gas Fee",
    definition: "The cost to process your transaction, paid in ETH. Like a postal stamp - you pay a small fee for the network to process your transaction. Fees go to validators who process transactions.",
    category: "basics"
  },
  {
    term: "Wei & Gwei",
    definition: "Tiny fractions of ETH used for gas prices. 1 ETH = 1 billion gwei = 1 quintillion wei. Like cents to dollars: 1 gwei = 0.000000001 ETH.",
    category: "basics"
  },

  // Transaction Lifecycle
  {
    term: "Mempool",
    definition: "The 'waiting room' for transactions. When you send a transaction, it sits here with thousands of others waiting to be included in a block. Think of it as mail waiting to be sorted.",
    category: "lifecycle"
  },
  {
    term: "Block",
    definition: "A batch of ~200-400 transactions bundled together. New blocks are created every 12 seconds, like mail trucks leaving the post office on schedule.",
    category: "lifecycle"
  },
  {
    term: "Validator",
    definition: "Computers that verify transactions and create new blocks. They stake 32 ETH as collateral to prove they're honest. Like bank tellers who verify your transactions and get paid for their work.",
    category: "lifecycle"
  },
  {
    term: "Slot",
    definition: "A 12-second time window. Every slot, one validator is chosen to propose a new block. Like scheduled departure times for mail trucks - one leaves every 12 seconds.",
    category: "lifecycle"
  },
  {
    term: "Epoch",
    definition: "32 slots (6.4 minutes). Used for finality checkpoints - after 2-3 epochs, your transaction becomes permanent. Like a shift change at the post office.",
    category: "lifecycle"
  },

  // MEV & PBS
  {
    term: "Builder",
    definition: "Professional operators who assemble blocks and compete to have them chosen. They include special transaction bundles to extract MEV and share profits with validators.",
    category: "mev"
  },
  {
    term: "Relay",
    definition: "Middlemen that forward builders' block proposals to validators. They ensure builders don't cheat by verifying blocks before passing them along.",
    category: "mev"
  },
  {
    term: "MEV (Maximal Extractable Value)",
    definition: "Profit extracted by reordering, inserting, or censoring transactions. Like a scalper buying concert tickets before you and reselling at a markup. Includes arbitrage, liquidations, and sandwich attacks.",
    category: "mev"
  },
  {
    term: "PBS (Proposer-Builder Separation)",
    definition: "System where specialized builders create blocks and validators choose the highest bid. Prevents validators from needing powerful computers to extract MEV themselves.",
    category: "mev"
  },
  {
    term: "MEV-Boost",
    definition: "Software validators run to receive block proposals from multiple builders. They choose the highest-paying block to maximize their earnings. ~95% of validators use this.",
    category: "mev"
  },
  {
    term: "Sandwich Attack",
    definition: "A type of MEV where a trader sees your pending DEX trade, buys before you (front-run), lets your trade execute at a worse price, then sells immediately (back-run) for profit. You lose money via worse execution.",
    category: "mev"
  },

  // Fees & Economics
  {
    term: "Base Fee",
    definition: "Minimum fee required for transactions, dynamically adjusted based on network congestion. This ETH is destroyed (burned), making ETH deflationary. Goes up when network is busy.",
    category: "economics"
  },
  {
    term: "Priority Fee / Tip",
    definition: "Extra payment to validators to process your transaction faster. Like tipping for express delivery. During congestion, higher tips get priority inclusion.",
    category: "economics"
  },
  {
    term: "Gas Limit",
    definition: "Maximum computation your transaction can use. Simple transfers use 21,000 gas, complex DeFi interactions use 100,000-500,000. Like estimating how much fuel your car trip needs.",
    category: "economics"
  },
  {
    term: "Gas Used",
    definition: "Actual computation consumed by your transaction. You're charged (Base Fee + Priority Fee) × Gas Used. Unused gas is refunded.",
    category: "economics"
  },

  // Security & Finality
  {
    term: "Finality",
    definition: "When a transaction becomes permanent and irreversible. Ethereum achieves this in 2-3 epochs (~15 minutes) via Casper-FFG. After finality, reversing would require burning ≥$30 billion in ETH.",
    category: "security"
  },
  {
    term: "Casper-FFG",
    definition: "Ethereum's finality mechanism. Validators vote on checkpoints, and when 2/3 agree on two consecutive epochs, the first becomes finalized. Makes transactions irreversible.",
    category: "security"
  },
  {
    term: "Justification",
    definition: "Step 1 of finality: when 2/3 of validators vote for an epoch. Think of it as 'probably final but not guaranteed yet.' Needs another justified epoch to become finalized.",
    category: "security"
  },
  {
    term: "Attestation",
    definition: "Votes cast by validators on which blocks are correct. Validators earn rewards for accurate attestations and lose ETH for dishonest ones.",
    category: "security"
  }
];

export default function Glossary() {
  const categories = [
    { id: 'basics', title: '🌟 Cryptocurrency Basics', color: 'blue' },
    { id: 'lifecycle', title: '🔄 Transaction Lifecycle', color: 'green' },
    { id: 'mev', title: '⚡ MEV & Block Building', color: 'purple' },
    { id: 'economics', title: '💰 Fees & Economics', color: 'yellow' },
    { id: 'security', title: '🔒 Security & Finality', color: 'cyan' }
  ];

  return (
    <aside className="rounded-xl bg-gradient-to-br from-purple-500/10 to-blue-500/10 border border-purple-500/30 p-5" aria-label="Glossary">
      <div className="mb-4">
        <h3 className="font-bold text-lg text-white mb-1">📖 Interactive Glossary</h3>
        <p className="text-xs text-white/60">Hover over any term to see its definition</p>
      </div>

      <div className="space-y-4">
        {categories.map(({ id, title, color }) => {
          const categoryTerms = terms.filter(t => t.category === id);
          if (categoryTerms.length === 0) return null;

          return (
            <div key={id} className="space-y-2">
              <h4 className={`text-sm font-semibold text-${color}-400`}>{title}</h4>
              <ul className="space-y-1 text-sm pl-3">
                {categoryTerms.map(({ term, definition }) => (
                  <li key={term}>
                    <span
                      data-tooltip-id="glossary"
                      data-tooltip-content={definition}
                      data-tooltip-place="right"
                      className="text-white/90 hover:text-white underline decoration-dotted decoration-white/40 hover:decoration-white/80 cursor-help transition-colors"
                    >
                      {term}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </div>

      <Tooltip
        id="glossary"
        className="max-w-md !bg-black !opacity-100 !text-white text-sm !p-3 !rounded-lg !border !border-white/20"
        style={{ zIndex: 9999 }}
      />
    </aside>
  );
}
