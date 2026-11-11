import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation } from 'react-router-dom';

import { TableLoading } from '@/components/ui/DataTable';
import { FilterBar, SearchInput } from '@/components/ui/FilterBar';
import { FilterChips } from '@/components/ui/FilterChips';
import { FilterField } from '@/components/ui/FilterField';
import { LoadError } from '@/components/ui/LoadError';
import { MaterialSymbol } from '@/components/ui/MaterialSymbol';
import { PageHeader } from '@/components/ui/PageHeader';
import { Select } from '@/components/ui/select';
import { StatTile } from '@/components/ui/StatTile';
import { EditTeamDialog } from '@/features/class-team/EditTeamDialog';
import { TeamChangesTable, type TeamChangeRow } from '@/features/class-team/TeamChangesTable';
import { TeamsTable } from '@/features/class-team/TeamsTable';
import { TeamTeachersTable } from '@/features/class-team/TeamTeachersTable';
import { useClassTeamEditing } from '@/features/class-team/useClassTeamEditing';
import { ClassesSectionTabs } from '@/features/classes/ClassesSectionTabs';
import { useActiveNurseryId } from '@/hooks/useActiveNurseryId';
import { useAdminBasePath } from '@/hooks/useAdminBasePath';
import { useAuthSession } from '@/hooks/useAuthSession';
import { useSearchParam } from '@/hooks/useSearchParam';
import { useUserProfile } from '@/hooks/useUserProfile';
import {
  CLASS_FILTERS,
  classTeamErrorKey,
  filterClasses,
  filterTeachers,
  pickName,
  teamSummary,
  type ClassFilter,
  type TeacherFilter,
} from '@/lib/classTeam';
import { adminLinks } from '@/lib/adminLinks';

type View = 'classes' | 'teachers' | 'changes';

const FILTER_LABEL: Record<ClassFilter, string> = {
  all: 'classTeam.filters.allClasses',
  attention: 'classTeam.filters.attention',
  no_lead: 'classTeam.filters.noLead',
  no_backup: 'classTeam.filters.noBackup',
  no_assistant: 'classTeam.filters.noAssistant',
  no_nanny: 'classTeam.filters.noNanny',
  complete: 'classTeam.filters.complete',
};

/**
 * Teams (a tab of the Classes section): each class's lead, backup, assistants and nannies as rows,
 * what each team is missing, every teacher and the latest changes. A row opens its team to change it
 * (`?edit=<class>` opens one from a link). The nursery admin and staff with the class team permission
 * (a head of teachers, from their own menu) change it; others with view access only see it.
 */
