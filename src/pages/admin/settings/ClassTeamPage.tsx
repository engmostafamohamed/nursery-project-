import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { confirm } from '@/components/ui/confirm';
import { DataTable, StatusPill, TableCard, TableEmpty, TableLoading, TBody, Td, Th, THead, Tr } from '@/components/ui/DataTable';
import { FilterBar, SearchInput } from '@/components/ui/FilterBar';
import { FilterChips } from '@/components/ui/FilterChips';
import { FilterField } from '@/components/ui/FilterField';
import { MaterialSymbol } from '@/components/ui/MaterialSymbol';
import { PageHeader } from '@/components/ui/PageHeader';
import { Select } from '@/components/ui/select';
import { StatTile } from '@/components/ui/StatTile';
import { useActiveNurseryId } from '@/hooks/useActiveNurseryId';
import { useAuthSession } from '@/hooks/useAuthSession';
import { useClassTeamActions, useClassTeams } from '@/hooks/useClassTeams';
import { useUserProfile } from '@/hooks/useUserProfile';
import {
  assistants,
  candidatesFor,
  classTeamErrorKey,
  filterClasses,
  filterTeachers,
  lead,
  nannies,
  pickName,
  substitute,
  teamSummary,
  type ClassFilter,
  type ClassTeamRole,
  type TeacherFilter,
  type TeamClass,
  type TeamTeacher,
} from '@/lib/classTeam';
import { cn } from '@/lib/utils';

type View = 'classes' | 'teachers' | 'changes';
type T = ReturnType<typeof useTranslation>['t'];

function roleName(t: T, role: ClassTeamRole): string {
  if (role === 'lead') return t('classTeam.roles.lead');
  if (role === 'assistant') return t('classTeam.roles.assistant');
  if (role === 'nanny') return t('classTeam.roles.nanny');
  return t('classTeam.roles.substitute');
}

function departmentName(t: T, department: string | null): string | null {
  if (department === 'finance') return t('classTeam.departments.finance');
  if (department === 'hr') return t('classTeam.departments.hr');
  if (department === 'operations') return t('classTeam.departments.operations');
  return null;
}

/**
 * Team & classes: who leads, assists, cares for (the nannies) and stands in for each class. The nursery admin and staff with
 * the class team permission (a head of teachers) change it; others with view access only see it.
 * Shared by the admin settings and the head of teachers' own sidebar.
 */
