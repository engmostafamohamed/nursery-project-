import { zodResolver } from '@hookform/resolvers/zod';
import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { useFieldArray, useForm, type UseFormReturn } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { MaterialSymbol } from '@/components/ui/MaterialSymbol';
import { FileDropzoneWithPreview } from '@/components/signup/FileDropzoneWithPreview';
import { SignupShell } from '@/components/signup/SignupShell';
import { StepMedicationConsents } from '@/components/signup/StepMedicationConsents';
import { StepReview } from '@/components/signup/StepReview';
import { SearchableSelect } from '@/components/ui/SearchableSelect';
import { childDateOfBirthBounds, isChildAgeValid } from '@/lib/onboardingDateBounds';
import { nationalityOptions } from '@/lib/nationalities';
import { ALLERGY_OPTIONS, OTHER_ALLERGY_VALUE, allergyLabel } from '@/lib/allergies';
import { cn } from '@/lib/utils';

import { parentSignUpDefaults } from '@/features/parent-signup/parentSignUpDefaults';
import {
  nurseryArrivalTime,
  nurseryDepartments,
  nurseryLeadSources,
  useSelectedNursery,
  useSignupNurseries,
  type SignupNursery,
} from '@/features/parent-signup/signupNurseries';
import { emptyParentSignUpFiles, type ParentSignUpFileBundle } from '@/features/parent-signup/parentSignUpFiles';
import { parentSignUpBaseSchema, validateCrossFieldRules, type ParentSignUpFormValues } from '@/features/parent-signup/parentSignUpValidation';
import { submitParentSignUp } from '@/features/parent-signup/submitParentSignUp';
import { SIGNUP_STEPS, STEP_FIELDS, type SignUpStep } from '@/features/parent-signup/parentSignUpTypes';
import { clearDraft, loadDraft, useApplicationDraft } from '@/hooks/useApplicationDraft';

function Field({ label, error, required, children }: { label: string; error?: string; required?: boolean; children: React.ReactNode }) {
  const { t } = useTranslation();
  const errorText = error?.startsWith('signup.') ? t(error) : error;

  return (
    <div className="space-y-1.5">
      <Label>
        {label}
        {required && <span className="text-error ms-0.5">*</span>}
      </Label>
      {children}
      {errorText && <p className="text-xs text-error">{errorText}</p>}
    </div>
  );
}

const requiredTextFilled = (value: unknown) => typeof value === 'string' && value.trim().length > 0;
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const phonePattern = /^\d{11}$/;
const digitsOnly = (value: string) => value.replace(/\D/g, '');
const handlePhoneInput = (event: FormEvent<HTMLInputElement>) => {
  const value = event.currentTarget.value;
  const nextValue = digitsOnly(value);
  if (value !== nextValue) event.currentTarget.value = nextValue;
};
const phoneInputProps = {
  type: 'tel',
  inputMode: 'numeric' as const,
  pattern: '[0-9]*',
  maxLength: 11,
  autoComplete: 'tel',
  onInput: handlePhoneInput,
};

const isValidEmail = (value: unknown) => typeof value === 'string' && emailPattern.test(value.trim());
const isValidPhone = (value: unknown) => typeof value === 'string' && phonePattern.test(value.trim());
const isOptionalEmailValid = (value: unknown) => !requiredTextFilled(value) || isValidEmail(value);
const isOptionalPhoneValid = (value: unknown) => !requiredTextFilled(value) || isValidPhone(value);

const USERNAME_PATTERN = /^[a-zA-Z0-9._-]{4,32}$/;

function hasCompleteParent(values: ParentSignUpFormValues) {
  // The family logs in with one username + password; emails are contact details,
  // so they only have to be well-formed when the parent actually fills one in.
  const credentialsValid =
    USERNAME_PATTERN.test(values.username.trim()) && values.password.trim().length >= 8;
  const allEnteredContactsValid =
    isOptionalPhoneValid(values.fatherMobile) &&
    isOptionalEmailValid(values.fatherEmail) &&
    isOptionalPhoneValid(values.motherMobile) &&
    isOptionalEmailValid(values.motherEmail);
  const fatherComplete = requiredTextFilled(values.fatherFullName) && isValidPhone(values.fatherMobile);
  const motherComplete = requiredTextFilled(values.motherFullName) && isValidPhone(values.motherMobile);

  return credentialsValid && allEnteredContactsValid && (fatherComplete || motherComplete);
}

function hasAcceptedAllConsents(values: ParentSignUpFormValues) {
  return values.agreeHealthPolicy && values.agreeFinancialAgreement && values.agreePolicies && values.agreeInfoAccuracy;
}

/** Ticking one of the Family Details boxes makes the detail it reveals mandatory. */
function hasCompleteFamilyDetails(values: ParentSignUpFormValues) {
  if (values.hasSiblings && !requiredTextFilled(values.siblingAges)) return false;

  if (values.hasAllergy) {
    const picked = values.allergyTypes ?? [];
    if (picked.length === 0) return false;
    if (picked.includes(OTHER_ALLERGY_VALUE) && !requiredTextFilled(values.allergyDetails)) return false;
  }

  if (values.hasMedicalCondition && !requiredTextFilled(values.medicalConditionDetails)) return false;

  return true;
}

