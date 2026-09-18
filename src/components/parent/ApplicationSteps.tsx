type Props = {
  step: number;
  labels: string[];
  icons?: string[];
  onStepClick?: (step: number) => void;
};

const DEFAULT_ICONS = [
  'account_circle',
  'home',
  'child_care',
  'school',
  'health_and_safety',
  'emergency',
  'restaurant',
  'directions_car',
  'upload_file',
  'task_alt',
] as const;

export function ApplicationSteps({ step, labels, icons, onStepClick }: Props) {
  return (
    <nav className="grid gap-2 sm:grid-cols-2 xl:grid-cols-1" aria-label="Application steps">
      {labels.map((label, idx) => {
        const n = idx + 1;
        const complete = n < step;
        const active = n === step;
        const canJump = Boolean(onStepClick) && n <= step;
        const content = (
          <>
            <span
              className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${
                complete || active ? 'bg-primary text-primary-foreground' : 'bg-surface-container text-on-surface-variant'
              }`}
            >
              <span className="material-symbols-outlined text-base" aria-hidden>
                {complete ? 'check' : icons?.[idx] ?? DEFAULT_ICONS[idx] ?? 'circle'}
              </span>
            </span>
            <span className="min-w-0">
              <span className="block text-[11px] font-semibold uppercase text-on-surface-variant">#{n}</span>
              <span className="block font-semibold leading-5">{label}</span>
            </span>
          </>
        );
        const className = `flex min-h-14 w-full items-center gap-3 rounded-lg border px-3 py-2 text-start text-xs transition-colors ${
          complete || active
            ? 'border-primary/30 bg-primary/10 text-on-surface'
            : 'border-outline-variant bg-surface text-on-surface-variant'
        } ${canJump ? 'hover:border-primary hover:bg-primary/15' : ''}`;

        if (canJump) {
          return (
            <button key={label} type="button" className={className} onClick={() => onStepClick?.(n)}>
              {content}
            </button>
          );
        }

        return (
          <div
            key={label}
            className={className}
          >
            {content}
          </div>
        );
      })}
    </nav>
  );
}
