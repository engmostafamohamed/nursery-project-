import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Button } from '@/components/ui/button';
import { MaterialSymbol } from '@/components/ui/MaterialSymbol';
import { PageHeader } from '@/components/ui/PageHeader';
import { Skeleton } from '@/components/ui/skeleton';
import { AbsenceDialog } from '@/features/staff-absence/AbsenceDialog';
import { AbsenceList } from '@/features/staff-absence/AbsenceList';
import { CoverBanner } from '@/features/staff-absence/CoverBanner';
import { absenceErrorKey } from '@/features/staff-absence/staffAbsenceApi';
import { useMyAbsences } from '@/features/staff-absence/useStaffAbsence';

/**
 * A teacher's absences: report a day or more away (the backup and the admins are told), see the
 * coming and past ones, cancel one that has not ended, and see the classes they cover today.
 */
export function TeacherAbsencesPage() {
  const { t } = useTranslation();
  const query = useMyAbsences();
  const [open, setOpen] = useState(false);

  return (
    <div className="mx-auto w-full max-w-4xl space-y-5 pb-24">
      <PageHeader
        icon="event_busy"
        title={t('staffAbsence.teacher.title')}
        description={t('staffAbsence.teacher.subtitle')}
        actions={
          <Button type="button" onClick={() => setOpen(true)} disabled={!query.data} data-testid="report-absence">
            <MaterialSymbol name="add" size="text-base" className="me-1" />
            {t('staffAbsence.dialog.reportTitle')}
          </Button>
        }
      />
      {query.isPending ? (
        <Skeleton className="h-48 rounded-2xl" />
      ) : query.isError ? (
        <p role="alert" className="rounded-xl border border-error/40 bg-error/5 p-4 text-sm text-error">{t(absenceErrorKey(query.error))}</p>
      ) : (
        <>
          <CoverBanner covering={query.data.covering} />
          <section aria-labelledby="my-absences" className="space-y-3 rounded-2xl border border-outline-variant bg-surface p-4 shadow-sm sm:p-5">
            <h2 id="my-absences" className="font-semibold text-on-surface">{t('staffAbsence.teacher.listTitle')}</h2>
            <AbsenceList absences={query.data.absences} today={query.data.today} emptyText={t('staffAbsence.teacher.empty')} />
          </section>
          {open ? <AbsenceDialog today={query.data.today} existing={query.data.absences} onClose={() => setOpen(false)} /> : null}
        </>
      )}
    </div>
  );
}