function isStepComplete(step: SignUpStep, values: ParentSignUpFormValues, files: ParentSignUpFileBundle) {
  if (step === 'parents') return hasCompleteParent(values);
  if (step === 'family') return hasCompleteFamilyDetails(values);
  if (step === 'consents') return hasAcceptedAllConsents(values);
  if (step === 'pickups' && (!files.pickupPerson1Photo || !files.pickupPerson2Photo)) return false;
  if (step === 'emergency') {
    // A list now, not six flat fields: every card the parent added must be complete.
    const contacts = values.emergencyContacts ?? [];
    return (
      contacts.length > 0 &&
      contacts.every(
        (contact) =>
          requiredTextFilled(contact.name) &&
          isValidPhone(contact.phone) &&
          requiredTextFilled(contact.relationship),
      )
    );
  }

  return STEP_FIELDS[step].every((field) => {
    const value = values[field as keyof ParentSignUpFormValues];
    if (field === 'childDob') return typeof value === 'string' && isChildAgeValid(value);
    if (/phone|mobile/i.test(field)) return isValidPhone(value);
    if (/email/i.test(field)) return isValidEmail(value);
    return typeof value === 'boolean' ? value : requiredTextFilled(value);
  });
}

function firstIncompleteStep(values: ParentSignUpFormValues, files: ParentSignUpFileBundle): SignUpStep | null {
  return SIGNUP_STEPS.find((step) => step !== 'review' && !isStepComplete(step, values, files)) ?? null;
}

function signupErrorMessage(error: unknown, t: (k: string, opts?: Record<string, unknown>) => string) {
  const message = error instanceof Error ? error.message : String(error);
  if (/for security purposes/i.test(message) && /after\s+\d+\s+seconds?/i.test(message)) {
    return t('signup.authCooldown');
  }
  if (/email rate limit exceeded/i.test(message)) {
    return t('signup.emailRateLimit');
  }
  if (/parent_email_already_exists|parent account already exists|already registered/i.test(message)) {
    return t('signup.parentEmailAlreadyExists');
  }
  if (/signupFilesTooLarge/i.test(message)) {
    return t('signup.filesTooLargeForSubmit');
  }
  if (/failed to send a request to the edge function/i.test(message)) {
    return t('signup.edgeFunctionRequestFailed');
  }
  if (/email address .* is invalid/i.test(message) || /invalid email/i.test(message)) {
    return t('signup.invalidEmail');
  }
  return `${t('signup.error')}: ${message}`;
}

function StepChild({ form, t, files, setFiles, nurseries, nurseriesLoading, nurseriesError }: StepProps) {
  const { i18n } = useTranslation();
  const e = form.formState.errors;
  const childDobBounds = childDateOfBirthBounds();

  const nurseryLabel = (nursery: SignupNursery) => {
    const ar = nursery.name_ar?.trim() ?? '';
    const en = nursery.name_en?.trim() ?? '';
    const name = i18n.language.startsWith('ar') ? ar || en : en || ar;
    // Several nurseries share a name — the city is what tells the branches apart.
    return nursery.city?.trim() ? `${name} — ${nursery.city.trim()}` : name;
  };


  const nurseryLoadErrorMessage = i18n.language.startsWith('ar')
    ? 'تعذر الاتصال بقاعدة البيانات. حاول مرة أخرى.'
    : 'Could not connect to the database. Please try again.';
  const noNurseriesMessage = i18n.language.startsWith('ar')
    ? 'لا توجد حضانات متاحة للتسجيل.'
    : 'No nurseries are available for registration.';

  return (
    <div className="space-y-4">
      <h3 className="text-lg font-semibold text-on-surface">{t('signup.steps.child')}</h3>
      <Field label={t('signup.nursery')} error={e.nurseryId?.message} required>
        <Select {...form.register('nurseryId')} disabled={nurseriesLoading || Boolean(nurseriesError) || nurseries.length === 0}>
          <option value="">
            {nurseriesLoading
              ? t('common.loading')
              : nurseriesError
                ? nurseryLoadErrorMessage
                : nurseries.length === 0
                  ? noNurseriesMessage
                  : t('common.select')}
          </option>
          {nurseries.map((n) => (
            <option key={n.id} value={n.id}>{nurseryLabel(n)}</option>
          ))}
        </Select>
        {nurseriesError ? (
          <p className="text-xs text-error">{nurseryLoadErrorMessage}</p>
        ) : null}
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={t('signup.childFirstName')} error={e.childFirstName?.message} required>
          <Input {...form.register('childFirstName')} />
        </Field>
        <Field label={t('signup.childMiddleName')} error={e.childMiddleName?.message} required>
          <Input {...form.register('childMiddleName')} />
        </Field>
        <Field label={t('signup.childLastName')} error={e.childLastName?.message} required>
          <Input {...form.register('childLastName')} />
        </Field>
        <Field label={t('signup.childNickname')} error={e.childNickname?.message} required>
          <Input {...form.register('childNickname')} />
        </Field>
        <Field label={t('signup.childDob')} error={e.childDob?.message} required>
          <Input type="date" min={childDobBounds.min} max={childDobBounds.max} {...form.register('childDob')} />
        </Field>
        <Field label={t('signup.childNationality')} error={e.childNationality?.message} required>
          <SearchableSelect
            name="childNationality"
            value={form.watch('childNationality')}
            onChange={(value) => form.setValue('childNationality', value, { shouldValidate: true })}
            options={nationalityOptions(i18n.language.startsWith('ar'))}
            searchPlaceholder={t('signup.nationalitySearch')}
          />
        </Field>
        <Field label={t('signup.childGender')}>
          <Select {...form.register('childGender')}>
            <option value="">{t('common.select')}</option>
            <option value="male">{t('common.genderMale')}</option>
            <option value="female">{t('common.genderFemale')}</option>
          </Select>
        </Field>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <FileDropzoneWithPreview label={t('signup.childPhoto')} file={files.childPhoto} onChange={(f) => setFiles((prev) => ({ ...prev, childPhoto: f }))} />
      </div>
    </div>
  );
}

