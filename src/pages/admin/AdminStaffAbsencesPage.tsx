import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation } from 'react-router-dom';

import { Button } from '@/components/ui/button';
import { MaterialSymbol } from '@/components/ui/MaterialSymbol';
import { PageHeader } from '@/components/ui/PageHeader';
import { Skeleton } from '@/components/ui/skeleton';
import { StatTile } from '@/components/ui/StatTile';
import { AbsenceDialog } from '@/features/staff-absence/AbsenceDialog';
import { AbsenceList } from '@/features/staff-absence/AbsenceList';
import { ClassCoverBoard } from '@/features/staff-absence/ClassCoverBoard';
import { absenceState, addDays, coverStatus } from '@/features/staff-absence/staffAbsence';
import { absenceErrorKey } from '@/features/staff-absence/staffAbsenceApi';
import { useStaffAbsences } from '@/features/staff-absence/useStaffAbsence';
import { getNurseryCalendarDateString } from '@/lib/nurseryDay';
import { cn } from '@/lib/utils';
import { useSettings } from '@/lib/useSettings';

type View = 'current' | 'past';

/**
 * Staff absences: who is away today and who covers each class, the coming and past absences, and
 * recording one for any member of staff.
 */
export function AdminStaffAbsencesPage() {
  const { t } = useTranslation();
  const location = useLocation();
  const base = location.pathname.startsWith('/xo-admin') ? '/xo-admin/nursery' : '/admin';
  const { nurseryId } = useSettings();
  const today = getNurseryCalendarDateString();
  const [view, setView] = useState<View>('current');
  const [open, setOpen] = useState(false);
  const query = useStaffAbsences(nurseryId, addDays(today, -60), addDays(today, 180));

  const shown = useMemo(() => {
    const all = query.data?.absences ?? [];
    return all.filter((a) => {
      const state = absenceState(a, query.data?.today ?? today);
      return view === 'current' ? state === 'today' || state === 'upcoming' : state === 'past' || state === 'cancelled';
    });
  }, [query.data, today, view]);

  const data = query.data;
  const awayToday = data ? new Set(data.absences.filter((a) => absenceState(a, data.today) === 'today').map((a) => a.userId)).size : 0;
  const covered = data ? data.classes.filter((c) => coverStatus(c) === 'covered').length : 0;
  const uncovered = data ? data.classes.filter((c) => coverStatus(c) === 'uncovered').length : 0;

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

          <section aria-labelledby="cover-today" className="space-y-3 rounded-2xl border border-outline-variant bg-surface p-4 shadow-sm sm:p-5">
            <div>
              <h2 id="cover-today" className="font-semibold text-on-surface">{t('staffAbsence.board.title')}</h2>
              <p className="text-xs text-on-surface-variant">{t('staffAbsence.board.hint')}</p>
            </div>
            <ClassCoverBoard classes={data.classes} classHref={(id) => `${base}/classes/${id}`} />
          </section>

          <section aria-labelledby="absences" className="space-y-3 rounded-2xl border border-outline-variant bg-surface p-4 shadow-sm sm:p-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 id="absences" className="font-semibold text-on-surface">{t('staffAbsence.admin.listTitle')}</h2>
              <div role="tablist" aria-label={t('staffAbsence.admin.listTitle')} className="flex gap-1.5">
                {(['current', 'past'] as const).map((v) => (
                  <button
                    key={v}
                    type="button"
                    role="tab"
                    aria-selected={view === v}
                    onClick={() => setView(v)}
                    className={cn(
                      'rounded-full border px-3.5 py-1.5 text-sm font-medium transition-colors',
                      view === v ? 'border-primary bg-primary text-primary-foreground' : 'border-outline-variant text-on-surface-variant hover:bg-surface-high',
                    )}
                  >
                    {t(`staffAbsence.admin.views.${v}`)}
                  </button>
                ))}
              </div>
            </div>
            <AbsenceList
              absences={shown}
              today={data.today}
              showPerson
              emptyText={t(view === 'current' ? 'staffAbsence.admin.emptyCurrent' : 'staffAbsence.admin.emptyPast')}
            />
          </section>

          {open ? <AbsenceDialog today={data.today} existing={data.absences} staff={data.staff} onClose={() => setOpen(false)} /> : null}
        </>
      ) : null}
    </div>
  );
}
