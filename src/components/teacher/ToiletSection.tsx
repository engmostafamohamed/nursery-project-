import { useTranslation } from 'react-i18next';

import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

import type { DailyReportFormData } from '@/hooks/dailyReportsSchema';

type Props = {
  value: DailyReportFormData['toilet'];
  onChange: (value: DailyReportFormData['toilet']) => void;
};

export function ToiletSection({ value, onChange }: Props) {
  const { t } = useTranslation();
  return (
    <section className="space-y-3 rounded-2xl border border-outline-variant bg-surface-container-lowest p-4">
      <h2 className="text-base font-semibold text-on-surface">{t('reports.daily.sections.toilet')}</h2>
      <div className="space-y-2">
        <Label>{t('reports.daily.toilet.changeCount')}</Label>
        <Input
          type="number"
          min={0}
          value={value.changeCount}
          onChange={(e) => onChange({ ...value, changeCount: Number(e.target.value || 0) })}
        />
      </div>
      <div className="space-y-2">
        <Label>{t('reports.daily.notesOptional')}</Label>
        <Input value={value.notes} onChange={(e) => onChange({ ...value, notes: e.target.value })} />
      </div>
    </section>
  );
}
