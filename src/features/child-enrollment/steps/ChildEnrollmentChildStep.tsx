import { useMemo } from 'react';
import { useFormContext } from 'react-hook-form';
import { useTranslation } from 'react-i18next';

import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { childDateOfBirthBounds } from '@/lib/onboardingDateBounds';
import { cn } from '@/lib/utils';

import type { ChildEnrollmentFileBundle } from '../childEnrollmentFiles';
import type { ChildEnrollmentFormValues } from '../childEnrollmentTypes';

type Props = {
  files: ChildEnrollmentFileBundle;
  onFilesChange: (next: ChildEnrollmentFileBundle) => void;
};

export function ChildEnrollmentChildStep({ files, onFilesChange }: Props) {
  const { t } = useTranslation();
  const { register, watch, formState } = useFormContext<ChildEnrollmentFormValues>();
  const dob = watch('dob');
  const lang = watch('nurseryLanguagePref');
  const dobBounds = childDateOfBirthBounds();

  const ageLabel = useMemo(() => {
    if (!dob) return '';
    const birth = new Date(dob);
    const now = new Date();
    const months =
      (now.getFullYear() - birth.getFullYear()) * 12 + (now.getMonth() - birth.getMonth());
    const years = Math.floor(months / 12);
    const m = months % 12;
    return t('childEnrollment.step1.ageDisplay', { years, months: m });
  }, [dob, t]);

  const dobErr = formState.errors.dob?.message as string | undefined;
  const genderErr = formState.errors.gender?.message as string | undefined;

  return (
    <div className="space-y-4">
      <div className="grid gap-3 md:grid-cols-2">
        <div className="space-y-1">
          <Label htmlFor="fullNameAr">{t('childEnrollment.step1.nameAr')} *</Label>
          <Input id="fullNameAr" {...register('fullNameAr')} />
        </div>
        <div className="space-y-1">
          <Label htmlFor="fullNameEn">
            {t('childEnrollment.step1.nameEn')}
            {lang !== 'ar' ? ' *' : ''}
          </Label>
          <Input id="fullNameEn" {...register('fullNameEn')} />
        </div>
        <div className="space-y-1">
          <Label htmlFor="dob">{t('childEnrollment.step1.dob')} *</Label>
          <Input
            id="dob"
            type="date"
            min={dobBounds.min}
            max={dobBounds.max}
            aria-invalid={Boolean(dobErr)}
            className={cn(dobErr && 'border-destructive')}
            {...register('dob')}
          />
          {dobErr ? (
            <p className="text-sm text-destructive" role="alert">
              {t(dobErr)}
            </p>
          ) : null}
        </div>
        <div className="space-y-1">
          <Label htmlFor="child-gender">{t('childEnrollment.step1.gender')} *</Label>
          <select
            id="child-gender"
            aria-invalid={Boolean(genderErr)}
            className={cn(
              'h-11 w-full rounded-lg border border-outline-variant bg-surface px-3 text-sm text-foreground',
              genderErr ? 'border-destructive' : 'border-outline-variant',
            )}
            {...register('gender')}
          >
            <option value="">{t('childEnrollment.step2.select')}</option>
            <option value="male">{t('common.genderMale')}</option>
            <option value="female">{t('common.genderFemale')}</option>
          </select>
          {genderErr ? (
            <p className="text-sm text-destructive" role="alert">
              {t(genderErr)}
            </p>
          ) : null}
        </div>
        <div className="space-y-1">
          <Label htmlFor="nationality">{t('childEnrollment.step1.nationality')}</Label>
          <Input id="nationality" {...register('nationality')} />
        </div>
        <div className="space-y-1">
          <Label htmlFor="birthCertNumber">{t('childEnrollment.step1.birthCertNumber')} *</Label>
          <Input id="birthCertNumber" {...register('birthCertNumber')} />
        </div>
      </div>
      {ageLabel ? <p className="text-sm text-on-surface-variant">{ageLabel}</p> : null}
      <div className="space-y-1">
        <Label>{t('childEnrollment.step1.photo')}</Label>
        <Input
          type="file"
          accept="image/jpeg,image/png,image/webp,image/gif"
          className="cursor-pointer"
          onChange={(e) => {
            const f = e.target.files?.[0] ?? null;
            onFilesChange({ ...files, childPhoto: f });
          }}
        />
      </div>
      <div className="space-y-1">
        <Label>{t('childEnrollment.step1.birthCertificateFile')} *</Label>
        <Input
          type="file"
          accept="image/jpeg,image/png,image/webp,application/pdf"
          className="cursor-pointer"
          onChange={(e) => {
            const f = e.target.files?.[0] ?? null;
            onFilesChange({ ...files, birthCertificate: f });
          }}
        />
        {files.birthCertificate ? (
          <p className="text-xs text-on-surface-variant">{files.birthCertificate.name}</p>
        ) : (
          <p className="text-xs text-on-surface-variant">{t('childEnrollment.step1.birthCertHint')}</p>
        )}
      </div>
    </div>
  );
}
