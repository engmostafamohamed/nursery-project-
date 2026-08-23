import { useFieldArray, useFormContext } from 'react-hook-form';
import { useTranslation } from 'react-i18next';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

import type { ChildEnrollmentFileBundle } from '../childEnrollmentFiles';
import type { ChildEnrollmentFormValues } from '../childEnrollmentTypes';

type Props = {
  files: ChildEnrollmentFileBundle;
  onFilesChange: (next: ChildEnrollmentFileBundle) => void;
};

export function ChildEnrollmentPickupStep({ files, onFilesChange }: Props) {
  const { t } = useTranslation();
  const { register, control } = useFormContext<ChildEnrollmentFormValues>();
  const { fields, append, remove } = useFieldArray({ control, name: 'extraPickups' });
  const mobileHint = `${t('childEnrollment.mobileWithCountry')} — ${t('childEnrollment.mobilePlaceholder')}`;

  return (
    <div className="space-y-4">
      <p className="text-sm text-on-surface-variant">{t('childEnrollment.step4.defaultParents')}</p>
      {fields.map((field, index) => (
        <div key={field.id} className="space-y-2 rounded-xl border border-outline-variant p-3">
          <div className="grid gap-2 md:grid-cols-2">
            <Input placeholder={t('childEnrollment.step4.fullName')} {...register(`extraPickups.${index}.fullName` as const)} />
            <Input placeholder={t('childEnrollment.step4.relationship')} {...register(`extraPickups.${index}.relationship` as const)} />
            <Input placeholder={t('childEnrollment.step4.nationalId')} {...register(`extraPickups.${index}.nationalId` as const)} />
            <Input
              autoComplete="tel"
              inputMode="tel"
              placeholder={mobileHint}
              {...register(`extraPickups.${index}.mobile` as const)}
            />
            <Input type="date" {...register(`extraPickups.${index}.validFrom` as const)} />
            <Input type="date" {...register(`extraPickups.${index}.validUntil` as const)} />
          </div>
          <div className="flex flex-wrap gap-3 text-sm">
            <label className="flex items-center gap-2">
              <input type="checkbox" {...register(`extraPickups.${index}.canPickup` as const)} />
              {t('childEnrollment.step4.canPickup')}
            </label>
            <label className="flex items-center gap-2">
              <input type="checkbox" {...register(`extraPickups.${index}.canDropoff` as const)} />
              {t('childEnrollment.step4.canDropoff')}
            </label>
            <label className="flex items-center gap-2">
              <input type="checkbox" {...register(`extraPickups.${index}.canMedical` as const)} />
              {t('childEnrollment.step4.canMedical')}
            </label>
          </div>
          <div className="space-y-1">
            <Label>{t('childEnrollment.step4.photo')}</Label>
            <Input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="cursor-pointer"
              onChange={(e) => {
                const f = e.target.files?.[0] ?? null;
                const next = [...files.pickupPhotos];
                next[index] = f;
                onFilesChange({ ...files, pickupPhotos: next });
              }}
            />
          </div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => {
              const nextPhotos = files.pickupPhotos.filter((_, i) => i !== index);
              onFilesChange({ ...files, pickupPhotos: nextPhotos });
              remove(index);
            }}
          >
            {t('childEnrollment.step4.remove')}
          </Button>
        </div>
      ))}
      <Button
        type="button"
        variant="outline"
        onClick={() => {
          append({
            fullName: '',
            relationship: '',
            nationalId: '',
            mobile: '',
            validFrom: '',
            validUntil: '',
            canPickup: true,
            canDropoff: true,
            canMedical: false,
          });
          onFilesChange({ ...files, pickupPhotos: [...files.pickupPhotos, null] });
        }}
      >
        {t('childEnrollment.step4.addPerson')}
      </Button>
    </div>
  );
}
