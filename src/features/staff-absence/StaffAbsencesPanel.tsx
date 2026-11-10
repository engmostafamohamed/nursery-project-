import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Button } from '@/components/ui/button';
import { TableLoading } from '@/components/ui/DataTable';
import { MaterialSymbol } from '@/components/ui/MaterialSymbol';
import { StatTile } from '@/components/ui/StatTile';

import { AbsenceDialog } from './AbsenceDialog';
import { AbsenceTable } from './AbsenceTable';
import { absenceErrorKey } from './staffAbsenceApi';
import { usePersonAbsences } from './usePersonAbsences';

/**
 * One member of staff's absences, on their page: whether they are away today, the days away in the
 * last six months and the ones coming, every absence as a row (cancel one that has not ended), and
 * recording one for them. Opened from the staff absences page (a row lands here).
 */
export function StaffAbsencesPanel({ userId, name }: { userId: string; name: string }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const { query, today, absences, summary } = usePersonAbsences(userId);
  const data = query.data;

  if (query.isPending) return <TableLoading rows={4} />;
  if (query.isError) {
    return <p role="alert" className="rounded-xl border border-error/40 bg-error/5 p-4 text-sm text-error">{t(absenceErrorKey(query.error))}</p>;
  }

  return (
    <div className="space-y-4" data-testid="staff-absences">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <StatTile
          icon={summary.awayToday ? 'event_busy' : 'event_available'}
          label={t('staffAbsence.profile.today')}
          value={summary.awayToday ? t('staffAbsence.profile.awayToday') : t('staffAbsence.profile.notAway')}
          helper={summary.awayToday ? t(`staffAbsence.reasons.${summary.awayToday.reason}`) : undefined}
          tone={summary.awayToday ? 'warning' : 'success'}
        />
        <StatTile icon="date_range" label={t('staffAbsence.profile.daysAway')} value={summary.daysAway} tone={summary.daysAway > 10 ? 'warning' : 'primary'} />
        <StatTile icon="event_upcoming" label={t('staffAbsence.profile.coming')} value={summary.coming} tone="primary" />
      </div>

      <AbsenceTable
        absences={absences}
        today={today}
        title={t('staffAbsence.profile.title')}
        description={t('staffAbsence.profile.description')}
        emptyText={t('staffAbsence.profile.empty', { name })}
        actions={
          <Button type="button" size="sm" className="gap-1" onClick={() => setOpen(true)} disabled={!data} data-testid="record-person-absence">
            <MaterialSymbol name="add" size="text-base" />
            {t('staffAbsence.dialog.recordTitle')}
          </Button>
        }
      />

      {open && data ? <AbsenceDialog today={data.today} existing={data.absences} staff={data.staff} personId={userId} onClose={() => setOpen(false)} /> : null}
    </div>
  );
}
