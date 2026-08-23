import { zodResolver } from '@hookform/resolvers/zod';
import { useEffect, useState } from 'react';
import { FormProvider, useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { useAuthSession } from '@/hooks/useAuthSession';
import { useNurseryLanguagePref } from '@/hooks/useNurseryLanguagePref';
import { useUserProfile } from '@/hooks/useUserProfile';

import { CHILD_ENROLLMENT_STORAGE_KEY, getDefaultChildEnrollmentValues } from './childEnrollmentDefaults';
import { emptyChildEnrollmentFiles, type ChildEnrollmentFileBundle } from './childEnrollmentFiles';
import { ChildEnrollmentStepPanels } from './ChildEnrollmentStepPanels';
import { submitChildEnrollment } from './submitChildEnrollment';
import type { ChildEnrollmentFormValues } from './childEnrollmentTypes';
import { childEnrollmentFullSchema, validateChildStep } from './childEnrollmentValidation';
import { useWizardDraft } from '../staff-onboarding/useWizardDraft';

const TOTAL = 7;

export function ChildEnrollmentWizard() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { user } = useAuthSession();
  const { data: profile } = useUserProfile(user?.id);
  const nurseryId = profile?.nursery_id;
  const { data: nurseryLang } = useNurseryLanguagePref(nurseryId);
  const [step, setStep] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [files, setFiles] = useState<ChildEnrollmentFileBundle>(() => emptyChildEnrollmentFiles());

  const form = useForm<ChildEnrollmentFormValues>({
    resolver: zodResolver(childEnrollmentFullSchema),
    defaultValues: getDefaultChildEnrollmentValues(),
    mode: 'onChange',
  });

  const extraLen = form.watch('extraPickups')?.length ?? 0;
  useEffect(() => {
    setFiles((prev) => {
      if (prev.pickupPhotos.length === extraLen) return prev;
      const nextPhotos = [...prev.pickupPhotos];
      while (nextPhotos.length < extraLen) nextPhotos.push(null);
      while (nextPhotos.length > extraLen) nextPhotos.pop();
      return { ...prev, pickupPhotos: nextPhotos };
    });
  }, [extraLen]);

  const { saveDraft, clearDraft } = useWizardDraft(form, CHILD_ENROLLMENT_STORAGE_KEY, true);

  useEffect(() => {
    if (nurseryLang) {
      form.setValue('nurseryLanguagePref', nurseryLang);
    }
  }, [nurseryLang, form]);

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem('xo_ai_prefill');
      if (!raw) return;
      const data = JSON.parse(raw) as Record<string, unknown>;
      if (data.type !== 'enrollment') return;
      sessionStorage.removeItem('xo_ai_prefill');
      if (typeof data.full_name_en === 'string' && data.full_name_en) {
        form.setValue('fullNameEn', data.full_name_en);
      }
      if (typeof data.full_name_ar === 'string' && data.full_name_ar) {
        form.setValue('fullNameAr', data.full_name_ar);
      }
      if (typeof data.dob === 'string' && data.dob) {
        form.setValue('dob', data.dob);
      }
    } catch {
      /* ignore */
    }
  }, [form]);

  const next = () => {
    saveDraft();
    const values = form.getValues();
    if (!validateChildStep(step, values, files)) {
      toast.error(t('childEnrollment.validation.stepError'));
      return;
    }
    if (step < TOTAL - 1) setStep((s) => s + 1);
  };

  const back = () => {
    saveDraft();
    setStep((s) => Math.max(0, s - 1));
  };

  const onSubmit = form.handleSubmit(async (values) => {
    if (!nurseryId) {
      toast.error(t('admin.children.missingNursery'));
      return;
    }
    if (!files.birthCertificate) {
      toast.error(t('childEnrollment.validation.birthCertRequired'));
      return;
    }
    if (!files.vaccinationCard) {
      toast.error(t('childEnrollment.validation.vaccinationCardRequired'));
      return;
    }
    if (values.custodyStatus === 'court_order' && !files.courtOrder) {
      toast.error(t('childEnrollment.validation.custodyDocRequired'));
      return;
    }
    setSubmitting(true);
    try {
      const { childId } = await submitChildEnrollment(values, nurseryId, files);
      clearDraft();
      setFiles(emptyChildEnrollmentFiles());
      toast.success(t('childEnrollment.success', { id: childId }));
      navigate('/admin/children');
    } catch (err: unknown) {
      const msg = String(err);
      if (msg.includes('birthCertificateFileRequired')) {
        toast.error(t('childEnrollment.validation.birthCertFile'));
      } else if (msg.includes('courtOrderFileRequired')) {
        toast.error(t('childEnrollment.validation.custodyDocRequired'));
      } else if (msg.includes('vaccinationCardRequired')) {
        toast.error(t('childEnrollment.validation.vaccinationCardRequired'));
      } else {
        toast.error(t('childEnrollment.submitError'), { description: msg });
      }
    } finally {
      setSubmitting(false);
    }
  });

  if (!nurseryId) {
    return <p className="text-sm text-error">{t('admin.children.missingNursery')}</p>;
  }

  return (
    <FormProvider {...form}>
      <form onSubmit={onSubmit} className="space-y-6">
        <div className="flex gap-1">
          {Array.from({ length: TOTAL }, (_, i) => (
            <div
              key={String(i)}
              className={`h-2 flex-1 rounded-full ${i <= step ? 'bg-primary' : 'bg-surface-container'}`}
            />
          ))}
        </div>
        <div className="rounded-2xl border border-outline-variant bg-surface-container-lowest p-4 md:p-6">
          <h2 className="mb-4 text-base font-semibold text-on-surface">{t(`childEnrollment.steps.${step}`)}</h2>
          <ChildEnrollmentStepPanels step={step} files={files} onFilesChange={setFiles} />
        </div>
        <div className="flex flex-wrap justify-between gap-2">
          <Button type="button" variant="outline" onClick={back} disabled={step === 0 || submitting}>
            {t('common.previous')}
          </Button>
          {step < TOTAL - 1 ? (
            <Button type="button" onClick={() => next()} disabled={submitting}>
              {t('common.next')}
            </Button>
          ) : (
            <Button type="submit" disabled={submitting}>
              {submitting ? t('common.saving') : t('childEnrollment.submit')}
            </Button>
          )}
        </div>
      </form>
    </FormProvider>
  );
}
