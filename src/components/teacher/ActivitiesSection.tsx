import { useTranslation } from 'react-i18next';

import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';

import { ACTIVITY_TAG_KEYS, type DailyReportFormData } from '@/hooks/dailyReportsSchema';

type Props = {
  value: DailyReportFormData['activities'];
  onChange: (value: DailyReportFormData['activities']) => void;
};

export function ActivitiesSection({ value, onChange }: Props) {
  const { t } = useTranslation();
  const toggle = (k: string, checked: boolean) => {
    onChange({
      ...value,
      tags: checked ? [...new Set([...value.tags, k])] : value.tags.filter((x) => x !== k),
    });
  };

  return (
    <section className="space-y-3 rounded-2xl border border-outline-variant bg-surface-container-lowest p-4">
      <h2 className="text-base font-semibold text-on-surface">{t('reports.daily.sections.activities')}</h2>
      <div className="grid gap-2 md:grid-cols-2">
        {ACTIVITY_TAG_KEYS.map((k) => (
          <label key={k} className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={value.tags.includes(k)} onChange={(e) => toggle(k, e.target.checked)} />
            {t(`reports.daily.options.activities.${k}`)}
          </label>
        ))}
      </div>
      <div className="space-y-2">
        <Label>{t('reports.daily.activities.freeText')}</Label>
        <Textarea
          rows={3}
          value={value.freeText}
          onChange={(e) => onChange({ ...value, freeText: e.target.value })}
        />
      </div>
      <div className="space-y-2">
        <Label>{t('reports.daily.notesOptional')}</Label>
        <Input value={value.notes} onChange={(e) => onChange({ ...value, notes: e.target.value })} />
      </div>
    </section>
  );
}