function StepParents({ form, t, files, setFiles }: StepProps) {
  const e = form.formState.errors;
  return (
    <div className="space-y-6">
      <h3 className="text-lg font-semibold text-on-surface">{t('signup.steps.parents')}</h3>

      {/* One login for the whole family — the emails below are contact details only. */}
      <div className="space-y-4 rounded-2xl border border-primary bg-primary/5 p-4">
        <div>
          <p className="text-sm font-medium text-on-surface">{t('signup.loginSectionTitle')}</p>
          <p className="text-xs text-on-surface-variant">{t('signup.loginSectionHint')}</p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t('signup.username')} error={e.username?.message} required>
            <Input {...form.register('username')} autoComplete="username" placeholder={t('signup.usernameHint')} />
          </Field>
          <Field label={t('signup.password')} error={e.password?.message} required>
            <Input type="password" {...form.register('password')} autoComplete="new-password" placeholder={t('signup.passwordHint')} />
          </Field>
        </div>
      </div>

      <p className="text-xs text-on-surface-variant">{t('signup.atLeastOneParent')}</p>

      <div className="space-y-4 rounded-2xl border border-outline-variant p-4">
        <p className="text-sm font-medium text-on-surface">{t('signup.fatherInfo')}</p>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t('signup.fatherFullName')}>
            <Input {...form.register('fatherFullName')} />
          </Field>
          <Field label={t('signup.fatherJob')}>
            <Input {...form.register('fatherJob')} />
          </Field>
          <Field label={t('signup.fatherMobile')} error={e.fatherMobile?.message}>
            <Input {...phoneInputProps} {...form.register('fatherMobile')} />
          </Field>
          <Field label={t('signup.fatherEmail')} error={e.fatherEmail?.message}>
            <Input type="email" {...form.register('fatherEmail')} />
          </Field>
          <FileDropzoneWithPreview label={t('signup.fatherIdPhoto')} file={files.fatherIdPhoto} onChange={(f) => setFiles((prev) => ({ ...prev, fatherIdPhoto: f }))} />
        </div>
      </div>

      <div className="space-y-4 rounded-2xl border border-outline-variant p-4">
        <p className="text-sm font-medium text-on-surface">{t('signup.motherInfo')}</p>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t('signup.motherFullName')}>
            <Input {...form.register('motherFullName')} />
          </Field>
          <Field label={t('signup.motherJob')}>
            <Input {...form.register('motherJob')} />
          </Field>
          <Field label={t('signup.motherMobile')} error={e.motherMobile?.message}>
            <Input {...phoneInputProps} {...form.register('motherMobile')} />
          </Field>
          <Field label={t('signup.motherEmail')} error={e.motherEmail?.message}>
            <Input type="email" {...form.register('motherEmail')} />
          </Field>
          <FileDropzoneWithPreview label={t('signup.motherIdPhoto')} file={files.motherIdPhoto} onChange={(f) => setFiles((prev) => ({ ...prev, motherIdPhoto: f }))} />
        </div>
      </div>

    </div>
  );
}

