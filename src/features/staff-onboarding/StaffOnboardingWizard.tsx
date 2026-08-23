import { zodResolver } from '@hookform/resolvers/zod';
import { useEffect, useState } from 'react';
import { FormProvider, useForm, useWatch } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { useAuthSession } from '@/hooks/useAuthSession';
import { useNurseryLanguagePref } from '@/hooks/useNurseryLanguagePref';
import { useStaffIdentityExists } from '@/hooks/useStaffIdentityExists';
import { useUserProfile } from '@/hooks/useUserProfile';

import { generateEmployeeId } from './mapStaffOnboardingToProfile';
import { STAFF_ONBOARDING_STORAGE_KEY, getDefaultStaffOnboardingValues } from './staffOnboardingDefaults';
import { emptyStaffOnboardingFiles, type StaffOnboardingFileBundle } from './staffOnboardingFiles';
import { StaffOnboardingStepPanels } from './StaffOnboardingStepPanels';
import { submitStaffOnboarding } from './submitStaffOnboarding';
import { focusFirstStaffInvalidField } from './staffOnboardingFocus';
import { getStaffStepFieldErrors } from './staffOnboardingStepFieldErrors';
import { staffOnboardingFullSchema } from './staffOnboardingValidation';
import type { StaffOnboardingFormValues } from './staffOnboardingTypes';
import { useWizardDraft } from './useWizardDraft';

const TOTAL = 7;

