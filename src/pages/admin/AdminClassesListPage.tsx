import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';

import { ClassViewDialog } from '@/components/admin/ClassViewDialog';
import { ActionGate } from '@/components/shared/ActionGate';
import { confirm } from '@/components/ui/confirm';
import { Button } from '@/components/ui/button';
import {
  DataTable,
  IconAction,
  StatusPill,
  TableCard,
  TableEmpty,
  TableLoading,
  TablePagination,
  TBody,
  THead,
  Td,
  Th,
  Tr,
} from '@/components/ui/DataTable';
import { FilterBar, SearchInput } from '@/components/ui/FilterBar';
import { FilterField } from '@/components/ui/FilterField';
import { PageHeader } from '@/components/ui/PageHeader';
import { Select } from '@/components/ui/select';
import { StatTile } from '@/components/ui/StatTile';
import { useActiveNurseryId } from '@/hooks/useActiveNurseryId';
import {
  useDeleteClass,
  useNurseryClasses,
  type NurseryClassRow,
  type StaffPerson,
} from '@/hooks/useClassStaff';
import { useNurseryLanguagePref } from '@/hooks/useNurseryLanguagePref';
import { usePagination } from '@/hooks/usePagination';
import { cn } from '@/lib/utils';

type SortKey = 'name' | 'grade' | 'lead' | 'roster';
type QuickFilter = 'all' | 'over' | 'noLead';
type LanguagePref = 'ar' | 'en' | 'both';

/** One line for sorting and search; identical Arabic and English names appear once. */
function localizedName(ar: string | null | undefined, en: string | null | undefined, pref: LanguagePref): string {
  const a = (ar ?? '').trim();
  const e = (en ?? '').trim();
  if (pref === 'ar') return a || e || '—';
  if (pref === 'en') return e || a || '—';
  if (a && e && a !== e) return `${a} / ${e}`;
  return a || e || '—';
}

/** For display: the reader's language first, the other name below it when it differs. */
function nameLines(ar: string | null | undefined, en: string | null | undefined, pref: LanguagePref, arabicFirst: boolean) {
  const a = (ar ?? '').trim();
  const e = (en ?? '').trim();
  if (pref === 'ar') return { primary: a || e || '—', secondary: '' };
  if (pref === 'en') return { primary: e || a || '—', secondary: '' };
  if (!a || !e || a === e) return { primary: a || e || '—', secondary: '' };
  return arabicFirst ? { primary: a, secondary: e } : { primary: e, secondary: a };
}

function staffName(p: StaffPerson | null, pref: LanguagePref, dash = '—'): string {
  if (!p) return dash;
  return localizedName(p.name_ar, p.name_en, pref) || dash;
}

function isOverCapacity(c: NurseryClassRow): boolean {
  return c.capacity != null && c.capacity > 0 && c.child_count > c.capacity;
}

function NameStack({ primary, secondary, strong = false }: { primary: string; secondary: string; strong?: boolean }) {
  return (
    <div className="min-w-0">
      <p className={cn('truncate text-on-surface', strong ? 'font-semibold' : 'font-medium')} title={primary}>{primary}</p>
      {secondary ? <p className="truncate text-xs text-on-surface-variant" title={secondary}>{secondary}</p> : null}
    </div>
  );
}

