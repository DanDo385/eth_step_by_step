import type { ReactNode } from "react";

export default function Panel({ title, children, id }: { title: string; children: ReactNode; id?: string }) {
  const headingId = id ? `${id}-title` : undefined;
  return (
    <section
      id={id}
      aria-labelledby={headingId}
      className="rounded-2xl bg-panel/80 border border-white/10 p-4 md:p-6 my-4"
    >
      <h2 id={headingId} className="text-neon-blue font-semibold text-xl mb-3">
        {title}
      </h2>
      <div className="text-sm md:text-base text-white/90">{children}</div>
    </section>
  );
}