export function ClassTeamPage() {
  const { t, i18n } = useTranslation();
  const { user } = useAuthSession();
  const { data: profile } = useUserProfile(user?.id);
  const { activeNurseryId } = useActiveNurseryId();
  const nurseryId = activeNurseryId ?? profile?.nursery_id ?? null;
  const editing = useClassTeamEditing(nurseryId);
  const { query, data, staff, classes, canUpdate, nameOf } = editing;
  const base = useAdminBasePath();
  const inAdmin = !useLocation().pathname.startsWith('/teacher');
  const classHref = inAdmin ? (id: string) => adminLinks(base).classPage(id) : undefined;
  // The team being changed is kept in the address (?edit=<class>): a link opens it straight away.
  const [editId, openTeam] = useSearchParam('edit');
  const editingClass = classes.find((c) => c.id === editId) ?? null;

  const [view, setView] = useState<View>('classes');
  const [classSearch, setClassSearch] = useState('');
  const [classFilter, setClassFilter] = useState<ClassFilter>('all');
  const [teacherSearch, setTeacherSearch] = useState('');
  const [teacherFilter, setTeacherFilter] = useState<TeacherFilter>('all');

  const classById = useMemo(() => new Map(classes.map((c) => [c.id, c])), [classes]);
  const summary = teamSummary({ classes, staff });
  const shownClasses = useMemo(() => filterClasses(classes, staff, classSearch, classFilter), [classes, staff, classSearch, classFilter]);
  const shownTeachers = useMemo(() => filterTeachers(staff, teacherSearch, teacherFilter), [staff, teacherSearch, teacherFilter]);
  const changeRows: TeamChangeRow[] = (data?.changes ?? []).map((c) => {
    const cls = classById.get(c.class_id);
    return {
      id: c.id,
      action: c.action,
      classId: c.class_id,
      className: cls ? pickName(cls, i18n.language) : '—',
      personName: nameOf(c.user_id),
      role: c.role,
      by: i18n.language.startsWith('ar') ? c.changed_by_ar || c.changed_by_en || '' : c.changed_by_en || c.changed_by_ar || '',
      at: c.created_at,
    };
  });

  // A number at the top shows the classes it counts (again: all of them).
  const pickClassFilter = (filter: ClassFilter) => {
    setView('classes');
    setClassFilter((current) => (current === filter ? 'all' : filter));
  };
  const classTile = (filter: ClassFilter, icon: string, label: string, value: number, tone: 'error' | 'warning') => (
    <StatTile
      icon={icon}
      label={label}
      value={value}
      tone={value > 0 ? tone : 'success'}
      onClick={() => pickClassFilter(filter)}
      active={view === 'classes' && classFilter === filter}
    />
  );

  return (
    <div className="space-y-5 pb-8">
      <ClassesSectionTabs />
      <PageHeader icon="groups" title={t('classTeam.title')} description={t('classTeam.description')}>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
          <StatTile icon="school" label={t('classTeam.tiles.classes')} value={summary.classes} onClick={() => pickClassFilter('all')} active={view === 'classes' && classFilter === 'all'} />
          {classTile('no_lead', 'person_off', t('classTeam.tiles.withoutLead'), summary.withoutLead, 'error')}
          {classTile('no_backup', 'swap_horiz', t('classTeam.tiles.withoutBackup'), summary.withoutBackup, 'warning')}
          {classTile('no_assistant', 'group_remove', t('classTeam.tiles.withoutAssistant'), summary.withoutAssistant, 'warning')}
          {classTile('no_nanny', 'diversity_1', t('classTeam.tiles.withoutNanny'), summary.withoutNanny, 'warning')}
          <StatTile
            icon="no_accounts"
            label={t('classTeam.tiles.teachersWithoutClass')}
            value={summary.teachersWithoutClass}
            tone={summary.teachersWithoutClass > 0 ? 'warning' : 'neutral'}
            onClick={() => {
              setView('teachers');
              setTeacherFilter('no_class');
            }}
            active={view === 'teachers' && teacherFilter === 'no_class'}
          />
        </div>
      </PageHeader>

      {data && !canUpdate ? (
        <p className="flex items-center gap-2 rounded-xl border border-outline-variant bg-surface-container-lowest px-4 py-3 text-sm text-on-surface-variant">
          <MaterialSymbol name="visibility" className="text-base" />
          {t('classTeam.readOnly')}
        </p>
      ) : null}

      <FilterChips
        value={view}
        onChange={setView}
        label={t('classTeam.tabs.label')}
        options={[
          { value: 'classes', label: t('classTeam.tabs.classes'), count: classes.length },
          { value: 'teachers', label: t('classTeam.tabs.teachers'), count: staff.length },
          { value: 'changes', label: t('classTeam.tabs.changes'), count: data?.changes.length },
        ]}
      />

      {query.isPending ? (
        <TableLoading rows={6} />
      ) : query.isError ? (
        <LoadError message={t(`classTeam.errors.${classTeamErrorKey(query.error)}`)} onRetry={() => void query.refetch()} />
      ) : view === 'classes' ? (
        <TeamsTable
          classes={shownClasses}
          staff={staff}
          nameOf={nameOf}
          canUpdate={canUpdate}
          onEdit={(cls) => openTeam(cls.id)}
          classHref={classHref}
          total={classes.length}
          resetKey={`${classFilter}|${classSearch.trim().toLowerCase()}`}
          filters={
            <FilterBar
              onClear={() => {
                setClassSearch('');
                setClassFilter('all');
              }}
              canClear={classSearch.trim() !== '' || classFilter !== 'all'}
            >
              <FilterField label={t('classTeam.filters.search')} className="sm:flex-[2]">
                <SearchInput value={classSearch} onChange={setClassSearch} placeholder={t('classTeam.filters.searchClasses')} />
              </FilterField>
              <FilterField label={t('classTeam.filters.show')}>
                <Select value={classFilter} onChange={(e) => setClassFilter(e.target.value as ClassFilter)} aria-label={t('classTeam.filters.show')}>
                  {CLASS_FILTERS.map((f) => (
                    <option key={f} value={f}>{t(FILTER_LABEL[f])}</option>
                  ))}
                </Select>
              </FilterField>
            </FilterBar>
          }
        />
      ) : view === 'teachers' ? (
        <TeamTeachersTable
          staff={shownTeachers}
          classById={classById}
          total={staff.length}
          resetKey={`${teacherFilter}|${teacherSearch.trim().toLowerCase()}`}
          filters={
            <FilterBar
              onClear={() => {
                setTeacherSearch('');
                setTeacherFilter('all');
              }}
              canClear={teacherSearch.trim() !== '' || teacherFilter !== 'all'}
            >
              <FilterField label={t('classTeam.filters.search')} className="sm:flex-[2]">
                <SearchInput value={teacherSearch} onChange={setTeacherSearch} placeholder={t('classTeam.filters.searchTeachers')} />
              </FilterField>
              <FilterField label={t('classTeam.filters.show')}>
                <Select value={teacherFilter} onChange={(e) => setTeacherFilter(e.target.value as TeacherFilter)} aria-label={t('classTeam.filters.show')}>
                  <option value="all">{t('classTeam.filters.allTeachers')}</option>
                  <option value="no_class">{t('classTeam.filters.noClass')}</option>
                  <option value="lead">{t('classTeam.filters.leads')}</option>
                  <option value="assistant">{t('classTeam.filters.assistants')}</option>
                  <option value="nanny">{t('classTeam.filters.nannies')}</option>
                  <option value="substitute">{t('classTeam.filters.substitutes')}</option>
                </Select>
              </FilterField>
            </FilterBar>
          }
        />
      ) : (
        <TeamChangesTable rows={changeRows} title={t('classTeam.tabs.changes')} />
      )}

      {editingClass ? (
        <EditTeamDialog cls={editingClass} editing={editing} classHref={classHref?.(editingClass.id)} onClose={() => openTeam(null)} />
      ) : null}
    </div>
  );
}
