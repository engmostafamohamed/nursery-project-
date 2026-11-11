import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Button } from '@/components/ui/button';
import { LoadError } from '@/components/ui/LoadError';
import { MaterialSymbol } from '@/components/ui/MaterialSymbol';
import { PageHeader } from '@/components/ui/PageHeader';
import { Skeleton } from '@/components/ui/skeleton';
import { AbsenceDialog } from '@/features/staff-absence/AbsenceDialog';
import { AbsenceTable } from '@/features/staff-absence/AbsenceTable';
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
        <LoadError message={t(absenceErrorKey(query.error))} onRetry={() => void query.refetch()} />
      ) : (
        <>
          <CoverBanner covering={query.data.covering} />
          <AbsenceTable absences={query.data.absences} today={query.data.today} title={t('staffAbsence.teacher.listTitle')} emptyText={t('staffAbsence.teacher.empty')} />
          {open ? <AbsenceDialog today={query.data.today} existing={query.data.absences} onClose={() => setOpen(false)} /> : null}
        </>
      )}
    </div>
  );
}
