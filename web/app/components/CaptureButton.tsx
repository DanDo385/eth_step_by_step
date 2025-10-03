// =============================================================================
// CaptureButton.tsx - Screenshot Export Component
// =============================================================================
// Allows users to capture screenshots of educational diagrams and panels,
// useful for saving learning materials or sharing Ethereum transaction flows.
//
// USAGE:
// <CaptureButton targetId="mermaid-diagram" />
//
// TECHNICAL DETAILS:
// - Uses html2canvas library to convert DOM elements to PNG images
// - Preserves transparency (backgroundColor: null) for clean screenshots
// - Auto-downloads the image with filename based on target element ID
// - Client-side only (needs browser APIs like document.getElementById)
//
// USER EXPERIENCE:
// - Simple one-click operation: click button -> image downloads
// - Helpful for students who want to save diagrams for later study
// - Error handling if target element doesn't exist
//
// DESIGN:
// - Minimal styling to blend into panel headers
// - Hover state (neon blue border) for interactivity feedback
// - Focus ring for keyboard navigation accessibility
// =============================================================================

"use client";  // Required for client-side DOM manipulation and event handlers

import html2canvas from "html2canvas";

/**
 * CaptureButton - exports a screenshot of a target DOM element as PNG
 *
 * @param targetId - ID of the DOM element to capture (e.g., "mermaid-diagram")
 */
export default function CaptureButton({ targetId }: { targetId: string }) {
  /**
   * Handles the screenshot capture process:
   * 1. Find the target element in the DOM
   * 2. Convert it to a canvas using html2canvas
   * 3. Convert canvas to PNG data URL
   * 4. Trigger download via invisible <a> element
   */
  const handleCapture = async () => {
    // Step 1: Find the target element
    const el = document.getElementById(targetId);
    if (!el) {
      // Element doesn't exist - show user-friendly error
      alert("Target element not found");
      return;
    }

    // Step 2: Convert DOM element to canvas
    // backgroundColor: null preserves transparency for clean screenshots
    const canvas = await html2canvas(el, { backgroundColor: null });

    // Step 3: Convert canvas to PNG data URL
    // Data URLs embed the image directly (data:image/png;base64,iVBORw0KG...)
    const dataUrl = canvas.toDataURL("image/png");

    // Step 4: Trigger browser download
    // Create invisible link element, set download attributes, and click it
    const link = document.createElement("a");
    link.href = dataUrl;
    link.download = `${targetId}.png`;  // Filename: mermaid-diagram.png
    link.click();  // Programmatically click to start download
  };

  return (
    <button
      type="button"
      aria-label="Capture panel screenshot"  // Accessibility label for screen readers
      onClick={handleCapture}
      className="px-3 py-1 rounded-lg border border-white/10 bg-black/30 text-xs hover:border-neon-blue focus:outline-none focus:ring-2 focus:ring-neon-blue"
    >
      Capture
    </button>
  );
}