export function AdminClassesListPage() {
  const { t, i18n } = useTranslation();
  const arabicFirst = i18n.language.startsWith('ar');
  const { activeNurseryId } = useActiveNurseryId();
  const { data: languagePref = 'both' } = useNurseryLanguagePref(activeNurseryId);
  const classesQuery = useNurseryClasses(activeNurseryId);
  const deleteMut = useDeleteClass();

  const [search, setSearch] = useState('');
  const [quickFilter, setQuickFilter] = useState<QuickFilter>('all');
  const [sortBy, setSortBy] = useState<SortKey>('name');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const [viewClassId, setViewClassId] = useState<string | null>(null);

  const onDelete = async (classId: string) => {
    if (!(await confirm({ description: t('admin.classes.actions.deleteConfirm'), variant: 'danger' })))
      return;
    try {
      await deleteMut.mutateAsync(classId);
      toast.success(t('admin.classes.toasts.deletedOk'));
    } catch (err) {
      console.error(err);
      toast.error(t('admin.classes.toasts.deleteFailed'));
    }
  };

  const stats = useMemo(() => {
    const data = classesQuery.data ?? [];
    return {
      classes: data.length,
      children: data.reduce((sum, c) => sum + c.child_count, 0),
      capacity: data.reduce((sum, c) => sum + (c.capacity ?? 0), 0),
      over: data.filter(isOverCapacity).length,
      noLead: data.filter((c) => !c.lead).length,
    };
  }, [classesQuery.data]);

  const rows = useMemo<NurseryClassRow[]>(() => {
    const data = classesQuery.data ?? [];
    const q = search.trim().toLowerCase();
    const filtered = data.filter((c) => {
      if (quickFilter === 'over' && !isOverCapacity(c)) return false;
      if (quickFilter === 'noLead' && c.lead) return false;
      if (!q) return true;
      return `${c.name_ar} ${c.name_en} ${c.grade_level ?? ''} ${c.room_number ?? ''}`.toLowerCase().includes(q);
    });
    const dir = sortDir === 'asc' ? 1 : -1;
    return [...filtered].sort((a, b) => {
      switch (sortBy) {
        case 'grade':
          return ((a.grade_level ?? '').localeCompare(b.grade_level ?? '')) * dir;
        case 'lead':
          return staffName(a.lead, languagePref).localeCompare(staffName(b.lead, languagePref)) * dir;
        case 'roster':
          return (a.child_count - b.child_count) * dir;
        case 'name':
        default:
          return localizedName(a.name_ar, a.name_en, languagePref)
            .localeCompare(localizedName(b.name_ar, b.name_en, languagePref)) * dir;
      }
    });
  }, [classesQuery.data, search, quickFilter, sortBy, sortDir, languagePref]);

  const toggleSort = (key: SortKey) => {
    if (sortBy === key) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else {
      setSortBy(key);
      setSortDir('asc');
    }
  };

  const filtersActive = quickFilter !== 'all' || Boolean(search.trim());
  const clearFilters = () => {
    setQuickFilter('all');
    setSearch('');
  };
  const toggleQuick = (value: QuickFilter) => setQuickFilter((current) => (current === value ? 'all' : value));
  const pager = usePagination(rows, 10, `${quickFilter}|${search.trim().toLowerCase()}|${sortBy}|${sortDir}`);

  const sortFor = (key: SortKey) => ({ active: sortBy === key, direction: sortDir, onToggle: () => toggleSort(key) });

  const capacityPct = stats.capacity > 0 ? Math.round((stats.children / stats.capacity) * 100) : null;

  return (
    <div className="space-y-5 pb-8">
      <PageHeader
        icon="school"
        title={t('admin.classes.list.title')}
        description={t('admin.classes.list.subtitle')}
        actions={
          <ActionGate feature="classes" action="create">
            <Button asChild>
              <Link to="/admin/classes/new">
                <span className="material-symbols-outlined me-1 text-base" aria-hidden>add</span>
                {t('admin.classes.actions.new')}
              </Link>
            </Button>
          </ActionGate>
        }
      >
        <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
          <StatTile icon="school" label={t('admin.classes.list.stats.classes')} value={stats.classes} onClick={clearFilters} active={!filtersActive} />
          <StatTile
            icon="child_care"
            label={t('admin.classes.list.colRoster')}
            value={capacityPct === null ? stats.children : `${stats.children} · ${capacityPct}%`}
            helper={stats.capacity > 0 ? t('admin.classes.list.stats.capacityHelper', { capacity: stats.capacity }) : undefined}
            tone={capacityPct !== null && capacityPct > 100 ? 'error' : capacityPct !== null && capacityPct >= 90 ? 'warning' : 'success'}
          />
          <StatTile
            icon="warning"
            label={t('admin.classes.list.stats.overCapacity')}
            value={stats.over}
            tone={stats.over > 0 ? 'error' : 'success'}
            onClick={() => toggleQuick('over')}
            active={quickFilter === 'over'}
          />
          <StatTile
            icon="person_alert"
            label={t('admin.classes.list.stats.noLead')}
            value={stats.noLead}
            tone={stats.noLead > 0 ? 'warning' : 'success'}
            onClick={() => toggleQuick('noLead')}
            active={quickFilter === 'noLead'}
          />
        </div>
      </PageHeader>

      <TableCard
        title={t('admin.classes.list.title')}
        count={classesQuery.isLoading ? undefined : t('admin.classes.list.resultsCount', { count: rows.length })}
        filters={
          <FilterBar onClear={clearFilters} canClear={filtersActive}>
            <FilterField label={t('admin.classes.list.showLabel')}>
              <Select value={quickFilter} onChange={(e) => setQuickFilter(e.target.value as QuickFilter)}>
                <option value="all">{t('admin.classes.list.showAll')}</option>
                <option value="over">{t('admin.classes.list.stats.overCapacity')}</option>
                <option value="noLead">{t('admin.classes.list.stats.noLead')}</option>
              </Select>
            </FilterField>
            <FilterField label={t('common.search')} className="sm:flex-[2]">
              <SearchInput value={search} onChange={setSearch} placeholder={t('admin.classes.list.searchPlaceholder')} />
            </FilterField>
          </FilterBar>
        }
        pagination={classesQuery.isLoading || rows.length === 0 ? null : <TablePagination pager={pager} />}
      >
        {classesQuery.isLoading ? (
          <TableLoading rows={3} />
        ) : rows.length === 0 ? (
          <TableEmpty
            icon="school"
            title={t('admin.classes.list.emptyTitle')}
            description={t('admin.classes.list.emptyDescription')}
          />
        ) : (
          <DataTable minWidth={960}>
            <THead>
              <Th sort={sortFor('name')}>{t('admin.classes.list.colName')}</Th>
              <Th sort={sortFor('grade')}>{t('admin.classes.list.colGrade')}</Th>
              <Th>{t('admin.classes.list.colRoom')}</Th>
              <Th sort={sortFor('lead')}>{t('admin.classes.list.colLead')}</Th>
              <Th>{t('admin.classes.list.colBackup')}</Th>
              <Th>{t('admin.classes.list.colAssistants')}</Th>
              <Th sort={sortFor('roster')}>{t('admin.classes.list.colRoster')}</Th>
              <Th align="end">{t('common.actions')}</Th>
            </THead>
            <TBody>
              {pager.pageItems.map((c) => {
                const name = nameLines(c.name_ar, c.name_en, languagePref, arabicFirst);
                const lead = c.lead ? nameLines(c.lead.name_ar, c.lead.name_en, languagePref, arabicFirst) : null;
                const backup = c.substitute ? nameLines(c.substitute.name_ar, c.substitute.name_en, languagePref, arabicFirst) : null;
                const over = isOverCapacity(c) ? c.child_count - (c.capacity ?? 0) : 0;
                const pct = c.capacity ? (c.child_count / c.capacity) * 100 : null;
                const fillTone = pct === null ? 'bg-primary' : pct > 100 ? 'bg-error' : pct >= 90 ? 'bg-warning' : 'bg-success';
                return (
                  <Tr key={c.id}>
                    <Td className="max-w-[220px]">
                      <NameStack primary={name.primary} secondary={name.secondary} strong />
                    </Td>
                    <Td className="text-on-surface-variant">{c.grade_level ?? '—'}</Td>
                    <Td>
                      {c.room_number ? (
                        <span className="inline-flex items-center gap-1 rounded-md bg-surface-high px-2 py-1 text-xs font-medium text-on-surface">
                          <span className="material-symbols-outlined text-sm" aria-hidden>meeting_room</span>
                          {c.room_number}
                        </span>
                      ) : (
                        <span className="text-on-surface-variant">—</span>
                      )}
                    </Td>
                    <Td className="max-w-[220px]">
                      {lead ? (
                        <NameStack primary={lead.primary} secondary={lead.secondary} />
                      ) : (
                        <StatusPill tone="warning" icon="person_alert">{t('admin.classes.list.noLead')}</StatusPill>
                      )}
                    </Td>
                    <Td className="max-w-[200px]">
                      {backup ? (
                        <NameStack primary={backup.primary} secondary={backup.secondary} />
                      ) : (
                        <span className="text-on-surface-variant">{t('admin.classes.list.noBackup')}</span>
                      )}
                    </Td>
                    <Td className="tabular-nums text-on-surface-variant">{c.assistants.length}</Td>
                    <Td>
                      <div className="min-w-[140px]">
                        <div className="flex items-center justify-between gap-2">
                          <span className={cn('font-semibold tabular-nums', over ? 'text-error' : 'text-on-surface')}>
                            {c.child_count}
                            {c.capacity != null ? ` / ${c.capacity}` : ''}
                          </span>
                          {over ? (
                            <span className="rounded-full bg-error/10 px-2 py-0.5 text-[11px] font-semibold text-error">
                              {t('admin.classes.list.overBy', { count: over })}
                            </span>
                          ) : null}
                        </div>
                        {pct !== null ? (
                          <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-surface-high">
                            <div className={cn('h-full rounded-full', fillTone)} style={{ width: `${Math.min(100, pct)}%` }} />
                          </div>
                        ) : null}
                      </div>
                    </Td>
                    <Td align="end">
                      <div className="flex items-center justify-end gap-1">
                        <ActionGate feature="classes" action="view">
                          <IconAction icon="visibility" label={`${t('common.view')}: ${name.primary}`} onClick={() => setViewClassId(c.id)} />
                        </ActionGate>
                        <ActionGate feature="classes" action="update">
                          <IconAction icon="edit" label={`${t('common.edit')}: ${name.primary}`} to={`/admin/classes/${c.id}`} />
                        </ActionGate>
                        <ActionGate feature="classes" action="delete">
                          <IconAction
                            icon="delete"
                            label={`${t('common.delete')}: ${name.primary}`}
                            onClick={() => void onDelete(c.id)}
                            disabled={deleteMut.isPending}
                            danger
                          />
                        </ActionGate>
                      </div>
                    </Td>
                  </Tr>
                );
              })}
            </TBody>
          </DataTable>
        )}
      </TableCard>

      <ClassViewDialog
        classId={viewClassId}
        open={viewClassId !== null}
        onOpenChange={(o) => {
          if (!o) setViewClassId(null);
        }}
      />
    </div>
  );
}
