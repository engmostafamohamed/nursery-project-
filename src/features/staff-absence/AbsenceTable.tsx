import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';

import { confirm } from '@/components/ui/confirm';
import { DataTable, IconAction, StatusPill, TableCard, TableEmpty, TablePagination, TBody, Td, Th, THead, Tr } from '@/components/ui/DataTable';
import { usePagination } from '@/hooks/usePagination';
import { formatDay } from '@/lib/datetime';
import { cn, getUserInitials } from '@/lib/utils';

import { REASON_ICON, STATE_TONE } from './absenceLook';
import { absenceState, daysBetween, sortAbsences, type Absence } from './staffAbsence';
import { absenceErrorKey } from './staffAbsenceApi';
import { useAbsenceChanges } from './useStaffAbsence';

const RANGE: Intl.DateTimeFormatOptions = { weekday: 'short', day: 'numeric', month: 'short' };

/**
 * Absences as rows, the current and coming ones first: who (on the admin's page), the dates and how
 * many days, the reason, where it stands, the note, who recorded it when it was not the person, and a
 * way to cancel one that has not ended. The admin's page and a teacher's own page share it; with
 * `personHref`, a row opens that member of staff.
 */
export function AbsenceTable({
  absences,
  today,
  showPerson = false,
  title,
  description,
  emptyText,
  actions,
  filters,
  resetKey = '',
  personHref,
}: {
  absences: Absence[];
  today: string;
  showPerson?: boolean;
  title: string;
  description?: string;
  emptyText: string;
  actions?: ReactNode;
  filters?: ReactNode;
  /** Changes when the list's filters do, to go back to the first page. */
  resetKey?: string;
  /** The member of staff's page: each row then opens it. */
  personHref?: (userId: string) => string;
}) {
  const { t, i18n } = useTranslation();
  const isArabic = i18n.language.startsWith('ar');
  const { cancel } = useAbsenceChanges();
  const navigate = useNavigate();
  const rows = sortAbsences(absences, today);
  const pager = usePagination(rows, 10, resetKey);
  const range = (a: Absence) => (a.startsOn === a.endsOn ? formatDay(a.startsOn, RANGE) : `${formatDay(a.startsOn, RANGE)} – ${formatDay(a.endsOn, RANGE)}`);

  const askCancel = async (a: Absence) => {
    const ok = await confirm({
      title: t('staffAbsence.cancelTitle'),
      description: t('staffAbsence.cancelBody', { from: formatDay(a.startsOn, RANGE), to: formatDay(a.endsOn, RANGE) }),
      confirmText: t('staffAbsence.cancelConfirm'),
      variant: 'danger',
    });
    if (!ok) return;
    try {
      await cancel.mutateAsync(a.id);
      toast.success(t('staffAbsence.cancelled'));
    } catch (error) {
      toast.error(t(absenceErrorKey(error)));
    }
  };

  return (
    <TableCard
      title={title}
      count={t('staffAbsence.table.count', { count: absences.length })}
      description={description}
      actions={actions}
      filters={filters}
      pagination={<TablePagination pager={pager} pageSizeOptions={[10, 25, 50]} />}
    >
      {rows.length ? (
        <DataTable minWidth={showPerson ? 960 : 760}>
          <THead>
            {showPerson ? <Th>{t('staffAbsence.table.person')}</Th> : null}
            <Th>{t('staffAbsence.table.dates')}</Th>
            <Th>{t('staffAbsence.table.reason')}</Th>
            <Th>{t('staffAbsence.table.state')}</Th>
            <Th>{t('staffAbsence.table.note')}</Th>
            <Th align="end">{t('staffAbsence.table.actions')}</Th>
          </THead>
          <TBody>
            {pager.pageItems.map((a) => {
              const state = absenceState(a, today);
              const name = (isArabic ? a.nameAr || a.nameEn : a.nameEn || a.nameAr) || '—';
              const by = isArabic ? a.byAr || a.byEn : a.byEn || a.byAr;
              const open = state === 'today' || state === 'upcoming';
              return (
                <Tr
                  key={a.id}
                  className={cn(!open && 'opacity-75')}
                  onClick={personHref && a.userId ? () => navigate(personHref(a.userId!)) : undefined}
                  data-testid="absence-item"
                >
                  {showPerson ? (
                    <Td>
                      <span className="flex items-center gap-2.5">
                        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary" aria-hidden>
                          {getUserInitials(name, '')}
                        </span>
                        <span className="min-w-0">
                          {personHref && a.userId ? (
                            <Link to={personHref(a.userId)} className="block truncate font-medium text-on-surface hover:text-primary hover:underline">{name}</Link>
                          ) : (
                            <span className="block truncate font-medium text-on-surface">{name}</span>
                          )}
                          {!a.bySelf && by ? <span className="block truncate text-xs text-on-surface-variant">{t('staffAbsence.recordedBy', { name: by })}</span> : null}
                        </span>
                      </span>
                    </Td>
                  ) : null}
                  <Td>
                    <p className={cn('whitespace-nowrap font-medium text-on-surface', state === 'cancelled' && 'line-through')}>{range(a)}</p>
                    <p className="text-xs text-on-surface-variant">{t('staffAbsence.days', { count: daysBetween(a.startsOn, a.endsOn) })}</p>
                  </Td>
                  <Td><StatusPill tone="neutral" icon={REASON_ICON[a.reason]}>{t(`staffAbsence.reasons.${a.reason}`)}</StatusPill></Td>
                  <Td><StatusPill tone={STATE_TONE[state]}>{t(`staffAbsence.states.${state}`)}</StatusPill></Td>
                  <Td className="max-w-[18rem]">
                    {a.note ? <p className="line-clamp-2 text-sm text-on-surface-variant" title={a.note}>{a.note}</p> : <span className="text-xs text-on-surface-variant">—</span>}
                    {!showPerson && !a.bySelf && by ? <p className="text-xs text-on-surface-variant">{t('staffAbsence.recordedBy', { name: by })}</p> : null}
                  </Td>
                  <Td align="end">
                    <div className="inline-flex items-center gap-0.5">
                      {open ? (
                        <IconAction icon="event_available" label={t('staffAbsence.cancel')} onClick={() => void askCancel(a)} disabled={cancel.isPending} danger />
                      ) : null}
                      {personHref && a.userId ? (
                        <IconAction icon="badge" label={t('staffAbsence.table.openPerson', { name })} to={personHref(a.userId)} />
                      ) : null}
                    </div>
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
