import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router-dom';

import { ActionGate } from '@/components/shared/ActionGate';
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
import { MaterialSymbol } from '@/components/ui/MaterialSymbol';
import { NameStack } from '@/components/ui/NameStack';
import { PageHeader } from '@/components/ui/PageHeader';
import { Select } from '@/components/ui/select';
import { StatTile } from '@/components/ui/StatTile';
import { capacityFill } from '@/features/classes/classCapacity';
import { DeleteClassDialog } from '@/features/class-editor/DeleteClassDialog';
import { ClassCapacityMeter } from '@/features/classes/ClassCapacityMeter';
import { ClassesSectionTabs } from '@/features/classes/ClassesSectionTabs';
import { useActiveNurseryId } from '@/hooks/useActiveNurseryId';
import { useAdminBasePath } from '@/hooks/useAdminBasePath';
import { useBilingualNames } from '@/hooks/useBilingualNames';
import { useNurseryClasses, type NurseryClassRow } from '@/hooks/useClassStaff';
import { usePagination } from '@/hooks/usePagination';
import { useTableSort } from '@/hooks/useTableSort';

type SortKey = 'name' | 'grade' | 'lead' | 'roster';
type QuickFilter = 'all' | 'over' | 'noLead';

const isOverCapacity = (c: NurseryClassRow) => capacityFill(c.child_count, c.capacity).over > 0;

