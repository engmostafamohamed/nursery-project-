import { useTranslation } from 'react-i18next';

import { Button } from '@/components/ui/button';
import { MaterialSymbol } from '@/components/ui/MaterialSymbol';

import type { ParentSignUpFileBundle } from '@/features/parent-signup/parentSignUpFiles';
import type { ParentSignUpFormValues } from '@/features/parent-signup/parentSignUpValidation';
import { SIGNUP_STEPS, type SignUpStep } from '@/features/parent-signup/parentSignUpTypes';
import {
  MEDICATION_CONSENT_OPTIONS,
  type MedicationConsentId,
} from '@/lib/admissions/medicationConsentOptions';
import { allergyLabel } from '@/lib/allergies';

/** Reads back the picked allergies, expanding "other" into what the parent typed. */
function allergySummary(values: ParentSignUpFormValues, preferArabic: boolean): string {
  const picked = (values.allergyTypes ?? [])
    .map((value) => (value === 'other' ? values.allergyDetails.trim() : allergyLabel(value, preferArabic)))
    .filter(Boolean);
  return picked.join(preferArabic ? '، ' : ', ');
}

type Props = {
  values: ParentSignUpFormValues;
  files: ParentSignUpFileBundle;
  onJumpTo: (step: SignUpStep) => void;
};

type SectionRow = {
  label: string;
  value: string | null;
};

function useDisplay() {
  const { t } = useTranslation();

  const yesNo = (v: string) => {
    if (v === 'Yes') return t('common.yes');
    if (v === 'No') return t('common.no');
    return v || '—';
  };

  const notEmpty = (...parts: (string | null | undefined)[]): string | null => {
    const filtered = parts.map((p) => (p ?? '').trim()).filter((p) => p.length > 0);
    return filtered.length > 0 ? filtered.join(' ') : null;
  };

  return { yesNo, notEmpty };
}

