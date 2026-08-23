import type { ReactNode } from 'react';

interface EmptyStateProps {
  icon: string;
  title: string;
  description: string;
  action?: ReactNode;
}

export function EmptyState({ icon, title, description, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-outline-variant bg-surface-container-lowest p-10 text-center">
      <span className="material-symbols-outlined mb-3 text-5xl text-on-surface-variant" aria-hidden>
        {icon}
      </span>
      <h3 className="text-lg font-semibold text-on-surface">{title}</h3>
      <p className="mt-2 max-w-md text-sm text-on-surface-variant">{description}</p>
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  );
}
