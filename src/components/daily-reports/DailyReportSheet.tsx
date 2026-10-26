import type { CSSProperties, ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

import { MealPlate } from '@/components/daily-reports/MealPlate';
import { NapHours } from '@/components/daily-reports/NapHours';
import { Drop3D, Orb3D, Tile3D } from '@/components/daily-reports/Shapes3D';
import { FamilyMessageSender } from '@/components/family-messages/FamilyMessageView';
import { MaterialSymbol } from '@/components/ui/MaterialSymbol';
import { StatusPill } from '@/components/ui/DataTable';
import { MEALS } from '@/lib/dailyReport';
import { childNameOf, classNameOf, type DailyReportCard } from '@/lib/dailyReportCard';
import { formatActivityTag } from '@/lib/dailyReportDisplay';
import {
  ACTIVITY_EMOJI,
  MOOD_EMOJI,
  MOOD_TONE,
  mealAmountName,
  moodName,
  NAP_EMOJI,
  napDurationText,
  napQualityName,
  questionName,
  TOILET_EMOJI,
} from '@/lib/dailyReportLabels';
import { cn, getUserInitials } from '@/lib/utils';

/** Sections come in one after another. */
const STAGGER_MS = 90;
const enter = (step: number): { className: string; style: CSSProperties } => ({
  className: 'animate-in fade-in slide-in-from-bottom-2 fill-mode-both duration-500 motion-reduce:animate-none',
  style: { animationDelay: `${step * STAGGER_MS}ms` },
});

function Section({ icon, title, step, className, children }: { icon: string; title: string; step: number; className?: string; children: ReactNode }) {
  const motion = enter(step);
  return (
    <section className={cn('space-y-4 rounded-2xl border border-outline-variant bg-surface p-4 sm:p-5', motion.className, className)} style={motion.style}>
      <h3 className="flex items-center gap-2 text-sm font-semibold text-on-surface">
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <MaterialSymbol name={icon} className="text-lg" />
        </span>
        {title}
      </h3>
      {children}
    </section>
  );
}

function Note({ text }: { text: string }) {
  return text.trim() ? <p className="rounded-lg bg-surface-container-lowest px-3 py-2 text-sm text-on-surface-variant">{text}</p> : null;
}

/**
 * A daily report as the family receives it: the child (photo, name, code, class of that day) and the
 * day, who sent it, then the day in 3D — plates that fill with food to what the child ate, a glass
 * bar per hour slept, the mood as a ball, a drop per toilet visit, a raised tile per activity, and
 * the teacher's note. The same sheet is the parent's report, the teacher's sent report, and the
 * editor's preview (`preview`).
 */
export function DailyReportSheet({ card, preview = false, className }: { card: DailyReportCard; preview?: boolean; className?: string }) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const locale = lang.startsWith('ar') ? 'ar-EG' : 'en-GB';
  const a = card.answers;
  const name = childNameOf(card, lang) || '—';
  const className_ = classNameOf(card, lang);
  const day = card.reportDate
    ? new Date(`${card.reportDate}T12:00:00`).toLocaleDateString(locale, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
    : '';
  const sentTime = card.publishedAt ? new Date(card.publishedAt).toLocaleTimeString(locale, { hour: 'numeric', minute: '2-digit', hour12: true }) : null;
  const napMinutes = a.nap.napped && a.nap.durationMinutes ? a.nap.durationMinutes : null;
  const napText = napMinutes ? napDurationText(t, napMinutes) : '';
  const toilet = a.toilet.changeCount;
  const tags = a.activities.tags;
  const bottles = a.feeding.bottleSessions.filter((s) => s.amountMl > 0 || s.time);
  const hasFeeding = bottles.length > 0 || a.feeding.nursingCount > 0 || a.feeding.solidFoods;

  return (
    <article className={cn('overflow-hidden rounded-2xl border border-outline-variant bg-surface shadow-sm', className)}>
      {/* The child and the day */}
      <header className="relative overflow-hidden bg-gradient-to-br from-primary/15 via-primary/5 to-surface px-4 py-5 sm:px-6">
        <span aria-hidden="true" className="pointer-events-none absolute -end-6 -top-8 h-32 w-32 rounded-full bg-warning/15" />
        <span aria-hidden="true" className="pointer-events-none absolute -bottom-10 end-24 h-20 w-20 rounded-full bg-success/10" />
        <div className="relative flex flex-wrap items-center gap-4">
          <span className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-primary text-xl font-bold text-primary-foreground shadow-md ring-4 ring-surface">
            {card.avatarUrl ? <img src={card.avatarUrl} alt="" className="h-full w-full object-cover" /> : getUserInitials(name, null)}
          </span>
          <div className="min-w-0 flex-1">
            <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-primary">
              {t('dailyReport.sheet.eyebrow')}
              {preview ? <StatusPill tone="warning" icon="visibility">{t('dailyReport.sheet.previewBadge')}</StatusPill> : null}
            </p>
            <h2 className="mt-0.5 font-headline text-2xl font-extrabold leading-tight text-on-surface">{name}</h2>
            <p className="mt-1 text-sm text-on-surface-variant">{day}</p>
          </div>
        </div>
        <div className="relative mt-4 flex flex-wrap gap-2">
          {card.childCode ? (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-surface/80 px-3 py-1 text-xs font-semibold text-on-surface ring-1 ring-outline-variant">
              <MaterialSymbol name="badge" className="text-sm text-primary" />
              <span className="text-on-surface-variant">{t('dailyReport.sheet.childCode')}</span>
              <span dir="ltr" className="tabular-nums">{card.childCode}</span>
            </span>
          ) : null}
          {className_ ? (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-surface/80 px-3 py-1 text-xs font-semibold text-on-surface ring-1 ring-outline-variant">
              <MaterialSymbol name="school" className="text-sm text-primary" />
              <span className="text-on-surface-variant">{t('dailyReport.sheet.class')}</span>
              {className_}
            </span>
          ) : null}
        </div>
      </header>

      {/* Who sent it */}
      <div className="flex flex-col gap-3 border-y border-outline-variant bg-surface-container-lowest px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <div className="min-w-0">
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-on-surface-variant">{t('dailyReport.sheet.sentBy')}</p>
          {card.sender ? (
            <FamilyMessageSender message={card.sender} />
          ) : (
            <p className="text-sm text-on-surface-variant">{t('familyMessages.unknownSender')}</p>
          )}
        </div>
        <p className="flex shrink-0 items-center gap-1.5 text-xs font-medium text-on-surface-variant">
          <MaterialSymbol name={sentTime ? 'mark_email_read' : 'schedule_send'} className="text-base" />
          {sentTime ? t('dailyReport.sheet.sentAt', { time: sentTime }) : t('dailyReport.sheet.notSentYet')}
        </p>
      </div>

      <div className="grid gap-4 p-4 sm:p-6 md:grid-cols-2">
        {/* Meals: a plate per meal, filled with food to what the child ate */}
        <Section icon="restaurant" title={t('dailyReport.sheet.meals')} step={1} className="md:col-span-2">
          {/* A row per meal on a phone (a plate beside its words), three big plates side by side above. */}
          <ul className="grid gap-4 sm:grid-cols-3 sm:gap-6">
            {MEALS.map((meal, i) => {
              const slot = a.meals[meal];
              const amount = slot.amount ? mealAmountName(t, slot.amount) : t('dailyReport.sheet.noAnswer');
              return (
                <li key={meal} className="grid grid-cols-[minmax(0,11rem)_minmax(0,1fr)] items-center gap-4 sm:flex sm:flex-col sm:gap-3 sm:text-center">
                  <MealPlate
                    meal={meal}
                    amount={slot.amount}
                    size={240}
                    delayMs={250 + i * 260}
                    label={t('dailyReport.sheet.mealLabel', { meal: questionName(t, meal), amount })}
                  />
                  <div>
                    <p className="text-base font-semibold text-on-surface">{questionName(t, meal)}</p>
                    <p className="text-base font-bold text-warning">{amount}</p>
                    {slot.notes.trim() ? <p className="mt-1 text-xs text-on-surface-variant">{slot.notes}</p> : null}
                  </div>
                </li>
              );
            })}
          </ul>
        </Section>

        {/* Nap: a glass bar per hour slept */}
        <Section icon="bedtime" title={questionName(t, 'nap')} step={2}>
          {napMinutes ? (
            <div className="flex flex-wrap items-end gap-4">
              <Orb3D tone="primary" size={64} delayMs={400}>{NAP_EMOJI.night}</Orb3D>
              <NapHours minutes={napMinutes} delayMs={550} label={t('dailyReport.sheet.napLabel', { duration: napText })} />
              <div className="ms-auto text-end">
                <p className="text-2xl font-extrabold text-on-surface">{napText}</p>
                {a.nap.quality ? <StatusPill tone="primary" icon="nights_stay">{napQualityName(t, a.nap.quality)}</StatusPill> : null}
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-4">
              <Orb3D tone="warning" size={64} delayMs={400}>{a.nap.napped === false ? NAP_EMOJI.awake : '❔'}</Orb3D>
              <p className="text-base font-bold text-on-surface">{a.nap.napped === false ? t('dailyReport.sheet.noNap') : t('dailyReport.sheet.noAnswer')}</p>
            </div>
          )}
          <Note text={a.nap.notes} />
        </Section>

        {/* Mood: a ball in the mood's colour */}
        <Section icon="mood" title={questionName(t, 'mood')} step={3}>
          {a.mood.mood ? (
            <div className="flex items-center gap-4">
              <Orb3D tone={MOOD_TONE[a.mood.mood]} size={96} delayMs={450}>{MOOD_EMOJI[a.mood.mood]}</Orb3D>
              <p className="text-xl font-extrabold text-on-surface">{moodName(t, a.mood.mood)}</p>
            </div>
          ) : (
            <p className="text-sm text-on-surface-variant">{t('dailyReport.sheet.noAnswer')}</p>
          )}
          <Note text={a.mood.notes} />
        </Section>

        {/* Toilet / diaper: a drop per visit */}
        <Section icon="baby_changing_station" title={questionName(t, 'toilet')} step={4}>
          {toilet == null ? (
            <p className="text-sm text-on-surface-variant">{t('dailyReport.sheet.noAnswer')}</p>
          ) : (
            <div className="flex flex-wrap items-center gap-4">
              <Orb3D tone="primary" size={64} delayMs={450}>{TOILET_EMOJI}</Orb3D>
              <div className="space-y-2">
                <p className="text-xl font-extrabold text-on-surface">
                  {toilet === 0 ? t('dailyReport.sheet.toiletNone') : t('dailyReport.sheet.toiletCount', { count: toilet })}
                </p>
                {toilet > 0 ? (
                  <span aria-hidden="true" className="flex flex-wrap items-end gap-1.5">
                    {Array.from({ length: Math.min(toilet, 8) }, (_, i) => (
                      <Drop3D key={i} size={32} delayMs={600 + i * 140} />
                    ))}
                  </span>
                ) : null}
              </div>
            </div>
          )}
          <Note text={a.toilet.notes} />
        </Section>

        {/* Activities: a raised tile each */}
        <Section icon="palette" title={questionName(t, 'activities')} step={5}>
          {tags.length ? (
            <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {tags.map((tag, i) => (
                <li key={tag}>
                  <Tile3D emoji={ACTIVITY_EMOJI[tag] ?? ACTIVITY_EMOJI.other} label={formatActivityTag(t, tag)} delayMs={550 + i * 110} />
                </li>
              ))}
            </ul>
          ) : null}
          {a.activities.freeText.trim() ? <p className="text-sm text-on-surface">{a.activities.freeText}</p> : null}
          {!tags.length && !a.activities.freeText.trim() ? <p className="text-sm text-on-surface-variant">{t('dailyReport.sheet.noAnswer')}</p> : null}
        </Section>

        {hasFeeding ? (
          <Section icon="child_care" title={t('reports.daily.sections.feeding')} step={6}>
            {bottles.length ? (
              <ul className="space-y-1 text-sm text-on-surface">
                {bottles.map((s, i) => (
                  <li key={i} className="flex items-center gap-2">
                    <span aria-hidden="true">🍼</span>
                    <span dir="ltr" className="tabular-nums">{s.time || '—'}</span>
                    <span className="tabular-nums">{t('dailyReport.sheet.bottleMl', { ml: s.amountMl })}</span>
                  </li>
                ))}
              </ul>
            ) : null}
            {a.feeding.nursingCount > 0 ? <p className="text-sm text-on-surface">{t('dailyReport.sheet.nursing', { count: a.feeding.nursingCount })}</p> : null}
            {a.feeding.solidFoods ? <p className="text-sm text-on-surface">{t('reports.daily.feeding.solidFoods')}</p> : null}
            <Note text={a.feeding.notes} />
          </Section>
        ) : null}

        {a.specialNotes.trim() ? (
          <Section icon="sticky_note_2" title={t('dailyReport.sheet.note')} step={7} className="md:col-span-2">
            <blockquote className="flex gap-2 rounded-lg border-s-4 border-primary/40 bg-surface-container-lowest px-3 py-2 text-sm leading-6 text-on-surface">
              <MaterialSymbol name="format_quote" className="mt-0.5 shrink-0 text-base text-primary" />
              <span className="whitespace-pre-line">{a.specialNotes}</span>
            </blockquote>
          </Section>
        ) : null}
      </div>
    </article>
  );
}
