import { useTranslation } from 'react-i18next';

type Day = { date: string; count: number; late: number };

type Props = {
  days: Day[];
  maxCount: number;
  activeChildren: number;
};

export function AttendanceDailyBars({ days, maxCount, activeChildren }: Props) {
  const { t, i18n } = useTranslation();
  const locale = i18n.language === 'ar' ? 'ar-EG' : 'en-GB';

  return (
    <div className="space-y-2">
      <p className="text-sm font-medium text-on-surface">{t('admin.attendanceAnalytics.dailyTitle')}</p>
      <div className="flex max-h-56 flex-wrap items-end gap-1 overflow-x-auto pb-1 md:max-h-none md:flex-nowrap">
        {days.map((d) => {
          const h = maxCount > 0 ? Math.round((d.count / maxCount) * 100) : 0;
          const label = new Date(d.date + 'T12:00:00').toLocaleDateString(locale, { weekday: 'short', day: 'numeric' });
          return (
            <div key={d.date} className="flex w-8 shrink-0 flex-col items-center gap-1">
              <div
                className="flex w-full min-h-[6px] flex-col justify-end rounded-t bg-primary/80"
                style={{ height: `${Math.max(8, h)}px` }}
                title={`${d.count} ${t('admin.attendanceAnalytics.present')}${d.late ? `, ${d.late} ${t('admin.attendanceAnalytics.late')}` : ''}`}
              />
              <span className="max-w-[2.5rem] truncate text-[9px] text-on-surface-variant">{label}</span>
              <span className="text-[10px] font-medium text-on-surface">{d.count}</span>
            </div>
          );
        })}
      </div>
      {activeChildren > 0 ? (
        <p className="text-xs text-on-surface-variant">{t('admin.attendanceAnalytics.dailyHint', { n: activeChildren })}</p>
      ) : null}
    </div>
  );
}