/** The nursery's classes: a row opens the class (its children, team and day); edit and delete sit at its end. */
export function AdminClassesListPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const base = useAdminBasePath();
  const { activeNurseryId } = useActiveNurseryId();
  const names = useBilingualNames(activeNurseryId);
  const classesQuery = useNurseryClasses(activeNurseryId);
  // Deleting asks where the class's children go first (DeleteClassDialog).
  const [deleting, setDeleting] = useState<NurseryClassRow | null>(null);

  const [search, setSearch] = useState('');
  const [quickFilter, setQuickFilter] = useState<QuickFilter>('all');
  const sort = useTableSort<SortKey>('name');

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

  const filtered = useMemo<NurseryClassRow[]>(() => {
    const q = search.trim().toLowerCase();
    return (classesQuery.data ?? []).filter((c) => {
      if (quickFilter === 'over' && !isOverCapacity(c)) return false;
      if (quickFilter === 'noLead' && c.lead) return false;
      if (!q) return true;
      return `${c.name_ar} ${c.name_en} ${c.grade_level ?? ''} ${c.room_number ?? ''}`.toLowerCase().includes(q);
    });
  }, [classesQuery.data, search, quickFilter]);
  const person = (p: NurseryClassRow['lead']) => (p ? names.text(p.name_ar, p.name_en) : '—');
  const rows = sort.sorted(filtered, {
    name: (a, b) => names.text(a.name_ar, a.name_en).localeCompare(names.text(b.name_ar, b.name_en)),
    grade: (a, b) => (a.grade_level ?? '').localeCompare(b.grade_level ?? ''),
    lead: (a, b) => person(a.lead).localeCompare(person(b.lead)),
    roster: (a, b) => a.child_count - b.child_count,
  });

  const filtersActive = quickFilter !== 'all' || Boolean(search.trim());
  const clearFilters = () => {
    setQuickFilter('all');
    setSearch('');
  };
  const toggleQuick = (value: QuickFilter) => setQuickFilter((current) => (current === value ? 'all' : value));
  const pager = usePagination(rows, 10, `${quickFilter}|${search.trim().toLowerCase()}|${sort.key}`);
  const sortFor = sort.sortFor;

  const capacity = capacityFill(stats.children, stats.capacity || null);

  return (
    <div className="space-y-5 pb-8">
      <ClassesSectionTabs />
      <PageHeader
        icon="school"
        title={t('admin.classes.list.title')}
        description={t('admin.classes.list.subtitle')}
        actions={
          <ActionGate feature="classes" action="create">
            <Button asChild className="gap-1">
              <Link to={`${base}/classes/new`}>
                <MaterialSymbol name="add" size="text-base" />
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
            value={capacity.pct === null ? stats.children : `${stats.children} · ${Math.round(capacity.pct)}%`}
            helper={stats.capacity > 0 ? t('admin.classes.list.stats.capacityHelper', { capacity: stats.capacity }) : undefined}
            tone={capacity.tone}
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
        description={t('admin.classes.list.openHint')}
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
        pagination={classesQuery.isLoading || rows.length === 0 ? null : <TablePagination pager={pager} pageSizeOptions={[10, 25, 50]} />}
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
          <DataTable minWidth={1040}>
            <THead>
              <Th sort={sortFor('name')}>{t('admin.classes.list.colName')}</Th>
              <Th sort={sortFor('grade')}>{t('admin.classes.list.colGrade')}</Th>
              <Th>{t('admin.classes.list.colRoom')}</Th>
              <Th sort={sortFor('lead')}>{t('admin.classes.list.colLead')}</Th>
              <Th>{t('admin.classes.list.colBackup')}</Th>
              <Th>{t('admin.classes.list.colAssistants')}</Th>
              <Th>{t('admin.classes.list.colNannies')}</Th>
              <Th sort={sortFor('roster')}>{t('admin.classes.list.colRoster')}</Th>
              <Th align="end">{t('common.actions')}</Th>
            </THead>
            <TBody>
              {pager.pageItems.map((c) => {
                const name = names.lines(c.name_ar, c.name_en);
                return (
                  <Tr key={c.id} onClick={() => navigate(`${base}/classes/${c.id}`)} className="group" data-testid="class-row">
                    <Td className="max-w-[220px]">
                      <div className="flex items-center gap-2">
                        <NameStack name={name} strong />
                        <MaterialSymbol
                          name="chevron_right"
                          size="text-base"
                          className="text-on-surface-variant opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100 rtl:rotate-180"
                        />
                      </div>
                    </Td>
                    <Td className="text-on-surface-variant">{c.grade_level ?? '—'}</Td>
                    <Td>
                      {c.room_number ? (
                        <span className="inline-flex items-center gap-1 rounded-md bg-surface-high px-2 py-1 text-xs font-medium text-on-surface">
                          <MaterialSymbol name="meeting_room" size="text-sm" />
                          {c.room_number}
                        </span>
                      ) : (
                        <span className="text-on-surface-variant">—</span>
                      )}
                    </Td>
                    <Td className="max-w-[220px]">
                      {c.lead ? (
                        <NameStack name={names.lines(c.lead.name_ar, c.lead.name_en)} />
                      ) : (
                        <StatusPill tone="warning" icon="person_alert">{t('admin.classes.list.noLead')}</StatusPill>
                      )}
                    </Td>
                    <Td className="max-w-[200px]">
                      {c.substitute ? (
                        <NameStack name={names.lines(c.substitute.name_ar, c.substitute.name_en)} />
                      ) : (
                        <span className="text-on-surface-variant">{t('admin.classes.list.noBackup')}</span>
                      )}
                    </Td>
                    <Td className="tabular-nums text-on-surface-variant">{c.assistants.length}</Td>
                    <Td className="tabular-nums text-on-surface-variant">{c.nannies.length}</Td>
                    <Td>
                      <ClassCapacityMeter count={c.child_count} capacity={c.capacity} />
                    </Td>
                    <Td align="end">
                      <div className="flex items-center justify-end gap-1">
                        <ActionGate feature="classes" action="update">
                          <IconAction icon="edit" label={`${t('common.edit')}: ${name.primary}`} to={`${base}/classes/${c.id}/edit`} />
                        </ActionGate>
                        <ActionGate feature="classes" action="delete">
                          <IconAction
                            icon="delete"
                            label={`${t('common.delete')}: ${name.primary}`}
                            onClick={() => setDeleting(c)}
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

      {deleting ? (
        <DeleteClassDialog
          classId={deleting.id}
          className={names.text(deleting.name_ar, deleting.name_en)}
          childrenCount={deleting.child_count}
          classes={(classesQuery.data ?? [])
            .filter((c) => c.id !== deleting.id)
            .map((c) => ({ id: c.id, nameAr: c.name_ar, nameEn: c.name_en, gradeLevel: c.grade_level, capacity: c.capacity, children: c.child_count }))}
          onDeleted={() => setDeleting(null)}
          onClose={() => setDeleting(null)}
        />
      ) : null}
    </div>
  );
}
