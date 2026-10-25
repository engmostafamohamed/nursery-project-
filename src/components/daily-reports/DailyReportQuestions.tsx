import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

import { Button } from '@/components/ui/button';
import { FieldError, invalidFieldClass } from '@/components/ui/FieldError';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { MaterialSymbol } from '@/components/ui/MaterialSymbol';
import { Textarea } from '@/components/ui/textarea';
import {
  ACTIVITY_TAGS,
  MEAL_AMOUNTS,
  MEALS,
  MOODS,
  NAP_QUALITIES,
  type DailyReportAnswers,
  type Meal,
  type MealAmount,
  type Mood,
  type NapQuality,
  type Question,
} from '@/lib/dailyReport';
import { questionName } from '@/lib/dailyReportLabels';
import { cn } from '@/lib/utils';

type T = ReturnType<typeof useTranslation>['t'];

const MOOD_EMOJI: Record<Mood, string> = { happy: '😊', content: '😌', fussy: '😣', cranky: '😤' };
const NAP_MAX_MINUTES = 300;
const TOILET_MAX = 30;

function mealAmountName(t: T, amount: MealAmount): string {
  if (amount === 'none') return t('reports.daily.options.mealAmount.none');
  if (amount === 'some') return t('reports.daily.options.mealAmount.some');
  return t('reports.daily.options.mealAmount.all');
}

function napQualityName(t: T, quality: NapQuality): string {
  if (quality === 'good') return t('reports.daily.options.napQuality.good');
  if (quality === 'ok') return t('reports.daily.options.napQuality.ok');
  return t('reports.daily.options.napQuality.restless');
}

function moodName(t: T, mood: Mood): string {
  if (mood === 'happy') return t('reports.daily.options.mood.happy');
  if (mood === 'content') return t('reports.daily.options.mood.content');
  if (mood === 'fussy') return t('reports.daily.options.mood.fussy');
  return t('reports.daily.options.mood.cranky');
}

/** A whole number from an input, kept between min and max; empty is "not answered". */
function wholeNumber(raw: string, min: number, max: number): number | null {
  if (raw.trim() === '') return null;
  const n = Math.round(Number(raw));
  if (!Number.isFinite(n)) return null;
  return Math.min(max, Math.max(min, n));
}