export function StaffOnboardingWizard() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { user } = useAuthSession();
  const { data: profile } = useUserProfile(user?.id);
  const nurseryId = profile?.nursery_id;
  const { data: nurseryLang } = useNurseryLanguagePref(nurseryId);
  const [step, setStep] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [staffFiles, setStaffFiles] = useState<StaffOnboardingFileBundle>(() => emptyStaffOnboardingFiles());
  const [staffFileErrors, setStaffFileErrors] = useState<
    Partial<Record<keyof StaffOnboardingFileBundle, string>>
  >({});
  const [stepErrorCount, setStepErrorCount] = useState(0);

  const form = useForm<StaffOnboardingFormValues>({
    resolver: zodResolver(staffOnboardingFullSchema),
    defaultValues: getDefaultStaffOnboardingValues(),
    mode: 'onChange',
  });

  const { saveDraft, clearDraft } = useWizardDraft(form, STAFF_ONBOARDING_STORAGE_KEY, true);

  useEffect(() => {
    if (nurseryLang) {
      form.setValue('nurseryLanguagePref', nurseryLang);
    }
  }, [nurseryLang, form]);

  useEffect(() => {
    const cur = form.getValues('employeeId');
    if (!cur?.trim()) {
      form.setValue('employeeId', generateEmployeeId());
    }
  }, [form]);

  useEffect(() => {
    setStepErrorCount(0);
  }, [step]);

  // Step 0 "Next" guard — block advancing when the entered mobile/email
  // already maps to an existing auth.users row (would otherwise produce
  // a cryptic 409 at Submit time). Watches the same form fields the panel
  // shows inline errors on; React Query dedupes the RPC across both callers.
  const newEmailWatch = (useWatch({ control: form.control, name: 'newEmail' }) ?? '') as string;
  const newMobileWatch = (useWatch({ control: form.control, name: 'newMobile' }) ?? '') as string;
  const userModeWatch = (useWatch({ control: form.control, name: 'userMode' }) ?? 'new') as
    | 'new'
    | 'existing';
  const [debouncedIdentity, setDebouncedIdentity] = useState<{ email: string; mobile: string }>({
    email: '',
    mobile: '',
  });
  useEffect(() => {
    const handle = setTimeout(
      () => setDebouncedIdentity({ email: newEmailWatch, mobile: newMobileWatch }),
      400,
    );
    return () => clearTimeout(handle);
  }, [newEmailWatch, newMobileWatch]);
  const identityCheck = useStaffIdentityExists(
    userModeWatch === 'new' ? debouncedIdentity.email : null,
    userModeWatch === 'new' ? debouncedIdentity.mobile : null,
  );

  const applyFieldErrorsAndStop = (
    fieldErrors: Partial<Record<keyof StaffOnboardingFormValues, string>>,
    stepIndex: number,
  ): boolean => {
    const keys = Object.keys(fieldErrors) as (keyof StaffOnboardingFormValues)[];
    if (keys.length === 0) return false;
    keys.forEach((key) => {
      const msg = fieldErrors[key];
      if (msg) form.setError(key, { type: 'manual', message: msg });
    });
    setStepErrorCount(keys.length);
    toast.error(t('staffOnboarding.validation.stepError'));
    focusFirstStaffInvalidField(stepIndex, fieldErrors);
    return true;
  };

  const next = () => {
    saveDraft();
    const values = form.getValues();
    form.clearErrors();
    const stepFieldErrors = getStaffStepFieldErrors(step, values);

    // Step 0 (Identity): block when mobile / email already maps to an existing
    // auth user. The inline error in StaffOnboardingStepPanels is the visual
    // cue; this stops Next so the user can't sail past it.
    if (step === 0 && userModeWatch === 'new' && identityCheck.data) {
      const { emailTaken, mobileTaken } = identityCheck.data;
      if (mobileTaken || emailTaken) {
        toast.error(
          mobileTaken
            ? 'A staff member with this mobile number is already registered.'
            : 'A user with this email already exists.',
        );
        requestAnimationFrame(() => {
          const target = document.querySelector(
            mobileTaken ? '[data-staff-field="newMobile"]' : '[data-staff-field="newEmail"]',
          ) as HTMLElement | null;
          target?.scrollIntoView({ behavior: 'smooth', block: 'center' });
          (target?.querySelector('input') as HTMLElement | null)?.focus();
        });
        return;
      }
    }

    // Step 0 (Identity): national ID photo is required. The file lives outside
    // react-hook-form, so we check it here and surface the error through the
    // staffFileErrors channel rendered by StaffFileRow.
    if (step === 0 && !staffFiles.nationalIdDoc) {
      setStaffFileErrors((prev) => ({
        ...prev,
        nationalIdDoc: 'staffOnboarding.validation.nationalIdPhotoRequired',
      }));
      setStepErrorCount(Object.keys(stepFieldErrors).length + 1);
      toast.error(t('staffOnboarding.validation.stepError'));
      if (Object.keys(stepFieldErrors).length > 0) {
        applyFieldErrorsAndStop(stepFieldErrors, step);
      } else {
        requestAnimationFrame(() => {
          const root = document.querySelector('[data-staff-field="nationalIdDoc"]') as HTMLElement | null;
          root?.scrollIntoView({ behavior: 'smooth', block: 'center' });
          (root?.querySelector('input[type="file"]') as HTMLElement | null)?.focus();
        });
      }
      return;
    }

    if (Object.keys(stepFieldErrors).length > 0) {
      applyFieldErrorsAndStop(stepFieldErrors, step);
      return;
    }

    // Passed: clear any lingering file-level error for this step.
    if (step === 0) {
      setStaffFileErrors((prev) => {
        const { nationalIdDoc: _, ...rest } = prev;
        return rest;
      });
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
    if (!staffFiles.nationalIdDoc) {
      setStaffFileErrors((prev) => ({
        ...prev,
        nationalIdDoc: 'staffOnboarding.validation.nationalIdPhotoRequired',
      }));
      toast.error(t('staffOnboarding.validation.nationalIdPhotoRequired'));
      setStep(0);
      return;
    }
    setSubmitting(true);
    try {
      const { employeeId } = await submitStaffOnboarding(values, nurseryId, t, staffFiles);
      clearDraft();
      setStaffFiles(emptyStaffOnboardingFiles());
      toast.success(t('staffOnboarding.success', { id: employeeId }));
      navigate('/admin/staff');
    } catch (err: unknown) {
      toast.error(t('staffOnboarding.submitError'), { description: String(err) });
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
          <h2 className="mb-4 text-base font-semibold text-on-surface">{t(`staffOnboarding.steps.${step}`)}</h2>
          {stepErrorCount > 0 ? (
            <p className="mb-4 text-sm text-error" role="alert">
              {t('validation.pleaseComplete', { count: stepErrorCount })}
            </p>
          ) : null}
          <StaffOnboardingStepPanels
            step={step}
            nurseryId={nurseryId}
            staffFiles={staffFiles}
            onStaffFilesChange={setStaffFiles}
            staffFileErrors={staffFileErrors}
          />
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
              {submitting ? t('common.saving') : t('staffOnboarding.submit')}
            </Button>
          )}
        </div>
      </form>
    </FormProvider>
  );
}
