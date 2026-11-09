import { useTranslation } from 'react-i18next';

import { PageHeader } from '@/components/ui/PageHeader';
import { MedicineRoundPanel } from '@/features/medicine-round/MedicineRoundPanel';
import { useSettings } from '@/lib/useSettings';

/** The nursery's medicine round today: every dose, who gave it, and what is overdue. */
export function AdminMedicinesPage() {
  const { t } = useTranslation();
  const { nurseryId } = useSettings();
  return (
    <div className="space-y-5">
      <PageHeader icon="medication" eyebrow={t('medicineRound.adminEyebrow')} title={t('medicineRound.adminTitle')} description={t('medicineRound.adminSubtitle')} />
      {nurseryId ? <MedicineRoundPanel nurseryId={nurseryId} /> : null}
    </div>
  );
}
