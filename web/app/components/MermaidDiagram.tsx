// =============================================================================
// MermaidDiagram.tsx - Transaction Flow Visualization
// =============================================================================
// Interactive diagram showing the journey of an Ethereum transaction from
// mempool through PBS (Proposer-Builder Separation) to finality.
//
// EDUCATIONAL PURPOSE:
// Helps beginners visualize the complex path a transaction takes:
// 1. Mempool (Execution Layer) - where transactions wait
// 2. PBS Market (Searchers/Builders/Relays) - where MEV extraction happens
// 3. Proposal (Consensus Layer) - where validators propose blocks
// 4. Finality - where blocks become irreversible
//
// VISUAL FEATURES:
// - Color-coded stages (green → blue → yellow → purple)
// - Animated transitions when stages become active
// - Gradient flow arrows connecting stages
// - Sub-elements for PBS showing searchers, builders, relays
// - Legend explaining active vs inactive states
//
// USAGE:
// <MermaidDiagram stages={{
//   mempool: true,
//   pbs: true,
//   relays: false,
//   proposal: false,
//   finality: false
// }} />
//
// TECHNICAL NOTE:
// Named "MermaidDiagram" for historical reasons, but actually uses custom
// CSS/HTML instead of Mermaid.js library for better control and performance.
// =============================================================================

"use client";  // Required for client-side interactivity and React hooks

import { useMemo } from "react";

// Stage keys represent different phases of transaction lifecycle
type StageKey = "mempool" | "pbs" | "relays" | "proposal" | "finality";

/**
 * MermaidDiagram - visualizes transaction flow across Ethereum layers
 *
 * @param stages - Object indicating which stages are currently active
 *                 Example: { mempool: true, pbs: false, ... }
 */
export default function MermaidDiagram({ stages }: { stages: Partial<Record<StageKey, boolean>> }) {
  /**
   * Diagram element configuration
   * useMemo prevents unnecessary recalculation on every render
   * Only recalculates when stages object changes
   */
  const diagramElements = useMemo(() => {
    return [
      // STAGE 1: Mempool (Execution Layer)
      {
        id: "mempool",
        label: "Mempool (EL)",
        position: "left",
        active: stages.mempool,
        color: "bg-green-600",        // Active color
        borderColor: "border-green-400"
      },
      // STAGE 2: PBS Market (MEV extraction layer)
      {
        id: "pbs",
        label: "PBS Market",
        position: "center",
        active: stages.pbs || stages.relays,  // Active if either PBS or relays active
        color: "bg-blue-600",
        borderColor: "border-blue-400",
        // Sub-elements show the components of PBS
        subElements: [
          { label: "Searchers", active: stages.pbs },   // Find MEV opportunities
          { label: "Builders", active: stages.pbs },    // Build optimized blocks
          { label: "Relays", active: stages.relays }    // Connect builders to validators
        ]
      },
      // STAGE 3: Block Proposal (Consensus Layer)
      {
        id: "proposal",
        label: "Proposal (CL)",
        position: "center-right",
        active: stages.proposal,
        color: "bg-yellow-600",
        borderColor: "border-yellow-400"
      },
      // STAGE 4: Finality (Irreversible commitment)
      {
        id: "finality",
        label: "Finality",
        position: "right",
        active: stages.finality,
        color: "bg-purple-600",
        borderColor: "border-purple-400"
      }
    ];
  }, [stages]);  // Dependency: recalculate when stages change

  return (
    <div className="w-full">
      <div className="rounded-xl border border-white/10 p-6 bg-black/30 overflow-auto min-h-[300px]">
        {/* Transaction Flow Diagram Container */}
        <div className="flex items-center justify-between w-full h-48 relative">

          {/* Flow Arrows - Gradient lines connecting stages */}
          <div className="absolute inset-0 flex items-center justify-between px-8">
            {/* Arrow 1: Mempool → PBS (green to blue) */}
            <div className="flex-1 h-0.5 bg-gradient-to-r from-green-400 to-blue-400"></div>
            {/* Arrow 2: PBS → Proposal (blue to yellow) */}
            <div className="flex-1 h-0.5 bg-gradient-to-r from-blue-400 to-yellow-400"></div>
            {/* Arrow 3: Proposal → Finality (yellow to purple) */}
            <div className="flex-1 h-0.5 bg-gradient-to-r from-yellow-400 to-purple-400"></div>
          </div>

          {/* Diagram Stage Elements */}
          {diagramElements.map((element, index) => (
            <div key={element.id} className="relative z-10 flex flex-col items-center">
              {/* Main stage box */}
              <div className={`
                px-4 py-3 rounded-lg border-2 text-white font-semibold text-sm
                ${element.active ? element.color : 'bg-gray-600 border-gray-400'}
                ${element.active ? element.borderColor : 'border-gray-400'}
                ${element.active ? 'shadow-lg shadow-current/25' : ''}
                transition-all duration-300
              `}>
                {element.label}
              </div>

              {/* Sub-elements (only for PBS stage) */}
              {element.subElements && (
                <div className="mt-2 space-y-1">
                  {element.subElements.map((sub, subIndex) => (
                    <div
                      key={subIndex}
                      className={`
                        px-2 py-1 rounded text-xs text-white/80
                        ${sub.active ? 'bg-blue-500' : 'bg-gray-500'}
                        transition-all duration-300
                      `}
                    >
                      {sub.label}
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Legend - Explains what colors mean */}
        <div className="mt-6 text-center">
          <div className="text-white/60 text-sm mb-2">Transaction Flow Status</div>
          <div className="flex justify-center space-x-4 text-xs">
            {/* Active indicator */}
            <div className="flex items-center space-x-1">
              <div className="w-3 h-3 bg-green-600 rounded"></div>
              <span>Active</span>
            </div>
            {/* Inactive indicator */}
            <div className="flex items-center space-x-1">
              <div className="w-3 h-3 bg-gray-600 rounded"></div>
              <span>Inactive</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