export function ClassTeamPage() {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const { user } = useAuthSession();
  const { data: profile } = useUserProfile(user?.id);
  const { activeNurseryId } = useActiveNurseryId();
  const nurseryId = activeNurseryId ?? profile?.nursery_id ?? null;
  const query = useClassTeams(nurseryId);
  const { assign, remove } = useClassTeamActions(nurseryId);

  const [view, setView] = useState<View>('classes');
  const [classSearch, setClassSearch] = useState('');
  const [classFilter, setClassFilter] = useState<ClassFilter>('all');
  const [teacherSearch, setTeacherSearch] = useState('');
  const [teacherFilter, setTeacherFilter] = useState<TeacherFilter>('all');

  const data = query.data;
  const staff = useMemo(() => data?.staff ?? [], [data]);
  const classes = useMemo(() => data?.classes ?? [], [data]);
  const byId = useMemo(() => new Map(staff.map((s) => [s.id, s])), [staff]);
  const classById = useMemo(() => new Map(classes.map((c) => [c.id, c])), [classes]);
  const summary = teamSummary({ classes, staff });
  const canUpdate = Boolean(data?.can_update);
  const busy = assign.isPending || remove.isPending;
  const nameOf = (id: string | null) => (id ? pickName(byId.get(id) ?? { name_ar: null, name_en: null }, lang) : '');

  const shownClasses = useMemo(() => filterClasses(classes, staff, classSearch, classFilter), [classes, staff, classSearch, classFilter]);
  const shownTeachers = useMemo(() => filterTeachers(staff, teacherSearch, teacherFilter), [staff, teacherSearch, teacherFilter]);

  const failed = (error: unknown) => toast.error(t(`classTeam.errors.${classTeamErrorKey(error)}`));

  /** Puts a teacher in a place; replacing the lead or backup asks first. */
  const place = async (cls: TeamClass, role: ClassTeamRole, userId: string) => {
    const current = role === 'lead' ? lead(cls) : role === 'substitute' ? substitute(cls) : null;
    if (current && current !== userId) {
      const ok = await confirm({
        title: t('classTeam.confirm.replaceTitle', { role: roleName(t, role) }),
        description: t('classTeam.confirm.replaceBody', { old: nameOf(current), new: nameOf(userId), class: pickName(cls, lang) }),
        confirmText: t('classTeam.confirm.replace'),
      });
      if (!ok) return;
    }
    try {
      await assign.mutateAsync({ classId: cls.id, userId, role });
      toast.success(t('classTeam.saved'));
    } catch (error) {
      failed(error);
    }
  };

  const takeOut = async (cls: TeamClass, userId: string) => {
    const ok = await confirm({
      title: t('classTeam.confirm.removeTitle', { name: nameOf(userId), class: pickName(cls, lang) }),
      description: t('classTeam.confirm.removeBody'),
      confirmText: t('classTeam.confirm.remove'),
      variant: 'danger',
    });
    if (!ok) return;
    try {
      await remove.mutateAsync({ classId: cls.id, userId });
      toast.success(t('classTeam.removed'));
    } catch (error) {
      failed(error);
    }
  };

  const pickClassFilter = (filter: ClassFilter) => {
    setView('classes');
    setClassFilter(filter);
  };

  return (
    <div className="space-y-5 pb-8">
      <PageHeader icon="groups" title={t('classTeam.title')} description={t('classTeam.description')}>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
          <StatTile icon="school" label={t('classTeam.tiles.classes')} value={summary.classes} onClick={() => pickClassFilter('all')} active={view === 'classes' && classFilter === 'all'} />
          <StatTile
            icon="person_off"
            label={t('classTeam.tiles.withoutLead')}
            value={summary.withoutLead}
            tone={summary.withoutLead > 0 ? 'error' : 'success'}
            onClick={() => pickClassFilter('no_lead')}
            active={view === 'classes' && classFilter === 'no_lead'}
          />
          <StatTile
            icon="group_remove"
            label={t('classTeam.tiles.withoutAssistant')}
            value={summary.withoutAssistant}
            tone={summary.withoutAssistant > 0 ? 'warning' : 'success'}
            onClick={() => pickClassFilter('no_assistant')}
            active={view === 'classes' && classFilter === 'no_assistant'}
          />
          <StatTile
            icon="diversity_1"
            label={t('classTeam.tiles.withoutNanny')}
            value={summary.withoutNanny}
            tone={summary.withoutNanny > 0 ? 'warning' : 'success'}
            onClick={() => pickClassFilter('no_nanny')}
            active={view === 'classes' && classFilter === 'no_nanny'}
          />
          <StatTile
            icon="badge"
            label={t('classTeam.tiles.teachers')}
            value={summary.teachers}
            onClick={() => {
              setView('teachers');
              setTeacherFilter('all');
            }}
            active={view === 'teachers' && teacherFilter === 'all'}
          />
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
          { value: 'changes', label: t('classTeam.tabs.changes') },
        ]}
      />

      {query.isPending ? (
        <TableLoading rows={6} />
      ) : query.isError ? (
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-error/30 bg-error/5 p-4 text-sm text-error" role="alert">
          <MaterialSymbol name="error" className="text-xl" />
          <span className="flex-1">{t(`classTeam.errors.${classTeamErrorKey(query.error)}`)}</span>
          <Button type="button" size="sm" variant="outline" onClick={() => void query.refetch()}>
            {t('common.retry')}
          </Button>
        </div>
      ) : view === 'classes' ? (
        <section className="space-y-4">
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
              <Select value={classFilter} onChange={(e) => setClassFilter(e.target.value as ClassFilter)}>
                <option value="all">{t('classTeam.filters.allClasses')}</option>
                <option value="no_lead">{t('classTeam.filters.noLead')}</option>
                <option value="no_assistant">{t('classTeam.filters.noAssistant')}</option>
                <option value="no_nanny">{t('classTeam.filters.noNanny')}</option>
              </Select>
            </FilterField>
          </FilterBar>
          {shownClasses.length ? (
            <div className="grid gap-4 md:grid-cols-2 2xl:grid-cols-3">
              {shownClasses.map((cls) => (
                <ClassCard
                  key={cls.id}
                  cls={cls}
                  staff={staff}
                  nameOf={nameOf}
                  canUpdate={canUpdate}
                  busy={busy}
                  onPlace={(role, userId) => void place(cls, role, userId)}
                  onRemove={(userId) => void takeOut(cls, userId)}
                />
              ))}
            </div>
          ) : (
            <TableEmpty icon="school" title={classes.length ? t('classTeam.empty.noMatch') : t('classTeam.empty.classes')} />
          )}
        </section>
      ) : view === 'teachers' ? (
        <TableCard
          title={t('classTeam.tabs.teachers')}
          count={t('classTeam.teachersTable.count', { count: shownTeachers.length })}
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
                <Select value={teacherFilter} onChange={(e) => setTeacherFilter(e.target.value as TeacherFilter)}>
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
        >
          {shownTeachers.length ? (
            <DataTable minWidth={820}>
              <THead>
                <Th>{t('classTeam.teachersTable.teacher')}</Th>
                <Th>{t('classTeam.teachersTable.role')}</Th>
                <Th>{t('classTeam.teachersTable.classes')}</Th>
                <Th>{t('classTeam.teachersTable.status')}</Th>
              </THead>
              <TBody>
                {shownTeachers.map((teacher) => (
                  <TeacherRow key={teacher.id} teacher={teacher} classById={classById} />
                ))}
              </TBody>
            </DataTable>
          ) : (
            <TableEmpty icon="badge" title={staff.length ? t('classTeam.empty.noMatch') : t('classTeam.empty.teachers')} />
          )}
        </TableCard>
      ) : (
        <TableCard title={t('classTeam.tabs.changes')}>
          {data?.changes.length ? (
            <ul className="divide-y divide-outline-variant">
              {data.changes.map((change) => {
                const cls = classById.get(change.class_id);
                const vars = {
                  name: nameOf(change.user_id),
                  class: cls ? pickName(cls, lang) : '—',
                  role: change.role ? roleName(t, change.role) : '',
                };
                const by = lang.startsWith('ar') ? change.changed_by_ar || change.changed_by_en : change.changed_by_en || change.changed_by_ar;
                return (
                  <li key={change.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm sm:px-5">
                    <span className="flex items-center gap-2 text-on-surface">
                      <MaterialSymbol
                        name={change.action === 'removed' ? 'person_remove' : change.action === 'changed' ? 'swap_horiz' : 'person_add'}
                        className={cn('text-base', change.action === 'removed' ? 'text-error' : 'text-primary')}
                      />
                      {change.action === 'assigned'
                        ? t('classTeam.changes.assigned', vars)
                        : change.action === 'changed'
                          ? t('classTeam.changes.changed', vars)
                          : t('classTeam.changes.removed', vars)}
                    </span>
                    <span className="text-xs text-on-surface-variant">
                      {by ? `${t('classTeam.changes.by', { name: by })} · ` : ''}
                      {new Date(change.created_at).toLocaleString(lang.startsWith('ar') ? 'ar-EG' : 'en-GB', {
                        day: 'numeric',
                        month: 'short',
                        hour: 'numeric',
                        minute: '2-digit',
                        hour12: true,
                      })}
                    </span>
                  </li>
                );
              })}
            </ul>
          ) : (
            <TableEmpty icon="history" title={t('classTeam.changes.empty')} />
          )}
        </TableCard>
      )}
    </div>
  );
}

