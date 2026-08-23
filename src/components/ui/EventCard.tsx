interface EventCardProps {
  month: string;
  day: string;
  title: string;
  description: string;
  time: string;
}

export function EventCard({ month, day, title, description, time }: EventCardProps) {
  return (
    <article className="flex rounded-3xl bg-surface-container-lowest p-4 shadow-sm">
      <div className="flex w-20 shrink-0 flex-col items-center justify-center rounded-2xl bg-surface-container-low text-on-surface">
        <p className="text-xs uppercase tracking-wide text-on-surface-variant">{month}</p>
        <p className="text-3xl font-extrabold">{day}</p>
      </div>
      <div className="ms-4 flex-1">
        <h3 className="text-base font-semibold text-on-surface">{title}</h3>
        <p className="mt-1 text-sm text-on-surface-variant">{description}</p>
        <p className="mt-2 text-xs font-medium text-secondary">{time}</p>
      </div>
    </article>
  );
}
