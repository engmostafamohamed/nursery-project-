import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Button } from '@/components/ui/button';
import { DataTable, TableCard, TBody, Td, Th, THead, Tr, type ThSort } from '@/components/ui/DataTable';
import { cn } from '@/lib/utils';

import { PanelEmpty } from './chartParts';
import { childrenPerTeacher, ratePercent, type NurseryRow } from './platformDashboard';
import { useDashboardFormat } from './useDashboardFormat';

type SortKey = 'children' | 'ratio' | 'attendance' | 'collected' | 'outstanding' | 'overdue';

const VALUE: Record<SortKey, (r: NurseryRow) => number> = {
  children: (r) => r.active_children,
  ratio: (r) => childrenPerTeacher(r) ?? -1,
  attendance: (r) => ratePercent(r.present_30, r.expected_30) ?? -1,
  collected: (r) => r.collected_this_month,
  outstanding: (r) => r.outstanding,
  overdue: (r) => r.overdue_count,
};

const COLLAPSED_ROWS = 8;

/** Every nursery side by side; any column sorts it, and a row opens that nursery's dashboard. */
export function NurseryPerformanceTable({ rows, onOpen }: { rows: NurseryRow[]; onOpen: (id: string) => void }) {
  const { t } = useTranslation();
  const f = useDashboardFormat();
  const [sort, setSort] = useState<{ key: SortKey; direction: 'asc' | 'desc' }>({ key: 'children', direction: 'desc' });
  const [showAll, setShowAll] = useState(false);

  const sorted = [...rows].sort((a, b) => {
    const diff = VALUE[sort.key](a) - VALUE[sort.key](b);
    return (sort.direction === 'asc' ? diff : -diff) || f.nurseryName(a).localeCompare(f.nurseryName(b));
  });
  const visible = showAll ? sorted : sorted.slice(0, COLLAPSED_ROWS);

  const sortBy = (key: SortKey): ThSort => ({
    active: sort.key === key,
    direction: sort.key === key ? sort.direction : 'desc',
    onToggle: () => setSort((cur) => ({ key, direction: cur.key === key && cur.direction === 'desc' ? 'asc' : 'desc' })),
  });

  return (
    <TableCard
      title={t('xoAdmin.dashboard.network.tableTitle')}
      count={f.int(rows.length)}
      description={t('xoAdmin.dashboard.network.tableHint')}
      pagination={
        rows.length > COLLAPSED_ROWS ? (
          <div className="border-t border-outline-variant px-4 py-2 sm:px-5">
            <Button type="button" variant="ghost" size="sm" onClick={() => setShowAll((v) => !v)} aria-expanded={showAll}>
              <span className="material-symbols-outlined me-1 text-base" aria-hidden>
                {showAll ? 'expand_less' : 'expand_more'}
              </span>
              {showAll
                ? t('xoAdmin.dashboard.network.showFewer')
                : t('xoAdmin.dashboard.network.showAll', { count: rows.length, formatted: f.int(rows.length) })}
            </Button>
          </div>
        ) : undefined
      }
    >
      {rows.length === 0 ? (
        <PanelEmpty>{t('xoAdmin.dashboard.empty')}</PanelEmpty>
      ) : (
        <DataTable minWidth={860}>
          <THead>
            <Th>{t('xoAdmin.dashboard.network.col.nursery')}</Th>
            <Th align="end" sort={sortBy('children')}>{t('xoAdmin.dashboard.network.col.children')}</Th>
            <Th align="end" sort={sortBy('ratio')}>{t('xoAdmin.dashboard.network.col.ratio')}</Th>
            <Th align="end" sort={sortBy('attendance')}>{t('xoAdmin.dashboard.network.col.attendance')}</Th>
            <Th align="end" sort={sortBy('collected')}>{t('xoAdmin.dashboard.network.col.collected')}</Th>
            <Th align="end" sort={sortBy('outstanding')}>{t('xoAdmin.dashboard.network.col.outstanding')}</Th>
            <Th align="end" sort={sortBy('overdue')}>{t('xoAdmin.dashboard.network.col.overdue')}</Th>
          </THead>
          <TBody>
            {visible.map((row) => {
              const rate = ratePercent(row.present_30, row.expected_30);
              const ratio = childrenPerTeacher(row);
              return (
                <Tr key={row.id} onClick={() => onOpen(row.id)}>
                  <Td>
                    <span className="block font-medium text-on-surface">{f.nurseryName(row)}</span>
                    <span className="block text-xs text-on-surface-variant">{row.city ?? t('xoAdmin.dashboard.network.cityNotSet')}</span>
                  </Td>
                  <Td align="end" className="tabular-nums">{f.int(row.active_children)}</Td>
                  <Td align="end" className="tabular-nums">
                    {ratio != null ? f.int(ratio) : '—'}
                    <span className="block text-xs text-on-surface-variant">
                      {t('xoAdmin.dashboard.network.teacherCount', { count: row.teachers, formatted: f.int(row.teachers) })}
                    </span>
                  </Td>
                  <Td align="end" className="tabular-nums">
                    {rate != null ? (
                      <span className="inline-flex items-center gap-2">
                        <span className="hidden h-1.5 w-14 overflow-hidden rounded-full bg-surface-high sm:inline-block" aria-hidden>
                          <span className="block h-full rounded-full bg-primary" style={{ width: `${rate}%` }} />
                        </span>
                        {f.percent(rate)}
                      </span>
                    ) : (
                      '—'
                    )}
                  </Td>
                  <Td align="end" className="whitespace-nowrap tabular-nums">{f.money(row.collected_this_month)}</Td>
                  <Td align="end" className="whitespace-nowrap tabular-nums">{f.money(row.outstanding)}</Td>
                  <Td align="end" className={cn('tabular-nums', row.overdue_count > 0 ? 'font-semibold text-error' : 'text-on-surface-variant')}>
                    {f.int(row.overdue_count)}
                  </Td>
                </Tr>
              );
            })}
          </TBody>
        </DataTable>
      )}
    </TableCard>
  );
}
