import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';

import { Button } from '@/components/ui/button';
import { MaterialSymbol } from '@/components/ui/MaterialSymbol';
import { localName } from '@/lib/bilingualName';
import { formatTimeIn } from '@/lib/datetime';
import { cn } from '@/lib/utils';

import {
  isSameAllergy,
  medicationState,
  severityTone,
  sortMedications,
  sortVaccinations,
  vaccinationState,
  type Allergy,
  type Condition,
  type DoseRecord,
  type HealthViewer,
  type Medication,
  type Vaccination,
} from './childHealth';
import { formatDay, sectionId, type Tone } from './healthFormat';
import { AddButton, Detail, EmptyNote, HealthCard, ItemActions, Pill } from './HealthUi';

/*
 * The four lists of the profile: allergies, conditions, daily medicines and vaccinations. Each item
 * shows everything a carer needs at a glance; staff who may edit get edit and delete on each one.
 */

type Editing<T> = { canEdit: boolean; onAdd: () => void; onEdit: (item: T) => void; onDelete: (item: T) => void };

const STRIPE: Record<Tone, string> = {
  error: 'border-s-error',
  warning: 'border-s-warning',
  success: 'border-s-success',
  primary: 'border-s-primary',
  neutral: 'border-s-outline-variant',
};

function ItemShell({ tone, highlighted = false, children, testId }: { tone: Tone; highlighted?: boolean; children: React.ReactNode; testId?: string }) {
  return (
    <li
      className={cn(
        'rounded-xl border border-outline-variant border-s-4 bg-surface p-3.5 transition-shadow sm:p-4',
        STRIPE[tone],
        highlighted && 'ring-2 ring-primary ring-offset-2 ring-offset-surface',
      )}
      data-testid={testId}
    >
      {children}
    </li>
  );
}

