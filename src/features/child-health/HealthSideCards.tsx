import { useTranslation } from 'react-i18next';

import { Button } from '@/components/ui/button';
import { MaterialSymbol } from '@/components/ui/MaterialSymbol';
import { localName } from '@/features/food-and-beverage/menu';
import { MEDICATION_CONSENT_OPTIONS } from '@/lib/admissions/medicationConsentOptions';
import { allergyLabel } from '@/lib/allergies';
import { cn } from '@/lib/utils';

import { carePeople, type CareTag, type ChildHealthProfile } from './childHealth';
import { sectionId, type Tone } from './healthFormat';
import { Detail, EmptyNote, HealthCard, Pill } from './HealthUi';

const TAG_TONE: Record<CareTag, Tone> = { emergency: 'error', primary: 'primary', parent: 'neutral', medical: 'success', nursery: 'neutral' };
const TAG_ORDER: CareTag[] = ['emergency', 'primary', 'parent', 'medical', 'nursery'];

/** A phone number that dials when tapped, written left to right. */
function PhoneLink({ phone, name }: { phone: string; name: string }) {
  const { t } = useTranslation();
  return (
    <a
      href={`tel:${phone.replace(/[^\d+]/g, '')}`}
      className="inline-flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary/5 px-3 py-1.5 text-sm font-semibold text-primary transition-colors hover:bg-primary/10"
      aria-label={t('health.profile.contacts.call', { name, phone })}
    >
      <MaterialSymbol name="call" size="text-base" />
      <span dir="ltr">{phone}</span>
    </a>
  );
}

