import { useQuery } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import { useFormContext, useFormState, useWatch } from 'react-hook-form';
import { useTranslation } from 'react-i18next';

/** Tiny built-in debouncer — defers value updates by `delayMs` to avoid hammering
 *  the existence-check RPC on every keystroke. */
function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const handle = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(handle);
  }, [value, delayMs]);
  return debounced;
}

import { Label } from '@/components/ui/label';
import { supabase } from '@/lib/supabase';
import { cn } from '@/lib/utils';
import { usePositions } from '@/hooks/usePositions';
import { useStaffIdentityExists } from '@/hooks/useStaffIdentityExists';
import { useViewerManagedPositions } from '@/hooks/useViewerManagedPositions';

import { MIN_SALARY_EGP } from '@/features/staff-onboarding/staffOnboardingValidation';

import { StaffOnboardingDateOfBirthField } from './StaffOnboardingDateOfBirthField';
import { calcProbationEnd, parseWeeklyHours } from './mapStaffOnboardingToProfile';
import { StaffFileRow } from './StaffFileRow';
import { StaffMobileControlledField } from './StaffMobileControlledField';
import { StaffOnboardingDocumentUploads } from './StaffOnboardingDocumentUploads';
import type { StaffOnboardingFileBundle } from './staffOnboardingFiles';
import { validateNationalIdDoc } from './staffOnboardingFiles';
import { isStaffNameArRequired, isStaffNameEnRequired } from './staffOnboardingValidation';
import { StaffOnboardingField as Field } from './StaffOnboardingField';
import { translateStaffFieldErrorMessage } from './staffFieldErrorMessage';
import type { StaffOnboardingFormValues, StaffPosition } from './staffOnboardingTypes';
import {
  requiresChildcareQualifications,
  requiresCriminalCheck,
} from './staffOnboardingTypes';

const DAYS = [0, 1, 2, 3, 4, 5, 6];

