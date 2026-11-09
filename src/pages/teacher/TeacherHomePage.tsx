import { useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router-dom';

import { ReportDueBanner } from '@/components/daily-reports/ReportDueBanner';
import { ReportRateCard } from '@/components/daily-reports/ReportRateCard';
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
  Td,
  Th,
  THead,
  Tr,
} from '@/components/ui/DataTable';
import { EmptyState } from '@/components/ui/EmptyState';
import { FilterBar, SearchInput } from '@/components/ui/FilterBar';
import { FilterChips } from '@/components/ui/FilterChips';
import { FilterField } from '@/components/ui/FilterField';
import { MaterialSymbol } from '@/components/ui/MaterialSymbol';
import { Select } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { StatTile } from '@/components/ui/StatTile';
import { MedicineDueBanner } from '@/features/medicine-round/MedicineDueBanner';
import { CoverBanner } from '@/features/staff-absence/CoverBanner';
import { useMyAbsences } from '@/features/staff-absence/useStaffAbsence';
import { useAuthSession } from '@/hooks/useAuthSession';
import { useMyDailyReports } from '@/hooks/useDailyReportWorkflow';
import { useMyClassChildren, useMyClasses } from '@/hooks/useFamilyMessages';
import { usePagination } from '@/hooks/usePagination';
import { useCan } from '@/hooks/usePermissions';
import { reportDay, stageOf } from '@/lib/dailyReport';
import { useUserProfile } from '@/hooks/useUserProfile';
import { getNurseryCalendarDateString } from '@/lib/nurseryDay';
import { supabase } from '@/lib/supabase';
import {
  classDay,
  filterClassChildren,
  inState,
  mainParent,
  NO_CHILDREN_FILTERS,
  type ChildrenFilters,
  type ChildState,
  type ClassPlace,
  type MyClassChild,
} from '@/lib/teacherClasses';
import { cn, getUserInitials } from '@/lib/utils';

type MediaRow = { id: string; thumbnail_url: string | null; caption: string | null; uploaded_at: string };
type T = ReturnType<typeof useTranslation>['t'];

const STATES: ChildState[] = ['all', 'here', 'picked_up', 'absent', 'extra_now'];

function placeName(t: T, place: ClassPlace): string {
  if (place === 'lead') return t('teacher.dashboard.places.lead');
  if (place === 'assistant') return t('teacher.dashboard.places.assistant');
  return t('teacher.dashboard.places.substitute');
}

function stateName(t: T, state: ChildState): string {
  switch (state) {
    case 'all':
      return t('teacher.dashboard.states.all');
    case 'here':
      return t('teacher.dashboard.states.here');
    case 'picked_up':
      return t('teacher.dashboard.states.picked_up');
    case 'absent':
      return t('teacher.dashboard.states.absent');
    case 'extra_now':
      return t('teacher.dashboard.states.extra_now');
  }
}

/**
 * The teacher's day: their classes and team, today's numbers, the absent children, and every child
 * of their classes with today's state and family, with one-click chat, message and photo.
 */