/** One choice among a few, as chips (a radio group). */
function Choices<V extends string | boolean>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: V | null;
  options: { value: V; label: ReactNode }[];
  onChange: (value: V) => void;
}) {
  return (
    <div role="radiogroup" aria-label={label} className="flex flex-wrap gap-2">
      {options.map((o) => {
        const selected = o.value === value;
        return (
          <button
            key={String(o.value)}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => onChange(o.value)}
            className={cn(
              'inline-flex min-h-11 items-center gap-1.5 rounded-full border px-4 text-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-60',
              selected ? 'border-primary bg-primary text-primary-foreground shadow-sm' : 'border-outline-variant bg-surface text-on-surface hover:bg-surface-high',
            )}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

function Required({ answered }: { answered: boolean }) {
  const { t } = useTranslation();
  return answered ? (
    <span className="inline-flex items-center gap-1 text-xs font-semibold text-success">
      <MaterialSymbol name="check_circle" className="text-base" />
      {t('dailyReport.editor.answered')}
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 text-xs font-semibold text-warning">
      <MaterialSymbol name="error" className="text-base" />
      {t('dailyReport.editor.notAnswered')}
    </span>
  );
}

function QuestionCard({ id, icon, title, hint, status, children }: { id: string; icon: string; title: string; hint?: string; status?: ReactNode; children: ReactNode }) {
  return (
    <section id={id} className="scroll-mt-24 space-y-4 rounded-xl border border-outline-variant bg-surface p-4 shadow-sm sm:p-5">
      <header className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
            <MaterialSymbol name={icon} className="text-xl" />
          </span>
          <div className="min-w-0">
            <h2 className="text-base font-semibold text-on-surface">{title}</h2>
            {hint ? <p className="text-xs text-on-surface-variant">{hint}</p> : null}
          </div>
        </div>
        {status}
      </header>
      {children}
    </section>
  );
}

function NoteInput({ id, value, onChange }: { id: string; value: string; onChange: (value: string) => void }) {
  const { t } = useTranslation();
  return (
    <div className="space-y-1">
      <Label htmlFor={id} className="text-xs text-on-surface-variant">{t('dailyReport.editor.note')}</Label>
      <Input id={id} value={value} maxLength={300} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}

/**
 * The daily report's questions: meals, nap, mood, toilet and activities (all required), the
 * youngest children's feeding and a note to the family (optional). Each required question says
 * live whether it is answered. Read-only once the report is sent.
 */
export function DailyReportQuestions({
  value,
  onChange,
  missing,
  readOnly,
  showFeeding,
}: {
  value: DailyReportAnswers;
  onChange: (value: DailyReportAnswers) => void;
  missing: Question[];
  readOnly: boolean;
  showFeeding: boolean;
}) {
  const { t } = useTranslation();
  const isMissing = (q: Question) => missing.includes(q);
  const setMeal = (meal: Meal, patch: Partial<DailyReportAnswers['meals'][Meal]>) =>
    onChange({ ...value, meals: { ...value.meals, [meal]: { ...value.meals[meal], ...patch } } });
  const nap = value.nap;
  const napTimeMissing = nap.napped === true && !(nap.durationMinutes != null && nap.durationMinutes > 0);
  const napQualityMissing = nap.napped === true && nap.quality == null;
  const toggleTag = (tag: string) => {
    const tags = value.activities.tags.includes(tag) ? value.activities.tags.filter((x) => x !== tag) : [...value.activities.tags, tag];
    onChange({ ...value, activities: { ...value.activities, tags } });
  };
  const feeding = value.feeding;
  const setFeeding = (patch: Partial<DailyReportAnswers['feeding']>) => onChange({ ...value, feeding: { ...feeding, ...patch } });

  return (
    <fieldset disabled={readOnly} className="min-w-0 space-y-4">
      <legend className="sr-only">{t('dailyReport.editor.questionsLegend')}</legend>

      <QuestionCard
        id="q-meals"
        icon="restaurant"
        title={t('reports.daily.sections.meals')}
        hint={t('dailyReport.editor.mealsHint')}
        status={<Required answered={!MEALS.some(isMissing)} />}
      >
        <div className="divide-y divide-outline-variant">
          {MEALS.map((meal) => (
            <div key={meal} id={`q-${meal}`} className="grid scroll-mt-24 gap-3 py-3 first:pt-0 last:pb-0 lg:grid-cols-[10rem_1fr_16rem] lg:items-center">
              <div>
                <p className="text-sm font-semibold text-on-surface">{questionName(t, meal)}</p>
                {isMissing(meal) && !readOnly ? <p className="text-xs text-warning">{t('dailyReport.editor.pickOne')}</p> : null}
              </div>
              <Choices
                label={questionName(t, meal)}
                value={value.meals[meal].amount}
                options={MEAL_AMOUNTS.map((a) => ({ value: a, label: mealAmountName(t, a) }))}
                onChange={(amount) => setMeal(meal, { amount })}
              />
              <Input
                aria-label={t('dailyReport.editor.noteFor', { question: questionName(t, meal) })}
                placeholder={t('dailyReport.editor.notePlaceholder')}
                value={value.meals[meal].notes}
                maxLength={300}
                onChange={(e) => setMeal(meal, { notes: e.target.value })}
              />
            </div>
          ))}
        </div>
      </QuestionCard>

      <QuestionCard id="q-nap" icon="bedtime" title={questionName(t, 'nap')} hint={t('dailyReport.editor.napHint')} status={<Required answered={!isMissing('nap')} />}>
        <Choices
          label={t('dailyReport.editor.napped')}
          value={nap.napped}
          options={[
            { value: true, label: t('dailyReport.editor.nappedYes') },
            { value: false, label: t('dailyReport.editor.nappedNo') },
          ]}
          onChange={(napped) => onChange({ ...value, nap: { ...nap, napped } })}
        />
        {nap.napped ? (
          <div className="grid gap-4 md:grid-cols-[12rem_1fr]">
            <div className="space-y-1">
              <Label htmlFor="nap-minutes">{t('dailyReport.editor.napMinutes')}</Label>
              <Input
                id="nap-minutes"
                type="number"
                inputMode="numeric"
                min={1}
                max={NAP_MAX_MINUTES}
                value={nap.durationMinutes ?? ''}
                aria-invalid={napTimeMissing && !readOnly}
                aria-describedby="nap-minutes-error"
                className={cn(napTimeMissing && !readOnly && invalidFieldClass)}
                onChange={(e) => onChange({ ...value, nap: { ...nap, durationMinutes: wholeNumber(e.target.value, 0, NAP_MAX_MINUTES) } })}
              />
              <FieldError id="nap-minutes-error" message={napTimeMissing && !readOnly ? t('dailyReport.editor.napMinutesNeeded') : null} />
            </div>
            <div className="space-y-1">
              <p className="text-sm font-medium text-on-surface">{t('reports.daily.nap.quality')}</p>
              <Choices
                label={t('reports.daily.nap.quality')}
                value={nap.quality}
                options={NAP_QUALITIES.map((q) => ({ value: q, label: napQualityName(t, q) }))}
                onChange={(quality) => onChange({ ...value, nap: { ...nap, quality } })}
              />
              <FieldError message={napQualityMissing && !readOnly ? t('dailyReport.editor.napQualityNeeded') : null} />
            </div>
          </div>
        ) : null}
        <NoteInput id="nap-note" value={nap.notes} onChange={(notes) => onChange({ ...value, nap: { ...nap, notes } })} />
      </QuestionCard>

      <QuestionCard id="q-mood" icon="mood" title={questionName(t, 'mood')} hint={t('dailyReport.editor.moodHint')} status={<Required answered={!isMissing('mood')} />}>
        <Choices
          label={questionName(t, 'mood')}
          value={value.mood.mood}
          options={MOODS.map((m) => ({
            value: m,
            label: (
              <>
                <span aria-hidden className="text-lg">{MOOD_EMOJI[m]}</span>
                {moodName(t, m)}
              </>
            ),
          }))}
          onChange={(mood) => onChange({ ...value, mood: { ...value.mood, mood } })}
        />
        <NoteInput id="mood-note" value={value.mood.notes} onChange={(notes) => onChange({ ...value, mood: { ...value.mood, notes } })} />
      </QuestionCard>

      <QuestionCard id="q-toilet" icon="baby_changing_station" title={questionName(t, 'toilet')} hint={t('dailyReport.editor.toiletHint')} status={<Required answered={!isMissing('toilet')} />}>
        <div className="flex flex-wrap items-end gap-3">
          <div className="space-y-1">
            <Label htmlFor="toilet-count">{t('dailyReport.editor.toiletCount')}</Label>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="icon"
                aria-label={t('dailyReport.editor.less')}
                onClick={() => onChange({ ...value, toilet: { ...value.toilet, changeCount: Math.max(0, (value.toilet.changeCount ?? 0) - 1) } })}
              >
                <MaterialSymbol name="remove" />
              </Button>
              <Input
                id="toilet-count"
                type="number"
                inputMode="numeric"
                min={0}
                max={TOILET_MAX}
                className="w-20 text-center"
                value={value.toilet.changeCount ?? ''}
                onChange={(e) => onChange({ ...value, toilet: { ...value.toilet, changeCount: wholeNumber(e.target.value, 0, TOILET_MAX) } })}
              />
              <Button
                type="button"
                variant="outline"
                size="icon"
                aria-label={t('dailyReport.editor.more')}
                onClick={() => onChange({ ...value, toilet: { ...value.toilet, changeCount: Math.min(TOILET_MAX, (value.toilet.changeCount ?? 0) + 1) } })}
              >
                <MaterialSymbol name="add" />
              </Button>
            </div>
          </div>
          <Button
            type="button"
            variant={value.toilet.changeCount === 0 ? 'default' : 'outline'}
            onClick={() => onChange({ ...value, toilet: { ...value.toilet, changeCount: 0 } })}
          >
            {t('dailyReport.editor.toiletNone')}
          </Button>
        </div>
        <NoteInput id="toilet-note" value={value.toilet.notes} onChange={(notes) => onChange({ ...value, toilet: { ...value.toilet, notes } })} />
      </QuestionCard>

      <QuestionCard id="q-activities" icon="palette" title={questionName(t, 'activities')} hint={t('dailyReport.editor.activitiesHint')} status={<Required answered={!isMissing('activities')} />}>
        <div className="flex flex-wrap gap-2" role="group" aria-label={questionName(t, 'activities')}>
          {ACTIVITY_TAGS.map((tag) => {
            const on = value.activities.tags.includes(tag);
            return (
              <button
                key={tag}
                type="button"
                aria-pressed={on}
                onClick={() => toggleTag(tag)}
                className={cn(
                  'inline-flex min-h-11 items-center gap-1 rounded-full border px-4 text-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-60',
                  on ? 'border-primary bg-primary/10 text-primary' : 'border-outline-variant bg-surface text-on-surface hover:bg-surface-high',
                )}
              >
                {on ? <MaterialSymbol name="check" className="text-base" /> : null}
                {t(`reports.daily.options.activities.${tag}`)}
              </button>
            );
          })}
        </div>
        <div className="space-y-1">
          <Label htmlFor="activities-text">{t('dailyReport.editor.activitiesText')}</Label>
          <Textarea
            id="activities-text"
            rows={3}
            maxLength={1000}
            value={value.activities.freeText}
            onChange={(e) => onChange({ ...value, activities: { ...value.activities, freeText: e.target.value } })}
          />
        </div>
      </QuestionCard>

      {showFeeding ? (
        <QuestionCard id="q-feeding" icon="child_care" title={t('reports.daily.sections.feeding')} hint={t('dailyReport.editor.optional')}>
          {feeding.bottleSessions.map((s, i) => (
            <div key={i} className="grid gap-2 rounded-lg border border-outline-variant p-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
              <div className="space-y-1">
                <Label htmlFor={`bottle-time-${i}`} className="text-xs">{t('reports.daily.feeding.bottleTime')}</Label>
                <Input
                  id={`bottle-time-${i}`}
                  type="time"
                  value={s.time}
                  onChange={(e) => setFeeding({ bottleSessions: feeding.bottleSessions.map((x, j) => (j === i ? { ...x, time: e.target.value } : x)) })}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor={`bottle-ml-${i}`} className="text-xs">{t('reports.daily.feeding.amountMl')}</Label>
                <Input
                  id={`bottle-ml-${i}`}
                  type="number"
                  min={0}
                  max={500}
                  value={s.amountMl || ''}
                  onChange={(e) => setFeeding({ bottleSessions: feeding.bottleSessions.map((x, j) => (j === i ? { ...x, amountMl: wholeNumber(e.target.value, 0, 500) ?? 0 } : x)) })}
                />
              </div>
              <Button type="button" variant="ghost" onClick={() => setFeeding({ bottleSessions: feeding.bottleSessions.filter((_, j) => j !== i) })}>
                {t('reports.daily.feeding.removeBottle')}
              </Button>
            </div>
          ))}
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={feeding.bottleSessions.length >= 12}
            onClick={() => setFeeding({ bottleSessions: [...feeding.bottleSessions, { time: '', amountMl: 0 }] })}
          >
            <MaterialSymbol name="add" className="me-1 text-base" />
            {t('reports.daily.feeding.addBottle')}
          </Button>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <Label htmlFor="nursing-count">{t('reports.daily.feeding.nursingCount')}</Label>
              <Input id="nursing-count" type="number" min={0} max={20} value={feeding.nursingCount} onChange={(e) => setFeeding({ nursingCount: wholeNumber(e.target.value, 0, 20) ?? 0 })} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="nursing-minutes">{t('reports.daily.feeding.nursingDuration')}</Label>
              <Input
                id="nursing-minutes"
                type="number"
                min={0}
                max={300}
                value={feeding.nursingDurationMinutes}
                onChange={(e) => setFeeding({ nursingDurationMinutes: wholeNumber(e.target.value, 0, 300) ?? 0 })}
              />
            </div>
          </div>
          <label className="flex min-h-11 items-center gap-2 text-sm">
            <input type="checkbox" className="h-4 w-4" checked={feeding.solidFoods} onChange={(e) => setFeeding({ solidFoods: e.target.checked })} />
            {t('reports.daily.feeding.solidFoods')}
          </label>
        </QuestionCard>
      ) : null}

      <QuestionCard id="q-notes" icon="sticky_note_2" title={t('dailyReport.editor.familyNote')} hint={t('dailyReport.editor.optional')}>
        <Textarea
          aria-label={t('dailyReport.editor.familyNote')}
          rows={3}
          maxLength={500}
          value={value.specialNotes}
          onChange={(e) => onChange({ ...value, specialNotes: e.target.value })}
        />
      </QuestionCard>
    </fieldset>
  );
}