export function StaffOnboardingStepPanels({
  step,
  nurseryId,
  staffFiles,
  onStaffFilesChange,
  staffFileErrors,
}: {
  step: number;
  nurseryId: string | undefined;
  staffFiles: StaffOnboardingFileBundle;
  onStaffFilesChange: (next: StaffOnboardingFileBundle) => void;
  staffFileErrors?: Partial<Record<keyof StaffOnboardingFileBundle, string>>;
}) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language === 'ar' ? 'ar' : 'en';
  const { register, watch, setValue, control, clearErrors } = useFormContext<StaffOnboardingFormValues>();
  const { errors } = useFormState({ control });
  const userMode = watch('userMode');
  const position = (useWatch({ control, name: 'position' }) ?? 'teacher') as StaffPosition;
  // Live "is this email / mobile already used?" check so the user sees the
  // collision on step 1 instead of after Submit on the final step.
  const newEmailWatched = (useWatch({ control, name: 'newEmail' }) ?? '') as string;
  const newMobileWatched = (useWatch({ control, name: 'newMobile' }) ?? '') as string;
  const debouncedEmail = useDebouncedValue(newEmailWatched, 400);
  const debouncedMobile = useDebouncedValue(newMobileWatched, 400);
  const identityCheck = useStaffIdentityExists(
    userMode === 'new' ? debouncedEmail : null,
    userMode === 'new' ? debouncedMobile : null,
  );
  const positionsQuery = usePositions();
  // Hierarchy filter: a viewer can only pick from positions their role manages.
  // null managed_position_keys => no restriction (super_admin, branch_admin…).
  const viewerManaged = useViewerManagedPositions();
  const availablePositions = useMemo(() => {
    const all = positionsQuery.data ?? [];
    if (viewerManaged.keys === null) return all;
    const allowed = new Set(viewerManaged.keys);
    return all.filter((p) => allowed.has(p.key));
  }, [positionsQuery.data, viewerManaged.keys]);
  const selectedPositionRow = availablePositions.find((p) => p.key === position) ?? null;
  const selectedRole = selectedPositionRow?.role ?? null;
  const isManagerRole = selectedRole?.base_role === 'manager';
  const employmentType =
    (useWatch({ control, name: 'employmentType' }) ?? 'full_time') as StaffOnboardingFormValues['employmentType'];
  const startDate = useWatch({ control, name: 'startDate' });
  const nurseryLanguagePref = watch('nurseryLanguagePref');
  const paymentMethod = watch('paymentMethod');
  const baseSalary = watch('baseSalary');
  const allowanceTransport = watch('allowanceTransport');
  const allowanceHousing = watch('allowanceHousing');
  const allowanceMeal = watch('allowanceMeal');
  const allowancePhone = watch('allowancePhone');
  const workingDays = watch('workingDays');
  const workStartTime = watch('workStartTime');
  const workEndTime = watch('workEndTime');

  const parentsQuery = useQuery({
    queryKey: ['staff-onboarding-parents', nurseryId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('users')
        .select('id, name_ar, name_en, phone')
        .eq('nursery_id', nurseryId as string)
        .eq('role', 'parent');
      if (error) throw error;
      return (data ?? []) as { id: string; name_ar: string; name_en: string; phone: string | null }[];
    },
    enabled: Boolean(nurseryId) && step === 0,
  });

  const gross =
    Number(baseSalary || 0) +
    Number(allowanceTransport || 0) +
    Number(allowanceHousing || 0) +
    Number(allowanceMeal || 0) +
    Number(allowancePhone || 0);
  const employerCostWithSocial = gross * 1.26;

  const nameArRequired = isStaffNameArRequired(nurseryLanguagePref);
  const nameEnRequired = isStaffNameEnRequired(nurseryLanguagePref);
  const showContractEnd = employmentType === 'temporary' || employmentType === 'contract';
  const childcareRole = requiresChildcareQualifications(position);
  const criminalCheckRole = requiresCriminalCheck(position);

  useEffect(() => {
    if (paymentMethod !== 'bank_transfer') {
      clearErrors(['bankName', 'bankAccountNumber', 'bankIban']);
    }
  }, [paymentMethod, clearErrors]);

  // =====================================================================
  // Step 1 — Identity & contact
  // =====================================================================
  if (step === 0) {
    return (
      <div className="space-y-6">
        <section className="space-y-4">
          <p className="text-sm font-medium">{t('staffOnboarding.step1.mode')}</p>
          <div className="flex flex-wrap gap-4">
            <label className="flex items-center gap-2 text-sm">
              <input type="radio" value="new" {...register('userMode')} />
              {t('staffOnboarding.step1.modeNew')}
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input type="radio" value="existing" {...register('userMode')} />
              {t('staffOnboarding.step1.modeExisting')}
            </label>
          </div>
          {userMode === 'new' ? (
            <div className="grid gap-3 md:grid-cols-2">
              <Field
                name="newNameAr"
                label={`${t('staffOnboarding.step1.nameAr')} ${nameArRequired ? t('staffOnboarding.step1.labelRequired') : t('staffOnboarding.step1.labelOptional')}`}
                required={false}
                ariaRequired={nameArRequired}
              />
              <Field
                name="newNameEn"
                label={`${t('staffOnboarding.step1.nameEn')} ${nameEnRequired ? t('staffOnboarding.step1.labelRequired') : t('staffOnboarding.step1.labelOptional')}`}
                required={false}
                ariaRequired={nameEnRequired}
              />
              <div className="space-y-1" data-staff-field="newMobile">
                <StaffMobileControlledField />
                {identityCheck.data?.mobileTaken ? (
                  <p className="text-sm text-error" role="alert">
                    A staff member with this mobile number is already registered.
                    Use a different mobile, or open their record at /admin/staff/directory.
                  </p>
                ) : null}
              </div>
              <div className="space-y-1" data-staff-field="newEmail">
                <Field name="newEmail" label={t('staffOnboarding.step1.email')} type="email" />
                {identityCheck.data?.emailTaken ? (
                  <p className="text-sm text-error" role="alert">
                    A user with this email already exists. Use a different email,
                    or leave it blank to auto-derive one from the mobile number.
                  </p>
                ) : null}
              </div>
            </div>
          ) : (
            <div className="space-y-2" data-staff-field="existingUserId">
              <Label htmlFor="existingUserId">{t('staffOnboarding.step1.pickParent')} *</Label>
              <select
                id="existingUserId"
                aria-invalid={Boolean(errors.existingUserId)}
                aria-describedby={errors.existingUserId ? 'existingUserId-err' : undefined}
                className={cn(
                  'h-11 w-full rounded-lg border border-outline-variant bg-surface px-3 text-sm text-foreground',
                  errors.existingUserId ? 'field-error' : 'border-outline-variant',
                )}
                {...register('existingUserId')}
              >
                <option value="">{t('staffOnboarding.step1.selectUser')}</option>
                {(parentsQuery.data ?? []).map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name_ar} / {p.name_en} — {p.phone ?? '—'}
                  </option>
                ))}
              </select>
              {errors.existingUserId?.message ? (
                <p id="existingUserId-err" className="mt-1 text-sm text-error" role="alert">
                  {translateStaffFieldErrorMessage(t, errors.existingUserId.message as string)}
                </p>
              ) : null}
            </div>
          )}
        </section>

        <section className="space-y-3 border-t border-outline-variant pt-4">
          <p className="text-sm font-medium">{t('staffOnboarding.step1.identitySectionTitle')}</p>
          <StaffFileRow
            name="nationalIdDoc"
            label={t('staffOnboarding.step1.nationalIdPhoto')}
            accept="image/jpeg,image/png,image/webp"
            file={staffFiles.nationalIdDoc}
            errorKey={staffFileErrors?.nationalIdDoc}
            hint={t('staffOnboarding.step1.nationalIdPhotoHint')}
            onPick={(f) => {
              if (f && !validateNationalIdDoc(f)) return;
              onStaffFilesChange({ ...staffFiles, nationalIdDoc: f });
            }}
            onClear={() => onStaffFilesChange({ ...staffFiles, nationalIdDoc: null })}
          />
          <div className="grid gap-3 md:grid-cols-2">
            <StaffOnboardingDateOfBirthField />
            <div className="space-y-1" data-staff-field="gender">
              <Label htmlFor="staff-gender">{t('staffOnboarding.step5.gender')} *</Label>
              <select
                id="staff-gender"
                aria-invalid={Boolean(errors.gender)}
                className={cn(
                  'h-11 w-full rounded-lg border border-outline-variant bg-surface px-3 text-sm text-foreground',
                  errors.gender ? 'field-error' : 'border-outline-variant',
                )}
                {...register('gender')}
              >
                <option value="" disabled>
                  {t('staffOnboarding.step5.genderPlaceholder')}
                </option>
                <option value="male">{t('common.genderMale')}</option>
                <option value="female">{t('common.genderFemale')}</option>
              </select>
              {errors.gender?.message ? (
                <p className="mt-1 text-sm text-error" role="alert">
                  {translateStaffFieldErrorMessage(t, errors.gender.message as string)}
                </p>
              ) : null}
            </div>
            <div className="space-y-1" data-staff-field="maritalStatus">
              <Label htmlFor="staff-marital">{t('staffOnboarding.step5.marital')}</Label>
              <select
                id="staff-marital"
                className={cn(
                  'h-11 w-full rounded-lg border border-outline-variant bg-surface px-3 text-sm text-foreground',
                  errors.maritalStatus ? 'field-error' : 'border-outline-variant',
                )}
                {...register('maritalStatus')}
              >
                <option value="">{t('staffOnboarding.marital.placeholder')}</option>
                <option value="single">{t('staffOnboarding.marital.single')}</option>
                <option value="married">{t('staffOnboarding.marital.married')}</option>
                <option value="divorced">{t('staffOnboarding.marital.divorced')}</option>
                <option value="widowed">{t('staffOnboarding.marital.widowed')}</option>
              </select>
            </div>
            <Field name="dependents" label={t('staffOnboarding.step5.dependents')} type="number" min="0" max="20" />
          </div>
        </section>
      </div>
    );
  }

  // =====================================================================
  // Step 2 — Position & employment
  // =====================================================================
  if (step === 1) {
    return (
      <div className="space-y-4">
        <div className="grid gap-3 md:grid-cols-2">
          <Field name="employeeId" label={t('staffOnboarding.step2.employeeId')} placeholder="EMP-XXXXXX" />
          <div className="space-y-1" data-staff-field="position">
            <Label htmlFor="staff-position">{t('staffOnboarding.step2.position')} *</Label>
            <select
              id="staff-position"
              aria-invalid={Boolean(errors.position)}
              className={cn(
                'h-11 w-full rounded-lg border border-outline-variant bg-surface px-3 text-sm text-foreground',
                errors.position ? 'field-error' : 'border-outline-variant',
              )}
              {...register('position')}
            >
              {/* Render seed positions first (built-ins), then any custom positions
                  created via /admin/settings/positions */}
              {(positionsQuery.data ?? []).map((p) => (
                <option key={p.id} value={p.key}>
                  {lang === 'ar' ? p.name_ar : p.name_en}
                </option>
              ))}
            </select>
            {errors.position?.message ? (
              <p className="mt-1 text-sm text-error" role="alert">
                {translateStaffFieldErrorMessage(t, errors.position.message as string)}
              </p>
            ) : null}
            {isManagerRole && selectedRole?.base_department ? (
              <p className="mt-1 text-xs text-info" role="status">
                Department: <strong>{selectedRole.base_department}</strong> (set by the linked role
                "{lang === 'ar' ? selectedRole.name_ar : selectedRole.name_en}")
              </p>
            ) : null}
            {selectedRole ? (
              <p className="mt-1 text-xs text-on-surface-variant">
                Role: {lang === 'ar' ? selectedRole.name_ar : selectedRole.name_en} ·{' '}
                {selectedRole.base_role}
                {selectedRole.base_department ? ` / ${selectedRole.base_department}` : ''}
              </p>
            ) : null}
          </div>
          <div className="space-y-1">
            <Label htmlFor="staff-employment-type">{t('staffOnboarding.step2.employmentType')}</Label>
            <select
              id="staff-employment-type"
              className="h-11 w-full rounded-lg border border-outline-variant bg-surface text-foreground px-3 text-sm"
              {...register('employmentType')}
            >
              <option value="full_time">{t('staffOnboarding.employment.full_time')}</option>
              <option value="part_time">{t('staffOnboarding.employment.part_time')}</option>
              <option value="temporary">{t('staffOnboarding.employment.temporary')}</option>
              <option value="contract">{t('staffOnboarding.employment.contract')}</option>
              <option value="intern">{t('staffOnboarding.employment.intern')}</option>
            </select>
          </div>
          <Field name="startDate" label={t('staffOnboarding.step2.startDate')} type="date" required ariaRequired />
        </div>
        {showContractEnd ? (
          <div className="grid gap-3 md:grid-cols-2" role="region" aria-label={t('staffOnboarding.step2.contractSection')}>
            <Field
              name="contractEndDate"
              label={`${t('staffOnboarding.step2.contractEnd')} ${t('staffOnboarding.step1.labelRequired')}`}
              type="date"
              min={startDate || undefined}
              required={false}
              ariaRequired
            />
            <label className="flex items-center gap-2 self-end pb-1 text-sm md:pt-6">
              <input type="checkbox" {...register('contractAutoRenewal')} />
              {t('staffOnboarding.step2.autoRenew')}
            </label>
          </div>
        ) : null}
        {(employmentType === 'full_time' || employmentType === 'part_time') && startDate ? (
          <p className="text-sm text-on-surface-variant">
            {t('staffOnboarding.step2.probationHint')}: {calcProbationEnd(startDate)}
          </p>
        ) : null}
      </div>
    );
  }

  // =====================================================================
  // Step 3 — Emergency contact (REQUIRED)
  // =====================================================================
  if (step === 2) {
    return (
      <div className="space-y-4">
        <p className="text-sm text-on-surface-variant">{t('staffOnboarding.step3.emergencyIntro')}</p>
        <div className="grid gap-3 md:grid-cols-2">
          <Field
            name="emergencyName"
            label={t('staffOnboarding.step7.emergencyName')}
            required
            ariaRequired
          />
          <Field
            name="emergencyRelationship"
            label={t('staffOnboarding.step7.emergencyRel')}
            required
            ariaRequired
          />
          <Field
            name="emergencyPhone"
            type="tel"
            label={t('staffOnboarding.step7.emergencyPhone')}
            placeholder="+20 101 234 5678"
            required
            ariaRequired
          />
        </div>
      </div>
    );
  }

  // =====================================================================
  // Step 4 — Qualifications & background (role-aware)
  // =====================================================================
  if (step === 3) {
    return (
      <div className="space-y-6">
        {childcareRole ? (
          <section className="space-y-3">
            <p className="text-sm font-medium">{t('staffOnboarding.step4.qualificationsRequired')}</p>
            <div className="grid gap-3 md:grid-cols-2">
              <Field
                name="educationDegree"
                label={t('staffOnboarding.step6.degree')}
                required
                ariaRequired
              />
              {position !== 'nanny' ? (
                <Field
                  name="teachingCertificate"
                  label={t('staffOnboarding.step6.cert')}
                  required
                  ariaRequired
                />
              ) : (
                <Field name="teachingCertificate" label={t('staffOnboarding.step6.cert')} />
              )}
              <Field
                name="yearsExperience"
                label={t('staffOnboarding.step6.years')}
                type="number"
                min="0"
                max="50"
                required
                ariaRequired
              />
            </div>
          </section>
        ) : (
          <section className="space-y-3">
            <p className="text-sm font-medium">{t('staffOnboarding.step4.qualificationsOptional')}</p>
            <div className="grid gap-3 md:grid-cols-2">
              <Field name="educationDegree" label={t('staffOnboarding.step6.degree')} />
              <Field name="teachingCertificate" label={t('staffOnboarding.step6.cert')} />
              <Field
                name="yearsExperience"
                label={t('staffOnboarding.step6.years')}
                type="number"
                min="0"
                max="50"
              />
            </div>
          </section>
        )}

        {criminalCheckRole ? (
          <section className="space-y-3 border-t border-outline-variant pt-4">
            <p className="text-sm font-medium">{t('staffOnboarding.step4.backgroundRequired')}</p>
            <div className="grid gap-3 md:grid-cols-2">
              <Field
                name="criminalCheckDate"
                label={t('staffOnboarding.step6.criminalDate')}
                type="date"
                required
                ariaRequired
              />
              <div className="space-y-1" data-staff-field="criminalStatus">
                <Label htmlFor="staff-criminal-status">
                  {t('staffOnboarding.step6.criminalStatus')} *
                </Label>
                <select
                  id="staff-criminal-status"
                  aria-invalid={Boolean(errors.criminalStatus)}
                  className={cn(
                    'h-11 w-full rounded-lg border border-outline-variant bg-surface px-3 text-sm text-foreground',
                    errors.criminalStatus ? 'field-error' : 'border-outline-variant',
                  )}
                  {...register('criminalStatus')}
                >
                  <option value="">{t('staffOnboarding.criminalStatusOptions.placeholder')}</option>
                  <option value="clear">{t('staffOnboarding.criminalStatusOptions.clear')}</option>
                  <option value="pending">{t('staffOnboarding.criminalStatusOptions.pending')}</option>
                  <option value="concerns">{t('staffOnboarding.criminalStatusOptions.concerns')}</option>
                </select>
                {errors.criminalStatus?.message ? (
                  <p className="mt-1 text-sm text-error" role="alert">
                    {translateStaffFieldErrorMessage(t, errors.criminalStatus.message as string)}
                  </p>
                ) : null}
              </div>
              {childcareRole ? (
                <Field
                  name="childProtectionTrainingDate"
                  label={t('staffOnboarding.step6.childProt')}
                  type="date"
                  required
                  ariaRequired
                />
              ) : null}
            </div>
          </section>
        ) : null}

        <section className="space-y-3 border-t border-outline-variant pt-4">
          <p className="text-sm font-medium">{t('staffOnboarding.step4.referencesOptional')}</p>
          <div className="grid gap-3 md:grid-cols-2">
            <Field name="ref1Name" label={t('staffOnboarding.step6.ref1Name')} />
            <Field name="ref1Phone" label={t('staffOnboarding.step6.ref1Phone')} type="tel" />
            <Field name="ref1Verified" label={t('staffOnboarding.step6.ref1Verified')} type="date" />
            <Field name="ref2Name" label={t('staffOnboarding.step6.ref2Name')} />
            <Field name="ref2Phone" label={t('staffOnboarding.step6.ref2Phone')} type="tel" />
            <Field name="ref2Verified" label={t('staffOnboarding.step6.ref2Verified')} type="date" />
          </div>
        </section>
      </div>
    );
  }

  // =====================================================================
  // Step 5 — Compensation
  // =====================================================================
  if (step === 4) {
    return (
      <div className="space-y-4">
        <Field
          name="baseSalary"
          label={t('staffOnboarding.step3.baseSalary')}
          type="number"
          min={String(MIN_SALARY_EGP)}
          required
          ariaRequired
        />
        <div className="grid gap-3 md:grid-cols-2">
          <Field name="allowanceTransport" label={t('staffOnboarding.step3.transport')} type="number" min="0" />
          <Field name="allowanceHousing" label={t('staffOnboarding.step3.housing')} type="number" min="0" />
          <Field name="allowanceMeal" label={t('staffOnboarding.step3.meal')} type="number" min="0" />
          <Field name="allowancePhone" label={t('staffOnboarding.step3.phone')} type="number" min="0" />
        </div>
        <p className="text-sm">
          {t('staffOnboarding.step3.gross')}: {gross.toFixed(2)} {t('staffOnboarding.egp')}
        </p>
        <p className="text-sm">
          {t('staffOnboarding.step3.employerCost')}: {employerCostWithSocial.toFixed(2)} {t('staffOnboarding.egp')}
        </p>
        <div className="space-y-1">
          <Label>{t('staffOnboarding.step3.paymentMethod')}</Label>
          <select className="h-11 w-full rounded-lg border border-outline-variant bg-surface text-foreground px-3 text-sm" {...register('paymentMethod')}>
            <option value="bank_transfer">{t('staffOnboarding.payment.bank')}</option>
            <option value="cash">{t('staffOnboarding.payment.cash')}</option>
            <option value="check">{t('staffOnboarding.payment.check')}</option>
          </select>
        </div>
        {paymentMethod === 'bank_transfer' && (
          <div className="grid gap-3 md:grid-cols-2">
            <Field name="bankName" label={t('staffOnboarding.step3.bankName')} required ariaRequired />
            <Field name="bankAccountNumber" label={t('staffOnboarding.step3.account')} required ariaRequired />
            <Field name="bankIban" label={t('staffOnboarding.step3.iban')} placeholder="EG..." />
          </div>
        )}
        <div className="grid gap-3 md:grid-cols-2 border-t border-outline-variant pt-4">
          <Field
            name="socialInsuranceNumber"
            label={t('staffOnboarding.step5.socialInsOptional')}
          />
          <Field name="taxId" label={t('staffOnboarding.step5.taxId')} />
        </div>
      </div>
    );
  }

  // =====================================================================
  // Step 6 — Schedule
  // =====================================================================
  if (step === 5) {
    return (
      <div className="space-y-4">
        <p className="text-sm font-medium">{t('staffOnboarding.step4.workingDays')}</p>
        <div
          className={cn('flex flex-wrap gap-2 rounded-lg p-1', errors.workingDays && 'field-error')}
          data-staff-field="workingDays"
        >
          {DAYS.map((d) => (
            <label key={d} className="flex items-center gap-1 rounded-lg border border-outline-variant px-2 py-1 text-xs">
              <input
                type="checkbox"
                checked={workingDays.includes(d)}
                onChange={() => {
                  const next = workingDays.includes(d) ? workingDays.filter((x) => x !== d) : [...workingDays, d].sort();
                  setValue('workingDays', next);
                }}
              />
              {t(`staffOnboarding.weekdays.${d}`)}
            </label>
          ))}
        </div>
        {errors.workingDays?.message ? (
          <p className="mt-1 text-sm text-error" role="alert">
            {translateStaffFieldErrorMessage(t, errors.workingDays.message as string)}
          </p>
        ) : null}
        <div className="grid gap-3 md:grid-cols-2">
          <Field name="workStartTime" label={t('staffOnboarding.step4.start')} type="time" required ariaRequired />
          <Field name="workEndTime" label={t('staffOnboarding.step4.end')} type="time" required ariaRequired />
        </div>
        <p className="text-sm text-on-surface-variant">
          {t('staffOnboarding.step4.weeklyHours')}:{' '}
          {parseWeeklyHours(workStartTime, workEndTime, workingDays.length).toFixed(1)} h
        </p>
      </div>
    );
  }

  // =====================================================================
  // Step 7 — Documents + Review + Terms
  // =====================================================================
  if (step === 6) {
    return (
      <div className="space-y-6">
        <section className="space-y-3">
          <p className="text-sm font-medium">{t('staffOnboarding.documentsOptional')}</p>
          <p className="text-xs text-on-surface-variant">{t('staffOnboarding.canUploadLater')}</p>
          <StaffOnboardingDocumentUploads
            files={staffFiles}
            onChange={onStaffFilesChange}
            errors={staffFileErrors}
            documentsOptional
          />
        </section>

        <section className="space-y-3 border-t border-outline-variant pt-4">
          <p className="text-sm font-medium">{t('staffOnboarding.step7.reviewTitle')}</p>
          <StaffReviewSummary />
        </section>

        <section className="space-y-1 border-t border-outline-variant pt-4" data-staff-field="termsAccepted">
          <label className="flex items-start gap-2 text-sm">
            <input type="checkbox" aria-invalid={Boolean(errors.termsAccepted)} {...register('termsAccepted')} />
            {t('staffOnboarding.step8.terms')}
          </label>
          {errors.termsAccepted?.message ? (
            <p className="mt-1 text-sm text-error" role="alert">
              {translateStaffFieldErrorMessage(t, errors.termsAccepted.message as string)}
            </p>
          ) : null}
        </section>
      </div>
    );
  }

  return null;
}

