import { useTranslation } from 'react-i18next';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { MILESTONE_TEMPLATES, type MilestoneCategory } from '@/hooks/useMilestones';

export type MilestoneFormValue = {
  childId: string;
  category: MilestoneCategory;
  milestoneText: string;
  achievedAt: string;
  notes: string;
  photoUrl: string;
  sharedWithParent: boolean;
};

type Props = {
  value: MilestoneFormValue;
  childAge?: number;
  onChange: (value: MilestoneFormValue) => void;
  onSubmit: () => Promise<void>;
};

const categories: MilestoneCategory[] = ['motor_skills', 'social', 'cognitive', 'language', 'self_care', 'creative'];

export function MilestoneForm({ value, childAge, onChange, onSubmit }: Props) {
  const { t } = useTranslation();
  const ageBucket = childAge != null ? (childAge <= 2 ? '1-2' : childAge <= 3 ? '2-3' : '3-4') : '2-3';
  return (
    <div className="space-y-3 rounded-2xl border border-outline-variant bg-surface-container-lowest p-4">
      <div className="space-y-2">
        <Label>{t('milestones.category')}</Label>
        <select className="h-11 w-full rounded-lg border border-outline-variant bg-surface text-foreground px-3 text-sm" value={value.category} onChange={(e) => onChange({ ...value, category: e.target.value as MilestoneCategory })}>
          {categories.map((c) => <option key={c} value={c}>{t(`milestones.categories.${c}`)}</option>)}
        </select>
      </div>
      <div className="space-y-2">
        <Label>{t('milestones.milestoneText')}</Label>
        <Textarea
          maxLength={200}
          value={value.milestoneText}
          placeholder={t(`milestones.placeholders.${value.category}`)}
          onChange={(e) => onChange({ ...value, milestoneText: e.target.value })}
        />
        <div className="flex flex-wrap gap-2">
          {MILESTONE_TEMPLATES[ageBucket].map((tpl) => (
            <button key={tpl} type="button" className="rounded-full border border-outline-variant px-2 py-1 text-xs" onClick={() => onChange({ ...value, milestoneText: tpl })}>
              {tpl}
            </button>
          ))}
        </div>
      </div>
      <div className="grid gap-2 md:grid-cols-2">
        <div className="space-y-2">
          <Label>{t('milestones.achievedAt')}</Label>
          <Input type="date" value={value.achievedAt} onChange={(e) => onChange({ ...value, achievedAt: e.target.value })} />
        </div>
        <div className="space-y-2">
          <Label>{t('milestones.photoUrl')}</Label>
          <Input value={value.photoUrl} onChange={(e) => onChange({ ...value, photoUrl: e.target.value })} />
        </div>
      </div>
      <div className="space-y-2">
        <Label>{t('milestones.notesOptional')}</Label>
        <Textarea maxLength={300} value={value.notes} onChange={(e) => onChange({ ...value, notes: e.target.value })} />
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={value.sharedWithParent} onChange={(e) => onChange({ ...value, sharedWithParent: e.target.checked })} />
        {t('milestones.shareWithParent')}
      </label>
      <Button onClick={() => void onSubmit()}>{t('milestones.save')}</Button>
    </div>
  );
}
