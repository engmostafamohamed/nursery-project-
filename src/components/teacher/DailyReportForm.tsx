import { useTranslation } from 'react-i18next';

import { ActivitiesSection } from '@/components/teacher/ActivitiesSection';
import { FeedingSection } from '@/components/teacher/FeedingSection';
import { MealsSection } from '@/components/teacher/MealsSection';
import { MoodSection } from '@/components/teacher/MoodSection';
import { NapSection } from '@/components/teacher/NapSection';
import { ToiletSection } from '@/components/teacher/ToiletSection';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import type { DailyReportFormData } from '@/hooks/dailyReportsSchema';

type ChildOption = { id: string; name: string; ageYears: number };

type Props = {
  value: DailyReportFormData;
  children: ChildOption[];
  sameForAllChildren: boolean;
  onToggleSameForAll: (checked: boolean) => void;
  onChange: (value: DailyReportFormData) => void;
  onSaveDraft: () => Promise<void>;
  onPublish: () => Promise<void>;
  onCopyFromYesterday: () => Promise<void>;
  isSaving: boolean;
};

export function DailyReportForm({
  value,
  children,
  sameForAllChildren,
  onToggleSameForAll,
  onChange,
  onSaveDraft,
  onPublish,
  onCopyFromYesterday,
  isSaving,
}: Props) {
  const { t } = useTranslation();
  const activeChild = children.find((c) => c.id === value.childId);
  const isInfant = (activeChild?.ageYears ?? 99) < 2;

  return (
    <div className="space-y-4">
      <section className="grid gap-3 rounded-2xl border border-outline-variant bg-surface-container-lowest p-4 md:grid-cols-3">
        <div className="space-y-2">
          <Label>{t('reports.daily.child')}</Label>
          <select
            className="h-11 w-full rounded-lg border border-outline-variant bg-surface text-foreground px-3 text-sm"
            value={value.childId}
            onChange={(e) => onChange({ ...value, childId: e.target.value })}
          >
            <option value="">{t('reports.daily.selectChild')}</option>
            {children.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-2">
          <Label>{t('reports.daily.date')}</Label>
          <Input type="date" value={value.reportDate} onChange={(e) => onChange({ ...value, reportDate: e.target.value })} />
        </div>
        <div className="flex flex-col justify-end gap-1 text-xs text-on-surface-variant">
          <p>{t('reports.daily.statusHint')}</p>
          <label className="flex items-center gap-2 text-sm text-on-surface">
            <input type="checkbox" checked={sameForAllChildren} onChange={(e) => onToggleSameForAll(e.target.checked)} />
            {t('reports.daily.sameForAll')}
          </label>
        </div>
      </section>

      <MealsSection value={value.meals} onChange={(meals) => onChange({ ...value, meals })} />
      <NapSection value={value.nap} onChange={(nap) => onChange({ ...value, nap })} />
      <MoodSection value={value.mood} onChange={(mood) => onChange({ ...value, mood })} />
      <ToiletSection value={value.toilet} onChange={(toilet) => onChange({ ...value, toilet })} />
      <ActivitiesSection value={value.activities} onChange={(activities) => onChange({ ...value, activities })} />
      {isInfant ? <FeedingSection value={value.feeding} onChange={(feeding) => onChange({ ...value, feeding })} /> : null}

      <section className="space-y-2 rounded-2xl border border-outline-variant bg-surface-container-lowest p-4">
        <Label>{t('reports.daily.specialNotes')}</Label>
        <Textarea maxLength={500} value={value.specialNotes} onChange={(e) => onChange({ ...value, specialNotes: e.target.value })} />
      </section>

      <div className="flex flex-wrap gap-2">
        <Button variant="outline" onClick={() => void onCopyFromYesterday()}>
          {t('reports.daily.copyYesterday')}
        </Button>
        <Button variant="outline" onClick={() => void onSaveDraft()} disabled={isSaving}>
          {t('reports.daily.saveDraft')}
        </Button>
        <Button onClick={() => void onPublish()} disabled={isSaving}>
          {t('reports.daily.publish')}
        </Button>
      </div>
    </div>
  );
}
