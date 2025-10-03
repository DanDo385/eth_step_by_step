import type { ReactNode } from 'react';

// Simple alert component for warnings and info messages
export default function Alert({ title, message, hint }: { title: string; message?: ReactNode; hint?: ReactNode }) {
  return (
    <div role="alert" className="rounded-xl border border-yellow-400/40 bg-yellow-400/10 p-3 text-yellow-100">
      <div className="font-semibold">{title}</div>
      {message ? <div className="text-sm opacity-90">{message}</div> : null}
      {hint ? <div className="text-xs opacity-70 mt-1">Hint: {hint}</div> : null}
    </div>
  );
}