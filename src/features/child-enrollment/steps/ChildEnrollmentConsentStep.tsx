import { useFormContext } from 'react-hook-form';
import { useTranslation } from 'react-i18next';

import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

import type { ChildEnrollmentFileBundle } from '../childEnrollmentFiles';
import type { ChildEnrollmentFormValues } from '../childEnrollmentTypes';

type Props = {
  files: ChildEnrollmentFileBundle;
  onFilesChange: (next: ChildEnrollmentFileBundle) => void;
};

const CONSENT_KEYS = [
  'photoClassroom',
  'photoWebsite',
  'photoSocial',
  'photoPromo',
  'fieldTrips',
  'emergencyMedical',
  'ambulance',
  'hospital',
  'surgery',
  'dataPrivacy',
  'behaviorPolicy',
  'pickupPolicy',
  'liability',
] as const;

export function ChildEnrollmentConsentStep({ files, onFilesChange }: Props) {
  const { t } = useTranslation();
  const { register } = useFormContext<ChildEnrollmentFormValues>();

  return (
    <div className="space-y-6">
      <p className="text-sm font-medium">{t('childEnrollment.step7.consentsTitle')}</p>
      <div className="grid gap-2 sm:grid-cols-2">
        {CONSENT_KEYS.map((key) => (
          <label key={key} className="flex items-start gap-2 text-sm">
            <input type="checkbox" {...register(`consents.${key}`)} />
            {t(`childEnrollment.step7.consent.${key}`)}
          </label>
        ))}
      </div>
      <div className="space-y-2">
        <p className="text-sm font-medium">{t('childEnrollment.step7.vaccines')}</p>
        <div className="grid gap-2 md:grid-cols-2">
          <Input type="date" placeholder="BCG" {...register('vaccinationBcg')} />
          <Input type="date" {...register('vaccinationHepB1')} />
          <Input type="date" {...register('vaccinationHepB2')} />
          <Input type="date" {...register('vaccinationHepB3')} />
          <Input type="date" {...register('vaccinationPolio')} />
          <Input type="date" {...register('vaccinationDtp')} />
          <Input type="date" {...register('vaccinationMmr')} />
        </div>
      </div>
      <div className="space-y-1">
        <Label>{t('childEnrollment.step7.vaccinationCard')} *</Label>
        <Input
          type="file"
          accept="image/jpeg,image/png,image/webp,application/pdf"
          className="cursor-pointer"
          onChange={(e) => {
            const f = e.target.files?.[0] ?? null;
            onFilesChange({ ...files, vaccinationCard: f });
          }}
        />
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        <div className="space-y-1">
          <Label>{t('childEnrollment.step7.signatureName')} *</Label>
          <Input {...register('signatureName')} />
        </div>
        <div className="space-y-1">
          <Label>{t('childEnrollment.step7.signatureDate')} *</Label>
          <Input type="date" {...register('signatureDate')} />
        </div>
      </div>
    </div>
  );
}
