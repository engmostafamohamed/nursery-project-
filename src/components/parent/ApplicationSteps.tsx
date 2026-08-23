type Props = {
  step: 1 | 2 | 3 | 4;
  labels: string[];
};

export function ApplicationSteps({ step, labels }: Props) {
  return (
    <div className="grid grid-cols-4 gap-2">
      {labels.map((label, idx) => {
        const n = idx + 1;
        const active = n <= step;
        return (
          <div key={label} className={`rounded-lg px-2 py-2 text-center text-xs ${active ? 'bg-primary text-white' : 'bg-surface-container text-on-surface-variant'}`}>
            {n}. {label}
          </div>
        );
      })}
    </div>
  );
}
