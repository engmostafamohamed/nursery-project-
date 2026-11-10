import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';

import { DataTable, IconAction, StatusPill, TableCard, TableEmpty, TablePagination, TBody, Td, Th, THead, Tr } from '@/components/ui/DataTable';
import { MaterialSymbol } from '@/components/ui/MaterialSymbol';
import { usePagination } from '@/hooks/usePagination';
import { useTableSort } from '@/hooks/useTableSort';
import {
  assistants,
  lead,
  nannies,
  otherClassesLed,
  pickName,
  substitute,
  TEAM_STATUS_RANK,
  teamGaps,
  teamStatus,
  type TeamClass,
  type TeamTeacher,
} from '@/lib/classTeam';
import { cn } from '@/lib/utils';

import { TEAM_STATUS_LOOK } from './teamLook';

type SortKey = 'class' | 'lead' | 'children' | 'status';

/**
 * The classes' teams as rows: the lead teacher (required; flagged when inactive or leading other
 * classes), the backup, the assistants and nannies, and what the team is missing. The classes that
 * need attention come first; a row (or its button) opens the team to change it.
 */
export function TeamsTable({
  classes,
  staff,
  nameOf,
  canUpdate,
  onEdit,
  classHref,
  filters,
  total,
  resetKey,
}: {
  /** The classes to show (already searched and filtered). */
  classes: TeamClass[];
  staff: TeamTeacher[];
  nameOf: (id: string | null) => string;
  canUpdate: boolean;
  onEdit: (cls: TeamClass) => void;
  /** The class's own page, when the reader can open it. */
  classHref?: (classId: string) => string;
  filters: ReactNode;
  /** How many classes there are before filtering (for the empty message). */
  total: number;
  /** Changes when the filters do, to go back to the first page. */
  resetKey: string;
}) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const byId = new Map(staff.map((s) => [s.id, s]));
  const sort = useTableSort<SortKey>('status');
  const rows = sort.sorted(classes, {
    class: (a, b) => pickName(a, lang).localeCompare(pickName(b, lang)),
    lead: (a, b) => (nameOf(lead(a)) || '~').localeCompare(nameOf(lead(b)) || '~'),
    children: (a, b) => a.children_count - b.children_count,
    status: (a, b) => TEAM_STATUS_RANK[teamStatus(a)] - TEAM_STATUS_RANK[teamStatus(b)] || pickName(a, lang).localeCompare(pickName(b, lang)),
  });
  const pager = usePagination(rows, 10, `${resetKey}|${sort.key}`);
  const list = new Intl.ListFormat(lang.startsWith('ar') ? 'ar' : 'en', { style: 'long', type: 'conjunction' });

  /** A single place (lead or backup) in a cell. */
  const one = (id: string | null, role: 'lead' | 'substitute', classId: string) => {
    if (!id) {
      return role === 'lead' ? (
        <StatusPill tone="error" icon="person_off">{t('classTeam.status.no_lead')}</StatusPill>
      ) : (
        <span className="text-xs text-warning">{t('classTeam.table.notSet')}</span>
      );
    }
    const person = byId.get(id);
    const inactive = person?.status !== 'active';
    const others = role === 'lead' ? otherClassesLed(person, classId) : 0;
    return (
      <div className="min-w-0">
        <p className={cn('truncate font-medium', inactive ? 'text-error' : 'text-on-surface')}>{nameOf(id)}</p>
        {inactive ? <p className="text-xs text-error">{t('classTeam.table.inactive')}</p> : null}
        {others ? <p className="text-xs text-warning">{t('classTeam.check.leadsOthers', { count: others })}</p> : null}
      </div>
    );
  };

  /** Several people (assistants, nannies): the first two, then how many more. */
  const many = (ids: string[]) => {
    if (!ids.length) return <span className="text-xs text-on-surface-variant">{t('classTeam.table.none')}</span>;
    const shown = ids.slice(0, 2);
    return (
      <ul className="flex flex-wrap gap-1">
        {shown.map((id) => (
          <li key={id}>
            <StatusPill tone={byId.get(id)?.status === 'active' ? 'neutral' : 'error'} className="max-w-[10rem]">
              <span className="truncate">{nameOf(id)}</span>
            </StatusPill>
          </li>
        ))}
        {ids.length > shown.length ? (
          <li>
            <StatusPill tone="neutral" icon="group">{t('classTeam.table.more', { count: ids.length - shown.length })}</StatusPill>
          </li>
        ) : null}
      </ul>
    );
  };

  return (
    <TableCard
      title={t('classTeam.table.title')}
      count={t('classTeam.table.count', { count: classes.length })}
      description={t(canUpdate ? 'classTeam.table.hint' : 'classTeam.table.hintView')}
      filters={filters}
      pagination={<TablePagination pager={pager} pageSizeOptions={[10, 25, 50]} />}
    >
      {rows.length ? (
        <DataTable minWidth={1080}>
          <THead>
            <Th sort={sort.sortFor('class')}>{t('classTeam.table.class')}</Th>
            <Th sort={sort.sortFor('lead')}>{t('classTeam.table.lead')}</Th>
            <Th>{t('classTeam.table.backup')}</Th>
            <Th>{t('classTeam.table.assistants')}</Th>
            <Th>{t('classTeam.table.nannies')}</Th>
            <Th sort={sort.sortFor('status')}>{t('classTeam.table.status')}</Th>
            <Th align="end">{t('classTeam.table.actions')}</Th>
          </THead>
          <TBody>
            {pager.pageItems.map((cls) => {
              const name = pickName(cls, lang);
              const status = teamStatus(cls);
              const look = TEAM_STATUS_LOOK[status];
              const gaps = teamGaps(cls).filter((g) => g !== 'no_lead');
              return (
                <Tr key={cls.id} onClick={() => onEdit(cls)} data-testid="team-row">
                  <Td>
                    {classHref ? (
                      <Link to={classHref(cls.id)} className="font-semibold text-on-surface hover:text-primary hover:underline">{name}</Link>
                    ) : (
                      <p className="font-semibold text-on-surface">{name}</p>
                    )}
                    <p className="text-xs text-on-surface-variant">
                      {t('classTeam.card.children', { count: cls.children_count })}
                      {cls.room_number ? ` · ${t('classTeam.card.room', { room: cls.room_number })}` : ''}
                    </p>
                  </Td>
                  <Td>{one(lead(cls), 'lead', cls.id)}</Td>
                  <Td>{one(substitute(cls), 'substitute', cls.id)}</Td>
                  <Td>{many(assistants(cls))}</Td>
                  <Td>{many(nannies(cls))}</Td>
                  <Td>
                    <StatusPill tone={look.tone} icon={look.icon}>{t(`classTeam.status.${status}`)}</StatusPill>
                    {gaps.length ? (
                      <p className="mt-1 text-xs text-on-surface-variant">
                        {t('classTeam.gaps.label', { list: list.format(gaps.map((g) => t(`classTeam.gaps.${g}`))) })}
                      </p>
                    ) : null}
                  </Td>
                  <Td align="end">
                    <div className="inline-flex items-center gap-0.5">
                      <IconAction
                        icon={canUpdate ? 'manage_accounts' : 'visibility'}
                        label={t(canUpdate ? 'classTeam.table.edit' : 'classTeam.table.view', { class: name })}
                        onClick={() => onEdit(cls)}
                      />
                      {classHref ? <IconAction icon="open_in_new" label={t('classTeam.table.openClass', { class: name })} to={classHref(cls.id)} /> : null}
                    </div>
                  </Td>
                </Tr>
              );
            })}
          </TBody>
        </DataTable>
      ) : (
        <TableEmpty icon="school" title={total ? t('classTeam.empty.noMatch') : t('classTeam.empty.classes')} />
      )}
      {rows.length ? (
        <p className="flex items-center gap-1.5 border-t border-outline-variant px-4 pt-3 text-xs text-on-surface-variant sm:px-5">
          <MaterialSymbol name="info" size="text-sm" />
          {t('classTeam.table.leadNote')}
        </p>
      ) : null}
    </TableCard>
  );
}
