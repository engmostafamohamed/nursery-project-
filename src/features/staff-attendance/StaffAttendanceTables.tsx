import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';

import { DataTable, IconAction, StatusPill, TableCard, TableEmpty, TablePagination, TBody, Td, Th, THead, Tr } from '@/components/ui/DataTable';
import { usePagination } from '@/hooks/usePagination';
import { localName } from '@/lib/bilingualName';
import { formatDay, formatTimeIn } from '@/lib/datetime';
import { cn, getUserInitials } from '@/lib/utils';

import { rateTone, STATE_ICON, STATE_PILL } from './staffAttendanceLook';
import type { PersonSummary, SpanDay } from './staffAttendanceRange';

const DAY: Intl.DateTimeFormatOptions = { weekday: 'short', day: 'numeric', month: 'short' };

const RATE_TEXT: Record<string, string> = { success: 'text-success', warning: 'text-warning', error: 'text-error', neutral: 'text-on-surface-variant' };

/** "7.67" as "7 h 40 min", or a dash. */
function hoursText(hours: number, t: (k: string, o?: Record<string, unknown>) => string): string {
  if (hours <= 0) return '—';
  const total = Math.round(hours * 60);
  return t('staffClock.hours', { h: Math.floor(total / 60), m: total % 60 });
}

/**
 * What the span came to for each member of staff: the days they were due and the days they were
 * here, how often and by how long they were late, the hours, and what is still waiting. A row opens
 * that person's own page, where the month and every correction live.
 */
export function StaffPeopleTable({
  summaries,
  title,
  emptyText,
  resetKey,
  filters,
  actions,
  personHref,
}: {
  summaries: PersonSummary[];
  title: string;
  emptyText: string;
  resetKey: string;
  filters?: ReactNode;
  actions?: ReactNode;
  personHref?: (userId: string) => string;
}) {
  const { t, i18n } = useTranslation();
  const isAr = i18n.language.startsWith('ar');
  const pager = usePagination(summaries, 10, resetKey);

  return (
    <TableCard
      title={title}
      count={t('staffAttendance.table.people', { count: summaries.length })}
      description={t('staffAttendance.table.peopleHint')}
      actions={actions}
      filters={filters}
      pagination={<TablePagination pager={pager} pageSizeOptions={[10, 25, 50]} />}
    >
      {summaries.length ? (
        <DataTable minWidth={980}>
          <THead>
            <Th>{t('staffAbsence.table.person')}</Th>
            <Th>{t('staffAttendance.table.here')}</Th>
            <Th>{t('staffAttendance.table.rate')}</Th>
            <Th>{t('staffAttendance.states.late')}</Th>
            <Th>{t('staffAttendance.states.missing')}</Th>
            <Th>{t('staffAttendance.states.away')}</Th>
            <Th>{t('staffAttendance.tiles.hours')}</Th>
            <Th align="end">{t('staffAbsence.table.actions')}</Th>
          </THead>
          <TBody>
            {pager.pageItems.map((s) => {
              const name = localName(s.person.nameAr, s.person.nameEn, isAr) || '—';
              const tone = rateTone(s.rate);
              return (
                <Tr key={s.person.id} className={cn(!s.person.active && 'opacity-75')} data-testid="staff-attendance-person">
                  <Td>
                    <span className="flex items-center gap-2.5">
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary" aria-hidden>
                        {getUserInitials(name, '')}
                      </span>
                      <span className="min-w-0">
                        {personHref ? (
                          <Link to={personHref(s.person.id)} className="block truncate font-medium text-on-surface hover:text-primary hover:underline">{name}</Link>
                        ) : (
                          <span className="block truncate font-medium text-on-surface">{name}</span>
                        )}
                        <span className="block truncate text-xs text-on-surface-variant">
                          {s.person.position || t(`staffAbsence.roles.${s.person.role}`, { defaultValue: s.person.role })}
                          {s.person.active ? '' : ` · ${t('staffAttendance.table.left')}`}
                        </span>
                      </span>
                    </span>
                  </Td>
                  <Td><span className="whitespace-nowrap tabular-nums">{t('staffAttendance.table.outOf', { here: s.present, expected: s.expected })}</span></Td>
                  <Td><span className={cn('font-semibold tabular-nums', RATE_TEXT[tone])}>{s.rate == null ? '—' : `${s.rate}%`}</span></Td>
                  <Td>
                    <span className="tabular-nums">{s.late || '—'}</span>
                    {s.lateMinutes > 0 ? <span className="block whitespace-nowrap text-xs text-warning">{t('staffAttendance.table.byMinutes', { count: s.lateMinutes })}</span> : null}
                  </Td>
                  <Td><span className={cn('tabular-nums', s.missing > 0 && 'font-semibold text-error')}>{s.missing || '—'}</span></Td>
                  <Td><span className="tabular-nums">{s.away || '—'}</span></Td>
                  <Td><span className="whitespace-nowrap tabular-nums">{hoursText(s.hours, t)}</span></Td>
                  <Td align="end">
                    <div className="inline-flex items-center gap-0.5">
                      {s.review > 0 ? <StatusPill tone="warning" icon={STATE_ICON.review}>{s.review}</StatusPill> : null}
                      {s.stillIn > 0 ? <StatusPill tone="primary" icon={STATE_ICON.still_in}>{s.stillIn}</StatusPill> : null}
                      {personHref ? <IconAction icon="badge" label={t('staffAbsence.table.openPerson', { name })} to={personHref(s.person.id)} /> : null}
                    </div>
                  </Td>
                </Tr>
              );
            })}
          </TBody>
        </DataTable>
      ) : (
        <TableEmpty icon="badge" title={emptyText} />
      )}
    </TableCard>
  );
}

