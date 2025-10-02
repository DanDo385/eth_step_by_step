import "./globals.css";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Ethereum Visualizer",
  description: "Mempool → PBS → Finality learning tool",
  icons: {
    icon: "/favicon.ico",
    shortcut: "/favicon.ico",
  }
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="min-h-screen">
        <div className="max-w-6xl mx-auto px-4 py-4">
          <h1 className="text-3xl font-bold text-center text-neon-blue mb-4">Ethereum Transaction Visualizer</h1>
        </div>
        {children}
      </body>
    </html>
  );
}