function StepFamily({ form, t }: StepProps) {
  const { i18n } = useTranslation();
  const hasSiblings = form.watch('hasSiblings');
  const hasAllergy = form.watch('hasAllergy');
  const hasMedicalCondition = form.watch('hasMedicalCondition');
  const allergyTypes = form.watch('allergyTypes') ?? [];
  return (
    <div className="space-y-4">
      <h3 className="text-lg font-semibold text-on-surface">{t('signup.steps.family')}</h3>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={t('signup.maritalStatus')}>
          <Select {...form.register('maritalStatus')}>
            <option value="">{t('common.select')}</option>
            <option value="married">{t('signup.married')}</option>
            <option value="divorced">{t('signup.divorced')}</option>
            <option value="widowed">{t('signup.widowed')}</option>
            <option value="single">{t('signup.single')}</option>
          </Select>
        </Field>
        <Field label={t('signup.address')}>
          <Input {...form.register('address')} placeholder={t('signup.addressHint')} />
        </Field>
      </div>
      <div className="flex items-center gap-2">
        <Checkbox
          id="hasSiblings"
          checked={hasSiblings}
          onCheckedChange={(v) => form.setValue('hasSiblings', v === true)}
        />
        <Label htmlFor="hasSiblings">{t('signup.hasSiblings')}</Label>
      </div>
      {hasSiblings && (
        <Field label={t('signup.siblingAges')} required>
          <Input {...form.register('siblingAges')} placeholder={t('signup.siblingAgesHint')} />
        </Field>
      )}

      <div className="space-y-3 rounded-2xl border border-outline-variant p-4">
        <div className="flex items-center gap-2">
          <Checkbox
            id="hasAllergy"
            checked={hasAllergy}
            onCheckedChange={(v) => form.setValue('hasAllergy', v === true)}
          />
          <Label htmlFor="hasAllergy">{t('signup.hasAllergy')}</Label>
        </div>
        {hasAllergy && (
          <>
            <Field label={t('signup.allergyTypes')} required>
              <div className="grid gap-2 sm:grid-cols-2">
                {ALLERGY_OPTIONS.map((option) => {
                  const checked = allergyTypes.includes(option.value);
                  return (
                    <label
                      key={option.value}
                      className="flex cursor-pointer items-start gap-2 rounded-xl border border-outline-variant p-2 text-sm"
                    >
                      <Checkbox
                        checked={checked}
                        onCheckedChange={(v) =>
                          form.setValue(
                            'allergyTypes',
                            v === true
                              ? [...allergyTypes, option.value]
                              : allergyTypes.filter((a) => a !== option.value),
                            { shouldValidate: true },
                          )
                        }
                      />
                      <span>{allergyLabel(option.value, i18n.language.startsWith('ar'))}</span>
                    </label>
                  );
                })}
              </div>
            </Field>
            {allergyTypes.includes(OTHER_ALLERGY_VALUE) && (
              <Field label={t('signup.allergyDetails')} required>
                <Input {...form.register('allergyDetails')} placeholder={t('signup.pleaseSpecify')} />
              </Field>
            )}
          </>
        )}
      </div>

      <div className="space-y-3 rounded-2xl border border-outline-variant p-4">
        <div className="flex items-center gap-2">
          <Checkbox
            id="hasMedicalCondition"
            checked={hasMedicalCondition}
            onCheckedChange={(v) => form.setValue('hasMedicalCondition', v === true)}
          />
          <Label htmlFor="hasMedicalCondition">{t('signup.hasMedicalCondition')}</Label>
        </div>
        {hasMedicalCondition && (
          <Field label={t('signup.medicalConditionDetails')} required>
            <Input {...form.register('medicalConditionDetails')} placeholder={t('signup.pleaseSpecify')} />
          </Field>
        )}
      </div>
    </div>
  );
}

/** Academic years around today: three past, the current one, and five ahead. */
function academicYearOptions(): string[] {
  const startYear = new Date().getFullYear() - 3;
  return Array.from({ length: 9 }, (_, index) => {
    const year = startYear + index;
    return `${year}-${year + 1}`;
  });
}

function StepEnrollment({ form, t, selectedNursery }: StepProps) {
  // Each nursery configures its own referral list and departments; fall back to generic ones.
  const leadSources = nurseryLeadSources(selectedNursery);
  const departments = nurseryDepartments(selectedNursery);
  const academicYears = academicYearOptions();
  return (
    <div className="space-y-4">
      <h3 className="text-lg font-semibold text-on-surface">{t('signup.steps.enrollment')}</h3>
      <div className="grid gap-4 sm:grid-cols-2">
        {/* Departments come from the nursery picked in step 1. */}
        <Field label={t('signup.department')}>
          <Select {...form.register('department')}>
            <option value="">{t('common.select')}</option>
            {departments.length > 0 ? (
              departments.map((dept) => (
                <option key={dept} value={dept}>{dept}</option>
              ))
            ) : (
              <>
                <option value="english">{t('signup.deptEnglish')}</option>
                <option value="french">{t('signup.deptFrench')}</option>
              </>
            )}
          </Select>
        </Field>
        {/* children.school_preference is CHECK-constrained to these three values. */}
        <Field label={t('signup.schoolPreference')}>
          <Select {...form.register('schoolPreference')}>
            <option value="">{t('common.select')}</option>
            <option value="british">{t('signup.schoolBritish')}</option>
            <option value="american">{t('signup.schoolAmerican')}</option>
            <option value="national">{t('signup.schoolNational')}</option>
            <option value="ib">{t('signup.schoolIb')}</option>
            <option value="french">{t('signup.schoolFrench')}</option>
            <option value="canadian">{t('signup.schoolCanadian')}</option>
            <option value="other">{t('signup.schoolOther')}</option>
          </Select>
        </Field>
        <Field label={t('signup.schoolAdmissionsPlan')}>
          <Input {...form.register('schoolAdmissionsPlan')} />
        </Field>
        <Field label={t('signup.academicYear')}>
          <Select {...form.register('academicYear')}>
            <option value="">{t('common.select')}</option>
            {academicYears.map((year) => (
              <option key={year} value={year}>{year}</option>
            ))}
          </Select>
        </Field>
        <Field label={t('signup.referralSource')}>
          <Select {...form.register('referralSource')}>
            <option value="">{t('common.select')}</option>
            {leadSources.length > 0 ? (
              leadSources.map((source) => (
                <option key={source} value={source}>{source}</option>
              ))
            ) : (
              <>
                <option value="social_media">{t('signup.refSocialMedia')}</option>
                <option value="tiktok">{t('signup.refTikTok')}</option>
                <option value="friend">{t('signup.refFriend')}</option>
                <option value="website">{t('signup.refWebsite')}</option>
                <option value="walkIn">{t('signup.refWalkIn')}</option>
                <option value="other">{t('signup.refOther')}</option>
              </>
            )}
          </Select>
        </Field>
      </div>
    </div>
  );
}

