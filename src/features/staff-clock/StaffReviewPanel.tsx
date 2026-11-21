import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { DataTable, IconAction, StatusPill, TableCard, TablePagination, TBody, Td, Th, THead, Tr } from '@/components/ui/DataTable';
import { Skeleton } from '@/components/ui/skeleton';
import { usePagination } from '@/hooks/usePagination';
import { localName } from '@/lib/bilingualName';
import { formatDay, formatTimeIn } from '@/lib/datetime';
import { getUserInitials } from '@/lib/utils';

import { SettleStaffDayDialog } from './SettleStaffDayDialog';
import { REVIEW_ICON, type ReviewDay } from './staffReview';
import { useStaffDaysToReview } from './useStaffReview';

const DAY: Intl.DateTimeFormatOptions = { weekday: 'short', day: 'numeric', month: 'short' };

/**
 * The days waiting for the manager's word: somebody left well before their shift ended, stayed long
 * after it, or never recorded a departure at all. Each row says whose day it is, when they came and
 * went and why it is here; settling one asks for the times as they really were.
 *
 * Nothing waiting means no card at all, so the page stays quiet on an ordinary day.
 */
export function StaffReviewPanel({ nurseryId, timezone, personHref }: {
  nurseryId: string | null;
  timezone: string;
  personHref?: (userId: string) => string;
}) {
  const { t, i18n } = useTranslation();
  const isArabic = i18n.language.startsWith('ar');
  const query = useStaffDaysToReview(nurseryId);
  const [settling, setSettling] = useState<ReviewDay | null>(null);
  const days = query.data ?? [];
  const pager = usePagination(days, 10, '');

  if (query.isPending && nurseryId) return <Skeleton className="h-28 rounded-xl" />;
  if (!days.length) return null;

  const nameOf = (d: ReviewDay) => localName(d.nameAr, d.nameEn, isArabic) || '—';
  const at = (iso: string | null) => (iso ? formatTimeIn(iso, timezone) : '—');

  return (
    <>
      <TableCard
        title={t('staffClock.review.title')}
        count={t('staffClock.review.count', { count: days.length })}
        description={t('staffClock.review.description')}
        pagination={<TablePagination pager={pager} pageSizeOptions={[10, 25, 50]} />}
      >
        <DataTable minWidth={860}>
          <THead>
            <Th>{t('staffAbsence.table.person')}</Th>
            <Th>{t('staffClock.review.day')}</Th>
            <Th>{t('staffClock.review.why')}</Th>
            <Th>{t('staffClock.record.in')}</Th>
            <Th>{t('staffClock.record.out')}</Th>
            <Th align="end">{t('staffAbsence.table.actions')}</Th>
          </THead>
          <TBody>
            {pager.pageItems.map((d) => {
              const name = nameOf(d);
              return (
                <Tr key={d.id} data-testid="staff-review-item">
                  <Td>
                    <span className="flex items-center gap-2.5">
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-warning/10 text-xs font-bold text-warning" aria-hidden>
                        {getUserInitials(name, '')}
                      </span>
                      <span className="min-w-0 truncate font-medium text-on-surface">{name}</span>
                    </span>
                  </Td>
                  <Td><span className="whitespace-nowrap">{formatDay(d.workDate, DAY)}</span></Td>
                  <Td>
                    {d.reason ? (
                      <StatusPill tone="warning" icon={REVIEW_ICON[d.reason]}>{t(`staffClock.review.${d.reason}`)}</StatusPill>
                    ) : (
                      <StatusPill tone="neutral">{t('staffClock.review.waiting')}</StatusPill>
                    )}
                  </Td>
                  <Td>
                    <span className="whitespace-nowrap tabular-nums">{at(d.checkInAt)}</span>
                    {d.lateMinutes > 0 ? <span className="block text-xs text-warning">{t('staffClock.lateBy', { count: d.lateMinutes })}</span> : null}
                  </Td>
                  <Td><span className="whitespace-nowrap tabular-nums">{at(d.checkOutAt)}</span></Td>
                  <Td align="end">
                    <div className="inline-flex items-center gap-0.5">
                      <IconAction icon="task_alt" label={t('staffClock.settle.open', { name })} onClick={() => setSettling(d)} />
                      {personHref && d.userId ? <IconAction icon="badge" label={t('staffAbsence.table.openPerson', { name })} to={personHref(d.userId)} /> : null}
                    </div>
                  </Td>
                </Tr>
              );
            })}
          </TBody>
        </DataTable>
      </TableCard>
      {settling ? (
        <SettleStaffDayDialog day={settling} name={nameOf(settling)} timezone={timezone} onClose={() => setSettling(null)} />
      ) : null}
    </>
  );
}
