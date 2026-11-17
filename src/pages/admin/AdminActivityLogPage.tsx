import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import {
  DataTable,
  StatusPill,
  TableCard,
  TableEmpty,
  TableLoading,
  TablePagination,
  TBody,
  Td,
  Th,
  THead,
  Tr,
  type PillTone,
} from '@/components/ui/DataTable';
import { FilterBar, SearchInput } from '@/components/ui/FilterBar';
import { FilterField } from '@/components/ui/FilterField';
import { MaterialSymbol } from '@/components/ui/MaterialSymbol';
import { PageHeader } from '@/components/ui/PageHeader';
import { Select } from '@/components/ui/select';
import { useActiveNurseryId } from '@/hooks/useActiveNurseryId';
import { useBilingualNames } from '@/hooks/useBilingualNames';
import { usePagination } from '@/hooks/usePagination';
import { formatDateTime } from '@/lib/datetime';

import { activityTitleKey, shownFields, type ActivityLine, type ActivitySubject } from '@/features/activity-log/activityLog';
import { useActivityLog } from '@/features/activity-log/useActivityLog';

const ACTION_TONE: Record<ActivityLine['action'], PillTone> = {
  created: 'success',
  updated: 'primary',
  deleted: 'error',
};

const ENTITY_ICON: Record<ActivityLine['entity'], string> = {
  class: 'school',
  class_team: 'groups',
  staff: 'badge',
  staff_absence: 'event_busy',
  staff_attendance: 'schedule',
};

/**
 * What the nursery's classes and staff have been through: every change the database recorded, newest
 * first — who did it, what it was about and which fields moved. Written by the database itself, so
 * a change made from any screen, an import or a script is here.
 */
export function AdminActivityLogPage() {
  const { t, i18n } = useTranslation();
  const { activeNurseryId } = useActiveNurseryId();
  const names = useBilingualNames(activeNurseryId);
  const [subject, setSubject] = useState<ActivitySubject | 'all'>('all');
  const [search, setSearch] = useState('');

  const query = useActivityLog({ nurseryId: activeNurseryId, subject });
  const lines = useMemo(() => query.data ?? [], [query.data]);

  const pick = (n: { ar: string | null; en: string | null }) => names.lines(n.ar, n.en).primary;

  const shown = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return lines;
    return lines.filter((line) =>
      `${pick(line.about)} ${pick(line.actor)} ${line.onClass ? pick(line.onClass) : ''}`.toLowerCase().includes(term),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lines, search, i18n.language]);

  const pager = usePagination(shown, 20, `${subject}|${search}|${shown.length}`);

  return (
    <div className="space-y-5 pb-8">
      <PageHeader
        icon="history"
        eyebrow={t('activityLog.eyebrow')}
        title={t('activityLog.title')}
        description={t('activityLog.subtitle')}
      />

      <TableCard
        title={t('activityLog.tableTitle')}
        count={t('activityLog.lineCount', { count: shown.length })}
        filters={
          <FilterBar onClear={() => { setSubject('all'); setSearch(''); }} canClear={subject !== 'all' || Boolean(search)}>
            <FilterField label={t('common.search')} className="sm:flex-[2]">
              <SearchInput value={search} onChange={setSearch} placeholder={t('activityLog.searchPlaceholder')} />
            </FilterField>
            <FilterField label={t('activityLog.filterSubject')}>
              <Select value={subject} onChange={(e) => setSubject(e.target.value as ActivitySubject | 'all')}>
                <option value="all">{t('common.all')}</option>
                <option value="class">{t('activityLog.subjects.class')}</option>
                <option value="staff">{t('activityLog.subjects.staff')}</option>
              </Select>
            </FilterField>
          </FilterBar>
        }
        pagination={shown.length ? <TablePagination pager={pager} pageSizeOptions={[20, 50, 100]} /> : null}
      >
        {query.isPending ? (
          <TableLoading />
        ) : query.isError ? (
          <TableEmpty icon="error" title={t('activityLog.loadError')} />
        ) : !shown.length ? (
          <TableEmpty
            icon="history"
            title={lines.length ? t('activityLog.noMatch') : t('activityLog.emptyTitle')}
            description={lines.length ? undefined : t('activityLog.emptyDescription')}
          />
        ) : (
          <DataTable minWidth={880}>
            <THead>
              <Th>{t('activityLog.table.what')}</Th>
              <Th>{t('activityLog.table.about')}</Th>
              <Th>{t('activityLog.table.changed')}</Th>
              <Th>{t('activityLog.table.who')}</Th>
              <Th>{t('activityLog.table.when')}</Th>
            </THead>
            <TBody>
              {pager.pageItems.map((line) => {
                const fields = shownFields(line);
                return (
                  <Tr key={line.id} data-testid="activity-row">
                    <Td className="min-w-[13rem]">
                      <span className="flex items-center gap-2">
                        <MaterialSymbol name={ENTITY_ICON[line.entity]} size="text-lg" className="shrink-0 text-primary" />
                        <span className="font-medium text-on-surface">{t(activityTitleKey(line))}</span>
                      </span>
                      <StatusPill tone={ACTION_TONE[line.action]} className="mt-1">
                        {t(`activityLog.actions.${line.action}`)}
                      </StatusPill>
                    </Td>
                    <Td className="min-w-[11rem]">
                      <span className="block font-medium text-on-surface">{pick(line.about) || '—'}</span>
                      {line.onClass ? (
                        <span className="block text-xs text-on-surface-variant">{t('activityLog.inClass', { class: pick(line.onClass) })}</span>
                      ) : null}
                      {line.role ? (
                        <span className="block text-xs text-on-surface-variant">{t(`classTeam.roles.${line.role}`, { defaultValue: line.role })}</span>
                      ) : null}
                    </Td>
                    <Td className="min-w-[13rem] max-w-[22rem] text-xs text-on-surface-variant">
                      {fields.length ? (
                        <ul className="space-y-0.5">
                          {fields.map((field) => (
                            <li key={field}>
                              <span className="font-medium text-on-surface">{t(`activityLog.fields.${field}`, { defaultValue: field })}</span>
                              {': '}
                              <span className="line-through opacity-70">{line.changed[field]?.from || '—'}</span>
                              {' → '}
                              <span className="text-on-surface">{line.changed[field]?.to || '—'}</span>
                            </li>
                          ))}
                        </ul>
                      ) : (
                        '—'
                      )}
                    </Td>
                    <Td className="whitespace-nowrap text-on-surface-variant">{pick(line.actor) || t('activityLog.bySystem')}</Td>
                    <Td className="whitespace-nowrap text-on-surface-variant">{formatDateTime(line.at)}</Td>
                  </Tr>
                );
              })}
            </TBody>
          </DataTable>
        )}
      </TableCard>
    </div>
  );
}