/** A class: its lead teacher, backup teacher, assistants and nannies, each changeable in place. */
function ClassCard({
  cls,
  staff,
  nameOf,
  canUpdate,
  busy,
  onPlace,
  onRemove,
}: {
  cls: TeamClass;
  staff: TeamTeacher[];
  nameOf: (id: string | null) => string;
  canUpdate: boolean;
  busy: boolean;
  onPlace: (role: ClassTeamRole, userId: string) => void;
  onRemove: (userId: string) => void;
}) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const leadId = lead(cls);
  const substituteId = substitute(cls);
  const teacherOption = (s: TeamTeacher) => (
    <option key={s.id} value={s.id}>
      {pickName(s, lang)}
      {s.classes.length ? ` (${s.classes.length})` : ''}
    </option>
  );

  /** One place (lead or backup): a picker for whoever may change it, the name otherwise. */
  const slot = (role: 'lead' | 'substitute', current: string | null) => (
    <div className="space-y-1">
      <p className="flex items-center gap-1.5 text-xs font-semibold text-on-surface-variant">
        <MaterialSymbol name={role === 'lead' ? 'star' : 'swap_horiz'} className="text-sm" />
        {t(role === 'lead' ? 'classTeam.roles.lead' : 'classTeam.roles.substitute')}
      </p>
      {canUpdate ? (
        <div className="flex items-center gap-2">
          <Select
            className={cn('h-10 text-sm', !current && role === 'lead' && 'border-error')}
            aria-label={t(role === 'lead' ? 'classTeam.roles.lead' : 'classTeam.roles.substitute')}
            value={current ?? ''}
            disabled={busy}
            onChange={(e) => {
              if (e.target.value) onPlace(role, e.target.value);
            }}
          >
            <option value="" disabled>
              {t('classTeam.card.choose')}
            </option>
            {current ? <option value={current}>{nameOf(current)}</option> : null}
            {candidatesFor(cls, staff, role).map(teacherOption)}
          </Select>
          {current ? (
            <Button type="button" variant="ghost" size="icon" disabled={busy} aria-label={t('classTeam.card.remove', { name: nameOf(current) })} onClick={() => onRemove(current)}>
              <MaterialSymbol name="person_remove" className="text-error" />
            </Button>
          ) : null}
        </div>
      ) : (
        <p className={cn('text-sm', current ? 'font-medium text-on-surface' : 'text-on-surface-variant')}>{current ? nameOf(current) : t('classTeam.card.none')}</p>
      )}
    </div>
  );

  // An assistant or a nanny is any active member of staff not already in this class.
  const freeStaff = staff.filter((s) => s.status === 'active' && !cls.members.some((m) => m.user_id === s.id));

  /** The places a class has several of: assistants and nannies. */
  const many = (role: 'assistant' | 'nanny', ids: string[]) => (
    <div className="space-y-2" data-testid={`team-${role}s`}>
      <p className="flex items-center gap-1.5 text-xs font-semibold text-on-surface-variant">
        <MaterialSymbol name={role === 'assistant' ? 'group' : 'diversity_1'} className="text-sm" />
        {t(role === 'assistant' ? 'classTeam.roles.assistant' : 'classTeam.roles.nanny')}
      </p>
      {ids.length ? (
        <ul className="flex flex-wrap gap-2">
          {ids.map((id) => (
            <li key={id} className="inline-flex items-center gap-1 rounded-full border border-outline-variant bg-surface-container-lowest py-1 ps-3 pe-1 text-sm">
              {nameOf(id)}
              {canUpdate ? (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => onRemove(id)}
                  aria-label={t('classTeam.card.remove', { name: nameOf(id) })}
                  className="inline-flex h-6 w-6 items-center justify-center rounded-full text-on-surface-variant hover:bg-error/10 hover:text-error"
                >
                  <MaterialSymbol name="close" className="text-sm" />
                </button>
              ) : null}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-on-surface-variant">{t(role === 'assistant' ? 'classTeam.card.noAssistants' : 'classTeam.card.noNannies')}</p>
      )}
      {canUpdate && freeStaff.length ? (
        <Select
          className="h-10 text-sm"
          aria-label={t(role === 'assistant' ? 'classTeam.card.addAssistant' : 'classTeam.card.addNanny')}
          value=""
          disabled={busy}
          onChange={(e) => {
            if (e.target.value) onPlace(role, e.target.value);
          }}
        >
          <option value="">{t(role === 'assistant' ? 'classTeam.card.addAssistant' : 'classTeam.card.addNanny')}</option>
          {freeStaff.map(teacherOption)}
        </Select>
      ) : null}
    </div>
  );

  return (
    <article className="flex flex-col gap-4 rounded-xl border border-outline-variant bg-surface p-4 shadow-sm">
      <header className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="truncate text-base font-semibold text-on-surface">{pickName(cls, lang)}</h3>
          <p className="text-xs text-on-surface-variant">
            {t('classTeam.card.children', { count: cls.children_count })}
            {cls.capacity ? ` · ${t('classTeam.card.capacity', { capacity: cls.capacity })}` : ''}
            {cls.room_number ? ` · ${t('classTeam.card.room', { room: cls.room_number })}` : ''}
          </p>
        </div>
        {!leadId ? (
          <StatusPill tone="error" icon="person_off">{t('classTeam.filters.noLead')}</StatusPill>
        ) : (
          <StatusPill tone="success" icon="check_circle">{t('classTeam.card.ready')}</StatusPill>
        )}
      </header>

      <div className="grid gap-3 sm:grid-cols-2">
        {slot('lead', leadId)}
        {slot('substitute', substituteId)}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        {many('assistant', assistants(cls))}
        {many('nanny', nannies(cls))}
      </div>
    </article>
  );
}

function TeacherRow({ teacher, classById }: { teacher: TeamTeacher; classById: Map<string, TeamClass> }) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const title = lang.startsWith('ar') ? teacher.role_title_ar || teacher.role_title_en : teacher.role_title_en || teacher.role_title_ar;
  const department = departmentName(t, teacher.department);
  return (
    <Tr>
      <Td>
        <p className="font-medium text-on-surface">{pickName(teacher, lang)}</p>
        <p className="text-xs text-on-surface-variant" dir="ltr">{teacher.email || teacher.phone || ''}</p>
      </Td>
      <Td>
        <p>{title || t('classTeam.teachersTable.teacherRole')}</p>
        {department ? <p className="text-xs text-on-surface-variant">{department}</p> : null}
      </Td>
      <Td>
        {teacher.classes.length ? (
          <ul className="flex flex-wrap gap-1.5">
            {teacher.classes.map((c) => {
              const cls = classById.get(c.class_id);
              return (
                <li key={c.class_id}>
                  <StatusPill tone={c.role === 'lead' ? 'primary' : 'neutral'}>
                    {cls ? pickName(cls, lang) : '—'} · {roleName(t, c.role)}
                  </StatusPill>
                </li>
              );
            })}
          </ul>
        ) : (
          <span className="text-sm text-warning">{t('classTeam.filters.noClass')}</span>
        )}
      </Td>
      <Td>
        <StatusPill tone={teacher.status === 'active' ? 'success' : 'neutral'}>
          {teacher.status === 'active' ? t('classTeam.teachersTable.active') : t('classTeam.teachersTable.inactive')}
        </StatusPill>
      </Td>
    </Tr>
  );
}
