import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { FilterBar, SearchInput } from '@/components/ui/FilterBar';
import { FilterChips } from '@/components/ui/FilterChips';
import { FilterField } from '@/components/ui/FilterField';
import { Input } from '@/components/ui/input';
import { LoadError } from '@/components/ui/LoadError';
import { PageHeader } from '@/components/ui/PageHeader';
import { SectionTabs } from '@/components/ui/SectionTabs';
import { Select } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { useStaffAbsences } from '@/features/staff-absence/useStaffAbsence';
import { StaffAttendanceStats } from '@/features/staff-attendance/StaffAttendanceStats';
import { StaffDaysTable, StaffPeopleTable } from '@/features/staff-attendance/StaffAttendanceTables';
import { DAY_STATES, personSummaries, spanDays, type DayState } from '@/features/staff-attendance/staffAttendanceRange';
import { staffDaysErrorKey, useNurseryStaffDays } from '@/features/staff-attendance/useNurseryStaffDays';
import { useAdminBasePath } from '@/hooks/useAdminBasePath';
import { useAuthSession } from '@/hooks/useAuthSession';
import { useUserProfile } from '@/hooks/useUserProfile';
import { adminLinks } from '@/lib/adminLinks';
import { attendanceSectionTabs } from '@/lib/attendanceTabs';
import { addCalendarDaysYmd, getNurseryCalendarDateString } from '@/lib/nurseryDay';

/** The spans the screen offers, and how far back each one reaches from today. */
const SPANS = { today: 0, week: 6, month: 29, quarter: 89 } as const;
type SpanKey = keyof typeof SPANS | 'custom';

/**
 * The nursery's staff attendance: the figures and the span's two charts, then what the span came to
 * for each member of staff and the days themselves. Every filter — the span, who, what they do and
 * where a day stands — narrows the figures, the charts and both tables together, so a number on a
 * tile and the rows under it always mean the same thing.
 */