function Section({
  title,
  icon,
  rows,
  onEdit,
  hint,
}: {
  title: string;
  icon: string;
  rows: SectionRow[];
  onEdit: () => void;
  hint?: string;
}) {
  const { t } = useTranslation();
  return (
    <section className="rounded-2xl border border-outline-variant bg-surface-container-lowest p-5">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <MaterialSymbol name={icon} className="text-primary" />
          <h4 className="font-semibold text-on-surface">{title}</h4>
        </div>
        <Button type="button" variant="ghost" size="sm" onClick={onEdit}>
          <MaterialSymbol name="edit" size="text-base" />
          <span>{t('signup.review.edit')}</span>
        </Button>
      </div>
      {hint && <p className="mb-3 text-xs text-on-surface-variant">{hint}</p>}
      <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
        {rows.map((row, idx) => (
          <div key={idx} className="flex min-w-0 flex-col">
            <dt className="text-xs uppercase tracking-wide text-on-surface-variant">{row.label}</dt>
            <dd className={row.value ? 'truncate text-on-surface' : 'text-on-surface-variant/60 italic'}>
              {row.value || '—'}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

export function StepReview({ values, files, onJumpTo }: Props) {
  const { t, i18n } = useTranslation();
  const { yesNo, notEmpty } = useDisplay();
  const isArabic = i18n.language === 'ar';
  const preferArabic = i18n.language.startsWith('ar');

  const childFullName = notEmpty(values.childFirstName, values.childMiddleName, values.childLastName);

  const meds = (values.medicationConsents ?? []) as MedicationConsentId[];
  const medLabels = meds
    .map((id) => MEDICATION_CONSENT_OPTIONS.find((o) => o.id === id))
    .filter((o): o is NonNullable<typeof o> => !!o)
    .map((o) => (isArabic ? o.labelAr : o.labelEn));

  const jump = (step: SignUpStep) => onJumpTo(step);

  const fileName = (f: File | null) => (f ? f.name : null);

  return (
    <div className="space-y-5">
      <div className="space-y-2">
        <h3 className="text-lg font-semibold text-on-surface">{t('signup.review.title')}</h3>
        <p className="text-sm text-on-surface-variant">{t('signup.review.description')}</p>
      </div>

      <Section
        title={t('signup.steps.child')}
        icon="child_care"
        onEdit={() => jump('child')}
        rows={[
          { label: t('signup.childFirstName'), value: childFullName },
          { label: t('signup.childNickname'), value: values.childNickname || null },
          { label: t('signup.childDob'), value: values.childDob || null },
          { label: t('signup.childNationality'), value: values.childNationality || null },
          { label: t('signup.childGender'), value: values.childGender || null },
          { label: t('signup.childPhoto'), value: fileName(files.childPhoto) },
        ]}
      />

      <Section
        title={t('signup.steps.parents')}
        icon="family_restroom"
        onEdit={() => jump('parents')}
        rows={[
          { label: t('signup.fatherFullName'), value: values.fatherFullName || null },
          { label: t('signup.fatherEmail'), value: values.fatherEmail || null },
          { label: t('signup.motherFullName'), value: values.motherFullName || null },
          { label: t('signup.motherEmail'), value: values.motherEmail || null },
        ]}
      />

      <Section
        title={t('signup.steps.family')}
        icon="home"
        onEdit={() => jump('family')}
        rows={[
          { label: t('signup.maritalStatus'), value: values.maritalStatus || null },
          { label: t('signup.address'), value: values.address || null },
          {
            label: t('signup.hasSiblings'),
            value: values.hasSiblings
              ? values.siblingAges || t('common.yes')
              : t('common.no'),
          },
          {
            label: t('signup.hasAllergy'),
            value: values.hasAllergy ? allergySummary(values, preferArabic) : t('common.no'),
          },
          {
            label: t('signup.hasMedicalCondition'),
            value: values.hasMedicalCondition
              ? values.medicalConditionDetails || t('common.yes')
              : t('common.no'),
          },
          { label: t('signup.childBehaviorHealthNotes'), value: values.childBehaviorHealthNotes || null },
        ]}
      />

      <Section
        title={t('signup.steps.enrollment')}
        icon="school"
        onEdit={() => jump('enrollment')}
        rows={[
          { label: t('signup.department'), value: values.department || null },
          { label: t('signup.schoolPreference'), value: values.schoolPreference || null },
          { label: t('signup.schoolAdmissionsPlan'), value: values.schoolAdmissionsPlan || null },
          { label: t('signup.academicYear'), value: values.academicYear || null },
          { label: t('signup.referralSource'), value: values.referralSource || null },
        ]}
      />

      <Section
        title={t('signup.steps.health')}
        icon="health_and_safety"
        onEdit={() => jump('health')}
        rows={[
          { label: t('signup.birthCertificate'), value: fileName(files.birthCertificate) },
          { label: t('signup.vaccinationCard'), value: fileName(files.vaccinationCard) },
        ]}
      />

      <Section
        title={t('signup.steps.emergency')}
        icon="emergency"
        onEdit={() => jump('emergency')}
        rows={(values.emergencyContacts ?? []).map((contact, index) => ({
          label: `${t('signup.emergencyContact')} ${index + 1}`,
          value: notEmpty(contact.name, contact.phone),
        }))}
      />

      <Section
        title={t('signup.steps.dailyCare')}
        icon="restaurant"
        onEdit={() => jump('dailyCare')}
        rows={[
          { label: t('signup.arrivalTime'), value: values.arrivalTime || null },
          { label: t('signup.takesBreakfastAtHome'), value: yesNo(values.takesBreakfastAtHome) },
          { label: t('signup.eatsNurseryMeals'), value: yesNo(values.eatsNurseryMeals) },
          { label: t('signup.diaperSupplyMethod'), value: values.diaperSupplyMethod || null },
          { label: t('signup.toiletTrainingStatus'), value: values.toiletTrainingStatus || null },
          { label: t('signup.napTimePreference'), value: yesNo(values.napTimePreference) },
          { label: t('signup.maxNapTime'), value: values.napTimePreference === 'Yes' ? values.maxNapTime || null : null },
        ]}
      />

      <Section
        title={t('signup.steps.pickups')}
        icon="directions_car"
        onEdit={() => jump('pickups')}
        rows={[
          {
            label: `${t('signup.pickupPerson')} 1`,
            value: notEmpty(values.pickupPerson1Name, values.pickupPerson1Phone),
          },
          {
            label: `${t('signup.pickupPerson')} 2`,
            value: notEmpty(values.pickupPerson2Name, values.pickupPerson2Phone),
          },
          { label: `${t('signup.pickupPhoto')} 1`, value: fileName(files.pickupPerson1Photo) },
          { label: `${t('signup.pickupPhoto')} 2`, value: fileName(files.pickupPerson2Photo) },
        ]}
      />

      <Section
        title={t('signup.steps.medicationConsents')}
        icon="medication"
        onEdit={() => jump('medicationConsents')}
        hint={t('signup.review.medicationHint')}
        rows={[
          {
            label: t('signup.review.medicationSelected'),
            value: medLabels.length > 0 ? medLabels.join(', ') : t('signup.review.medicationNone'),
          },
        ]}
      />

      <Section
        title={t('signup.steps.consents')}
        icon="verified"
        onEdit={() => jump('consents')}
        rows={[
          { label: t('signup.agreeHealthPolicyShort'), value: values.agreeHealthPolicy ? t('common.yes') : t('common.no') },
          { label: t('signup.agreeFinancialAgreementShort'), value: values.agreeFinancialAgreement ? t('common.yes') : t('common.no') },
          { label: t('signup.agreePoliciesShort'), value: values.agreePolicies ? t('common.yes') : t('common.no') },
          { label: t('signup.agreeInfoAccuracyShort'), value: values.agreeInfoAccuracy ? t('common.yes') : t('common.no') },
        ]}
      />

      {SIGNUP_STEPS.length > 0 && (
        <div className="flex items-start gap-3 rounded-xl bg-primary/5 px-4 py-3 text-sm text-on-surface">
          <MaterialSymbol name="rocket_launch" className="text-primary" />
          <p>{t('signup.review.readyToSubmit')}</p>
        </div>
      )}
    </div>
  );
}
