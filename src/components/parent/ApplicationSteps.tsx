type Props = {
  step: 1 | 2 | 3 | 4;
  labels: string[];
};

const ICONS = ['account_circle', 'child_care', 'upload_file', 'task_alt'] as const;

export function ApplicationSteps({ step, labels }: Props) {
  return (
    <div className="grid gap-2 sm:grid-cols-4">
      {labels.map((label, idx) => {
        const n = idx + 1;
        const complete = n < step;
        const active = n === step;
        return (
          <div
            key={label}
            className={`flex min-h-14 items-center gap-3 rounded-lg border px-3 py-2 text-start text-xs transition-colors ${
              complete || active
                ? 'border-primary/30 bg-primary/10 text-on-surface'
                : 'border-outline-variant bg-surface text-on-surface-variant'
            }`}
          >
            <span
              className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${
                complete || active ? 'bg-primary text-primary-foreground' : 'bg-surface-container text-on-surface-variant'
              }`}
            >
              <span className="material-symbols-outlined text-base" aria-hidden>
                {complete ? 'check' : ICONS[idx] ?? 'circle'}
              </span>
            </span>
            <span className="min-w-0">
              <span className="block text-[11px] font-semibold uppercase text-on-surface-variant">#{n}</span>
              <span className="block truncate font-semibold">{label}</span>
            </span>
          </div>
        );
      })}
    </div>
  );
}
