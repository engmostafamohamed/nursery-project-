import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';

import { DataTable, IconAction, StatusPill, TableCard, TableEmpty, TablePagination, TBody, Td, Th, THead, Tr } from '@/components/ui/DataTable';
import { FilterBar, SearchInput } from '@/components/ui/FilterBar';
import { FilterField } from '@/components/ui/FilterField';
import { MaterialSymbol } from '@/components/ui/MaterialSymbol';
import { Select } from '@/components/ui/select';
import { usePagination } from '@/hooks/usePagination';
import { cn } from '@/lib/utils';
import { useTableSort } from '@/hooks/useTableSort';

import { COVER_LOOK } from './absenceLook';
import { COVER_STATUSES, coverRank, coverStatus, needsTeam, sortClassCover, type ClassCover, type ClassPerson, type CoverStatus } from './staffAbsence';

type SortKey = 'class' | 'children' | 'status';

/**
 * Each class today as a row: its lead and backup (who is away, who covers), and whether someone is
 * on duty. The classes left with nobody come first; one that needs its team set links straight to it.
 */
export function ClassCoverTable({ classes, classHref, teamHref, personHref }: {
  classes: ClassCover[];
  classHref: (classId: string) => string;
  /** The class's team, to set who covers it. */
  teamHref: (classId: string) => string;
  /** A teacher's page (their name opens it). */
  personHref?: (userId: string) => string;
}) {
  const { t, i18n } = useTranslation();
  const isArabic = i18n.language.startsWith('ar');
  const name = (ar: string, en: string) => (isArabic ? ar || en : en || ar) || '—';
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<CoverStatus | 'all'>('all');
  const sort = useTableSort<SortKey>('status');

  const counts = useMemo(() => {
    const c = Object.fromEntries(COVER_STATUSES.map((s) => [s, 0])) as Record<CoverStatus, number>;
    for (const k of classes) c[coverStatus(k)] += 1;
    return c;
  }, [classes]);
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return sortClassCover(classes).filter((c) => {
      if (status !== 'all' && coverStatus(c) !== status) return false;
      if (!q) return true;
      return [c.nameAr, c.nameEn, c.lead?.nameAr, c.lead?.nameEn, c.backup?.nameAr, c.backup?.nameEn].join(' ').toLowerCase().includes(q);
    });
  }, [classes, search, status]);
  const rows = sort.sorted(filtered, {
    class: (a, b) => name(a.nameAr, a.nameEn).localeCompare(name(b.nameAr, b.nameEn)),
    children: (a, b) => a.children - b.children,
    status: (a, b) => coverRank(a) - coverRank(b) || name(a.nameAr, a.nameEn).localeCompare(name(b.nameAr, b.nameEn)),
  });
  const pager = usePagination(rows, 10, `${status}|${search.trim().toLowerCase()}|${sort.key}`);

  const person = (p: ClassPerson | null, covering: boolean) =>
    p ? (
      <span className="flex min-w-0 flex-wrap items-center gap-1.5">
        {personHref ? (
          <Link to={personHref(p.id)} className={cn('hover:text-primary hover:underline', p.away ? 'text-on-surface-variant line-through' : 'font-medium text-on-surface')}>{name(p.nameAr, p.nameEn)}</Link>
        ) : (
          <span className={p.away ? 'text-on-surface-variant line-through' : 'font-medium text-on-surface'}>{name(p.nameAr, p.nameEn)}</span>
        )}
        {p.away ? <StatusPill tone="warning">{t('staffAbsence.board.away')}</StatusPill> : covering ? <StatusPill tone="primary">{t('staffAbsence.board.covering')}</StatusPill> : null}
      </span>
    ) : (
      <span className="text-xs text-on-surface-variant">{t('staffAbsence.board.none')}</span>
    );

  return (
    <TableCard
      title={t('staffAbsence.board.title')}
      count={t('staffAbsence.board.count', { count: filtered.length })}
      description={t('staffAbsence.board.hint')}
      filters={
        <FilterBar onClear={() => { setSearch(''); setStatus('all'); }} canClear={Boolean(search.trim()) || status !== 'all'}>
          <FilterField label={t('staffAbsence.board.searchLabel')} className="sm:flex-[2]">
            <SearchInput value={search} onChange={setSearch} placeholder={t('staffAbsence.board.search')} />
          </FilterField>
          <FilterField label={t('staffAbsence.board.show')}>
            <Select value={status} onChange={(e) => setStatus(e.target.value as CoverStatus | 'all')} aria-label={t('staffAbsence.board.show')}>
              <option value="all">{t('staffAbsence.board.all')}</option>
              {COVER_STATUSES.map((s) => (
                <option key={s} value={s}>{t(`staffAbsence.board.status.${s}`)} ({counts[s]})</option>
              ))}
            </Select>
          </FilterField>
        </FilterBar>
      }
      pagination={<TablePagination pager={pager} pageSizeOptions={[10, 25, 50]} />}
    >
      {rows.length ? (
        <DataTable minWidth={880}>
          <THead>
            <Th sort={sort.sortFor('class')}>{t('staffAbsence.board.class')}</Th>
            <Th>{t('staffAbsence.board.lead')}</Th>
            <Th>{t('staffAbsence.board.backup')}</Th>
            <Th sort={sort.sortFor('status')}>{t('staffAbsence.board.today')}</Th>
            <Th align="end">{t('staffAbsence.board.actions')}</Th>
          </THead>
          <TBody>
            {pager.pageItems.map((c) => {
              const s = coverStatus(c);
              const look = COVER_LOOK[s];
              const className = name(c.nameAr, c.nameEn);
              return (
                <Tr key={c.classId} className={s === 'uncovered' ? 'bg-error/5' : undefined} data-testid="class-cover">
                  <Td>
                    <Link to={classHref(c.classId)} className="font-semibold text-on-surface hover:text-primary hover:underline">{className}</Link>
                    <p className="text-xs text-on-surface-variant">{t('staffAbsence.board.children', { count: c.children })}</p>
                  </Td>
                  <Td>{person(c.lead, false)}</Td>
                  <Td>{person(c.backup, c.coveredByBackup)}</Td>
                  <Td><StatusPill tone={look.tone} icon={look.icon}>{t(`staffAbsence.board.status.${s}`)}</StatusPill></Td>
                  <Td align="end">
                    {needsTeam(c) ? (
                      <Link to={teamHref(c.classId)} className="inline-flex items-center gap-1 whitespace-nowrap rounded-lg px-2 py-1.5 text-sm font-medium text-primary hover:bg-primary/10">
                        <MaterialSymbol name="group_add" size="text-base" />
                        {t('staffAbsence.board.setTeam')}
                      </Link>
                    ) : (
                      <IconAction icon="open_in_new" label={t('staffAbsence.board.openClass', { class: className })} to={classHref(c.classId)} />
                    )}
                  </Td>
                </Tr>
              );
            })}
          </TBody>
        </DataTable>
      ) : (
        <TableEmpty icon="school" title={classes.length ? t('staffAbsence.board.noMatch') : t('staffAbsence.board.noClasses')} />
      )}
    </TableCard>
  );
}
