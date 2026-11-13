import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { MaterialSymbol } from '@/components/ui/MaterialSymbol';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { TONE_TINT } from '@/components/ui/toneClasses';
import { templateBucket } from '@/features/milestones/milestoneDraft';
import { MILESTONE_CATEGORIES, MILESTONE_LOOK } from '@/features/milestones/milestones';
import { milestoneErrorKey, uploadMilestonePhoto, type MilestoneDraft } from '@/features/milestones/milestonesApi';
import { useMilestonePhoto } from '@/features/milestones/useMilestonePhoto';
import { cn } from '@/lib/utils';

type Props = {
  value: MilestoneDraft;
  onChange: (value: MilestoneDraft) => void;
  kids: { id: string; name: string }[];
  /** A recorded milestone keeps its child. */
  childLocked?: boolean;
  childAge?: number;
  nurseryId: string;
  today: string;
  saving: boolean;
  /** Text keys of what is missing, shown once the teacher tried to save. */
  problems: string[];
  onSubmit: () => void;
  onCancel: () => void;
};

/** The teacher's milestone: the child, what they did and when, a photo, a note, and whether the family sees it. */
export function MilestoneForm({ value, onChange, kids, childLocked, childAge, nurseryId, today, saving, problems, onSubmit, onCancel }: Props) {
  const { t } = useTranslation();
  const photoInput = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const photo = useMilestonePhoto(value.photoPath);
  const suggestions = t(`milestones.templates.${templateBucket(childAge)}`, { returnObjects: true }) as unknown;
  const set = (patch: Partial<MilestoneDraft>) => onChange({ ...value, ...patch });

  const pickPhoto = async (file: File) => {
    setUploading(true);
    try {
      set({ photoPath: await uploadMilestonePhoto(nurseryId, value.childId, file) });
    } catch (error) {
      toast.error(t(milestoneErrorKey(error)));
    } finally {
      setUploading(false);
    }
  };

  return (
    <form
      className="space-y-5 rounded-2xl border border-outline-variant bg-surface p-4 shadow-sm sm:p-6"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit();
      }}
      data-testid="milestone-form"
    >
      <div className="space-y-2">
        <Label htmlFor="milestone-child">{t('milestones.child')}</Label>
        <Select id="milestone-child" value={value.childId} disabled={childLocked} onChange={(e) => set({ childId: e.target.value, photoPath: null })}>
          <option value="">{t('milestones.selectChild')}</option>
          {kids.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </Select>
      </div>

      <fieldset className="space-y-2">
        <legend className="mb-2 text-sm font-medium text-on-surface">{t('milestones.category')}</legend>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3" role="radiogroup">
          {MILESTONE_CATEGORIES.map((c) => {
            const selected = value.category === c;
            return (
              <button
                key={c}
                type="button"
                role="radio"
                aria-checked={selected}
                onClick={() => set({ category: c })}
                className={cn(
                  'flex items-center gap-2 rounded-xl border px-3 py-2.5 text-start text-sm font-medium transition-colors',
                  selected ? 'border-primary bg-primary/5 text-on-surface ring-1 ring-primary' : 'border-outline-variant text-on-surface-variant hover:bg-surface-high',
                )}
              >
                <span className={cn('flex h-8 w-8 shrink-0 items-center justify-center rounded-lg', TONE_TINT[MILESTONE_LOOK[c].tone])}>
                  <MaterialSymbol name={MILESTONE_LOOK[c].icon} size="text-lg" />
                </span>
                {t(`milestones.categories.${c}`)}
              </button>
            );
          })}
        </div>
      </fieldset>

      <div className="space-y-2">
        <Label htmlFor="milestone-text">{t('milestones.milestoneText')}</Label>
        <Textarea
          id="milestone-text"
          maxLength={200}
          rows={2}
          value={value.milestoneText}
          placeholder={t(`milestones.placeholders.${value.category}`)}
          onChange={(e) => set({ milestoneText: e.target.value })}
        />
        {Array.isArray(suggestions) ? (
          <div className="flex flex-wrap gap-1.5">
            <span className="text-xs text-on-surface-variant">{t('milestones.form.suggestions')}</span>
            {(suggestions as string[]).map((s) => (
              <button
                key={s}
                type="button"
                className="rounded-full border border-outline-variant px-2.5 py-1 text-xs text-on-surface-variant hover:bg-surface-high"
                onClick={() => set({ milestoneText: s })}
              >
                {s}
              </button>
            ))}
          </div>
        ) : null}
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="milestone-date">{t('milestones.achievedAt')}</Label>
          <Input id="milestone-date" type="date" max={today} value={value.achievedAt} onChange={(e) => set({ achievedAt: e.target.value })} />
        </div>
        <div className="space-y-2">
          <span className="text-sm font-medium text-on-surface">{t('milestones.form.photo')}</span>
          <div className="flex items-center gap-3">
            {value.photoPath ? (
              photo ? <img src={photo} alt="" className="h-14 w-14 rounded-lg object-cover" /> : <span className="h-14 w-14 animate-pulse rounded-lg bg-surface-high" />
            ) : null}
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={uploading}
              onClick={() => (value.childId ? photoInput.current?.click() : toast.error(t('milestones.form.errors.child')))}
            >
              <MaterialSymbol name={uploading ? 'progress_activity' : 'add_a_photo'} size="text-base" className={cn('me-1', uploading && 'animate-spin')} />
              {value.photoPath ? t('milestones.form.photoChange') : t('milestones.form.photoAdd')}
            </Button>
            {value.photoPath ? (
              <Button type="button" variant="ghost" size="sm" onClick={() => set({ photoPath: null })}>
                {t('milestones.form.photoRemove')}
              </Button>
            ) : null}
          </div>
          <input
            ref={photoInput}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = '';
              if (file) void pickPhoto(file);
            }}
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="milestone-notes">{t('milestones.notesOptional')}</Label>
        <Textarea id="milestone-notes" maxLength={300} rows={3} value={value.notes} onChange={(e) => set({ notes: e.target.value })} />
      </div>

      <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-outline-variant p-3">
        <input type="checkbox" className="mt-1 h-4 w-4" checked={value.sharedWithParent} onChange={(e) => set({ sharedWithParent: e.target.checked })} />
        <span>
          <span className="block text-sm font-medium text-on-surface">{t('milestones.shareWithParent')}</span>
          <span className="block text-xs text-on-surface-variant">{t('milestones.form.shareHint')}</span>
        </span>
      </label>

      {problems.length ? (
        <ul role="alert" className="space-y-1 rounded-xl bg-error/10 p-3 text-sm text-error">
          {problems.map((p) => <li key={p}>{t(p)}</li>)}
        </ul>
      ) : null}

      <div className="flex flex-wrap justify-end gap-2">
        <Button type="button" variant="ghost" onClick={onCancel}>{t('common.cancel')}</Button>
        <Button type="submit" disabled={saving || uploading} data-testid="milestone-save">
          {saving ? <MaterialSymbol name="progress_activity" size="text-base" className="me-1 animate-spin" /> : null}
          {t('milestones.save')}
        </Button>
      </div>
    </form>
  );
}