function StepHealth({ t, files, setFiles }: StepProps) {
  return (
    <div className="space-y-4">
      <h3 className="text-lg font-semibold text-on-surface">{t('signup.steps.health')}</h3>
      <div className="grid gap-4 sm:grid-cols-2">
        <FileDropzoneWithPreview
          label={t('signup.birthCertificate')}
          file={files.birthCertificate}
          onChange={(f) => setFiles((prev) => ({ ...prev, birthCertificate: f }))}
        />
        <FileDropzoneWithPreview
          label={t('signup.vaccinationCard')}
          file={files.vaccinationCard}
          onChange={(f) => setFiles((prev) => ({ ...prev, vaccinationCard: f }))}
        />
      </div>
    </div>
  );
}

function StepEmergency({ form, t }: StepProps) {
  // One contact is required; the rest are added and removed by the parent.
  const { fields, append, remove } = useFieldArray({ control: form.control, name: 'emergencyContacts' });
  const errors = form.formState.errors.emergencyContacts;

  return (
    <div className="space-y-6">
      <h3 className="text-lg font-semibold text-on-surface">{t('signup.steps.emergency')}</h3>
      <p className="text-xs text-on-surface-variant">{t('signup.emergencyHint')}</p>

      {fields.map((field, index) => (
        <div key={field.id} className="space-y-4 rounded-2xl border border-outline-variant p-4">
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm font-medium text-on-surface">
              {t('signup.emergencyContact')} {index + 1}
              {index === 0 ? <span className="text-error ms-0.5">*</span> : null}
            </p>
            {index > 0 ? (
              <Button type="button" variant="outline" size="sm" onClick={() => remove(index)}>
                <MaterialSymbol name="delete" size="text-base" />
                {t('signup.removeContact')}
              </Button>
            ) : null}
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label={t('signup.contactName')} error={errors?.[index]?.name?.message} required>
              <Input {...form.register(`emergencyContacts.${index}.name`)} />
            </Field>
            <Field label={t('signup.contactPhone')} error={errors?.[index]?.phone?.message} required>
              <Input {...phoneInputProps} {...form.register(`emergencyContacts.${index}.phone`)} />
            </Field>
            <Field label={t('signup.contactRelationship')} error={errors?.[index]?.relationship?.message} required>
              <Input {...form.register(`emergencyContacts.${index}.relationship`)} />
            </Field>
          </div>
        </div>
      ))}

      <Button
        type="button"
        variant="outline"
        onClick={() => append({ name: '', phone: '', relationship: '' })}
      >
        <MaterialSymbol name="add" size="text-base" />
        {t('signup.addContact')}
      </Button>
    </div>
  );
}

function StepDailyCare({ form, t }: StepProps) {
  const sendsVitamins = form.watch('sendsVitamins');
  const yesNo = (name: 'takesBreakfastAtHome' | 'eatsNurseryMeals' | 'extraMealPreference'
    | 'sendsExtraSnacks' | 'waterPreference' | 'sendsVitamins') => (
    <Select {...form.register(name)}>
      <option value="">{t('common.select')}</option>
      <option value="Yes">{t('common.yes')}</option>
      <option value="No">{t('common.no')}</option>
    </Select>
  );

  return (
    <div className="space-y-6">
      <h3 className="text-lg font-semibold text-on-surface">{t('signup.steps.dailyCare')}</h3>

      <div>
        <h4 className="mb-3 text-sm font-semibold uppercase tracking-wide text-on-surface-variant">{t('signup.mealsSection')}</h4>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t('signup.arrivalTime')}>
            <Input type="time" {...form.register('arrivalTime')} />
          </Field>
          <Field label={t('signup.takesBreakfastAtHome')}>{yesNo('takesBreakfastAtHome')}</Field>
          <Field label={t('signup.eatsNurseryMeals')}>{yesNo('eatsNurseryMeals')}</Field>
          <Field label={t('signup.acceptExtraMeals')}>{yesNo('extraMealPreference')}</Field>
          <Field label={t('signup.acceptExtraSnacks')}>{yesNo('sendsExtraSnacks')}</Field>
          <Field label={t('signup.acceptMineralWater')}>{yesNo('waterPreference')}</Field>
          <Field label={t('signup.sendsVitamins')}>{yesNo('sendsVitamins')}</Field>
          {sendsVitamins === 'Yes' && (
            <Field label={t('signup.vitaminDetails')}>
              <Input {...form.register('vitaminDetails')} placeholder={t('signup.vitaminDetailsHint')} />
            </Field>
          )}
        </div>
      </div>

      <div>
        <h4 className="mb-3 text-sm font-semibold uppercase tracking-wide text-on-surface-variant">{t('signup.diaperSection')}</h4>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t('signup.diaperSupplyMethod')}>
            <Select {...form.register('diaperSupplyMethod')}>
              <option value="">{t('common.select')}</option>
              <option value="Stock">{t('signup.stock')}</option>
              <option value="On daily basis">{t('signup.daily')}</option>
            </Select>
          </Field>
          <Field label={t('signup.dailyDiaperCount')}>
            <Input type="number" {...form.register('dailyDiaperCount')} />
          </Field>
          <Field label={t('signup.rashCreamUsage')}>
            <Input {...form.register('rashCreamUsage')} />
          </Field>
          <Field label={t('signup.diaperChangeFrequency')}>
            <Input {...form.register('diaperChangeFrequency')} />
          </Field>
          <Field label={t('signup.toiletTrainingStatus')}>
            <Select {...form.register('toiletTrainingStatus')}>
              <option value="">{t('common.select')}</option>
              <option value="not_started">{t('signup.notStarted')}</option>
              <option value="in_progress">{t('signup.inProgress')}</option>
              <option value="completed">{t('signup.completed')}</option>
            </Select>
          </Field>
        </div>
      </div>

      <div>
        <h4 className="mb-3 text-sm font-semibold uppercase tracking-wide text-on-surface-variant">{t('signup.napSection')}</h4>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t('signup.napTimePreference')}>
            <Input type="time" {...form.register('napTimePreference')} />
          </Field>
          <Field label={t('signup.maxNapTime')}>
            <Input {...form.register('maxNapTime')} placeholder={t('signup.maxNapTimeHint')} />
          </Field>
        </div>
      </div>
    </div>
  );
}

