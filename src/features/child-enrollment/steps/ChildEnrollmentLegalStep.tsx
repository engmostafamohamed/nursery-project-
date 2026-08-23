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

export function ChildEnrollmentLegalStep({ files, onFilesChange }: Props) {
  const { t } = useTranslation();
  const { register, watch } = useFormContext<ChildEnrollmentFormValues>();
  const custody = watch('custodyStatus');

  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <Label>{t('childEnrollment.step6.custody')}</Label>
        <select className="h-11 w-full rounded-lg border border-outline-variant bg-surface text-foreground px-3 text-sm" {...register('custodyStatus')}>
          <option value="both">{t('childEnrollment.step6.custodyBoth')}</option>
          <option value="father">{t('childEnrollment.step6.custodyFather')}</option>
          <option value="mother">{t('childEnrollment.step6.custodyMother')}</option>
          <option value="guardian">{t('childEnrollment.step6.custodyGuardian')}</option>
          <option value="court_order">{t('childEnrollment.step6.custodyCourt')}</option>
        </select>
      </div>
      {custody === 'court_order' ? (
        <div className="space-y-1">
          <Label>{t('childEnrollment.step6.courtDoc')} *</Label>
          <Input
            type="file"
            accept="image/jpeg,image/png,image/webp,application/pdf"
            className="cursor-pointer"
            onChange={(e) => {
              const f = e.target.files?.[0] ?? null;
              onFilesChange({ ...files, courtOrder: f });
            }}
          />
        </div>
      ) : null}
      <div className="space-y-1">
        <Label>{t('childEnrollment.step6.marriageCert')}</Label>
        <Input
          type="file"
          accept="image/jpeg,image/png,image/webp,application/pdf"
          className="cursor-pointer"
          onChange={(e) => {
            const f = e.target.files?.[0] ?? null;
            onFilesChange({ ...files, marriageCertificate: f });
          }}
        />
      </div>
      <div className="space-y-1">
        <Label>{t('childEnrollment.step6.birthCertUpload')} *</Label>
        <Input
          type="file"
          accept="image/jpeg,image/png,image/webp,application/pdf"
          className="cursor-pointer"
          onChange={(e) => {
            const f = e.target.files?.[0] ?? null;
            onFilesChange({ ...files, birthCertificate: f });
          }}
        />
      </div>
    </div>
  );
}
