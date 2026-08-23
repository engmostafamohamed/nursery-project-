import { useFormContext } from 'react-hook-form';
import { useTranslation } from 'react-i18next';

import { Input } from '@/components/ui/input';
import { useAuthSession } from '@/hooks/useAuthSession';
import { useUserProfile } from '@/hooks/useUserProfile';
import { parentDisplayName, type ParentSearchResult } from '@/hooks/useParentSearch';

import { ExistingParentPicker } from '../ExistingParentPicker';
import type { ChildEnrollmentFormValues } from '../childEnrollmentTypes';

export function ChildEnrollmentFamilyStep() {
  const { t, i18n } = useTranslation();
  const { register, setValue, watch } = useFormContext<ChildEnrollmentFormValues>();
  const { user } = useAuthSession();
  const { data: profile } = useUserProfile(user?.id);
  const mobileHint = `${t('childEnrollment.mobileWithCountry')} — ${t('childEnrollment.mobilePlaceholder')}`;
  const preferArabic = i18n.language.startsWith('ar');

  // The enrolment function matches an existing parent on email/phone, so filling those
  // from the picked account is what actually links the child to it.
  const applyParent = (role: 'father' | 'mother') => (parent: ParentSearchResult) => {
    setValue(`${role}Name`, parentDisplayName(parent, preferArabic), { shouldValidate: true });
    setValue(`${role}Email`, parent.email ?? '', { shouldValidate: true });
    setValue(`${role}Mobile`, parent.phone ?? '', { shouldValidate: true });
  };

  const clearParent = (role: 'father' | 'mother') => () => {
    setValue(`${role}Name`, '', { shouldValidate: true });
    setValue(`${role}Email`, '', { shouldValidate: true });
    setValue(`${role}Mobile`, '', { shouldValidate: true });
  };

  return (
    <div className="space-y-6">
      <section className="space-y-3">
        <p className="text-sm font-medium">{t('childEnrollment.step3.father')}</p>
        <div className="grid gap-3 md:grid-cols-2">
          <ExistingParentPicker
            nurseryId={profile?.nursery_id ?? undefined}
            linkedEmail={watch('fatherEmail')}
            onPick={applyParent('father')}
            onClear={clearParent('father')}
          />
          <Input placeholder={t('childEnrollment.step3.fullName')} {...register('fatherName')} />
          <Input placeholder={t('childEnrollment.step3.nationalId')} {...register('fatherNationalId')} />
          <Input
            autoComplete="tel"
            inputMode="tel"
            placeholder={mobileHint}
            {...register('fatherMobile')}
          />
          <Input placeholder={t('childEnrollment.step3.email')} type="email" {...register('fatherEmail')} />
          <Input placeholder={t('childEnrollment.step3.occupation')} {...register('fatherOccupation')} />
          <Input placeholder={t('childEnrollment.step3.workplace')} {...register('fatherWorkplace')} />
        </div>
      </section>
      <section className="space-y-3">
        <p className="text-sm font-medium">{t('childEnrollment.step3.mother')}</p>
        <div className="grid gap-3 md:grid-cols-2">
          <ExistingParentPicker
            nurseryId={profile?.nursery_id ?? undefined}
            linkedEmail={watch('motherEmail')}
            onPick={applyParent('mother')}
            onClear={clearParent('mother')}
          />
          <Input placeholder={t('childEnrollment.step3.fullName')} {...register('motherName')} />
          <Input placeholder={t('childEnrollment.step3.nationalId')} {...register('motherNationalId')} />
          <Input
            autoComplete="tel"
            inputMode="tel"
            placeholder={mobileHint}
            {...register('motherMobile')}
          />
          <Input placeholder={t('childEnrollment.step3.email')} type="email" {...register('motherEmail')} />
          <Input placeholder={t('childEnrollment.step3.occupation')} {...register('motherOccupation')} />
          <Input placeholder={t('childEnrollment.step3.workplace')} {...register('motherWorkplace')} />
        </div>
      </section>
      <section className="space-y-3">
        <p className="text-sm font-medium">{t('childEnrollment.step3.address')}</p>
        <div className="grid gap-3 md:grid-cols-2">
          <Input placeholder={t('childEnrollment.step3.street')} className="md:col-span-2" {...register('addressStreet')} />
          <Input placeholder={t('childEnrollment.step3.district')} {...register('addressDistrict')} />
          <Input placeholder={t('childEnrollment.step3.city')} {...register('addressCity')} />
          <Input placeholder={t('childEnrollment.step3.governorate')} className="md:col-span-2" {...register('addressGovernorate')} />
        </div>
      </section>
      <section className="space-y-3">
        <p className="text-sm font-medium">{t('childEnrollment.step3.emergency')}</p>
        <div className="grid gap-3 md:grid-cols-2">
          <Input placeholder={t('childEnrollment.step3.emergencyName')} {...register('emergencyName')} />
          <Input placeholder={t('childEnrollment.step3.emergencyRel')} {...register('emergencyRelationship')} />
          <Input
            autoComplete="tel"
            inputMode="tel"
            placeholder={mobileHint}
            {...register('emergencyMobile')}
          />
        </div>
      </section>
    </div>
  );
}
