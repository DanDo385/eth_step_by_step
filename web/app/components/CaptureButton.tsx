"use client";

import html2canvas from "html2canvas";

export default function CaptureButton({ targetId }: { targetId: string }) {
  const handleCapture = async () => {
    const el = document.getElementById(targetId);
    if (!el) {
      alert("Target element not found");
      return;
    }
    const canvas = await html2canvas(el, { backgroundColor: null });
    const link = document.createElement("a");
    link.href = canvas.toDataURL("image/png");
    link.download = `${targetId}.png`;
    link.click();
  };

  return (
    <button
      type="button"
      aria-label="Capture panel screenshot"
      onClick={handleCapture}
      className="px-3 py-1 rounded-lg border border-white/10 bg-black/30 text-xs hover:border-neon-blue focus:outline-none focus:ring-2 focus:ring-neon-blue"
    >
      Capture
    </button>
  );
}
