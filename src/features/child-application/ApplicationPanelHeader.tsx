/** A step's heading: its icon, title and one line of help. */
export function PanelHeader({ icon, title, body }: { icon: string; title: string; body?: string }) {
  return (
    <div className="flex items-start gap-3">
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
        <span className="material-symbols-outlined text-xl" aria-hidden>{icon}</span>
      </span>
      <div className="min-w-0">
        <h2 className="text-base font-semibold text-on-surface">{title}</h2>
        {body ? <p className="mt-1 text-xs leading-5 text-on-surface-variant">{body}</p> : null}
      </div>
    </div>
  );
}
