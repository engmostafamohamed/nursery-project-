import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';

import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import type { StaffAttendanceDayRow } from '@/hooks/useStaffAttendanceMonth';
import { cn } from '@/lib/utils';

function weekdaysInMonth(month: string): number {
  const [y, m] = month.split('-').map(Number);
  const last = new Date(y, m, 0).getDate();
  let c = 0;
  for (let d = 1; d <= last; d += 1) {
    const day = new Date(y, m - 1, d).getDay();
    if (day !== 0 && day !== 6) c += 1;
  }
  return c;
}

function firstCheckIn(row: StaffAttendanceDayRow): string | null {
  return row.check_in_at ? String(row.check_in_at) : row.clock_in ? String(row.clock_in) : null;
}

function isLate(ts: string | null): boolean {
  if (!ts) return false;
  const d = new Date(ts);
  return d.getHours() > 9 || (d.getHours() === 9 && d.getMinutes() > 30);
}

type Props = {
  month: string;
  onMonthChange: (m: string) => void;
  rows: StaffAttendanceDayRow[];
};

export function StaffAttendanceCalendar({ month, onMonthChange, rows }: Props) {
  const { t, i18n } = useTranslation();

  const stats = useMemo(() => {
    const worked = new Set(rows.map((r) => r.work_date.slice(0, 10)));
    const workedDays = worked.size;
    const late = rows.filter((r) => isLate(firstCheckIn(r))).length;
    const wdays = weekdaysInMonth(month);
    const absent = Math.max(0, wdays - workedDays);
    return { workedDays, late, absent, wdays };
  }, [rows, month]);

  const { grid } = useMemo(() => {
    const [y, m] = month.split('-').map(Number);
    const first = new Date(y, m - 1, 1);
    const lastDay = new Date(y, m, 0).getDate();
    const startDow = first.getDay();
    const pad = startDow === 0 ? 6 : startDow - 1;
    const cells: Array<{ day: number | null; key: string; hasWork: boolean }> = [];
    for (let i = 0; i < pad; i += 1) {
      cells.push({ day: null, key: `p-${i}`, hasWork: false });
    }
    const worked = new Set(rows.map((r) => r.work_date.slice(0, 10)));
    for (let d = 1; d <= lastDay; d += 1) {
      const iso = `${month}-${String(d).padStart(2, '0')}`;
      cells.push({
        day: d,
        key: iso,
        hasWork: worked.has(iso),
      });
    }
    return { grid: cells, startPad: pad };
  }, [month, rows]);

  const weekLabels = i18n.language?.startsWith('ar')
    ? ['س', 'ح', 'ن', 'ث', 'ر', 'خ', 'ج']
    : ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-1">
          <label className="text-xs text-on-surface-variant">{t('staff.attendance.month')}</label>
          <Input type="month" value={month} onChange={(e) => onMonthChange(e.target.value)} />
        </div>
      </div>

      <div className="grid gap-2 sm:grid-cols-3">
        <Card>
          <CardContent className="p-3">
            <p className="text-xs text-on-surface-variant">{t('staff.attendance.stat.worked')}</p>
            <p className="text-lg font-semibold">{stats.workedDays}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3">
            <p className="text-xs text-on-surface-variant">{t('staff.attendance.stat.late')}</p>
            <p className="text-lg font-semibold">{stats.late}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3">
            <p className="text-xs text-on-surface-variant">{t('staff.attendance.stat.absent')}</p>
            <p className="text-lg font-semibold">{stats.absent}</p>
            <p className="text-xs text-on-surface-variant">{t('staff.attendance.stat.absentHint')}</p>
          </CardContent>
        </Card>
      </div>

      <div className="rounded-2xl border border-outline-variant bg-surface-container-lowest p-3">
        <div className="mb-2 grid grid-cols-7 gap-1 text-center text-xs text-on-surface-variant">
          {weekLabels.map((w) => (
            <span key={w}>{w}</span>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-1">
          {grid.map((c) =>
            c.day === null ? (
              <div key={c.key} className="aspect-square" />
            ) : (
              <div
                key={c.key}
                className={cn(
                  'flex aspect-square items-center justify-center rounded-lg border text-sm',
                  c.hasWork
                    ? 'border-primary bg-primary/10 font-medium text-primary'
                    : 'border-outline-variant/60 bg-surface-container/40 text-on-surface-variant',
                )}
              >
                {c.day}
              </div>
            ),
          )}
        </div>
      </div>
    </section>
  );
}
