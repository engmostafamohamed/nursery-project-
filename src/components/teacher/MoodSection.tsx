import { useTranslation } from 'react-i18next';

import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

import type { DailyReportFormData, MoodType } from '@/hooks/dailyReportsSchema';

type Props = {
  value: DailyReportFormData['mood'];
  onChange: (value: DailyReportFormData['mood']) => void;
};

const moods: { key: MoodType; emoji: string }[] = [
  { key: 'happy', emoji: '😊' },
  { key: 'content', emoji: '😌' },
  { key: 'fussy', emoji: '😣' },
  { key: 'cranky', emoji: '😤' },
];

export function MoodSection({ value, onChange }: Props) {
  const { t } = useTranslation();
  return (
    <section className="space-y-3 rounded-2xl border border-outline-variant bg-surface-container-lowest p-4">
      <h2 className="text-base font-semibold text-on-surface">{t('reports.daily.sections.mood')}</h2>
      <div className="space-y-2">
        <Label>{t('reports.daily.mood.overallMood')}</Label>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {moods.map(({ key, emoji }) => (
            <button
              key={key}
              type="button"
              onClick={() => onChange({ ...value, mood: key })}
              className={`rounded-lg border px-2 py-3 text-sm ${value.mood === key ? 'border-primary bg-primary/10' : 'border-outline-variant'}`}
            >
              <span className="text-lg" aria-hidden>
                {emoji}
              </span>
              <span className="ms-1">{t(`reports.daily.options.mood.${key}`)}</span>
            </button>
          ))}
        </div>
      </div>
      <div className="space-y-2">
        <Label>{t('reports.daily.notesOptional')}</Label>
        <Input value={value.notes} onChange={(e) => onChange({ ...value, notes: e.target.value })} />
      </div>
    </section>
  );
}
