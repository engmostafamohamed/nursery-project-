import { useTranslation } from 'react-i18next';

export type ClassStatRow = { classId: string; name: string; rate: number; present: number; size: number };

type Props = {
  rows: ClassStatRow[];
  unassignedLabel: string;
};

export function AttendanceClassBars({ rows, unassignedLabel }: Props) {
  const { t } = useTranslation();
  if (!rows.length) return null;
  return (
    <div className="space-y-3">
      <p className="text-sm font-medium text-on-surface">{t('admin.attendanceAnalytics.byClassTitle')}</p>
      <ul className="space-y-2">
        {rows.map((r) => {
          const label = r.classId === '__unassigned__' ? unassignedLabel : r.name;
          const w = Math.min(100, Math.round(r.rate * 10) / 10);
          return (
            <li key={r.classId} className="space-y-1">
              <div className="flex justify-between text-xs text-on-surface">
                <span className="truncate pe-2 font-medium">{label}</span>
                <span>{w}%</span>
              </div>
              <div className="h-2 w-full overflow-hidden rounded-full bg-surface-container">
                <div className="h-full rounded-full bg-secondary" style={{ width: `${w}%` }} />
              </div>
              <p className="text-[11px] text-on-surface-variant">
                {t('admin.attendanceAnalytics.classMeta', { present: r.present, size: r.size })}
              </p>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