function StepPickups({ form, t, files, setFiles }: StepProps) {
  const e = form.formState.errors;
  return (
    <div className="space-y-6">
      <h3 className="text-lg font-semibold text-on-surface">{t('signup.steps.pickups')}</h3>
      <div className="space-y-4 rounded-2xl border border-outline-variant p-4">
        <p className="text-sm font-medium text-on-surface">{t('signup.pickupPerson')} 1 *</p>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t('signup.pickupName')} error={e.pickupPerson1Name?.message} required>
            <Input {...form.register('pickupPerson1Name')} />
          </Field>
          <Field label={t('signup.pickupPhone')} error={e.pickupPerson1Phone?.message} required>
            <Input {...phoneInputProps} {...form.register('pickupPerson1Phone')} />
          </Field>
          <Field label={t('signup.pickupRelation')}>
            <Input {...form.register('pickupPerson1Relation')} />
          </Field>
          <Field label={t('signup.pickupAuthorization')}>
            <Select {...form.register('pickupPerson1Authorization')}>
              <option value="anytime">{t('signup.anytime')}</option>
              <option value="scheduled">{t('signup.scheduled')}</option>
              <option value="emergency_only">{t('signup.emergencyOnly')}</option>
            </Select>
          </Field>
          <FileDropzoneWithPreview
            label={t('signup.pickupPhoto')}
            file={files.pickupPerson1Photo}
            onChange={(f) => setFiles((prev) => ({ ...prev, pickupPerson1Photo: f }))}
            required
          />
        </div>
      </div>
      <div className="space-y-4 rounded-2xl border border-outline-variant p-4">
        <p className="text-sm font-medium text-on-surface">{t('signup.pickupPerson')} 2 *</p>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t('signup.pickupName')} error={e.pickupPerson2Name?.message} required>
            <Input {...form.register('pickupPerson2Name')} />
          </Field>
          <Field label={t('signup.pickupPhone')} error={e.pickupPerson2Phone?.message} required>
            <Input {...phoneInputProps} {...form.register('pickupPerson2Phone')} />
          </Field>
          <Field label={t('signup.pickupRelation')}>
            <Input {...form.register('pickupPerson2Relation')} />
          </Field>
          <Field label={t('signup.pickupAuthorization')}>
            <Select {...form.register('pickupPerson2Authorization')}>
              <option value="anytime">{t('signup.anytime')}</option>
              <option value="scheduled">{t('signup.scheduled')}</option>
              <option value="emergency_only">{t('signup.emergencyOnly')}</option>
            </Select>
          </Field>
          <FileDropzoneWithPreview
            label={t('signup.pickupPhoto')}
            file={files.pickupPerson2Photo}
            onChange={(f) => setFiles((prev) => ({ ...prev, pickupPerson2Photo: f }))}
            required
          />
        </div>
      </div>
    </div>
  );
}

function StepConsents({ form, t }: StepProps) {
  const e = form.formState.errors;
  return (
    <div className="space-y-4">
      <h3 className="text-lg font-semibold text-on-surface">{t('signup.steps.consents')}</h3>
      <p className="text-sm text-on-surface-variant">{t('signup.consentsIntro')}</p>
      {e.agreeHealthPolicy?.message && (
        <p className="text-sm text-error">{t('signup.allConsentsRequired')}</p>
      )}
      {[
        { id: 'agreeHealthPolicy' as const, label: t('signup.agreeHealthPolicy') },
        { id: 'agreeFinancialAgreement' as const, label: t('signup.agreeFinancialAgreement') },
        { id: 'agreePolicies' as const, label: t('signup.agreePolicies') },
        { id: 'agreeInfoAccuracy' as const, label: t('signup.agreeInfoAccuracy') },
      ].map((item) => {
        const checked = form.watch(item.id);
        return (
          <label
            key={item.id}
            className={cn(
              'flex cursor-pointer items-start gap-3 rounded-xl border p-3 transition-colors',
              checked ? 'border-primary bg-primary/5' : 'border-outline-variant',
            )}
          >
            <Checkbox
              id={item.id}
              checked={checked}
              onCheckedChange={(v) => form.setValue(item.id, v === true)}
            />
            <Label htmlFor={item.id} className="cursor-pointer text-sm leading-relaxed">
              {item.label}
            </Label>
          </label>
        );
      })}
    </div>
  );
}

