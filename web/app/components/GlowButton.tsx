"use client";

import type { ReactNode } from "react";

export default function GlowButton({
  children,
  onClick,
  ariaLabel,
  className
}: {
  children: ReactNode;
  onClick?: () => void | Promise<void>;
  ariaLabel?: string;
  className?: string;
}) {
  return (
    <button
      type="button"
      aria-label={ariaLabel}
      onClick={onClick}
      className={`text-lg md:text-2xl px-6 py-4 rounded-2xl bg-panel hover:shadow-neonBlue border border-cyan-400/30 shadow-neon transition-all outline-none focus:ring-2 focus:ring-neon-blue ${className || ""}`}
    >
      {children}
    </button>
  );
}
