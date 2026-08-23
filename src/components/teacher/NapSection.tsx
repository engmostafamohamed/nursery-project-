import { useTranslation } from 'react-i18next';

import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

import type { DailyReportFormData, NapQuality } from '@/hooks/dailyReportsSchema';

type Props = {
  value: DailyReportFormData['nap'];
  onChange: (value: DailyReportFormData['nap']) => void;
};

const qualityOptions: NapQuality[] = ['good', 'ok', 'restless'];

export function NapSection({ value, onChange }: Props) {
  const { t } = useTranslation();
  return (
    <section className="space-y-3 rounded-2xl border border-outline-variant bg-surface-container-lowest p-4">
      <h2 className="text-base font-semibold text-on-surface">{t('reports.daily.sections.nap')}</h2>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={value.napped} onChange={(e) => onChange({ ...value, napped: e.target.checked })} />
        {t('reports.daily.nap.napped')}
      </label>
      {value.napped ? (
        <div className="grid gap-2 md:grid-cols-2">
          <div className="space-y-2">
            <Label>{t('reports.daily.nap.durationMinutes')}</Label>
            <Input
              type="number"
              min={0}
              value={value.durationMinutes ?? ''}
              onChange={(e) => onChange({ ...value, durationMinutes: e.target.value ? Number(e.target.value) : null })}
            />
          </div>
          <div className="space-y-2">
            <Label>{t('reports.daily.nap.quality')}</Label>
            <select
              className="h-11 w-full rounded-lg border border-outline-variant bg-surface text-foreground px-3 text-sm"
              value={value.quality}
              onChange={(e) => onChange({ ...value, quality: e.target.value as NapQuality })}
            >
              {qualityOptions.map((o) => (
                <option key={o} value={o}>
                  {t(`reports.daily.options.napQuality.${o}`)}
                </option>
              ))}
            </select>
          </div>
        </div>
      ) : null}
      <div className="space-y-2">
        <Label>{t('reports.daily.notesOptional')}</Label>
        <Input value={value.notes} onChange={(e) => onChange({ ...value, notes: e.target.value })} />
      </div>
    </section>
  );
}
