import { useTranslation } from 'react-i18next';

import { PageHeader } from '@/components/ui/PageHeader';
import { MedicineRoundPanel } from '@/features/medicine-round/MedicineRoundPanel';

/** A teacher's medicine round: today's doses for the children they look after (or cover) today. */
export function TeacherMedicinesPage() {
  const { t } = useTranslation();
  return (
    <div className="space-y-5">
      <PageHeader icon="medication" title={t('medicineRound.teacherTitle')} description={t('medicineRound.teacherSubtitle')} />
      <MedicineRoundPanel />
    </div>
  );
}
