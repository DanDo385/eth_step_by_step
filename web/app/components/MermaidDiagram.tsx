"use client";

import { useMemo } from "react";

type StageKey = "mempool" | "pbs" | "relays" | "proposal" | "finality";

export default function MermaidDiagram({ stages }: { stages: Partial<Record<StageKey, boolean>> }) {
  // Create a visual diagram using CSS and HTML instead of Mermaid
  const diagramElements = useMemo(() => {
    return [
      {
        id: "mempool",
        label: "Mempool (EL)",
        position: "left",
        active: stages.mempool,
        color: "bg-green-600",
        borderColor: "border-green-400"
      },
      {
        id: "pbs",
        label: "PBS Market",
        position: "center",
        active: stages.pbs || stages.relays,
        color: "bg-blue-600",
        borderColor: "border-blue-400",
        subElements: [
          { label: "Searchers", active: stages.pbs },
          { label: "Builders", active: stages.pbs },
          { label: "Relays", active: stages.relays }
        ]
      },
      {
        id: "proposal",
        label: "Proposal (CL)",
        position: "center-right",
        active: stages.proposal,
        color: "bg-yellow-600",
        borderColor: "border-yellow-400"
      },
      {
        id: "finality",
        label: "Finality",
        position: "right",
        active: stages.finality,
        color: "bg-purple-600",
        borderColor: "border-purple-400"
      }
    ];
  }, [stages]);

  return (
    <div className="w-full">
      <div className="rounded-xl border border-white/10 p-6 bg-black/30 overflow-auto min-h-[300px]">
        {/* Transaction Flow Diagram */}
        <div className="flex items-center justify-between w-full h-48 relative">
          {/* Flow arrows */}
          <div className="absolute inset-0 flex items-center justify-between px-8">
            <div className="flex-1 h-0.5 bg-gradient-to-r from-green-400 to-blue-400"></div>
            <div className="flex-1 h-0.5 bg-gradient-to-r from-blue-400 to-yellow-400"></div>
            <div className="flex-1 h-0.5 bg-gradient-to-r from-yellow-400 to-purple-400"></div>
          </div>
          
          {/* Diagram elements */}
          {diagramElements.map((element, index) => (
            <div key={element.id} className="relative z-10 flex flex-col items-center">
              {/* Main element */}
              <div className={`
                px-4 py-3 rounded-lg border-2 text-white font-semibold text-sm
                ${element.active ? element.color : 'bg-gray-600 border-gray-400'}
                ${element.active ? element.borderColor : 'border-gray-400'}
                ${element.active ? 'shadow-lg shadow-current/25' : ''}
                transition-all duration-300
              `}>
                {element.label}
              </div>
              
              {/* Sub-elements for PBS */}
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
        
        {/* Legend */}
        <div className="mt-6 text-center">
          <div className="text-white/60 text-sm mb-2">Transaction Flow Status</div>
          <div className="flex justify-center space-x-4 text-xs">
            <div className="flex items-center space-x-1">
              <div className="w-3 h-3 bg-green-600 rounded"></div>
              <span>Active</span>
            </div>
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
