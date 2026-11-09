import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';

import { MaterialSymbol } from '@/components/ui/MaterialSymbol';
import { cn } from '@/lib/utils';

import { roundCounts, roundSlots } from './medicineRound';
import { useMedicineRound } from './useMedicineRound';

/** On a teacher's home: medicines due now or overdue, leading to the round. Nothing when none. */
export function MedicineDueBanner() {
  const { t } = useTranslation();
  const query = useMedicineRound(null);
  const counts = useMemo(() => roundCounts(query.data ? roundSlots(query.data) : []), [query.data]);
  const waiting = counts.overdue + counts.due;
  if (!waiting) return null;
  const late = counts.overdue > 0;
  return (
    <Link
      to="/teacher/medicines"
      className={cn('flex items-center gap-3 rounded-2xl border p-4 transition-colors', late ? 'border-error/40 bg-error/5 hover:bg-error/10' : 'border-warning/40 bg-warning/5 hover:bg-warning/10')}
      data-testid="medicine-due-banner"
    >
      <span className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-white', late ? 'bg-error' : 'bg-warning')} aria-hidden>
        <MaterialSymbol name="medication" size="text-xl" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block font-semibold text-on-surface">{t('medicineRound.banner.title', { count: waiting })}</span>
        <span className="block text-xs text-on-surface-variant">{late ? t('medicineRound.banner.overdue', { count: counts.overdue }) : t('medicineRound.banner.hint')}</span>
      </span>
      <MaterialSymbol name="chevron_right" size="text-xl" className="text-on-surface-variant rtl:rotate-180" />
    </Link>
  );
}
