import type { ReactNode } from 'react';

/** A dashboard section's heading: a tinted icon and the title. */
export function SectionTitle({ icon, children }: { icon: string; children: ReactNode }) {
  return (
    <h2 className="mb-3 flex items-center gap-2 text-base font-semibold text-on-surface">
      <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary" aria-hidden>
        <span className="material-symbols-outlined text-lg">{icon}</span>
      </span>
      {children}
    </h2>
  );
}