/**
 * The days themselves, newest first: whose day, which day, the shift it belonged to, when they came
 * and went, how late and how long. The days nobody was due are not here — a day off is not a row.
 */
export function StaffDaysTable({
  days,
  timezone,
  emptyText,
  resetKey,
  filters,
  personHref,
}: {
  days: SpanDay[];
  timezone: string;
  emptyText: string;
  resetKey: string;
  filters?: ReactNode;
  personHref?: (userId: string) => string;
}) {
  const { t, i18n } = useTranslation();
  const isAr = i18n.language.startsWith('ar');
  const rows = [...days].sort((a, b) => (a.date === b.date ? 0 : a.date < b.date ? 1 : -1));
  const pager = usePagination(rows, 25, resetKey);
  const at = (iso: string | null) => (iso ? formatTimeIn(iso, timezone) : '—');

  return (
    <TableCard
      title={t('staffAttendance.table.days')}
      count={t('staffAttendance.table.dayCount', { count: rows.length })}
      description={t('staffAttendance.table.daysHint')}
      filters={filters}
      pagination={<TablePagination pager={pager} pageSizeOptions={[25, 50, 100]} />}
    >
      {rows.length ? (
        <DataTable minWidth={1020}>
          <THead>
            <Th>{t('staffAbsence.table.person')}</Th>
            <Th>{t('staffClock.review.day')}</Th>
            <Th>{t('staffAttendance.table.shift')}</Th>
            <Th>{t('staffClock.record.in')}</Th>
            <Th>{t('staffClock.record.out')}</Th>
            <Th>{t('staffAttendance.table.hoursShort')}</Th>
            <Th>{t('staffAttendance.table.state')}</Th>
            <Th align="end">{t('staffAbsence.table.actions')}</Th>
          </THead>
          <TBody>
            {pager.pageItems.map((d) => {
              const name = localName(d.person.nameAr, d.person.nameEn, isAr) || '—';
              return (
                <Tr key={`${d.person.id}|${d.date}`} data-testid="staff-attendance-day">
                  <Td><span className="block min-w-0 truncate font-medium text-on-surface">{name}</span></Td>
                  <Td><span className="whitespace-nowrap">{formatDay(d.date, DAY)}</span></Td>
                  <Td>
                    <span className="whitespace-nowrap text-xs text-on-surface-variant tabular-nums">
                      {d.shift?.from ? `${d.shift.from} – ${d.shift.to ?? '—'}` : '—'}
                    </span>
                  </Td>
                  <Td>
                    <span className="whitespace-nowrap tabular-nums">{at(d.row?.checkInAt ?? null)}</span>
                    {d.row && d.row.lateMinutes > 0 ? (
                      <span className="block whitespace-nowrap text-xs text-warning">{t('staffClock.lateBy', { count: d.row.lateMinutes })}</span>
                    ) : null}
                  </Td>
                  <Td><span className="whitespace-nowrap tabular-nums">{at(d.row?.checkOutAt ?? null)}</span></Td>
                  <Td><span className="whitespace-nowrap tabular-nums">{hoursText(d.row?.workHours ?? 0, t)}</span></Td>
                  <Td>
                    <StatusPill tone={STATE_PILL[d.state]} icon={STATE_ICON[d.state]}>
                      {d.state === 'review' && d.row?.reviewReason ? t(`staffClock.review.${d.row.reviewReason}`) : t(`staffAttendance.states.${d.state}`)}
                    </StatusPill>
                    {d.row?.source === 'admin' ? <span className="mt-0.5 block text-xs text-on-surface-variant">{t('staffAttendance.table.byAdmin')}</span> : null}
                  </Td>
                  <Td align="end">
                    {personHref ? <IconAction icon="badge" label={t('staffAbsence.table.openPerson', { name })} to={personHref(d.person.id)} /> : null}
                  </Td>
                </Tr>
              );
            })}
          </TBody>
        </DataTable>
      ) : (
        <TableEmpty icon="event_available" title={emptyText} />
      )}
    </TableCard>
  );
}