// -----------------------------------------------------------------------------------------------
export function AllergiesCard({
  allergies,
  viewer,
  highlight,
  ...editing
}: { allergies: Allergy[]; viewer: HealthViewer; highlight?: string | null } & Editing<Allergy>) {
  const { t, i18n } = useTranslation();
  const isArabic = i18n.language.startsWith('ar');
  const target = allergies.find((a) => isSameAllergy(a.name, highlight));

  // Arriving from a link about one allergy: bring it into view.
  useEffect(() => {
    if (!target) return;
    const timer = window.setTimeout(() => document.getElementById(`allergy-${target.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 150);
    return () => window.clearTimeout(timer);
  }, [target]);

  const lifeThreatening = allergies.some((a) => a.severity === 'life_threatening');

  return (
    <HealthCard
      id={sectionId('allergies')}
      icon="allergy"
      title={t('health.profile.sections.allergies')}
      hint={t('health.profile.hints.allergies')}
      count={allergies.length}
      tone={lifeThreatening ? 'error' : 'warning'}
      action={editing.canEdit ? <AddButton label={t('health.actions.addAllergy')} onClick={editing.onAdd} testId="add-allergy" /> : undefined}
    >
      {lifeThreatening ? (
        <p className="mb-3 flex items-start gap-2 rounded-xl bg-error px-3.5 py-2.5 text-sm font-medium text-white">
          <MaterialSymbol name="emergency" size="text-lg" />
          <span>
            {t('health.allergy.lifeThreateningBanner')} · <span className="font-normal opacity-95">{t('health.allergy.lifeThreateningBannerHint')}</span>
          </span>
        </p>
      ) : null}
      {target && editing.canEdit && target.foodAllergens.length === 0 ? (
        <div className="mb-3 flex flex-col gap-2 rounded-xl border border-primary/30 bg-primary/5 p-3.5 sm:flex-row sm:items-center" data-testid="allergy-foods-prompt">
          <MaterialSymbol name="restaurant_menu" size="text-xl" className="text-primary" />
          <p className="flex-1 text-sm text-on-surface">{t('health.profile.allergy.fromAlerts', { name: target.name })}</p>
          <Button type="button" size="sm" onClick={() => editing.onEdit(target)}>
            {t('health.profile.allergy.chooseFoods')}
          </Button>
        </div>
      ) : null}
      {allergies.length === 0 ? (
        <EmptyNote
          icon="allergy"
          text={viewer === 'parent' ? t('health.profile.empty.allergiesParent') : t('health.empty.allergies')}
          action={editing.canEdit ? <AddButton label={t('health.actions.addAllergy')} onClick={editing.onAdd} /> : undefined}
        />
      ) : (
        <ul className="space-y-3">
          {allergies.map((a) => {
            const tone = severityTone(a.severity);
            return (
              <ItemShell key={a.id} tone={tone} highlighted={a.id === target?.id} testId="allergy-item">
                <div id={`allergy-${a.id}`} className="scroll-mt-28">
                  <div className="flex items-start gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="font-semibold text-on-surface">{a.name}</h3>
                        <Pill tone={tone === 'neutral' ? 'neutral' : tone} icon={tone === 'error' ? 'warning' : undefined}>
                          {t(`health.severity.allergy.${a.severity}`)}
                        </Pill>
                      </div>
                    </div>
                    {editing.canEdit ? <ItemActions name={a.name} onEdit={() => editing.onEdit(a)} onDelete={() => editing.onDelete(a)} /> : null}
                  </div>
                  <dl className="mt-3 grid gap-3 sm:grid-cols-3">
                    <Detail label={t('health.profile.allergy.reaction')} value={a.reaction} />
                    <Detail label={t('health.profile.allergy.treatment')} value={a.treatment} />
                    <Detail label={t('health.profile.allergy.lastReaction')} value={formatDay(a.lastReactionDate, isArabic)} />
                  </dl>
                  <div className="mt-3 flex flex-wrap items-center gap-1.5 border-t border-outline-variant pt-3 text-xs">
                    {a.foodAllergens.length ? (
                      <>
                        <span className="inline-flex items-center gap-1 font-medium text-success">
                          <MaterialSymbol name="task_alt" size="text-sm" />
                          {t('health.profile.allergy.menuChecked')}
                        </span>
                        {a.foodAllergens.map((f) => (
                          <span key={f} className="rounded-full bg-surface-high px-2 py-0.5 font-medium text-on-surface">{t(`fnb.allergens.${f}`)}</span>
                        ))}
                      </>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-on-surface-variant">
                        <MaterialSymbol name="no_food" size="text-sm" />
                        {t('health.profile.allergy.notOnMenu')}
                      </span>
                    )}
                  </div>
                </div>
              </ItemShell>
            );
          })}
        </ul>
      )}
    </HealthCard>
  );
}

// -----------------------------------------------------------------------------------------------
export function ConditionsCard({ conditions, viewer, ...editing }: { conditions: Condition[]; viewer: HealthViewer } & Editing<Condition>) {
  const { t, i18n } = useTranslation();
  const isArabic = i18n.language.startsWith('ar');
  return (
    <HealthCard
      id={sectionId('conditions')}
      icon="monitor_heart"
      title={t('health.profile.sections.conditions')}
      hint={t('health.profile.hints.conditions')}
      count={conditions.length}
      action={editing.canEdit ? <AddButton label={t('health.actions.addCondition')} onClick={editing.onAdd} testId="add-condition" /> : undefined}
    >
      {conditions.length === 0 ? (
        <EmptyNote
          icon="monitor_heart"
          text={viewer === 'parent' ? t('health.profile.empty.conditionsParent') : t('health.empty.conditions')}
          action={editing.canEdit ? <AddButton label={t('health.actions.addCondition')} onClick={editing.onAdd} /> : undefined}
        />
      ) : (
        <ul className="space-y-3">
          {conditions.map((c) => (
            <ItemShell key={c.id} tone="primary" testId="condition-item">
              <div className="flex items-start gap-2">
                <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
                  <h3 className="font-semibold text-on-surface">{c.name}</h3>
                  {c.severity ? <Pill tone="neutral">{c.severity}</Pill> : null}
                </div>
                {editing.canEdit ? <ItemActions name={c.name} onEdit={() => editing.onEdit(c)} onDelete={() => editing.onDelete(c)} /> : null}
              </div>
              {c.emergencyPlan ? (
                <div className="mt-3 rounded-lg bg-error/5 px-3 py-2">
                  <p className="text-xs font-semibold text-error">{t('health.profile.condition.plan')}</p>
                  <p className="mt-0.5 whitespace-pre-line text-sm text-on-surface">{c.emergencyPlan}</p>
                </div>
              ) : null}
              <dl className="mt-3 grid gap-3 sm:grid-cols-3">
                <Detail label={t('health.profile.condition.treatment')} value={c.treatment} />
                <Detail label={t('health.profile.condition.triggers')} value={c.triggers} />
                <Detail label={t('health.profile.condition.diagnosed')} value={formatDay(c.diagnosisDate, isArabic)} />
              </dl>
            </ItemShell>
          ))}
        </ul>
      )}
    </HealthCard>
  );
}

// -----------------------------------------------------------------------------------------------
const MED_TONE = { expired: 'error', expiring: 'warning', ok: 'success', no_date: 'neutral' } as const;
const CONSENT_TONE = { granted: 'success', pending: 'warning', denied: 'error' } as const;

export function MedicationsCard({ medications, today, tz, viewer, ...editing }: { medications: Medication[]; today: string; tz: string; viewer: HealthViewer } & Editing<Medication>) {
  const { t, i18n } = useTranslation();
  const isArabic = i18n.language.startsWith('ar');
  return (
    <HealthCard
      id={sectionId('medications')}
      icon="medication"
      title={t('health.profile.sections.medications')}
      hint={t('health.profile.hints.medications')}
      count={medications.length}
      action={editing.canEdit ? <AddButton label={t('health.actions.addMedication')} onClick={editing.onAdd} testId="add-medication" /> : undefined}
    >
      {medications.length === 0 ? (
        <EmptyNote
          icon="medication"
          text={viewer === 'parent' ? t('health.profile.empty.medicationsParent') : t('health.empty.medications')}
          action={editing.canEdit ? <AddButton label={t('health.actions.addMedication')} onClick={editing.onAdd} /> : undefined}
        />
      ) : (
        <ul className="space-y-3">
          {sortMedications(medications, today).map((m) => {
            const state = medicationState(m, today);
            return (
              <ItemShell key={m.id} tone={state === 'expired' ? 'error' : state === 'expiring' ? 'warning' : 'primary'} testId="medication-item">
                <div className="flex items-start gap-2">
                  <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
                    <h3 className="font-semibold text-on-surface">{m.name}</h3>
                    {m.dosage ? <span className="text-sm text-on-surface-variant">{m.dosage}</span> : null}
                  </div>
                  {editing.canEdit ? <ItemActions name={m.name} onEdit={() => editing.onEdit(m)} onDelete={() => editing.onDelete(m)} /> : null}
                </div>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  <Pill tone={MED_TONE[state]} icon={state === 'expired' ? 'event_busy' : 'event'}>
                    {state === 'no_date' ? t('health.profile.medication.noDate') : t(`health.profile.medication.${state}`, { date: formatDay(m.expiryDate, isArabic) })}
                  </Pill>
                  <Pill tone={CONSENT_TONE[m.consent]} icon={m.consent === 'granted' ? 'verified_user' : 'gpp_maybe'}>
                    {t(`health.profile.medication.consent.${m.consent}`)}
                  </Pill>
                </div>
                <DoseSchedule medication={m} tz={tz} />
                <dl className="mt-3 grid gap-3 sm:grid-cols-3">
                  <Detail label={t('health.profile.medication.instructions')} value={m.times} />
                  <Detail label={t('health.profile.medication.method')} value={t(`health.method.${m.method}`)} />
                  <Detail label={t('health.profile.medication.storage')} value={m.storage} />
                </dl>
              </ItemShell>
            );
          })}
        </ul>
      )}
    </HealthCard>
  );
}

// -----------------------------------------------------------------------------------------------
const VAC_TONE = { overdue: 'error', due_soon: 'warning', scheduled: 'primary', done: 'success' } as const;

export function VaccinationsCard({ vaccinations, today, viewer, ...editing }: { vaccinations: Vaccination[]; today: string; viewer: HealthViewer } & Editing<Vaccination>) {
  const { t, i18n } = useTranslation();
  const isArabic = i18n.language.startsWith('ar');
  return (
    <HealthCard
      id={sectionId('vaccinations')}
      icon="vaccines"
      title={t('health.profile.sections.vaccinations')}
      hint={t('health.profile.hints.vaccinations')}
      count={vaccinations.length}
      action={editing.canEdit ? <AddButton label={t('health.actions.addVaccination')} onClick={editing.onAdd} testId="add-vaccination" /> : undefined}
    >
      {vaccinations.length === 0 ? (
        <EmptyNote
          icon="vaccines"
          text={viewer === 'parent' ? t('health.profile.empty.vaccinationsParent') : t('health.empty.vaccinations')}
          action={editing.canEdit ? <AddButton label={t('health.actions.addVaccination')} onClick={editing.onAdd} /> : undefined}
        />
      ) : (
        <ul className="space-y-3">
          {sortVaccinations(vaccinations, today).map((v) => {
            const state = vaccinationState(v, today);
            return (
              <ItemShell key={v.id} tone={VAC_TONE[state]} testId="vaccination-item">
                <div className="flex items-start gap-2">
                  <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
                    <h3 className="font-semibold text-on-surface">{v.name}</h3>
                    <Pill tone="neutral">{t('health.profile.vaccination.dose', { dose: v.dose })}</Pill>
                    <Pill tone={VAC_TONE[state]}>{t(`health.profile.vaccination.${state}`)}</Pill>
                  </div>
                  {editing.canEdit ? <ItemActions name={v.name} onEdit={() => editing.onEdit(v)} onDelete={() => editing.onDelete(v)} /> : null}
                </div>
                <dl className="mt-3 grid gap-3 sm:grid-cols-4">
                  <Detail label={t('health.profile.vaccination.givenOn')} value={v.givenOn ? formatDay(v.givenOn, isArabic) : t('health.profile.vaccination.notGiven')} />
                  <Detail label={t('health.profile.vaccination.nextDue')} value={formatDay(v.nextDue, isArabic)} />
                  <Detail label={t('health.profile.vaccination.givenBy')} value={v.givenBy} />
                  <Detail label={t('health.profile.vaccination.batch')} value={v.batch} />
                </dl>
              </ItemShell>
            );
          })}
        </ul>
      )}
    </HealthCard>
  );
}

/**
 * When a medicine is given (its times, or "when needed"), its course, and what happened today:
 * each time given (at what time, by whom) or not given (and why), or still to come.
 */
function DoseSchedule({ medication: m, tz }: { medication: Medication; tz: string }) {
  const { t, i18n } = useTranslation();
  const isArabic = i18n.language.startsWith('ar');
  const clock = (iso: string) => formatTimeIn(iso, tz);
  const by = (d: DoseRecord) => (localName(d.byAr, d.byEn, isArabic));
  const doseFor = (time: string) => m.dosesToday.find((d) => d.scheduledTime === time);
  const extra = m.dosesToday.filter((d) => !d.scheduledTime);

  return (
    <div className="mt-3 space-y-2 rounded-lg bg-surface-container-lowest p-3" data-testid="dose-schedule">
      <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-on-surface-variant">
        <MaterialSymbol name="alarm" size="text-sm" className="text-primary" />
        {m.doseTimes.length ? t('health.profile.medication.givenAt', { times: m.doseTimes.join(' · ') }) : t('health.profile.medication.onlyWhenNeeded')}
        {m.startsOn || m.endsOn ? (
          <span>
            ·{' '}
            {m.startsOn && m.endsOn
              ? t('health.profile.medication.course', { from: formatDay(m.startsOn, isArabic), to: formatDay(m.endsOn, isArabic) })
              : m.endsOn
                ? t('health.profile.medication.courseUntilDate', { date: formatDay(m.endsOn, isArabic) })
                : t('health.profile.medication.courseFromDate', { date: formatDay(m.startsOn, isArabic) })}
          </span>
        ) : null}
      </p>
      {m.doseTimes.length || extra.length ? (
        <ul className="flex flex-wrap gap-1.5" aria-label={t('health.profile.medication.today')}>
          {m.doseTimes.map((time) => {
            const d = doseFor(time);
            return (
              <li key={time}>
                {d ? (
                  <Pill tone={d.status === 'given' ? 'success' : 'warning'} icon={d.status === 'given' ? 'check_circle' : 'block'}>
                    <span dir="ltr">{time}</span>
                    {' · '}
                    {d.status === 'given'
                      ? t('health.profile.medication.doseGiven', { time: clock(d.recordedAt), by: by(d) })
                      : t('health.profile.medication.doseSkipped', { reason: t(`medicineRound.reasons.${d.skipReason ?? 'other'}`) })}
                  </Pill>
                ) : (
                  <Pill tone="neutral" icon="schedule"><span dir="ltr">{time}</span> · {t('health.profile.medication.doseOpen')}</Pill>
                )}
              </li>
            );
          })}
          {extra.map((d) => (
            <li key={d.id}>
              <Pill tone="success" icon="check_circle">{t('health.profile.medication.doseGiven', { time: clock(d.recordedAt), by: by(d) })}</Pill>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