type StepProps = {
  form: UseFormReturn<ParentSignUpFormValues>;
  t: (k: string, opts?: Record<string, unknown>) => string;
  files: ParentSignUpFileBundle;
  setFiles: React.Dispatch<React.SetStateAction<ParentSignUpFileBundle>>;
  nurseries: SignupNursery[];
  nurseriesLoading: boolean;
  nurseriesError: string | null;
  selectedNursery: SignupNursery | null;
};

export function ParentSignUpPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [stepIndex, setStepIndex] = useState(0);
  const [furthestReached, setFurthestReached] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [files, setFiles] = useState<ParentSignUpFileBundle>(emptyParentSignUpFiles);

  const initialDraft = useMemo(() => loadDraft(), []);

  const form = useForm<ParentSignUpFormValues>({
    resolver: zodResolver(parentSignUpBaseSchema),
    defaultValues: { ...parentSignUpDefaults, ...(initialDraft.values as Partial<ParentSignUpFormValues>) },
    mode: 'onChange',
  });

  // Restore step index from saved meta (only once on mount)
  useEffect(() => {
    if (initialDraft.meta) {
      setFurthestReached(initialDraft.meta.furthestStepIndex);
      setStepIndex(Math.min(initialDraft.meta.currentStepIndex, initialDraft.meta.furthestStepIndex));
      toast.info(t('signup.draftRestored'));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const { nurseries, loading: nurseriesLoading, error: nurseriesError } = useSignupNurseries();

  const liveValues = form.watch();
  const selectedNursery = useSelectedNursery(nurseries, liveValues.nurseryId);

  // Fields the chosen nursery determines. Only written while they still hold the
  // previous nursery's auto value (or nothing), so a parent's own edit survives.
  const autoFilledRef = useRef<{ arrivalTime: string }>({ arrivalTime: '' });
  useEffect(() => {
    if (!selectedNursery) return;

    const arrivalTime = nurseryArrivalTime(selectedNursery);
    if (arrivalTime) {
      const current = form.getValues('arrivalTime');
      if (!current || current === autoFilledRef.current.arrivalTime) {
        form.setValue('arrivalTime', arrivalTime);
        autoFilledRef.current.arrivalTime = arrivalTime;
      }
    }

    // The referral list is per-nursery, so a value from another nursery no longer applies.
    const leadSources = nurseryLeadSources(selectedNursery);
    const referralSource = form.getValues('referralSource');
    if (leadSources.length > 0 && referralSource && !leadSources.includes(referralSource)) {
      form.setValue('referralSource', '');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedNursery]);

  const draftHasContent = useMemo(
    () =>
      JSON.stringify(liveValues) !== JSON.stringify(parentSignUpDefaults) ||
      stepIndex !== 0 ||
      furthestReached !== 0,
    [liveValues, stepIndex, furthestReached],
  );
  const autosave = useApplicationDraft(liveValues, stepIndex, furthestReached, draftHasContent);

  const currentStep = SIGNUP_STEPS[stepIndex];
  const isFirst = stepIndex === 0;
  const isLast = stepIndex === SIGNUP_STEPS.length - 1;
  const canContinue = isStepComplete(currentStep, liveValues, files);
  const canSubmit = SIGNUP_STEPS.every((step) => isStepComplete(step, liveValues, files));
  const firstMissingStep = useMemo(() => firstIncompleteStep(liveValues, files), [files, liveValues]);

  const errorSteps = useMemo(() => {
    const set = new Set<SignUpStep>();
    const errs = form.formState.errors;
    for (const step of SIGNUP_STEPS) {
      const fields = STEP_FIELDS[step];
      if (fields.some((f) => errs[f as keyof typeof errs])) set.add(step);
    }
    if (currentStep === 'review') {
      for (const step of SIGNUP_STEPS) {
        if (step !== 'review' && !isStepComplete(step, liveValues, files)) set.add(step);
      }
    }
    return set;
  }, [currentStep, files, form.formState.errors, liveValues]);

  const goNext = async () => {
    if (isLast || !canContinue) return;
    const fieldsToValidate = STEP_FIELDS[currentStep];
    if (fieldsToValidate.length > 0) {
      const valid = await form.trigger(fieldsToValidate as (keyof ParentSignUpFormValues)[]);
      if (!valid) return;
    }
    if (currentStep === 'parents') {
      const crossFieldError = validateCrossFieldRules(form.getValues(), { checkConsents: false });
      if (crossFieldError) {
        toast.error(t(`signup.${crossFieldError}`));
        return;
      }
    }
    const nextIdx = stepIndex + 1;
    setStepIndex(nextIdx);
    setFurthestReached((f) => Math.max(f, nextIdx));
  };

  const goBack = () => {
    if (!isFirst) setStepIndex((i) => i - 1);
  };

  const jumpTo = (idx: number) => {
    if (idx <= furthestReached) setStepIndex(idx);
  };

  const saveAndExit = () => {
    if (draftHasContent) {
      autosave.flush();
    } else {
      clearDraft();
    }
    toast.success(t('signup.savedAndExit'));
    navigate('/login');
  };

  const resetDraft = () => {
    clearDraft();
    form.reset(parentSignUpDefaults);
    setFiles(emptyParentSignUpFiles());
    setStepIndex(0);
    setFurthestReached(0);
    toast.success(t('signup.draftCleared'));
  };

  const onSubmit = form.handleSubmit(async (values) => {
    if (submitting) return;
    const crossFieldError = validateCrossFieldRules(values, { checkConsents: true });
    if (crossFieldError) {
      toast.error(t(`signup.${crossFieldError}`));
      return;
    }
    if (!files.pickupPerson1Photo || !files.pickupPerson2Photo) {
      toast.error(t('signup.pickupPhotoRequired'));
      setStepIndex(SIGNUP_STEPS.indexOf('pickups'));
      return;
    }
    autosave.flush();
    setSubmitting(true);
    try {
      await submitParentSignUp(values, files);
      clearDraft();
      // signup.success is the success page's namespace object — the toast needs its title.
      toast.success(t('signup.success.title'));
      navigate('/signup/success');
    } catch (err: unknown) {
      toast.error(signupErrorMessage(err, t), {
        description: t('signup.draftKeptAfterError'),
      });
    } finally {
      setSubmitting(false);
    }
  }, () => {
    const firstErrorStep = SIGNUP_STEPS.find((step) => {
      const fields = STEP_FIELDS[step];
      return fields.some((field) => form.formState.errors[field as keyof typeof form.formState.errors]);
    });
    const target = firstErrorStep ?? firstMissingStep;
    if (target) setStepIndex(SIGNUP_STEPS.indexOf(target));
    toast.error(t('signup.completeRequiredBeforeSubmit'));
  });

  const renderCurrentStep = () => {
    const stepProps: StepProps = {
      form,
      t,
      files,
      setFiles,
      nurseries,
      nurseriesLoading,
      nurseriesError,
      selectedNursery,
    };
    switch (currentStep) {
      case 'child':
        return <StepChild {...stepProps} />;
      case 'parents':
        return <StepParents {...stepProps} />;
      case 'family':
        return <StepFamily {...stepProps} />;
      case 'enrollment':
        return <StepEnrollment {...stepProps} />;
      case 'health':
        return <StepHealth {...stepProps} />;
      case 'emergency':
        return <StepEmergency {...stepProps} />;
      case 'dailyCare':
        return <StepDailyCare {...stepProps} />;
      case 'pickups':
        return <StepPickups {...stepProps} />;
      case 'medicationConsents':
        return <StepMedicationConsents form={form} />;
      case 'consents':
        return <StepConsents {...stepProps} />;
      case 'review':
        return (
          <StepReview
            values={liveValues}
            files={files}
            onJumpTo={(step) => jumpTo(SIGNUP_STEPS.indexOf(step))}
          />
        );
      default:
        return null;
    }
  };

  return (
    <SignupShell
      currentIndex={stepIndex}
      furthestReached={furthestReached}
      errorSteps={errorSteps}
      onJumpTo={jumpTo}
      onSaveAndExit={saveAndExit}
      onResetDraft={resetDraft}
      autosaveState={autosave.state}
      autosavedAgoSeconds={autosave.agoSeconds}
    >
      <form onSubmit={onSubmit} noValidate className="space-y-8">
        {renderCurrentStep()}

        <div className="flex items-center justify-between border-t border-outline-variant pt-6">
          <Button type="button" variant="outline" onClick={goBack} disabled={isFirst}>
            <MaterialSymbol name="arrow_back" size="text-base" />
            {t('signup.back')}
          </Button>

          {isLast ? (
            <div className="flex flex-col items-end gap-2">
              {!canSubmit ? (
                <p className="max-w-xs text-end text-xs text-warning">
                  {firstMissingStep === 'pickups' ? t('signup.pickupPhotoRequired') : t('signup.completeRequiredBeforeSubmit')}
                </p>
              ) : null}
              <Button type="submit" className="btn-gradient text-primary-foreground" disabled={submitting}>
              {submitting ? t('common.loading') : t('signup.submit')}
              <MaterialSymbol name="send" size="text-base" />
              </Button>
            </div>
          ) : (
            <Button type="button" className="btn-gradient text-primary-foreground" onClick={() => void goNext()} disabled={!canContinue}>
              {t('signup.next')}
              <MaterialSymbol name="arrow_forward" size="text-base" />
            </Button>
          )}
        </div>

        <p className="text-center text-sm text-on-surface-variant">
          {t('signup.alreadyHaveAccount')}{' '}
          <Link to="/login" className="text-secondary hover:underline">
            {t('auth.signIn')}
          </Link>
        </p>
      </form>
    </SignupShell>
  );
}