function StaffReviewSummary() {
  const { t } = useTranslation();
  const { watch } = useFormContext<StaffOnboardingFormValues>();
  const v = watch();

  const identityRows: Array<[string, string]> = [
    [t('staffOnboarding.step1.nameEn'), v.newNameEn || v.newNameAr || '—'],
    [t('staffOnboarding.step1.mobile'), v.newMobile || '—'],
    [t('staffOnboarding.step1.email'), v.newEmail || '—'],
    [t('staffOnboarding.step5.dob'), v.dateOfBirth || '—'],
    [t('staffOnboarding.step5.gender'), v.gender || '—'],
  ];
  const positionRows: Array<[string, string]> = [
    [t('staffOnboarding.step2.position'), t(`staffOnboarding.positions.${v.position}`)],
    [t('staffOnboarding.step2.employmentType'), t(`staffOnboarding.employment.${v.employmentType}`)],
    [t('staffOnboarding.step2.startDate'), v.startDate || '—'],
    ...(v.contractEndDate ? ([[t('staffOnboarding.step2.contractEnd'), v.contractEndDate]] as Array<[string, string]>) : []),
  ];
  const emergencyRows: Array<[string, string]> = [
    [t('staffOnboarding.step7.emergencyName'), v.emergencyName || '—'],
    [t('staffOnboarding.step7.emergencyRel'), v.emergencyRelationship || '—'],
    [t('staffOnboarding.step7.emergencyPhone'), v.emergencyPhone || '—'],
  ];
  const compensationRows: Array<[string, string]> = [
    [t('staffOnboarding.step3.baseSalary'), v.baseSalary || '—'],
    [t('staffOnboarding.step3.paymentMethod'), t(`staffOnboarding.payment.${v.paymentMethod === 'bank_transfer' ? 'bank' : v.paymentMethod}`)],
    ...(v.paymentMethod === 'bank_transfer'
      ? ([
          [t('staffOnboarding.step3.bankName'), v.bankName || '—'],
          [t('staffOnboarding.step3.account'), v.bankAccountNumber || '—'],
        ] as Array<[string, string]>)
      : []),
  ];
  const scheduleRows: Array<[string, string]> = [
    [
      t('staffOnboarding.step4.workingDays'),
      v.workingDays.length
        ? v.workingDays.map((d) => t(`staffOnboarding.weekdays.${d}`)).join(', ')
        : '—',
    ],
    [t('staffOnboarding.step4.start'), v.workStartTime || '—'],
    [t('staffOnboarding.step4.end'), v.workEndTime || '—'],
  ];

  return (
    <div className="grid gap-3 md:grid-cols-2">
      <ReviewCard title={t('staffOnboarding.steps.0')} rows={identityRows} />
      <ReviewCard title={t('staffOnboarding.steps.1')} rows={positionRows} />
      <ReviewCard title={t('staffOnboarding.steps.2')} rows={emergencyRows} />
      <ReviewCard title={t('staffOnboarding.steps.4')} rows={compensationRows} />
      <ReviewCard title={t('staffOnboarding.steps.5')} rows={scheduleRows} />
    </div>
  );
}

function ReviewCard({ title, rows }: { title: string; rows: Array<[string, string]> }) {
  return (
    <div className="rounded-xl border border-outline-variant bg-surface-container-low p-3 text-xs">
      <p className="mb-2 text-sm font-semibold text-on-surface">{title}</p>
      <dl className="space-y-1">
        {rows.map(([label, value], i) => (
          <div key={i} className="flex items-start justify-between gap-3">
            <dt className="text-on-surface-variant">{label}</dt>
            <dd className="text-end text-on-surface break-words">{value}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
