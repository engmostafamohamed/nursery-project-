import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { DataTable, IconAction, TablePagination, TBody, Td, Th, THead, Tr } from '@/components/ui/DataTable';
import { EmptyState } from '@/components/ui/EmptyState';
import { useAuthSession } from '@/hooks/useAuthSession';
import { usePagination } from '@/hooks/usePagination';
import { useUserProfile } from '@/hooks/useUserProfile';
import { useWaitlist } from '@/hooks/useWaitlist';

export function AdminWaitlistPage() {
  const { t } = useTranslation();
  const { user } = useAuthSession();
  const { data: profile } = useUserProfile(user?.id);
  const waitlist = useWaitlist(profile?.nursery_id ?? undefined);

  // One row per child waiting, by class and then by place in the queue.
  const [now] = useState(() => Date.now());
  const rows = useMemo(() => {
    return waitlist.waitlist
      .map((row) => {
        const classObj = (row.classes as Record<string, unknown> | null) ?? {};
        const days = Math.max(0, Math.floor((now - +new Date(String(row.added_at))) / 86400000));
        return { row, className: String(classObj.name_ar ?? classObj.name_en ?? 'Class'), days };
      })
      .sort((a, b) => a.className.localeCompare(b.className) || Number(a.row.position) - Number(b.row.position));
  }, [waitlist.waitlist, now]);
  const pager = usePagination(rows, 10, rows.length);

  return (
    <div className="space-y-4">
      <h1 className="text-lg font-semibold text-on-surface">{t('admissions.waitlistTitle')}</h1>
      {!rows.length ? (
        <EmptyState icon="hourglass" title={t('admissions.waitlistEmptyTitle')} description={t('admissions.waitlistEmptyDescription')} />
      ) : (
        <div className="overflow-hidden rounded-xl border border-outline-variant bg-surface shadow-sm">
          <DataTable minWidth={900}>
            <THead>
              <Th>{t('admissions.waitlistTable.class')}</Th>
              <Th className="w-16">{t('admissions.waitlistTable.position')}</Th>
              <Th>{t('admissions.waitlistTable.parent')}</Th>
              <Th>{t('admissions.waitlistTable.phone')}</Th>
              <Th>{t('admissions.daysOnWaitlist')}</Th>
              <Th align="end">{t('admissions.waitlistTable.actions')}</Th>
            </THead>
            <TBody>
              {pager.pageItems.map(({ row, className, days }) => {
                const inquiry = (row.inquiries as Record<string, unknown> | null) ?? {};
                return (
                  <Tr key={String(row.id)} data-testid="waitlist-row">
                    <Td className="font-medium text-on-surface">{className}</Td>
                    <Td className="font-semibold tabular-nums text-on-surface">#{String(row.position)}</Td>
                    <Td className="text-on-surface">{String(inquiry.parent_name ?? '—')}</Td>
                    <Td className="whitespace-nowrap tabular-nums text-on-surface-variant"><span dir="ltr">{String(inquiry.parent_phone ?? '—')}</span></Td>
                    <Td className="tabular-nums text-on-surface-variant">{days}</Td>
                    <Td align="end">
                      <span className="flex items-center justify-end gap-1">
                        <IconAction icon="arrow_upward" label={t('admissions.waitlistTable.moveUp')} onClick={() => void waitlist.reorderWaitlist({ id: String(row.id), classId: String(row.class_id), direction: 'up' })} />
                        <IconAction icon="arrow_downward" label={t('admissions.waitlistTable.moveDown')} onClick={() => void waitlist.reorderWaitlist({ id: String(row.id), classId: String(row.class_id), direction: 'down' })} />
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => void waitlist.notifyOpening({ waitlistId: String(row.id), inquiry, className }).then(() => toast.success(t('admissions.openingNotified')))}
                        >
                          {t('admissions.notifyOpening')}
                        </Button>
                        <Button size="sm" onClick={() => toast.message(t('common.comingSoon'))}>{t('admissions.convertToApplication')}</Button>
                      </span>
                    </Td>
                  </Tr>
                );
              })}
            </TBody>
          </DataTable>
          <TablePagination pager={pager} pageSizeOptions={[10, 20, 50]} />
        </div>
      )}
    </div>
  );
}
