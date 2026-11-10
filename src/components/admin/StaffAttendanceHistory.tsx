import { useTranslation } from 'react-i18next';

import { DataTable, StatusPill, TableCard, TableEmpty, TablePagination, TBody, Td, Th, THead, Tr } from '@/components/ui/DataTable';
import { usePagination } from '@/hooks/usePagination';
import type { StaffAttendanceDayRow } from '@/hooks/useStaffAttendanceMonth';
import { formatDay, formatTime } from '@/lib/datetime';

/** Late when they came more than this many minutes after opening (the class page's rule too). */
const LATE_AFTER_MINUTES = 5;

/**
 * A member of staff's days in the month, newest first: when they came and left, the hours, whether
 * they were late, and whether the day was recorded by an admin (with the admin's note).
 */
export function StaffAttendanceHistory({ rows, month }: { rows: StaffAttendanceDayRow[]; month: string }) {
  const { t } = useTranslation();
  const days = [...rows].sort((a, b) => b.work_date.localeCompare(a.work_date));
  const pager = usePagination(days, 10, month);

  return (
    <TableCard
      title={t('staff.attendanceHistory')}
      count={t('staff.profile.daysCount', { count: days.length })}
      pagination={<TablePagination pager={pager} pageSizeOptions={[10, 25, 50]} />}
    >
      {days.length ? (
        <DataTable minWidth={760}>
          <THead>
            <Th>{t('staff.workDate')}</Th>
            <Th>{t('staff.checkIn')}</Th>
            <Th>{t('staff.checkOut')}</Th>
            <Th>{t('staff.workHours')}</Th>
            <Th>{t('staff.profile.cols.status')}</Th>
            <Th>{t('staff.profile.cols.notes')}</Th>
          </THead>
          <TBody>
            {pager.pageItems.map((r) => {
              const checkIn = r.check_in_at ?? r.clock_in;
              const checkOut = r.check_out_at ?? r.clock_out;
              const late = (r.late_minutes ?? 0) > LATE_AFTER_MINUTES;
              return (
                <Tr key={r.id} data-testid="staff-day-row">
                  <Td className="whitespace-nowrap font-medium text-on-surface">{formatDay(r.work_date, { weekday: 'short', day: 'numeric', month: 'short' })}</Td>
                  <Td className="tabular-nums">{checkIn ? formatTime(checkIn) : '—'}</Td>
                  <Td className="tabular-nums">{checkOut ? formatTime(checkOut) : <span className="text-on-surface-variant">{checkIn ? t('staff.profile.stillIn') : '—'}</span>}</Td>
                  <Td className="tabular-nums">{r.work_hours != null ? Number(r.work_hours).toFixed(1) : '—'}</Td>
                  <Td>
                    <span className="flex flex-wrap items-center gap-1">
                      {late ? (
                        <StatusPill tone="warning" icon="schedule">{t('classProfile.teamToday.lateBy', { count: r.late_minutes ?? 0 })}</StatusPill>
                      ) : (
                        <StatusPill tone="success" icon="check_circle">{t('classProfile.teamToday.onTime')}</StatusPill>
                      )}
                      {r.source === 'admin' ? <StatusPill tone="neutral" icon="edit_calendar">{t('classProfile.teamToday.byAdmin')}</StatusPill> : null}
                    </span>
                  </Td>
                  <Td className="max-w-[16rem] text-on-surface-variant">{r.notes ? <span className="line-clamp-2" title={r.notes}>{r.notes}</span> : '—'}</Td>
                </Tr>
              );
            })}
          </TBody>
        </DataTable>
      ) : (
        <TableEmpty icon="event_note" title={t('staff.profile.noDays')} />
      )}
    </TableCard>
  );
}
