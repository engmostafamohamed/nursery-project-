import { useFormContext } from 'react-hook-form';
import { useTranslation } from 'react-i18next';

import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';

import type { ChildEnrollmentFormValues } from '../childEnrollmentTypes';

const TOILET = ['trained', 'in_progress', 'not_started', 'other'];

export function ChildEnrollmentDevStep() {
  const { t } = useTranslation();
  const { register } = useFormContext<ChildEnrollmentFormValues>();

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Input placeholder={t('childEnrollment.step5.prevNursery')} className="md:col-span-2" {...register('previousNursery')} />
      <Input placeholder={t('childEnrollment.step5.homeLang')} {...register('homeLanguage')} />
      <div className="space-y-1">
        <Label>{t('childEnrollment.step5.toilet')}</Label>
        <select className="h-11 w-full rounded-lg border border-outline-variant bg-surface text-foreground px-3 text-sm" {...register('toiletTraining')}>
          <option value="">{t('childEnrollment.step2.select')}</option>
          {TOILET.map((x) => (
            <option key={x} value={x}>
              {t(`childEnrollment.step5.toiletOpts.${x}`)}
            </option>
          ))}
        </select>
      </div>
      <Input type="number" placeholder={t('childEnrollment.step5.nap')} {...register('napMinutes')} />
      <Textarea placeholder={t('childEnrollment.step5.temperament')} className="md:col-span-2" rows={2} {...register('temperament')} />
      <Textarea placeholder={t('childEnrollment.step5.comfort')} className="md:col-span-2" rows={2} {...register('comfortItems')} />
      <label className="flex items-center gap-2 text-sm md:col-span-2">
        <input type="checkbox" {...register('separationAnxiety')} />
        {t('childEnrollment.step5.anxiety')}
      </label>
      <Input placeholder={t('childEnrollment.step5.religion')} {...register('religiousDenomination')} />
      <Input placeholder={t('childEnrollment.step5.holidays')} {...register('religiousHolidays')} />
      <Textarea placeholder={t('childEnrollment.step5.cultural')} className="md:col-span-2" rows={2} {...register('culturalPractices')} />
    </div>
  );
}
