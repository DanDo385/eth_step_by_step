"use client";

import { useEffect, useState } from "react";

export default function ThemeToggle() {
  const [dark, setDark] = useState(true);

  useEffect(() => {
    const saved = localStorage.getItem("theme") || "dark";
    document.documentElement.classList.toggle("dark", saved === "dark");
    setDark(saved === "dark");
  }, []);

  const toggle = () => {
    const next = !dark;
    setDark(next);
    localStorage.setItem("theme", next ? "dark" : "light");
    document.documentElement.classList.toggle("dark", next);
  };

  return (
    <button
      aria-label="Toggle color theme"
      onClick={toggle}
      className="px-3 py-2 rounded-lg border border-white/10 bg-black/30 hover:border-neon-blue focus:outline-none focus:ring-2 focus:ring-neon-blue"
    >
      {dark ? "🌙 Dark" : "☀️ Light"}
    </button>
  );
}