export function AdminStaffAttendancePage() {
  const { t } = useTranslation();
  const { user } = useAuthSession();
  const { data: profile, isPending: profilePending } = useUserProfile(user?.id);
  const nurseryId = profile?.nursery_id ?? null;
  const base = useAdminBasePath();
  const links = adminLinks(base);
  const today = getNurseryCalendarDateString();

  const [span, setSpan] = useState<SpanKey>('week');
  const [customFrom, setCustomFrom] = useState(addCalendarDaysYmd(today, -6));
  const [customTo, setCustomTo] = useState(today);
  const [search, setSearch] = useState('');
  const [role, setRole] = useState<string>('all');
  const [department, setDepartment] = useState<string>('all');
  const [state, setState] = useState<DayState | 'all'>('all');

  const from = span === 'custom' ? customFrom : addCalendarDaysYmd(today, -SPANS[span]);
  const to = span === 'custom' ? customTo : today;
  const rangeBroken = span === 'custom' && (!customFrom || !customTo || customTo < customFrom);

  const query = useNurseryStaffDays(rangeBroken ? null : nurseryId, from, to);
  // Reported absences tell "away" from "never came"; the absences screen reads them the same way.
  const absences = useStaffAbsences(rangeBroken ? null : nurseryId, from, to);
  const data = query.data;

  const departments = useMemo(() => {
    const seen = new Set<string>();
    for (const person of data?.staff ?? []) if (person.department) seen.add(person.department);
    return [...seen].sort();
  }, [data]);

  /** The span's days, then the filters on top of them: who, what they do, where the day stands. */
  const shown = useMemo(() => {
    if (!data) return { days: [], summaries: [], allDays: [] };
    const q = search.trim().toLowerCase();
    const keep = data.staff.filter(
      (p) =>
        (role === 'all' || p.role === role)
        && (department === 'all' || p.department === department)
        && (!q || `${p.nameAr} ${p.nameEn} ${p.position ?? ''}`.toLowerCase().includes(q)),
    );
    const keepIds = new Set(keep.map((p) => p.id));
    const all = spanDays({ ...data, staff: keep }, absences.data?.absences ?? []);
    return {
      allDays: all,
      days: state === 'all' ? all : all.filter((d) => d.state === state),
      summaries: personSummaries(state === 'all' ? all : all.filter((d) => d.state === state), keep).filter((s) => keepIds.has(s.person.id)),
    };
  }, [data, absences.data, search, role, department, state]);

  const resetKey = `${from}|${to}|${search.trim().toLowerCase()}|${role}|${department}|${state}`;
  const filtered = Boolean(search.trim()) || role !== 'all' || department !== 'all' || state !== 'all';
  const pending = profilePending || (query.isPending && !rangeBroken);

  return (
    <div className="space-y-5 pb-24">
      <PageHeader
        icon="badge"
        eyebrow={t('admin.attendance.eyebrow')}
        title={t('staffAttendance.title')}
        description={t('staffAttendance.subtitle')}
      >
        <SectionTabs tabs={attendanceSectionTabs(base, t)} label={t('admin.attendance.title')} className="mb-4" />

        <div className="grid gap-3 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
          <FilterField label={t('staffAttendance.spanLabel')}>
            <FilterChips
              value={span}
              onChange={setSpan}
              label={t('staffAttendance.spanLabel')}
              options={(['today', 'week', 'month', 'quarter', 'custom'] as const).map((key) => ({
                value: key,
                label: t(`staffAttendance.spans.${key}`),
              }))}
            />
          </FilterField>
          {span === 'custom' ? (
            <div className="grid grid-cols-2 gap-3">
              <FilterField label={t('staffAttendance.fromLabel')}>
                <Input type="date" value={customFrom} max={today} onChange={(e) => setCustomFrom(e.target.value)} />
              </FilterField>
              <FilterField label={t('staffAttendance.toLabel')}>
                <Input type="date" value={customTo} max={today} onChange={(e) => setCustomTo(e.target.value)} />
              </FilterField>
            </div>
          ) : null}
        </div>
      </PageHeader>

      {rangeBroken ? (
        <LoadError message={t('staffAttendance.errors.badRange')} />
      ) : pending ? (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 xl:grid-cols-8">
            {[1, 2, 3, 4, 5, 6, 7, 8].map((k) => <Skeleton key={k} className="h-20 rounded-xl" />)}
          </div>
          <Skeleton className="h-60 rounded-xl" />
          <Skeleton className="h-72 rounded-xl" />
        </div>
      ) : query.isError || !data ? (
        <LoadError message={t(staffDaysErrorKey(query.error))} onRetry={() => void query.refetch()} />
      ) : (
        <>
          <StaffAttendanceStats
            days={shown.allDays}
            summaries={personSummaries(shown.allDays, data.staff)}
            from={from}
            to={to}
            state={state}
            onState={setState}
          />

          <StaffPeopleTable
            summaries={shown.summaries}
            title={t('staffAttendance.table.peopleTitle')}
            emptyText={filtered ? t('staffAttendance.table.noMatch') : t('staffAttendance.table.nobody')}
            resetKey={resetKey}
            personHref={(id) => links.staffPage(id, 'attendance')}
            filters={
              <FilterBar
                onClear={() => { setSearch(''); setRole('all'); setDepartment('all'); setState('all'); }}
                canClear={filtered}
              >
                <FilterField label={t('staffAttendance.searchLabel')} className="sm:flex-[2]">
                  <SearchInput value={search} onChange={setSearch} placeholder={t('staffAttendance.searchPlaceholder')} />
                </FilterField>
                <FilterField label={t('staffAttendance.roleLabel')}>
                  <Select value={role} onChange={(e) => setRole(e.target.value)} aria-label={t('staffAttendance.roleLabel')}>
                    <option value="all">{t('staffAttendance.allRoles')}</option>
                    {(['teacher', 'manager', 'branch_admin'] as const).map((r) => (
                      <option key={r} value={r}>{t(`staffAbsence.roles.${r}`)}</option>
                    ))}
                  </Select>
                </FilterField>
                {departments.length ? (
                  <FilterField label={t('staffAttendance.departmentLabel')}>
                    <Select value={department} onChange={(e) => setDepartment(e.target.value)} aria-label={t('staffAttendance.departmentLabel')}>
                      <option value="all">{t('staffAttendance.allDepartments')}</option>
                      {departments.map((d) => (
                        <option key={d} value={d}>{t(`staffOnboarding.departments.${d}`, { defaultValue: d })}</option>
                      ))}
                    </Select>
                  </FilterField>
                ) : null}
                <FilterField label={t('staffAttendance.table.state')}>
                  <Select value={state} onChange={(e) => setState(e.target.value as DayState | 'all')} aria-label={t('staffAttendance.table.state')}>
                    <option value="all">{t('staffAttendance.allStates')}</option>
                    {DAY_STATES.map((s) => (
                      <option key={s} value={s}>{t(`staffAttendance.states.${s}`)}</option>
                    ))}
                  </Select>
                </FilterField>
              </FilterBar>
            }
          />

          <StaffDaysTable
            days={shown.days}
            timezone={data.timezone}
            emptyText={filtered ? t('staffAttendance.table.noMatch') : t('staffAttendance.table.noDays')}
            resetKey={resetKey}
            personHref={(id) => links.staffPage(id, 'attendance')}
          />
        </>
      )}
    </div>
  );
}
