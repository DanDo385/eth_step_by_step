// =============================================================================
// Panel.tsx - Content Container Component
// =============================================================================
// Reusable panel component that wraps sections of content with consistent
// styling, spacing, and accessibility features.
//
// USAGE:
// <Panel title="Mempool Data" id="mempool">
//   <p>Here's what's happening in the mempool...</p>
//   <MempoolTable data={data} />
// </Panel>
//
// DESIGN FEATURES:
// - Semi-transparent dark panel background (bg-panel/80) for glassmorphic effect
// - Subtle white border for definition against dark background
// - Responsive padding (more space on desktop, less on mobile)
// - Neon blue title for visual hierarchy
//
// ACCESSIBILITY:
// - Uses semantic <section> element for proper document structure
// - Links section to heading with aria-labelledby for screen readers
// - Auto-generates heading IDs from panel IDs for anchor links
// - Responsive text sizing for readability across devices
// =============================================================================

import type { ReactNode } from "react";

/**
 * Panel component - wraps content sections with consistent styling
 *
 * @param title - Panel heading text (displayed in neon blue)
 * @param children - Panel content (any React nodes)
 * @param id - Optional ID for the section (enables anchor links like #mempool)
 */
export default function Panel({ title, children, id }: { title: string; children: ReactNode; id?: string }) {
  // Generate heading ID from section ID for accessibility linking
  // Example: id="mempool" -> headingId="mempool-title"
  const headingId = id ? `${id}-title` : undefined;

  return (
    <section
      id={id}  // Enables anchor links: <a href="#mempool">Jump to mempool</a>
      aria-labelledby={headingId}  // Links section to its heading for screen readers
      className="rounded-2xl bg-panel/80 border border-white/10 p-4 md:p-6 my-4"
    >
      {/* Panel title - neon blue for visual pop */}
      <h2 id={headingId} className="text-neon-blue font-semibold text-xl mb-3">
        {title}
      </h2>

      {/* Panel content area - responsive text sizing */}
      <div className="text-sm md:text-base text-white/90">{children}</div>
    </section>
  );
}
