import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';

import { MaterialSymbol } from '@/components/ui/MaterialSymbol';
import { localName } from '@/features/food-and-beverage/menu';
import { cn, getUserInitials } from '@/lib/utils';

import { ageOn, medicationState, vaccinationState, worstSeverity, type ChildHealthProfile } from './childHealth';
import { goToSection, sectionId, TILE, type Tone } from './healthFormat';

type Fact = { key: string; icon: string; label: string; value: ReactNode; helper: string; tone: Tone; section?: string; /** The colour marks the kind of fact, not a problem. */ quiet?: boolean };

/**
 * Who the profile is about and the four things to know at a glance: blood type, allergies, daily
 * medicines and vaccinations. Each fact leads to its part of the page.
 */
export function HealthProfileHero({ profile, back, actions }: { profile: ChildHealthProfile; back: { to: string; label: string }; actions?: ReactNode }) {
  const { t, i18n } = useTranslation();
  const isArabic = i18n.language.startsWith('ar');
  const { child, today } = profile;
  const name = localName(child.nameAr, child.nameEn, isArabic);
  const className = localName(child.classNameAr, child.classNameEn, isArabic);
  const age = ageOn(child.dob, today);

  const worst = worstSeverity(profile.allergies);
  const expired = profile.medications.filter((m) => medicationState(m, today) === 'expired').length;
  const overdue = profile.vaccinations.filter((v) => vaccinationState(v, today) === 'overdue').length;
  const dueSoon = profile.vaccinations.filter((v) => vaccinationState(v, today) === 'due_soon').length;

  const facts: Fact[] = [
    {
      key: 'blood',
      icon: 'bloodtype',
      label: t('health.fields.bloodType'),
      value: child.bloodType ? <span dir="ltr">{child.bloodType}</span> : '—',
      helper: child.bloodType ? t('health.profile.facts.bloodKnown') : t('health.profile.facts.notRecorded'),
      tone: child.bloodType ? 'error' : 'neutral',
      quiet: true,
      section: 'contacts',
    },
    {
      key: 'allergies',
      icon: 'allergy',
      label: t('health.profile.sections.allergies'),
      value: profile.allergies.length,
      helper: worst ? t('health.profile.facts.worst', { severity: t(`health.severity.allergy.${worst}`) }) : t('health.profile.facts.noneRecorded'),
      tone: worst === 'life_threatening' || worst === 'severe' ? 'error' : worst === 'moderate' ? 'warning' : 'success',
      section: 'allergies',
    },
    {
      key: 'medications',
      icon: 'medication',
      label: t('health.profile.sections.medications'),
      value: profile.medications.length,
      helper: expired
        ? t('health.profile.facts.expired', { count: expired })
        : profile.medications.length ? t('health.profile.facts.inDate') : t('health.profile.facts.none'),
      tone: expired ? 'error' : profile.medications.length ? 'success' : 'neutral',
      section: 'medications',
    },
    {
      key: 'vaccinations',
      icon: 'vaccines',
      label: t('health.profile.sections.vaccinations'),
      value: profile.vaccinations.length,
      helper: overdue
        ? t('health.profile.facts.overdue', { count: overdue })
        : dueSoon ? t('health.profile.facts.dueSoon', { count: dueSoon })
          : profile.vaccinations.length ? t('health.profile.facts.upToDate') : t('health.profile.facts.noneRecorded'),
      tone: overdue ? 'error' : dueSoon ? 'warning' : profile.vaccinations.length ? 'success' : 'neutral',
      section: 'vaccinations',
    },
  ];

  return (
    <section className="overflow-hidden rounded-2xl border border-outline-variant bg-surface shadow-sm" data-testid="health-hero">
      <div className="no-print flex flex-wrap items-center justify-between gap-2 border-b border-outline-variant bg-surface-container-lowest px-3 py-2 sm:px-4">
        <Link to={back.to} className="inline-flex items-center gap-1 rounded-full px-2.5 py-1.5 text-sm font-medium text-primary transition-colors hover:bg-primary/10">
          <MaterialSymbol name="arrow_back" size="text-lg" className="rtl:rotate-180" />
          {back.label}
        </Link>
        {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
      </div>

      <div className="flex items-center gap-4 p-4 sm:p-5">
        {child.avatarUrl ? (
          <img src={child.avatarUrl} alt="" className="h-16 w-16 shrink-0 rounded-2xl object-cover ring-1 ring-outline-variant sm:h-20 sm:w-20" />
        ) : (
          <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-xl font-bold text-primary sm:h-20 sm:w-20" aria-hidden>
            {getUserInitials(name, '')}
          </span>
        )}
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wide text-primary">{t('health.profile.eyebrow')}</p>
          <h1 className="mt-0.5 truncate text-2xl font-bold text-on-surface">{name}</h1>
          <div className="mt-2 flex flex-wrap gap-1.5 text-xs">
            <Chip icon="school">{className || t('health.profile.noClass')}</Chip>
            {age ? (
              <Chip icon="cake">
                {age.years ? t('health.profile.age.years', { count: age.years }) : null}
                {age.years && age.months ? t('health.profile.age.and') : null}
                {age.months || !age.years ? t('health.profile.age.months', { count: age.months }) : null}
              </Chip>
            ) : null}
            {child.gender ? <Chip icon={child.gender === 'male' ? 'boy' : 'girl'}>{t(`health.profile.gender.${child.gender}`)}</Chip> : null}
            {child.status && child.status !== 'active' ? <Chip icon="pause_circle" tone="warning">{t(`health.profile.status.${child.status}`, { defaultValue: child.status })}</Chip> : null}
          </div>
        </div>
      </div>

      <ul className="grid grid-cols-2 gap-px border-t border-outline-variant bg-outline-variant lg:grid-cols-4">
        {facts.map((fact) => (
          <li key={fact.key} className="bg-surface">
            <button
              type="button"
              onClick={() => fact.section && goToSection(sectionId(fact.section))}
              className="flex h-full w-full items-start gap-3 p-4 text-start transition-colors hover:bg-surface-container-lowest focus-visible:bg-surface-container-lowest focus-visible:outline-none"
              data-testid={`health-fact-${fact.key}`}
            >
              <span className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-xl', TILE[fact.tone])} aria-hidden>
                <MaterialSymbol name={fact.icon} size="text-xl" />
              </span>
              <span className="min-w-0">
                <span className="block text-xs font-medium text-on-surface-variant">{fact.label}</span>
                <span className="block text-xl font-bold leading-7 tabular-nums text-on-surface">{fact.value}</span>
                <span className={cn('block text-xs', !fact.quiet && (fact.tone === 'error' || fact.tone === 'warning') ? `font-medium ${fact.tone === 'error' ? 'text-error' : 'text-warning'}` : 'text-on-surface-variant')}>
                  {fact.helper}
                </span>
              </span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

function Chip({ icon, tone = 'neutral', children }: { icon: string; tone?: 'neutral' | 'warning'; children: ReactNode }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full border px-2.5 py-1 font-medium',
        tone === 'warning' ? 'border-warning/30 bg-warning/10 text-warning' : 'border-outline-variant bg-surface text-on-surface-variant',
      )}
    >
      <MaterialSymbol name={icon} size="text-sm" />
      {children}
    </span>
  );
}
