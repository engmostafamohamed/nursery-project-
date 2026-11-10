import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Button } from '@/components/ui/button';
import { FilterBar, SearchInput } from '@/components/ui/FilterBar';
import { FilterChips } from '@/components/ui/FilterChips';
import { FilterField } from '@/components/ui/FilterField';
import { MaterialSymbol } from '@/components/ui/MaterialSymbol';
import { PageHeader } from '@/components/ui/PageHeader';
import { Select } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { StatTile } from '@/components/ui/StatTile';
import { AbsenceDialog } from '@/features/staff-absence/AbsenceDialog';
import { AbsenceTable } from '@/features/staff-absence/AbsenceTable';
import { ClassCoverTable } from '@/features/staff-absence/ClassCoverTable';
import { ABSENCE_REASONS, absenceState, addDays, coverStatus, type AbsenceReason } from '@/features/staff-absence/staffAbsence';
import { absenceErrorKey } from '@/features/staff-absence/staffAbsenceApi';
import { useStaffAbsences } from '@/features/staff-absence/useStaffAbsence';
import { useAdminBasePath } from '@/hooks/useAdminBasePath';
import { getNurseryCalendarDateString } from '@/lib/nurseryDay';
import { useSettings } from '@/lib/useSettings';

type View = 'current' | 'past';

/**
 * Staff absences: today's, the coming and the past ones as a table to search and filter (a row opens
 * that member of staff, on their absences), then who covers each class today (a class left with
 * nobody links to its team), and recording an absence for anyone.
 */
export function AdminStaffAbsencesPage() {
  const { t } = useTranslation();
  const base = useAdminBasePath();
  const { nurseryId } = useSettings();
  const today = getNurseryCalendarDateString();
  const [view, setView] = useState<View>('current');
  const [search, setSearch] = useState('');
  const [reason, setReason] = useState<AbsenceReason | 'all'>('all');
  const [open, setOpen] = useState(false);
  const query = useStaffAbsences(nurseryId, addDays(today, -60), addDays(today, 180));
  const data = query.data;
  const day = data?.today ?? today;
  // A member of staff's page, on their absences.
  const personHref = (userId: string) => `${base}/staff/${userId}?tab=absences`;

  const inView = useMemo(() => {
    const all = data?.absences ?? [];
    const current = all.filter((a) => ['today', 'upcoming'].includes(absenceState(a, day)));
    return { current, past: all.filter((a) => !current.includes(a)) };
  }, [data, day]);
  const shown = useMemo(() => {
    const q = search.trim().toLowerCase();
    return inView[view].filter((a) => (reason === 'all' || a.reason === reason) && (!q || `${a.nameAr} ${a.nameEn}`.toLowerCase().includes(q)));
  }, [inView, view, search, reason]);

  const awayToday = data ? new Set(data.absences.filter((a) => absenceState(a, data.today) === 'today').map((a) => a.userId)).size : 0;
  const covered = data ? data.classes.filter((c) => coverStatus(c) === 'covered').length : 0;
  const uncovered = data ? data.classes.filter((c) => ['uncovered', 'lead_away'].includes(coverStatus(c))).length : 0;

  return (
    <div className="space-y-5 pb-24">
      <PageHeader
        icon="event_busy"
        eyebrow={t('staffAbsence.admin.eyebrow')}
        title={t('staffAbsence.admin.title')}
        description={t('staffAbsence.admin.subtitle')}
        actions={
          <Button type="button" onClick={() => setOpen(true)} disabled={!data} data-testid="record-absence">
            <MaterialSymbol name="add" size="text-base" className="me-1" />
            {t('staffAbsence.dialog.recordTitle')}
          </Button>
        }
      />

      {query.isPending ? (
        <Skeleton className="h-64 rounded-2xl" />
      ) : query.isError ? (
        <p role="alert" className="rounded-xl border border-error/40 bg-error/5 p-4 text-sm text-error">{t(absenceErrorKey(query.error))}</p>
      ) : data ? (
        <>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <StatTile icon="event_busy" label={t('staffAbsence.admin.awayToday')} value={awayToday} tone={awayToday ? 'warning' : 'success'} />
            <StatTile icon="swap_horiz" label={t('staffAbsence.admin.coveredToday')} value={covered} tone="primary" />
            <StatTile icon="person_off" label={t('staffAbsence.admin.uncoveredToday')} value={uncovered} tone={uncovered ? 'error' : 'success'} />
          </div>

          <AbsenceTable
            absences={shown}
            today={data.today}
            showPerson
            title={t('staffAbsence.admin.listTitle')}
            emptyText={search.trim() || reason !== 'all' ? t('staffAbsence.table.noMatch') : t(view === 'current' ? 'staffAbsence.admin.emptyCurrent' : 'staffAbsence.admin.emptyPast')}
            resetKey={`${view}|${reason}|${search.trim().toLowerCase()}`}
            personHref={personHref}
            actions={
              <FilterChips
                value={view}
                onChange={setView}
                label={t('staffAbsence.admin.listTitle')}
                options={(['current', 'past'] as const).map((v) => ({ value: v, label: t(`staffAbsence.admin.views.${v}`), count: inView[v].length }))}
              />
            }
            filters={
              <FilterBar onClear={() => { setSearch(''); setReason('all'); }} canClear={Boolean(search.trim()) || reason !== 'all'}>
                <FilterField label={t('staffAbsence.table.searchLabel')} className="sm:flex-[2]">
                  <SearchInput value={search} onChange={setSearch} placeholder={t('staffAbsence.table.search')} />
                </FilterField>
                <FilterField label={t('staffAbsence.table.reason')}>
                  <Select value={reason} onChange={(e) => setReason(e.target.value as AbsenceReason | 'all')} aria-label={t('staffAbsence.table.reason')}>
                    <option value="all">{t('staffAbsence.table.allReasons')}</option>
                    {ABSENCE_REASONS.map((r) => <option key={r} value={r}>{t(`staffAbsence.reasons.${r}`)}</option>)}
                  </Select>
                </FilterField>
              </FilterBar>
            }
          />

          <ClassCoverTable
            classes={data.classes}
            classHref={(id) => `${base}/classes/${id}`}
            teamHref={(id) => `${base}/classes/teams?edit=${id}`}
            personHref={personHref}
          />

          {open ? <AbsenceDialog today={data.today} existing={data.absences} staff={data.staff} onClose={() => setOpen(false)} /> : null}
        </>
      ) : null}
    </div>
  );
}
