import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "class",
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        bg: "#0b0f1a",
        panel: "#0f1629",
        neon: {
          green: "#00ff9c",
          blue: "#00d1ff",
          yellow: "#ffe600"
        }
      },
      boxShadow: {
        neon: "0 0 20px rgba(0, 255, 156, 0.45)",
        neonBlue: "0 0 24px rgba(0, 209, 255, 0.45)"
      }
    }
  },
  plugins: []
};

export default config;