/** Everyone to call about the child, emergency contacts first, each once with what they are to the child. */
export function CareContactsCard({ profile }: { profile: ChildHealthProfile }) {
  const { t, i18n } = useTranslation();
  const isArabic = i18n.language.startsWith('ar');
  const people = carePeople(profile);

  return (
    <HealthCard id={sectionId('contacts')} icon="contact_emergency" title={t('health.profile.sections.contacts')} hint={t('health.profile.hints.contacts')} count={people.length} tone="error">
      {people.length === 0 ? (
        <EmptyNote icon="person_off" text={t('health.profile.contacts.empty')} />
      ) : (
        <ul className="space-y-2.5" data-testid="care-contacts">
          {people.map((person) => {
            const name = localName(person.nameAr, person.nameEn, isArabic) || t('health.profile.contacts.unnamed');
            const relation = person.relationship ? t(`health.profile.relations.${person.relationship.toLowerCase()}`, { defaultValue: person.relationship }) : null;
            return (
              <li key={person.key} className="rounded-xl border border-outline-variant p-3">
                <div className="flex items-start gap-3">
                  <span className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-full', person.tags.includes('emergency') ? 'bg-error/10 text-error' : 'bg-surface-high text-on-surface-variant')} aria-hidden>
                    <MaterialSymbol name={person.tags.includes('parent') ? 'family_restroom' : 'person'} size="text-lg" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold text-on-surface">{name}</p>
                    {relation ? <p className="text-xs text-on-surface-variant">{relation}</p> : null}
                    <div className="mt-1.5 flex flex-wrap gap-1">
                      {TAG_ORDER.filter((tag) => person.tags.includes(tag)).map((tag) => (
                        <Pill key={tag} tone={TAG_TONE[tag]}>{t(`health.profile.contacts.tags.${tag}`)}</Pill>
                      ))}
                    </div>
                  </div>
                </div>
                <div className="mt-2.5">
                  {person.phone ? <PhoneLink phone={person.phone} name={name} /> : <p className="text-xs text-on-surface-variant">{t('health.profile.contacts.noPhone')}</p>}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </HealthCard>
  );
}

/** The child's doctor and insurance; staff who may edit change them (with the blood type) here. */
export function DoctorInsuranceCard({ profile, onEdit }: { profile: ChildHealthProfile; onEdit?: () => void }) {
  const { t } = useTranslation();
  const r = profile.record;
  const nothing = !r.pediatricianName && !r.pediatricianPhone && !r.pediatricianClinic && !r.insuranceProvider && !r.insurancePolicyNumber && !r.insuranceNotes;
  const edit = onEdit ? (
    <Button type="button" size="sm" variant="outline" onClick={onEdit} data-testid="edit-overview">
      <MaterialSymbol name="edit" size="text-base" className="me-1" />
      {t('health.profile.actions.edit')}
    </Button>
  ) : undefined;

  return (
    <HealthCard id={sectionId('doctor')} icon="stethoscope" title={t('health.profile.sections.doctor')} hint={t('health.profile.hints.doctor')} action={edit}>
      {nothing ? (
        <EmptyNote icon="stethoscope" text={onEdit ? t('health.profile.doctor.emptyStaff') : t('health.profile.doctor.emptyParent')} />
      ) : (
        <div className="space-y-4" data-testid="doctor-insurance">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-on-surface-variant">{t('health.profile.doctor.pediatrician')}</p>
            <p className="mt-1 font-semibold text-on-surface">{r.pediatricianName ?? '—'}</p>
            {r.pediatricianClinic ? <p className="text-sm text-on-surface-variant">{r.pediatricianClinic}</p> : null}
            {r.pediatricianPhone ? <div className="mt-2"><PhoneLink phone={r.pediatricianPhone} name={r.pediatricianName ?? ''} /></div> : null}
          </div>
          <div className="border-t border-outline-variant pt-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-on-surface-variant">{t('health.profile.doctor.insurance')}</p>
            <dl className="mt-2 grid gap-3 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
              <Detail label={t('health.fields.insuranceProvider')} value={r.insuranceProvider} />
              <Detail label={t('health.fields.insurancePolicy')} value={r.insurancePolicyNumber ? <span dir="ltr">{r.insurancePolicyNumber}</span> : null} />
              <Detail label={t('health.fields.insuranceNotes')} value={r.insuranceNotes} wide />
            </dl>
          </div>
        </div>
      )}
    </HealthCard>
  );
}

/** What the parents wrote about health when they enrolled, as they wrote it. */
export function EnrollmentNotesCard({ profile }: { profile: ChildHealthProfile }) {
  const { t, i18n } = useTranslation();
  const isArabic = i18n.language.startsWith('ar');
  const e = profile.enrollment;
  const consentLabel = (id: string) => {
    const option = MEDICATION_CONSENT_OPTIONS.find((o) => o.id === id);
    return option ? (isArabic ? option.labelAr : option.labelEn) : id;
  };
  const yesNo = (v: boolean | null) => (v === null ? null : v ? t('common.yes') : t('common.no'));
  const allergyTypes = e.allergyTypes.map((v) => allergyLabel(v, isArabic)).join('، ');
  // Only what the parents answered; a question left blank is not shown.
  const rows: Array<[key: string, value: string | null, wide: boolean]> = [
    ['hasAllergy', yesNo(e.hasAllergy ?? (allergyTypes || e.foodAllergies ? true : null)), false],
    ['allergyTypes', allergyTypes || null, false],
    ['foodAllergies', e.foodAllergies, true],
    ['otherAllergies', e.allergyOtherDetails, true],
    ['hasCondition', yesNo(e.hasMedicalCondition ?? (e.medicalConditionDetails ? true : null)), false],
    ['condition', e.medicalConditionDetails, true],
    ['notes', e.healthNotes, true],
  ];
  const empty = rows.every(([, value]) => !value) && e.medicationConsents.length === 0;

  return (
    <HealthCard id={sectionId('enrollment')} icon="assignment" title={t('health.profile.sections.enrollment')} hint={t('health.profile.hints.enrollment')} tone="neutral">
      {empty ? (
        <EmptyNote icon="assignment" text={t('health.profile.enrollment.nothing')} />
      ) : (
        <div className="space-y-4" data-testid="enrollment-notes">
          <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
            {rows
              .filter(([, value]) => value)
              .map(([key, value, wide]) => (
                <Detail key={key} label={t(`health.profile.enrollment.${key}`)} value={value} wide={wide} />
              ))}
          </dl>
          <div className="border-t border-outline-variant pt-3">
            <p className="text-xs font-medium text-on-surface-variant">{t('health.profile.enrollment.consents')}</p>
            {e.medicationConsents.length ? (
              <ul className="mt-1.5 flex flex-wrap gap-1.5">
                {e.medicationConsents.map((c) => (
                  <li key={c}>
                    <Pill tone="success" icon="check">{consentLabel(c)}</Pill>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-0.5 text-sm text-on-surface-variant">{t('health.profile.enrollment.noConsents')}</p>
            )}
          </div>
        </div>
      )}
    </HealthCard>
  );
}
