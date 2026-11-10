import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { DataTable, TableCard, TableEmpty, TablePagination, TBody, Td, Th, THead, Tr } from '@/components/ui/DataTable';
import { FilterBar } from '@/components/ui/FilterBar';
import { FilterField } from '@/components/ui/FilterField';
import { MaterialSymbol } from '@/components/ui/MaterialSymbol';
import { Select } from '@/components/ui/select';
import { usePagination } from '@/hooks/usePagination';
import type { ClassTeamRole } from '@/lib/classTeam';
import { formatDateTime } from '@/lib/datetime';
import { cn } from '@/lib/utils';

import { CHANGE_ICON } from './teamLook';
import { roleName } from './useClassTeamEditing';

type Action = keyof typeof CHANGE_ICON;

/** A change to a class's team, in the reader's language (both the Teams page and a class's page make these). */
export type TeamChangeRow = {
  id: string;
  action: Action;
  classId: string;
  className: string;
  personName: string;
  role: ClassTeamRole | null;
  /** Who made the change ('' when not known). */
  by: string;
  at: string;
};

/**
 * The latest changes to class teams, newest first, as rows: who joined, moved or left which class,
 * who did it and when; filtered by kind of change and, across classes, by class. The Teams page shows
 * every class's (`showClass`); a class's page shows its own.
 */
export function TeamChangesTable({ rows, title, description, showClass = true }: {
  rows: TeamChangeRow[];
  title: string;
  description?: string;
  showClass?: boolean;
}) {
  const { t, i18n } = useTranslation();
  const [classId, setClassId] = useState('all');
  const [action, setAction] = useState<Action | 'all'>('all');
  const shown = useMemo(
    () => rows.filter((c) => (classId === 'all' || c.classId === classId) && (action === 'all' || c.action === action)),
    [rows, classId, action],
  );
  const pager = usePagination(shown, 10, `${classId}|${action}`);
  const classes = useMemo(() => {
    const byId = new Map(rows.map((r) => [r.classId, r.className]));
    return [...byId].sort((a, b) => a[1].localeCompare(b[1], i18n.language));
  }, [rows, i18n.language]);

  return (
    <TableCard
      title={title}
      count={t('classTeam.changesTable.count', { count: shown.length })}
      description={description}
      filters={
        rows.length ? (
          <FilterBar onClear={() => { setClassId('all'); setAction('all'); }} canClear={classId !== 'all' || action !== 'all'}>
            {showClass && classes.length > 1 ? (
              <FilterField label={t('classTeam.changesTable.class')}>
                <Select value={classId} onChange={(e) => setClassId(e.target.value)} aria-label={t('classTeam.changesTable.class')}>
                  <option value="all">{t('classTeam.filters.allClasses')}</option>
                  {classes.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
                </Select>
              </FilterField>
            ) : null}
            <FilterField label={t('classTeam.changesTable.change')}>
              <Select value={action} onChange={(e) => setAction(e.target.value as Action | 'all')} aria-label={t('classTeam.changesTable.change')}>
                <option value="all">{t('classTeam.changesTable.allChanges')}</option>
                {(['assigned', 'changed', 'removed'] as const).map((a) => <option key={a} value={a}>{t(`classTeam.changesTable.actions.${a}`)}</option>)}
              </Select>
            </FilterField>
          </FilterBar>
        ) : undefined
      }
      pagination={<TablePagination pager={pager} pageSizeOptions={[10, 25, 50]} />}
    >
      {shown.length ? (
        <DataTable minWidth={showClass ? 760 : 620}>
          <THead>
            <Th>{t('classTeam.changesTable.change')}</Th>
            {showClass ? <Th>{t('classTeam.changesTable.class')}</Th> : null}
            <Th>{t('classTeam.changesTable.by')}</Th>
            <Th>{t('classTeam.changesTable.when')}</Th>
          </THead>
          <TBody>
            {pager.pageItems.map((change) => (
              <Tr key={change.id} data-testid="team-change-row">
                <Td>
                  <span className="flex items-center gap-2 text-on-surface">
                    <span className={cn('flex h-8 w-8 shrink-0 items-center justify-center rounded-full', change.action === 'removed' ? 'bg-error/10 text-error' : 'bg-primary/10 text-primary')}>
                      <MaterialSymbol name={CHANGE_ICON[change.action]} size="text-base" />
                    </span>
                    {t(`classTeam.changes.${change.action}`, { name: change.personName, class: change.className, role: change.role ? roleName(t, change.role) : '' })}
                  </span>
                </Td>
                {showClass ? <Td className="text-on-surface-variant">{change.className}</Td> : null}
                <Td className="text-on-surface-variant">{change.by || '—'}</Td>
                <Td className="whitespace-nowrap text-on-surface-variant">
                  {formatDateTime(change.at, { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })}
                </Td>
              </Tr>
            ))}
          </TBody>
        </DataTable>
      ) : (
        <TableEmpty icon="history" title={rows.length ? t('classTeam.empty.noMatch') : t('classTeam.changes.empty')} />
      )}
    </TableCard>
  );
}