export function TeacherHomePage() {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const locale = lang.startsWith('ar') ? 'ar-EG' : 'en-GB';
  const navigate = useNavigate();
  const { user } = useAuthSession();
  const { data: profile } = useUserProfile(user?.id);
  const classes = useMyClasses(user?.id);
  const childrenQuery = useMyClassChildren(user?.id);
  const [today] = useState(() => getNurseryCalendarDateString());
  const [filters, setFilters] = useState<ChildrenFilters>(NO_CHILDREN_FILTERS);
  const tableRef = useRef<HTMLDivElement>(null);
  // Today's daily reports, and the nursery's send rate for the head of teachers.
  const reports = useMyDailyReports(user?.id, null);
  const canSeeRates = useCan('class_team');
  const reportRows = reports.data ?? [];
  // The classes this teacher covers today as their backup.
  const myAbsences = useMyAbsences();
  const reportTally = reportDay(reportRows);
  const nextReport = reportRows.find((r) => stageOf(r) === 'not_started' || stageOf(r) === 'in_progress');

  const all = useMemo(() => childrenQuery.data ?? [], [childrenQuery.data]);
  const day = classDay(all);
  const rows = useMemo(() => filterClassChildren(all, filters), [all, filters]);
  const pager = usePagination(rows, 20, JSON.stringify(filters));
  const absent = useMemo(() => all.filter((c) => inState(c, 'absent')), [all]);

  // Today's photos this teacher took.
  const mediaQuery = useQuery({
    queryKey: ['teacher-home-media', user?.id, today],
    queryFn: async (): Promise<MediaRow[]> => {
      const res = await supabase
        .from('media')
        .select('id, thumbnail_url, caption, uploaded_at')
        .eq('uploaded_by', user!.id)
        .eq('captured_at', today)
        .order('uploaded_at', { ascending: false })
        .limit(8);
      if (res.error) throw res.error;
      return (res.data ?? []) as MediaRow[];
    },
    enabled: Boolean(user?.id),
  });

  const name = (row: { name_ar?: string | null; name_en?: string | null; full_name_ar?: string | null; full_name_en?: string | null }) => {
    const ar = row.full_name_ar ?? row.name_ar ?? null;
    const en = row.full_name_en ?? row.name_en ?? null;
    return (lang.startsWith('ar') ? ar || en : en || ar) || '—';
  };
  const time = (iso: string | null) => (iso ? new Date(iso).toLocaleTimeString(locale, { hour: 'numeric', minute: '2-digit', hour12: true }) : '—');
  const showState = (state: ChildState) => {
    setFilters((f) => ({ ...f, state }));
    tableRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };
  const chatWith = (child: MyClassChild) => {
    const parent = mainParent(child);
    if (parent) navigate(`/teacher/chat?with=${parent.id}`);
  };

  const teacherName = (lang.startsWith('ar') ? profile?.name_ar || profile?.name_en : profile?.name_en || profile?.name_ar) || t('teacher.home.fallbackName');

  if (classes.isPending || childrenQuery.isPending) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-28 w-full rounded-xl" />
        <div className="grid grid-cols-2 gap-3 xl:grid-cols-5">{[1, 2, 3, 4, 5].map((k) => <Skeleton key={k} className="h-24 rounded-xl" />)}</div>
        <Skeleton className="h-72 w-full rounded-xl" />
      </div>
    );
  }

  if (!(classes.data ?? []).length) {
    return <EmptyState icon="school" title={t('teacher.home.noClassesTitle')} description={t('teacher.home.noClassesDescription')} />;
  }

  return (
    <div className="space-y-5 pb-8">
      {/* Greeting and the day's shortcuts */}
      <section className="overflow-hidden rounded-xl border border-outline-variant bg-surface shadow-sm">
        <div className="flex flex-col gap-4 bg-surface-container-lowest px-4 py-5 sm:px-5 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex min-w-0 items-center gap-3">
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-md">
              <MaterialSymbol name="waving_hand" className="text-2xl" />
            </span>
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase text-primary">
                {new Date(`${today}T12:00:00`).toLocaleDateString(locale, { weekday: 'long', day: 'numeric', month: 'long' })}
              </p>
              <h1 className="font-headline text-2xl font-extrabold text-on-surface">{t('teacher.home.greeting', { name: teacherName })}</h1>
              <p className="text-sm text-on-surface-variant">{t('teacher.dashboard.subtitle')}</p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button asChild>
              <Link to="/teacher/family-messages">
                <MaterialSymbol name="outgoing_mail" className="me-2 text-base" />
                {t('teacher.dashboard.actions.message')}
              </Link>
            </Button>
            <Button asChild variant="outline">
              <Link to="/teacher/media/upload">
                <MaterialSymbol name="add_a_photo" className="me-2 text-base" />
                {t('teacher.dashboard.actions.photos')}
              </Link>
            </Button>
            <Button asChild variant="outline">
              <Link to="/teacher/chat">
                <MaterialSymbol name="forum" className="me-2 text-base" />
                {t('teacher.dashboard.actions.chat')}
              </Link>
            </Button>
            <Button asChild variant="outline">
              <Link to="/teacher/attendance">
                <MaterialSymbol name="fact_check" className="me-2 text-base" />
                {t('teacher.dashboard.actions.attendance')}
              </Link>
            </Button>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3 p-4 sm:grid-cols-3 sm:p-5 xl:grid-cols-5">
          <StatTile className="xl:flex-col xl:items-start xl:gap-2" icon="groups" label={t('teacher.dashboard.tiles.children')} value={day.children} onClick={() => showState('all')} active={filters.state === 'all'} />
          <StatTile className="xl:flex-col xl:items-start xl:gap-2" icon="home_work" label={t('teacher.dashboard.tiles.here')} value={day.here} tone="primary" onClick={() => showState('here')} active={filters.state === 'here'} />
          <StatTile className="xl:flex-col xl:items-start xl:gap-2" icon="logout" label={t('teacher.dashboard.tiles.pickedUp')} value={day.pickedUp} tone="success" onClick={() => showState('picked_up')} active={filters.state === 'picked_up'} />
          <StatTile
            className="xl:flex-col xl:items-start xl:gap-2"
            icon="event_busy"
            label={t('teacher.dashboard.tiles.absent')}
            value={day.absent}
            tone={day.absent > 0 ? 'error' : 'neutral'}
            helper={day.withNotice > 0 ? t('teacher.dashboard.tiles.withNotice', { count: day.withNotice }) : undefined}
            onClick={() => showState('absent')}
            active={filters.state === 'absent'}
          />
          <StatTile
            className="xl:flex-col xl:items-start xl:gap-2"
            icon="schedule"
            label={t('teacher.dashboard.tiles.extraNow')}
            value={day.inExtraNow}
            tone={day.inExtraNow > 0 ? 'error' : 'neutral'}
            helper={t('teacher.dashboard.tiles.extraNowHint')}
            onClick={() => showState('extra_now')}
            active={filters.state === 'extra_now'}
          />
        </div>
      </section>

      <CoverBanner covering={myAbsences.data?.covering ?? []} />
      <MedicineDueBanner />

      {/* The day's reports: an alarm as the end of the day nears */}
      {reportRows.length || canSeeRates ? (
        <div className={cn('grid gap-5', canSeeRates && reportRows.length && 'xl:grid-cols-3')}>
          {reportRows.length ? (
            <ReportDueBanner
              className={cn(canSeeRates && 'xl:col-span-2')}
              day={reportTally}
              dueAt={reportRows[0]?.due_at ?? null}
              actions={
                <>
                  <Button asChild>
                    <Link to="/teacher/daily-reports">
                      <MaterialSymbol name="description" className="me-1 text-base" />
                      {t('dailyReport.banner.open')}
                    </Link>
                  </Button>
                  {nextReport ? (
                    <Button asChild variant="outline" className="bg-surface text-on-surface">
                      <Link to={`/teacher/daily-reports/${nextReport.child_id}/${nextReport.day}`}>
                        <MaterialSymbol name="edit_note" className="me-1 text-base" />
                        {t('dailyReport.banner.fillNext')}
                      </Link>
                    </Button>
                  ) : null}
                </>
              }
            />
          ) : null}
          {canSeeRates ? <ReportRateCard nurseryId={profile?.nursery_id} to="/teacher/report-rates" /> : null}
        </div>
      ) : null}

      <div className="grid gap-5 xl:grid-cols-3">
        {/* My classes and their team */}
        <section className="space-y-3 xl:col-span-2">
          <h2 className="flex items-center gap-2 text-base font-semibold text-on-surface">
            <MaterialSymbol name="school" className="text-primary" />
            {t('teacher.dashboard.myClasses')}
          </h2>
          <div className="grid gap-3 sm:grid-cols-2">
            {(classes.data ?? []).map((cls) => {
              const kids = all.filter((c) => c.class_id === cls.class_id);
              const present = kids.filter((c) => c.day_status === 'in_nursery' || c.day_status === 'picked_up').length;
              return (
                <article key={cls.class_id} className="space-y-3 rounded-xl border border-outline-variant bg-surface p-4 shadow-sm">
                  <header className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <h3 className="truncate font-semibold text-on-surface">{name(cls)}</h3>
                      <p className="text-xs text-on-surface-variant">{t('teacher.dashboard.classToday', { present, total: cls.children_count })}</p>
                    </div>
                    <StatusPill tone={cls.my_role === 'lead' ? 'primary' : 'neutral'}>{placeName(t, cls.my_role)}</StatusPill>
                  </header>
                  <ul className="flex flex-wrap gap-1.5">
                    {cls.team.map((member) => (
                      <li key={member.user_id} className="inline-flex items-center gap-1.5 rounded-full bg-surface-container-lowest px-2.5 py-1 text-xs text-on-surface">
                        <span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary/10 text-[10px] font-bold text-primary">
                          {getUserInitials(name(member), null)}
                        </span>
                        {name(member)}
                        <span className="text-on-surface-variant">· {placeName(t, member.role)}</span>
                      </li>
                    ))}
                  </ul>
                  <div className="flex flex-wrap gap-2">
                    <Button asChild size="sm" variant="outline">
                      <Link to={`/teacher/family-messages?class=${cls.class_id}`}>
                        <MaterialSymbol name="outgoing_mail" className="me-1 text-base" />
                        {t('teacher.dashboard.messageClass')}
                      </Link>
                    </Button>
                    <Button asChild size="sm" variant="ghost">
                      <Link to={`/teacher/media/upload?class=${cls.class_id}`}>
                        <MaterialSymbol name="add_a_photo" className="me-1 text-base" />
                        {t('teacher.dashboard.actions.photos')}
                      </Link>
                    </Button>
                  </div>
                </article>
              );
            })}
          </div>
        </section>

        {/* Today's absent children */}
        <section className="space-y-3">
          <h2 className="flex items-center gap-2 text-base font-semibold text-on-surface">
            <MaterialSymbol name="event_busy" className="text-error" />
            {t('teacher.dashboard.absentToday')}
            <span className="rounded-full bg-surface-high px-2 py-0.5 text-xs font-medium tabular-nums text-on-surface-variant">{absent.length}</span>
          </h2>
          <div className="rounded-xl border border-outline-variant bg-surface shadow-sm">
            {absent.length ? (
              <ul className="max-h-80 divide-y divide-outline-variant overflow-y-auto">
                {absent.map((child) => (
                  <li key={child.child_id} className="flex items-center gap-3 px-4 py-3">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-on-surface">{name(child)}</p>
                      <p className="truncate text-xs text-on-surface-variant">
                        {child.day_status === 'excused'
                          ? `${t('teacher.dashboard.withNotice')}${child.absence_reason ? ` · ${t(`attendance.absence.reasons.${child.absence_reason}`, { defaultValue: child.absence_reason })}` : ''}`
                          : t('teacher.dashboard.noNotice')}
                      </p>
                    </div>
                    <IconAction icon="forum" label={t('teacher.dashboard.row.chat')} onClick={() => chatWith(child)} disabled={!mainParent(child)} />
                    <IconAction icon="outgoing_mail" label={t('teacher.dashboard.row.message')} to={`/teacher/family-messages?child=${child.child_id}`} />
                  </li>
                ))}
              </ul>
            ) : (
              <p className="flex items-center gap-2 px-4 py-6 text-sm text-on-surface-variant">
                <MaterialSymbol name="verified" className="text-success" />
                {t('teacher.dashboard.noAbsent')}
              </p>
            )}
          </div>
        </section>
      </div>

      {/* Every child of my classes */}
      <div ref={tableRef}>
        <TableCard
          title={t('teacher.dashboard.childrenTitle')}
          count={t('teacher.dashboard.childrenCount', { count: rows.length })}
          description={t('teacher.dashboard.childrenHint')}
          filters={
            <div className="space-y-3">
              <FilterBar onClear={() => setFilters(NO_CHILDREN_FILTERS)} canClear={JSON.stringify(filters) !== JSON.stringify(NO_CHILDREN_FILTERS)}>
                <FilterField label={t('teacher.dashboard.filters.search')} className="sm:flex-[2]">
                  <SearchInput value={filters.search} onChange={(search) => setFilters((f) => ({ ...f, search }))} placeholder={t('teacher.dashboard.filters.searchPlaceholder')} />
                </FilterField>
                {(classes.data ?? []).length > 1 ? (
                  <FilterField label={t('teacher.dashboard.filters.class')}>
                    <Select value={filters.classId} onChange={(e) => setFilters((f) => ({ ...f, classId: e.target.value }))}>
                      <option value="all">{t('teacher.dashboard.filters.allClasses')}</option>
                      {(classes.data ?? []).map((cls) => (
                        <option key={cls.class_id} value={cls.class_id}>{name(cls)}</option>
                      ))}
                    </Select>
                  </FilterField>
                ) : null}
              </FilterBar>
              <FilterChips
                value={filters.state}
                onChange={(state) => setFilters((f) => ({ ...f, state }))}
                label={t('teacher.dashboard.filters.state')}
                options={STATES.map((state) => ({ value: state, label: stateName(t, state), count: all.filter((c) => inState(c, state)).length }))}
              />
            </div>
          }
          pagination={rows.length ? <TablePagination pager={pager} /> : null}
        >
          {childrenQuery.isError ? (
            <TableEmpty icon="error" title={t('teacher.dashboard.loadError')} />
          ) : childrenQuery.isPending ? (
            <TableLoading />
          ) : !rows.length ? (
            <TableEmpty icon="group_off" title={all.length ? t('teacher.dashboard.noMatch') : t('teacher.dashboard.noChildren')} />
          ) : (
            <DataTable minWidth={900}>
              <THead>
                <Th>{t('teacher.dashboard.columns.child')}</Th>
                <Th>{t('teacher.dashboard.columns.class')}</Th>
                <Th>{t('teacher.dashboard.columns.today')}</Th>
                <Th>{t('teacher.dashboard.columns.family')}</Th>
                <Th align="end">{t('teacher.dashboard.columns.actions')}</Th>
              </THead>
              <TBody>
                {pager.pageItems.map((child) => {
                  const parent = mainParent(child);
                  return (
                    <Tr key={child.child_id}>
                      <Td>
                        <div className="flex items-center gap-3">
                          {child.avatar_url ? (
                            <img src={child.avatar_url} alt="" className="h-9 w-9 shrink-0 rounded-full object-cover" loading="lazy" />
                          ) : (
                            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">
                              {getUserInitials(name(child), null)}
                            </span>
                          )}
                          <div className="min-w-0">
                            <p className="truncate font-medium text-on-surface">{name(child)}</p>
                            {child.child_code ? <p className="font-mono text-xs text-on-surface-variant" dir="ltr">{child.child_code}</p> : null}
                          </div>
                        </div>
                      </Td>
                      <Td>
                        <p>{lang.startsWith('ar') ? child.class_name_ar || child.class_name_en : child.class_name_en || child.class_name_ar}</p>
                        <p className="text-xs text-on-surface-variant">{placeName(t, child.my_role)}</p>
                      </Td>
                      <Td>
                        <TodayState child={child} time={time} />
                      </Td>
                      <Td>
                        {parent ? (
                          <div className="min-w-0">
                            <p className="truncate">{name(parent)}</p>
                            {parent.phone ? (
                              <a href={`tel:${parent.phone}`} className="text-xs font-medium text-primary hover:underline" dir="ltr">
                                {parent.phone}
                              </a>
                            ) : null}
                            {child.parents.length > 1 ? <p className="text-xs text-on-surface-variant">{t('teacher.dashboard.moreParents', { count: child.parents.length - 1 })}</p> : null}
                          </div>
                        ) : (
                          <span className="text-on-surface-variant">{t('teacher.dashboard.noParents')}</span>
                        )}
                      </Td>
                      <Td align="end">
                        <div className="inline-flex gap-1">
                          <IconAction icon="forum" label={t('teacher.dashboard.row.chat')} onClick={() => chatWith(child)} disabled={!parent} />
                          <IconAction icon="outgoing_mail" label={t('teacher.dashboard.row.message')} to={`/teacher/family-messages?child=${child.child_id}`} />
                          <IconAction icon="add_a_photo" label={t('teacher.dashboard.row.photo')} to={`/teacher/media/upload?class=${child.class_id}&child=${child.child_id}`} />
                        </div>
                      </Td>
                    </Tr>
                  );
                })}
              </TBody>
            </DataTable>
          )}
        </TableCard>
      </div>

      {/* Today's photos */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-base font-semibold text-on-surface">
            <MaterialSymbol name="photo_library" className="text-primary" />
            {t('teacher.home.mediaTitle')}
          </h2>
          <Link to="/teacher/media" className="text-sm font-medium text-primary hover:underline">
            {t('teacher.home.openMedia')}
          </Link>
        </div>
        {(mediaQuery.data ?? []).length ? (
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 xl:grid-cols-8">
            {(mediaQuery.data ?? []).map((m) => (
              <div key={m.id} className="overflow-hidden rounded-xl border border-outline-variant bg-surface-container-lowest">
                <div className="aspect-square bg-surface-container">
                  {m.thumbnail_url ? <img src={m.thumbnail_url} alt={m.caption ?? ''} className="h-full w-full object-cover" loading="lazy" /> : null}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <Link
            to="/teacher/media/upload"
            className="block rounded-xl border border-dashed border-outline-variant bg-surface-container-lowest p-6 text-center text-sm text-on-surface-variant transition-colors hover:bg-surface-container-low"
          >
            {t('teacher.home.noMediaToday')}
          </Link>
        )}
      </section>
    </div>
  );
}

function TodayState({ child, time }: { child: MyClassChild; time: (iso: string | null) => string }) {
  const { t } = useTranslation();
  const pill = child.late_now ? (
    <StatusPill tone="error" icon="schedule">{t('teacher.dashboard.states.extra_now')}</StatusPill>
  ) : child.day_status === 'in_nursery' ? (
    <StatusPill tone="primary" icon="home_work">{t('teacher.dashboard.states.here')}</StatusPill>
  ) : child.day_status === 'picked_up' ? (
    <StatusPill tone="success" icon="logout">{t('teacher.dashboard.states.picked_up')}</StatusPill>
  ) : child.day_status === 'excused' ? (
    <StatusPill tone="warning" icon="mark_email_read">{t('teacher.dashboard.withNotice')}</StatusPill>
  ) : child.day_status === 'absent' ? (
    <StatusPill tone="error" icon="event_busy">{t('teacher.dashboard.states.absent')}</StatusPill>
  ) : (
    <StatusPill tone="neutral" icon="weekend">{t('teacher.dashboard.states.off')}</StatusPill>
  );
  return (
    <div className="space-y-1">
      {pill}
      {child.check_in ? (
        <p className={cn('text-xs tabular-nums text-on-surface-variant')}>
          {time(child.check_in)} → {child.check_out ? time(child.check_out) : t('teacher.dashboard.stillHere')}
        </p>
      ) : null}
    </div>
  );
}
