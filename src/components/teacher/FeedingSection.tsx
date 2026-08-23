import { useTranslation } from 'react-i18next';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

import type { DailyReportFormData } from '@/hooks/dailyReportsSchema';

type Props = {
  value: DailyReportFormData['feeding'];
  onChange: (value: DailyReportFormData['feeding']) => void;
};

export function FeedingSection({ value, onChange }: Props) {
  const { t } = useTranslation();

  const updateSession = (i: number, patch: Partial<{ time: string; amountMl: number }>) => {
    const next = [...value.bottleSessions];
    next[i] = { ...next[i], ...patch };
    onChange({ ...value, bottleSessions: next });
  };

  const addSession = () => {
    if (value.bottleSessions.length >= 12) return;
    onChange({ ...value, bottleSessions: [...value.bottleSessions, { time: '', amountMl: 0 }] });
  };

  const removeSession = (i: number) => {
    onChange({ ...value, bottleSessions: value.bottleSessions.filter((_, j) => j !== i) });
  };

  return (
    <section className="space-y-3 rounded-2xl border border-outline-variant bg-surface-container-lowest p-4">
      <h2 className="text-base font-semibold text-on-surface">{t('reports.daily.sections.feeding')}</h2>
      <p className="text-xs text-on-surface-variant">{t('reports.daily.feeding.bottleSessionsHint')}</p>
      {value.bottleSessions.map((s, i) => (
        <div key={i} className="grid gap-2 rounded-lg border border-outline-variant/60 p-2 md:grid-cols-[1fr_1fr_auto]">
          <div className="space-y-1">
            <Label className="text-xs">{t('reports.daily.feeding.bottleTime')}</Label>
            <Input type="time" value={s.time} onChange={(e) => updateSession(i, { time: e.target.value })} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">{t('reports.daily.feeding.amountMl')}</Label>
            <Input
              type="number"
              min={0}
              value={s.amountMl || ''}
              onChange={(e) => updateSession(i, { amountMl: Number(e.target.value || 0) })}
            />
          </div>
          <div className="flex items-end">
            <Button type="button" variant="outline" size="sm" onClick={() => removeSession(i)}>
              {t('reports.daily.feeding.removeBottle')}
            </Button>
          </div>
        </div>
      ))}
      <Button type="button" variant="outline" size="sm" onClick={addSession}>
        {t('reports.daily.feeding.addBottle')}
      </Button>
      <div className="grid gap-2 md:grid-cols-2">
        <div className="space-y-2">
          <Label>{t('reports.daily.feeding.nursingCount')}</Label>
          <Input
            type="number"
            min={0}
            value={value.nursingCount}
            onChange={(e) => onChange({ ...value, nursingCount: Number(e.target.value || 0) })}
          />
        </div>
        <div className="space-y-2">
          <Label>{t('reports.daily.feeding.nursingDuration')}</Label>
          <Input
            type="number"
            min={0}
            value={value.nursingDurationMinutes}
            onChange={(e) => onChange({ ...value, nursingDurationMinutes: Number(e.target.value || 0) })}
          />
        </div>
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={value.solidFoods} onChange={(e) => onChange({ ...value, solidFoods: e.target.checked })} />
        {t('reports.daily.feeding.solidFoods')}
      </label>
      <div className="space-y-2">
        <Label>{t('reports.daily.notesOptional')}</Label>
        <Input value={value.notes} onChange={(e) => onChange({ ...value, notes: e.target.value })} />
      </div>
    </section>
  );
}
