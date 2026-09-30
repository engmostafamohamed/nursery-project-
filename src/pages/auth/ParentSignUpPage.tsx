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
import { Textarea } from '@/components/ui/textarea';
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
import {
  KNOWN_FIELD_KEYS_BY_STEP,
  REGISTRATION_TEMPLATE_STEPS,
  SYSTEM_ALWAYS_ACTIVE_REGISTRATION_FIELD_KEYS,
  SYSTEM_REQUIRED_REGISTRATION_FIELD_KEYS,
  deriveStepOrder,
  normalizeRegistrationTemplate,
  type RegistrationQuestionType,
  type RegistrationTemplatePayload,
  type RegistrationTemplateQuestion,
} from '@/features/parent-signup/registrationTemplates';
import { emptyParentSignUpFiles, type ParentSignUpFileBundle } from '@/features/parent-signup/parentSignUpFiles';
import {
  NAP_DURATION_VALUES,
  parentSignUpBaseSchema,
  validateCrossFieldRules,
  type ParentSignUpFormValues,
} from '@/features/parent-signup/parentSignUpValidation';
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
const emptyEmergencyContact = () => ({ name: '', phone: '', relationship: '' });

function hasStartedEmergencyContact(contact: ParentSignUpFormValues['emergencyContacts'][number]) {
  return requiredTextFilled(contact.name) || requiredTextFilled(contact.phone) || requiredTextFilled(contact.relationship);
}

type TemplateFieldKey = keyof ParentSignUpFormValues | keyof ParentSignUpFileBundle | string;

const FILE_FIELD_KEYS = new Set<string>([
  'childPhoto',
  'fatherIdPhoto',
  'motherIdPhoto',
  'birthCertificate',
  'vaccinationCard',
  'proofOfAddress',
  'medicalReport',
  'otherDocument',
  'pickupPerson1Photo',
  'pickupPerson2Photo',
]);

const SYSTEM_REQUIRED_FIELD_KEYS = new Set<string>(SYSTEM_REQUIRED_REGISTRATION_FIELD_KEYS);
const SYSTEM_ALWAYS_ACTIVE_FIELD_KEYS = new Set<string>(SYSTEM_ALWAYS_ACTIVE_REGISTRATION_FIELD_KEYS);

function questionForField(template: RegistrationTemplatePayload | null | undefined, fieldKey: TemplateFieldKey) {
  return template?.questions.find((question) => question.fieldKey === fieldKey) ?? null;
}

function isTemplateFieldActive(template: RegistrationTemplatePayload | null | undefined, fieldKey: TemplateFieldKey, fallback = true) {
  if (SYSTEM_ALWAYS_ACTIVE_FIELD_KEYS.has(String(fieldKey))) return true;
  const question = questionForField(template, fieldKey);
  return question ? question.active : fallback;
}

function isTemplateFieldRequired(template: RegistrationTemplatePayload | null | undefined, fieldKey: TemplateFieldKey, fallback = false) {
  if (SYSTEM_REQUIRED_FIELD_KEYS.has(String(fieldKey))) return true;
  const question = questionForField(template, fieldKey);
  return question ? question.active && question.required : fallback;
}

function templateFieldLabel(
  template: RegistrationTemplatePayload | null | undefined,
  fieldKey: TemplateFieldKey,
  fallback: string,
) {
  const question = questionForField(template, fieldKey);
  return question?.label?.trim() || fallback;
}

function templateFieldHelp(template: RegistrationTemplatePayload | null | undefined, fieldKey: TemplateFieldKey) {
  return questionForField(template, fieldKey)?.helpText?.trim() || '';
}

function templateFieldOptions(
  template: RegistrationTemplatePayload | null | undefined,
  fieldKey: TemplateFieldKey,
  fallback: string[] = [],
) {
  const options = questionForField(template, fieldKey)?.options?.filter(Boolean) ?? [];
  return options.length > 0 ? options : fallback;
}

/** A step stays in the wizard only while it still has something to show: at least one
 * active built-in field, or an active custom question the admin added for it. When no
 * template has loaded yet, every built-in field falls back to active, so nothing hides. */
function stepHasActiveContent(step: SignUpStep, template: RegistrationTemplatePayload | null | undefined) {
  const knownKeys = KNOWN_FIELD_KEYS_BY_STEP[step as (typeof REGISTRATION_TEMPLATE_STEPS)[number]] ?? [];
  if (knownKeys.some((key) => isTemplateFieldActive(template, key))) return true;
  return (template?.questions ?? []).some((question) => question.active && !question.fieldKey && question.step === step);
}

function TemplateHelp({ text }: { text: string }) {
  return text ? <p className="text-xs text-on-surface-variant">{text}</p> : null;
}

function hasCompleteEmergencyContact(contact: ParentSignUpFormValues['emergencyContacts'][number]) {
  return requiredTextFilled(contact.name) && isValidPhone(contact.phone) && requiredTextFilled(contact.relationship);
}

function normalizeEmergencyContacts(values: ParentSignUpFormValues): ParentSignUpFormValues {
  const emergencyContacts = [...(values.emergencyContacts ?? [])];
  while (emergencyContacts.length < 2) emergencyContacts.push(emptyEmergencyContact());
  return { ...values, emergencyContacts };
}

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

function hasAcceptedAllConsents(values: ParentSignUpFormValues, template?: RegistrationTemplatePayload | null) {
  return ([
    'agreeHealthPolicy',
    'agreeFinancialAgreement',
    'agreePolicies',
    'agreeInfoAccuracy',
  ] as const).every((fieldKey) => {
    if (!isTemplateFieldActive(template, fieldKey)) return true;
    if (!isTemplateFieldRequired(template, fieldKey, true)) return true;
    return values[fieldKey] === true;
  });
}

/** Ticking one of the Family Details boxes makes the detail it reveals mandatory. */
function hasCompleteFamilyDetails(values: ParentSignUpFormValues, template?: RegistrationTemplatePayload | null) {
  if (
    isTemplateFieldActive(template, 'hasSiblings') &&
    isTemplateFieldActive(template, 'siblingAges') &&
    values.hasSiblings &&
    !requiredTextFilled(values.siblingAges)
  ) return false;
  return true;
}

/** Ticking one of the Health boxes makes the detail it reveals mandatory. */
function hasCompleteHealthDetails(values: ParentSignUpFormValues, template?: RegistrationTemplatePayload | null) {
  if (isTemplateFieldActive(template, 'hasAllergy') && values.hasAllergy) {
    const picked = values.allergyTypes ?? [];
    if (isTemplateFieldActive(template, 'allergyTypes') && picked.length === 0) return false;
    if (
      isTemplateFieldActive(template, 'allergyDetails') &&
      picked.includes(OTHER_ALLERGY_VALUE) &&
      !requiredTextFilled(values.allergyDetails)
    ) return false;
  }

  if (
    isTemplateFieldActive(template, 'hasMedicalCondition') &&
    isTemplateFieldActive(template, 'medicalConditionDetails') &&
    values.hasMedicalCondition &&
    !requiredTextFilled(values.medicalConditionDetails)
  ) return false;

  return true;
}

function hasCompleteNapPreferences(values: ParentSignUpFormValues, template?: RegistrationTemplatePayload | null) {
  if (!isTemplateFieldActive(template, 'napTimePreference')) return true;
  if (!isTemplateFieldRequired(template, 'napTimePreference', true) && !requiredTextFilled(values.napTimePreference)) return true;
  if (values.napTimePreference !== 'Yes' && values.napTimePreference !== 'No') return false;
  if (values.napTimePreference === 'No') return true;
  if (!isTemplateFieldActive(template, 'maxNapTime')) return true;
  if (!isTemplateFieldRequired(template, 'maxNapTime', true) && !requiredTextFilled(values.maxNapTime)) return true;
  return NAP_DURATION_VALUES.includes(values.maxNapTime as (typeof NAP_DURATION_VALUES)[number]);
}

function hasCompleteDocuments(files: ParentSignUpFileBundle, template?: RegistrationTemplatePayload | null) {
  const requiredFileFields: Array<keyof ParentSignUpFileBundle> = [
    'birthCertificate',
    'vaccinationCard',
    'proofOfAddress',
    'medicalReport',
    'otherDocument',
  ];
  const singleFileRequirementsMet = requiredFileFields.every((fieldKey) => {
    if (!isTemplateFieldActive(template, fieldKey)) return true;
    if (!isTemplateFieldRequired(template, fieldKey, fieldKey === 'birthCertificate' || fieldKey === 'vaccinationCard' || fieldKey === 'proofOfAddress')) return true;
    return Boolean(files[fieldKey]);
  });

  const fatherIdRequired = isTemplateFieldActive(template, 'fatherIdPhoto') && isTemplateFieldRequired(template, 'fatherIdPhoto', false);
  const motherIdRequired = isTemplateFieldActive(template, 'motherIdPhoto') && isTemplateFieldRequired(template, 'motherIdPhoto', false);
  const anyParentIdRequired = !template || fatherIdRequired || motherIdRequired;
  const parentIdMet = !anyParentIdRequired || Boolean(files.fatherIdPhoto || files.motherIdPhoto);

  return singleFileRequirementsMet && parentIdMet;
}

function isBuiltInQuestionComplete(question: RegistrationTemplateQuestion, values: ParentSignUpFormValues, files: ParentSignUpFileBundle) {
  if (!question.active || !question.fieldKey) return true;
  const fieldKey = String(question.fieldKey);
  if (FILE_FIELD_KEYS.has(fieldKey)) return templateValidationPasses(question, files[fieldKey as keyof ParentSignUpFileBundle]);
  if (fieldKey === 'emergencyContacts') {
    const contacts = values.emergencyContacts ?? [];
    if (!question.required && contacts.every((contact) => !hasStartedEmergencyContact(contact))) return true;
    return contacts.length >= 2 && contacts.slice(0, 2).every(hasCompleteEmergencyContact);
  }
  if (fieldKey === 'medicationConsents') return templateValidationPasses(question, values.medicationConsents ?? []);
  if (fieldKey === 'childDob') {
    if (!question.required && !requiredTextFilled(values.childDob)) return true;
    return typeof values.childDob === 'string' && isChildAgeValid(values.childDob) && templateValidationPasses(question, values.childDob);
  }
  if (fieldKey === 'username') return USERNAME_PATTERN.test(values.username.trim()) && templateValidationPasses(question, values.username);
  if (fieldKey === 'password') return values.password.trim().length >= 8 && templateValidationPasses(question, values.password);
  const value = values[fieldKey as keyof ParentSignUpFormValues];
  if (typeof value === 'boolean') {
    return fieldKey.startsWith('agree') ? (!question.required || value === true) : templateValidationPasses(question, value);
  }
  if (Array.isArray(value)) return templateValidationPasses(question, value);
  if (/phone|mobile/i.test(fieldKey)) {
    if (!question.required && !requiredTextFilled(value)) return true;
    return isValidPhone(value) && templateValidationPasses(question, value);
  }
  if (/email/i.test(fieldKey)) {
    if (!question.required && !requiredTextFilled(value)) return true;
    return isValidEmail(value) && templateValidationPasses(question, value);
  }
  return templateValidationPasses(question, value);
}

function templateStepQuestionsComplete(
  step: SignUpStep,
  values: ParentSignUpFormValues,
  files: ParentSignUpFileBundle,
  template?: RegistrationTemplatePayload | null,
) {
  if (!template || step === 'review') return true;
  return template.questions
    .filter((question) =>
      question.active &&
      question.fieldKey &&
      question.step === step &&
      question.fieldKey !== 'fatherIdPhoto' &&
      question.fieldKey !== 'motherIdPhoto',
    )
    .every((question) => isBuiltInQuestionComplete(question, values, files));
}

function isStepComplete(
  step: SignUpStep,
  values: ParentSignUpFormValues,
  files: ParentSignUpFileBundle,
  template?: RegistrationTemplatePayload | null,
) {
  if (step === 'parents') return hasCompleteParent(values) && templateStepQuestionsComplete(step, values, files, template);
  if (step === 'family') return hasCompleteFamilyDetails(values, template) && templateStepQuestionsComplete(step, values, files, template);
  if (step === 'health') return hasCompleteHealthDetails(values, template) && templateStepQuestionsComplete(step, values, files, template);
  if (step === 'dailyCare') return hasCompleteNapPreferences(values, template) && templateStepQuestionsComplete(step, values, files, template);
  if (step === 'consents') return hasAcceptedAllConsents(values, template) && templateStepQuestionsComplete(step, values, files, template);
  if (step === 'pickups') return templateStepQuestionsComplete(step, values, files, template);
  if (step === 'documents') return hasCompleteDocuments(files, template) && templateStepQuestionsComplete(step, values, files, template);
  if (step === 'emergency') {
    if (!isTemplateFieldActive(template, 'emergencyContacts')) return true;
    if (!isTemplateFieldRequired(template, 'emergencyContacts', true)) return true;
    // First two cards are required; extra cards are optional unless started.
    const contacts = values.emergencyContacts ?? [];
    return (
      contacts.length >= 2 &&
      contacts.every((contact, index) =>
        index < 2
          ? hasCompleteEmergencyContact(contact)
          : !hasStartedEmergencyContact(contact) || hasCompleteEmergencyContact(contact),
      )
    );
  }

  const baseComplete = STEP_FIELDS[step].every((field) => {
    if (!isTemplateFieldActive(template, field)) return true;
    if (!isTemplateFieldRequired(template, field, true)) return true;
    const value = values[field as keyof ParentSignUpFormValues];
    if (field === 'childDob') return typeof value === 'string' && isChildAgeValid(value);
    if (/phone|mobile/i.test(field)) return isValidPhone(value);
    if (/email/i.test(field)) return isValidEmail(value);
    return typeof value === 'boolean' ? value : requiredTextFilled(value);
  });
  return baseComplete && templateStepQuestionsComplete(step, values, files, template);
}

function firstIncompleteStep(
  values: ParentSignUpFormValues,
  files: ParentSignUpFileBundle,
  template?: RegistrationTemplatePayload | null,
): SignUpStep | null {
  return SIGNUP_STEPS.find((step) => step !== 'review' && !isStepComplete(step, values, files, template)) ?? null;
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
  if (/registration_closed/i.test(message)) {
    return t('signup.registrationClosed');
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

function StepChild({ form, t, files, setFiles, nurseries, nurseriesLoading, nurseriesError, activeRegistrationTemplate }: StepProps) {
  const { i18n } = useTranslation();
  const e = form.formState.errors;
  const childDobBounds = childDateOfBirthBounds();
  const template = activeRegistrationTemplate;

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
      <Field label={templateFieldLabel(template, 'nurseryId', t('signup.nursery'))} error={e.nurseryId?.message} required>
        <TemplateHelp text={templateFieldHelp(template, 'nurseryId')} />
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
        {isTemplateFieldActive(template, 'childFirstName') ? (
          <Field label={templateFieldLabel(template, 'childFirstName', t('signup.childFirstName'))} error={e.childFirstName?.message} required={isTemplateFieldRequired(template, 'childFirstName', true)}>
            <TemplateHelp text={templateFieldHelp(template, 'childFirstName')} />
            <Input {...form.register('childFirstName')} />
          </Field>
        ) : null}
        {isTemplateFieldActive(template, 'childMiddleName') ? (
          <Field label={templateFieldLabel(template, 'childMiddleName', t('signup.childMiddleName'))} error={e.childMiddleName?.message} required={isTemplateFieldRequired(template, 'childMiddleName', true)}>
            <TemplateHelp text={templateFieldHelp(template, 'childMiddleName')} />
            <Input {...form.register('childMiddleName')} />
          </Field>
        ) : null}
        {isTemplateFieldActive(template, 'childLastName') ? (
          <Field label={templateFieldLabel(template, 'childLastName', t('signup.childLastName'))} error={e.childLastName?.message} required={isTemplateFieldRequired(template, 'childLastName', true)}>
            <TemplateHelp text={templateFieldHelp(template, 'childLastName')} />
            <Input {...form.register('childLastName')} />
          </Field>
        ) : null}
        {isTemplateFieldActive(template, 'childNickname') ? (
          <Field label={templateFieldLabel(template, 'childNickname', t('signup.childNickname'))} error={e.childNickname?.message} required={isTemplateFieldRequired(template, 'childNickname', true)}>
            <TemplateHelp text={templateFieldHelp(template, 'childNickname')} />
            <Input {...form.register('childNickname')} />
          </Field>
        ) : null}
        {isTemplateFieldActive(template, 'childDob') ? (
          <Field label={templateFieldLabel(template, 'childDob', t('signup.childDob'))} error={e.childDob?.message} required={isTemplateFieldRequired(template, 'childDob', true)}>
            <TemplateHelp text={templateFieldHelp(template, 'childDob')} />
            <Input type="date" min={childDobBounds.min} max={childDobBounds.max} {...form.register('childDob')} />
          </Field>
        ) : null}
        {isTemplateFieldActive(template, 'childNationality') ? (
          <Field label={templateFieldLabel(template, 'childNationality', t('signup.childNationality'))} error={e.childNationality?.message} required={isTemplateFieldRequired(template, 'childNationality', true)}>
            <TemplateHelp text={templateFieldHelp(template, 'childNationality')} />
            <SearchableSelect
              name="childNationality"
              value={form.watch('childNationality')}
              onChange={(value) => form.setValue('childNationality', value, { shouldValidate: true })}
              options={nationalityOptions(i18n.language.startsWith('ar'))}
              searchPlaceholder={t('signup.nationalitySearch')}
            />
          </Field>
        ) : null}
        {isTemplateFieldActive(template, 'childGender') ? (
          <Field label={templateFieldLabel(template, 'childGender', t('signup.childGender'))} required={isTemplateFieldRequired(template, 'childGender')}>
            <TemplateHelp text={templateFieldHelp(template, 'childGender')} />
            {/* children.gender is CHECK-constrained to male/female; submitParentSignUp
                nulls out anything else, so a custom template option never breaks the insert. */}
            <Select {...form.register('childGender')}>
              <option value="">{t('common.select')}</option>
              {templateFieldOptions(template, 'childGender', ['male', 'female']).map((option) => (
                <option key={option} value={option}>
                  {option === 'male' ? t('common.genderMale') : option === 'female' ? t('common.genderFemale') : option}
                </option>
              ))}
            </Select>
          </Field>
        ) : null}
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        {isTemplateFieldActive(template, 'childPhoto') ? (
          <FileDropzoneWithPreview
            label={templateFieldLabel(template, 'childPhoto', t('signup.childPhoto'))}
            file={files.childPhoto}
            onChange={(f) => setFiles((prev) => ({ ...prev, childPhoto: f }))}
            required={isTemplateFieldRequired(template, 'childPhoto')}
          />
        ) : null}
      </div>
    </div>
  );
}

function StepParents({ form, t, activeRegistrationTemplate }: StepProps) {
  const e = form.formState.errors;
  const template = activeRegistrationTemplate;
  const [showPassword, setShowPassword] = useState(false);
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
          <Field label={templateFieldLabel(template, 'username', t('signup.username'))} error={e.username?.message} required>
            <TemplateHelp text={templateFieldHelp(template, 'username')} />
            <Input {...form.register('username')} autoComplete="username" placeholder={t('signup.usernameHint')} />
          </Field>
          <Field label={templateFieldLabel(template, 'password', t('signup.password'))} error={e.password?.message} required>
            <TemplateHelp text={templateFieldHelp(template, 'password')} />
            <div className="relative">
              <Input
                type={showPassword ? 'text' : 'password'}
                {...form.register('password')}
                autoComplete="new-password"
                className="pe-11"
                placeholder={t('signup.passwordHint')}
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="absolute end-1 top-1/2 size-9 -translate-y-1/2 text-on-surface-variant"
                aria-label={showPassword ? t('signup.hidePassword') : t('signup.showPassword')}
                onClick={() => setShowPassword((visible) => !visible)}
              >
                <MaterialSymbol name={showPassword ? 'visibility_off' : 'visibility'} size="text-xl" />
              </Button>
            </div>
          </Field>
        </div>
      </div>

      <p className="text-xs text-on-surface-variant">{t('signup.atLeastOneParent')}</p>

      <div className="space-y-4 rounded-2xl border border-outline-variant p-4">
        <p className="text-sm font-medium text-on-surface">{t('signup.fatherInfo')}</p>
        <div className="grid gap-4 sm:grid-cols-2">
          {isTemplateFieldActive(template, 'fatherFullName') ? (
            <Field label={templateFieldLabel(template, 'fatherFullName', t('signup.fatherFullName'))} required={isTemplateFieldRequired(template, 'fatherFullName')}>
              <TemplateHelp text={templateFieldHelp(template, 'fatherFullName')} />
              <Input {...form.register('fatherFullName')} />
            </Field>
          ) : null}
          {isTemplateFieldActive(template, 'fatherJob') ? (
            <Field label={templateFieldLabel(template, 'fatherJob', t('signup.fatherJob'))} required={isTemplateFieldRequired(template, 'fatherJob')}>
              <TemplateHelp text={templateFieldHelp(template, 'fatherJob')} />
              <Input {...form.register('fatherJob')} />
            </Field>
          ) : null}
          {isTemplateFieldActive(template, 'fatherMobile') ? (
            <Field label={templateFieldLabel(template, 'fatherMobile', t('signup.fatherMobile'))} error={e.fatherMobile?.message} required={isTemplateFieldRequired(template, 'fatherMobile')}>
              <TemplateHelp text={templateFieldHelp(template, 'fatherMobile')} />
              <Input {...phoneInputProps} {...form.register('fatherMobile')} />
            </Field>
          ) : null}
          {isTemplateFieldActive(template, 'fatherEmail') ? (
            <Field label={templateFieldLabel(template, 'fatherEmail', t('signup.fatherEmail'))} error={e.fatherEmail?.message} required={isTemplateFieldRequired(template, 'fatherEmail')}>
              <TemplateHelp text={templateFieldHelp(template, 'fatherEmail')} />
              <Input type="email" {...form.register('fatherEmail')} />
            </Field>
          ) : null}
        </div>
      </div>

      <div className="space-y-4 rounded-2xl border border-outline-variant p-4">
        <p className="text-sm font-medium text-on-surface">{t('signup.motherInfo')}</p>
        <div className="grid gap-4 sm:grid-cols-2">
          {isTemplateFieldActive(template, 'motherFullName') ? (
            <Field label={templateFieldLabel(template, 'motherFullName', t('signup.motherFullName'))} required={isTemplateFieldRequired(template, 'motherFullName')}>
              <TemplateHelp text={templateFieldHelp(template, 'motherFullName')} />
              <Input {...form.register('motherFullName')} />
            </Field>
          ) : null}
          {isTemplateFieldActive(template, 'motherJob') ? (
            <Field label={templateFieldLabel(template, 'motherJob', t('signup.motherJob'))} required={isTemplateFieldRequired(template, 'motherJob')}>
              <TemplateHelp text={templateFieldHelp(template, 'motherJob')} />
              <Input {...form.register('motherJob')} />
            </Field>
          ) : null}
          {isTemplateFieldActive(template, 'motherMobile') ? (
            <Field label={templateFieldLabel(template, 'motherMobile', t('signup.motherMobile'))} error={e.motherMobile?.message} required={isTemplateFieldRequired(template, 'motherMobile')}>
              <TemplateHelp text={templateFieldHelp(template, 'motherMobile')} />
              <Input {...phoneInputProps} {...form.register('motherMobile')} />
            </Field>
          ) : null}
          {isTemplateFieldActive(template, 'motherEmail') ? (
            <Field label={templateFieldLabel(template, 'motherEmail', t('signup.motherEmail'))} error={e.motherEmail?.message} required={isTemplateFieldRequired(template, 'motherEmail')}>
              <TemplateHelp text={templateFieldHelp(template, 'motherEmail')} />
              <Input type="email" {...form.register('motherEmail')} />
            </Field>
          ) : null}
        </div>
      </div>

    </div>
  );
}

function StepFamily({ form, t, activeRegistrationTemplate }: StepProps) {
  const template = activeRegistrationTemplate;
  const hasSiblings = form.watch('hasSiblings');
  return (
    <div className="space-y-4">
      <h3 className="text-lg font-semibold text-on-surface">{t('signup.steps.family')}</h3>
      <div className="grid gap-4 sm:grid-cols-2">
        {isTemplateFieldActive(template, 'maritalStatus') ? (
          <Field label={templateFieldLabel(template, 'maritalStatus', t('signup.maritalStatus'))} required={isTemplateFieldRequired(template, 'maritalStatus')}>
            <TemplateHelp text={templateFieldHelp(template, 'maritalStatus')} />
            {/* family.marital_status is CHECK-constrained to these five values; submitParentSignUp
                nulls out anything else, so a custom template option never breaks the insert. */}
            <Select {...form.register('maritalStatus')}>
              <option value="">{t('common.select')}</option>
              {templateFieldOptions(template, 'maritalStatus', ['married', 'divorced', 'separated', 'widowed', 'single']).map((option) => (
                <option key={option} value={option}>
                  {option === 'married'
                    ? t('signup.married')
                    : option === 'divorced'
                      ? t('signup.divorced')
                      : option === 'separated'
                        ? t('signup.separated')
                        : option === 'widowed'
                          ? t('signup.widowed')
                          : option === 'single'
                            ? t('signup.single')
                            : option}
                </option>
              ))}
            </Select>
          </Field>
        ) : null}
        {isTemplateFieldActive(template, 'address') ? (
          <Field label={templateFieldLabel(template, 'address', t('signup.address'))} required={isTemplateFieldRequired(template, 'address')}>
            <TemplateHelp text={templateFieldHelp(template, 'address')} />
            <Input {...form.register('address')} placeholder={t('signup.addressHint')} />
          </Field>
        ) : null}
      </div>
      {isTemplateFieldActive(template, 'hasSiblings') ? (
        <div className="flex items-center gap-2">
          <Checkbox
            id="hasSiblings"
            checked={hasSiblings}
            onCheckedChange={(v) => form.setValue('hasSiblings', v === true)}
          />
          <Label htmlFor="hasSiblings">{templateFieldLabel(template, 'hasSiblings', t('signup.hasSiblings'))}</Label>
        </div>
      ) : null}
      {hasSiblings && isTemplateFieldActive(template, 'siblingAges') ? (
        <Field label={templateFieldLabel(template, 'siblingAges', t('signup.siblingAges'))} required={isTemplateFieldRequired(template, 'siblingAges', true)}>
          <TemplateHelp text={templateFieldHelp(template, 'siblingAges')} />
          <Input {...form.register('siblingAges')} placeholder={t('signup.siblingAgesHint')} />
        </Field>
      ) : null}
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

function StepEnrollment({ form, t, selectedNursery, activeRegistrationTemplate }: StepProps) {
  // Each nursery configures its own referral list and departments; fall back to generic ones.
  const template = activeRegistrationTemplate;
  const leadSources = nurseryLeadSources(selectedNursery);
  const departments = nurseryDepartments(selectedNursery);
  const academicYears = academicYearOptions();
  const departmentOptions = templateFieldOptions(template, 'department', departments);
  const schoolPreferenceOptions = templateFieldOptions(template, 'schoolPreference');
  const academicYearTemplateOptions = templateFieldOptions(template, 'academicYear', academicYears);
  const referralOptions = templateFieldOptions(template, 'referralSource', leadSources);
  return (
    <div className="space-y-4">
      <h3 className="text-lg font-semibold text-on-surface">{t('signup.steps.enrollment')}</h3>
      <div className="grid gap-4 sm:grid-cols-2">
        {/* Departments come from the nursery picked in step 1. */}
        {isTemplateFieldActive(template, 'department') ? (
          <Field label={templateFieldLabel(template, 'department', t('signup.department'))} required={isTemplateFieldRequired(template, 'department')}>
            <TemplateHelp text={templateFieldHelp(template, 'department')} />
            <Select {...form.register('department')}>
              <option value="">{t('common.select')}</option>
              {departmentOptions.length > 0 ? (
                departmentOptions.map((dept) => (
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
        ) : null}
        {/* children.school_preference is CHECK-constrained to these three values. */}
        {isTemplateFieldActive(template, 'schoolPreference') ? (
          <Field label={templateFieldLabel(template, 'schoolPreference', t('signup.schoolPreference'))} required={isTemplateFieldRequired(template, 'schoolPreference')}>
            <TemplateHelp text={templateFieldHelp(template, 'schoolPreference')} />
            <Select {...form.register('schoolPreference')}>
              <option value="">{t('common.select')}</option>
              {schoolPreferenceOptions.length > 0 ? (
                schoolPreferenceOptions.map((option) => <option key={option} value={option}>{option}</option>)
              ) : (
                <>
                  <option value="british">{t('signup.schoolBritish')}</option>
                  <option value="american">{t('signup.schoolAmerican')}</option>
                  <option value="national">{t('signup.schoolNational')}</option>
                  <option value="ib">{t('signup.schoolIb')}</option>
                  <option value="french">{t('signup.schoolFrench')}</option>
                  <option value="canadian">{t('signup.schoolCanadian')}</option>
                  <option value="other">{t('signup.schoolOther')}</option>
                </>
              )}
            </Select>
          </Field>
        ) : null}
        {isTemplateFieldActive(template, 'schoolAdmissionsPlan') ? (
          <Field label={templateFieldLabel(template, 'schoolAdmissionsPlan', t('signup.schoolAdmissionsPlan'))} required={isTemplateFieldRequired(template, 'schoolAdmissionsPlan')}>
            <TemplateHelp text={templateFieldHelp(template, 'schoolAdmissionsPlan')} />
            <Input {...form.register('schoolAdmissionsPlan')} />
          </Field>
        ) : null}
        {isTemplateFieldActive(template, 'academicYear') ? (
          <Field label={templateFieldLabel(template, 'academicYear', t('signup.academicYear'))} required={isTemplateFieldRequired(template, 'academicYear')}>
            <TemplateHelp text={templateFieldHelp(template, 'academicYear')} />
            <Select {...form.register('academicYear')}>
              <option value="">{t('common.select')}</option>
              {academicYearTemplateOptions.map((year) => (
                <option key={year} value={year}>{year}</option>
              ))}
            </Select>
          </Field>
        ) : null}
        {isTemplateFieldActive(template, 'referralSource') ? (
          <Field label={templateFieldLabel(template, 'referralSource', t('signup.referralSource'))} required={isTemplateFieldRequired(template, 'referralSource')}>
            <TemplateHelp text={templateFieldHelp(template, 'referralSource')} />
            <Select {...form.register('referralSource')}>
              <option value="">{t('common.select')}</option>
              {referralOptions.length > 0 ? (
                referralOptions.map((source) => (
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
        ) : null}
      </div>
    </div>
  );
}

function StepHealth({ form, t, activeRegistrationTemplate }: StepProps) {
  const { i18n } = useTranslation();
  const template = activeRegistrationTemplate;
  const hasAllergy = form.watch('hasAllergy');
  const hasMedicalCondition = form.watch('hasMedicalCondition');
  const allergyTypes = form.watch('allergyTypes') ?? [];

  return (
    <div className="space-y-4">
      <h3 className="text-lg font-semibold text-on-surface">{t('signup.steps.health')}</h3>
      {isTemplateFieldActive(template, 'hasAllergy') ? (
        <div className="space-y-3 rounded-2xl border border-outline-variant p-4">
          <div className="flex items-center gap-2">
            <Checkbox
              id="hasAllergy"
              checked={hasAllergy}
              onCheckedChange={(v) => form.setValue('hasAllergy', v === true, { shouldValidate: true })}
            />
            <Label htmlFor="hasAllergy">{templateFieldLabel(template, 'hasAllergy', t('signup.hasAllergy'))}</Label>
          </div>
          <TemplateHelp text={templateFieldHelp(template, 'hasAllergy')} />
          {hasAllergy && (
          <>
            {isTemplateFieldActive(template, 'allergyTypes') ? (
              <Field label={templateFieldLabel(template, 'allergyTypes', t('signup.allergyTypes'))} required={isTemplateFieldRequired(template, 'allergyTypes', true)}>
                <TemplateHelp text={templateFieldHelp(template, 'allergyTypes')} />
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
            ) : null}
            {allergyTypes.includes(OTHER_ALLERGY_VALUE) && isTemplateFieldActive(template, 'allergyDetails') && (
              <Field label={templateFieldLabel(template, 'allergyDetails', t('signup.allergyDetails'))} required={isTemplateFieldRequired(template, 'allergyDetails', true)}>
                <TemplateHelp text={templateFieldHelp(template, 'allergyDetails')} />
                <Input {...form.register('allergyDetails')} placeholder={t('signup.pleaseSpecify')} />
              </Field>
            )}
          </>
          )}
        </div>
      ) : null}

      <div className="space-y-3 rounded-2xl border border-outline-variant p-4">
        {isTemplateFieldActive(template, 'hasMedicalCondition') ? (
          <div className="flex items-center gap-2">
            <Checkbox
              id="hasMedicalCondition"
              checked={hasMedicalCondition}
              onCheckedChange={(v) => form.setValue('hasMedicalCondition', v === true, { shouldValidate: true })}
            />
            <Label htmlFor="hasMedicalCondition">{templateFieldLabel(template, 'hasMedicalCondition', t('signup.hasMedicalCondition'))}</Label>
          </div>
        ) : null}
        <TemplateHelp text={templateFieldHelp(template, 'hasMedicalCondition')} />
        {hasMedicalCondition && isTemplateFieldActive(template, 'medicalConditionDetails') ? (
          <Field label={templateFieldLabel(template, 'medicalConditionDetails', t('signup.medicalConditionDetails'))} required={isTemplateFieldRequired(template, 'medicalConditionDetails', true)}>
            <TemplateHelp text={templateFieldHelp(template, 'medicalConditionDetails')} />
            <Input {...form.register('medicalConditionDetails')} placeholder={t('signup.pleaseSpecify')} />
          </Field>
        ) : null}
        {isTemplateFieldActive(template, 'childBehaviorHealthNotes') ? (
          <Field label={templateFieldLabel(template, 'childBehaviorHealthNotes', t('signup.childBehaviorHealthNotes'))} required={isTemplateFieldRequired(template, 'childBehaviorHealthNotes')}>
            <TemplateHelp text={templateFieldHelp(template, 'childBehaviorHealthNotes')} />
            <Textarea
              {...form.register('childBehaviorHealthNotes')}
              className="min-h-28"
              placeholder={t('signup.childBehaviorHealthNotesHint')}
            />
          </Field>
        ) : null}
      </div>
    </div>
  );
}

function StepDocuments({ t, files, setFiles, activeRegistrationTemplate }: StepProps) {
  const template = activeRegistrationTemplate;
  const hasParentId = Boolean(files.fatherIdPhoto || files.motherIdPhoto);

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-lg font-semibold text-on-surface">{t('signup.steps.documents')}</h3>
        <p className="mt-1 text-sm text-on-surface-variant">{t('signup.documentsHint')}</p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        {isTemplateFieldActive(template, 'birthCertificate') ? (
          <FileDropzoneWithPreview
            label={templateFieldLabel(template, 'birthCertificate', t('signup.birthCertificate'))}
            file={files.birthCertificate}
            onChange={(f) => setFiles((prev) => ({ ...prev, birthCertificate: f }))}
            required={isTemplateFieldRequired(template, 'birthCertificate', true)}
          />
        ) : null}
        {isTemplateFieldActive(template, 'vaccinationCard') ? (
          <FileDropzoneWithPreview
            label={templateFieldLabel(template, 'vaccinationCard', t('signup.vaccinationCard'))}
            file={files.vaccinationCard}
            onChange={(f) => setFiles((prev) => ({ ...prev, vaccinationCard: f }))}
            required={isTemplateFieldRequired(template, 'vaccinationCard', true)}
          />
        ) : null}
        {isTemplateFieldActive(template, 'fatherIdPhoto') ? (
          <FileDropzoneWithPreview
            label={templateFieldLabel(template, 'fatherIdPhoto', t('signup.fatherIdPhoto'))}
            file={files.fatherIdPhoto}
            onChange={(f) => setFiles((prev) => ({ ...prev, fatherIdPhoto: f }))}
            required={isTemplateFieldRequired(template, 'fatherIdPhoto') && !hasParentId}
          />
        ) : null}
        {isTemplateFieldActive(template, 'motherIdPhoto') ? (
          <FileDropzoneWithPreview
            label={templateFieldLabel(template, 'motherIdPhoto', t('signup.motherIdPhoto'))}
            file={files.motherIdPhoto}
            onChange={(f) => setFiles((prev) => ({ ...prev, motherIdPhoto: f }))}
            required={isTemplateFieldRequired(template, 'motherIdPhoto') && !hasParentId}
          />
        ) : null}
        {isTemplateFieldActive(template, 'proofOfAddress') ? (
          <FileDropzoneWithPreview
            label={templateFieldLabel(template, 'proofOfAddress', t('signup.proofOfAddress'))}
            file={files.proofOfAddress}
            onChange={(f) => setFiles((prev) => ({ ...prev, proofOfAddress: f }))}
            required={isTemplateFieldRequired(template, 'proofOfAddress', true)}
          />
        ) : null}
        {isTemplateFieldActive(template, 'medicalReport') ? (
          <FileDropzoneWithPreview
            label={templateFieldLabel(template, 'medicalReport', t('signup.medicalReport'))}
            file={files.medicalReport}
            onChange={(f) => setFiles((prev) => ({ ...prev, medicalReport: f }))}
            required={isTemplateFieldRequired(template, 'medicalReport')}
          />
        ) : null}
        {isTemplateFieldActive(template, 'otherDocument') ? (
          <FileDropzoneWithPreview
            label={templateFieldLabel(template, 'otherDocument', t('signup.otherDocument'))}
            file={files.otherDocument}
            onChange={(f) => setFiles((prev) => ({ ...prev, otherDocument: f }))}
            required={isTemplateFieldRequired(template, 'otherDocument')}
          />
        ) : null}
      </div>
    </div>
  );
}

function StepEmergency({ form, t, activeRegistrationTemplate }: StepProps) {
  // The first two contacts are required; the rest are added and removed by the parent.
  const template = activeRegistrationTemplate;
  const { fields, append, remove } = useFieldArray({ control: form.control, name: 'emergencyContacts' });
  const errors = form.formState.errors.emergencyContacts;
  const contactsActive = isTemplateFieldActive(template, 'emergencyContacts');
  const contactsRequired = isTemplateFieldRequired(template, 'emergencyContacts', true);

  if (!contactsActive) {
    return (
      <div className="space-y-4">
        <h3 className="text-lg font-semibold text-on-surface">{t('signup.steps.emergency')}</h3>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <h3 className="text-lg font-semibold text-on-surface">{t('signup.steps.emergency')}</h3>
      <p className="text-xs text-on-surface-variant">{t('signup.emergencyHint')}</p>
      <TemplateHelp text={templateFieldHelp(template, 'emergencyContacts')} />

      {fields.map((field, index) => (
        <div key={field.id} className="space-y-4 rounded-2xl border border-outline-variant p-4">
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm font-medium text-on-surface">
              {templateFieldLabel(template, 'emergencyContacts', t('signup.emergencyContact'))} {index + 1}
              {contactsRequired && index < 2 ? <span className="text-error ms-0.5">*</span> : null}
            </p>
            {index > 1 ? (
              <Button type="button" variant="outline" size="sm" onClick={() => remove(index)}>
                <MaterialSymbol name="delete" size="text-base" />
                {t('signup.removeContact')}
              </Button>
            ) : null}
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label={t('signup.contactName')} error={errors?.[index]?.name?.message} required={contactsRequired && index < 2}>
              <Input {...form.register(`emergencyContacts.${index}.name`)} />
            </Field>
            <Field label={t('signup.contactPhone')} error={errors?.[index]?.phone?.message} required={contactsRequired && index < 2}>
              <Input {...phoneInputProps} {...form.register(`emergencyContacts.${index}.phone`)} />
            </Field>
            <Field
              label={t('signup.contactRelationship')}
              error={errors?.[index]?.relationship?.message}
              required={contactsRequired && index < 2}
            >
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

function StepDailyCare({ form, t, activeRegistrationTemplate }: StepProps) {
  const template = activeRegistrationTemplate;
  const sendsVitamins = form.watch('sendsVitamins');
  const napAccepted = form.watch('napTimePreference');
  const maxNapTime = form.watch('maxNapTime');
  const maxNapTimeInvalid =
    requiredTextFilled(maxNapTime) &&
    !NAP_DURATION_VALUES.includes(maxNapTime as (typeof NAP_DURATION_VALUES)[number]);
  const yesNo = (name: 'takesBreakfastAtHome' | 'eatsNurseryMeals' | 'extraMealPreference'
    | 'sendsExtraSnacks' | 'waterPreference' | 'sendsVitamins') => {
    if (!isTemplateFieldActive(template, name)) return null;
    return (
      <Field
        label={templateFieldLabel(template, name, {
          takesBreakfastAtHome: t('signup.takesBreakfastAtHome'),
          eatsNurseryMeals: t('signup.eatsNurseryMeals'),
          extraMealPreference: t('signup.acceptExtraMeals'),
          sendsExtraSnacks: t('signup.acceptExtraSnacks'),
          waterPreference: t('signup.acceptMineralWater'),
          sendsVitamins: t('signup.sendsVitamins'),
        }[name])}
        required={isTemplateFieldRequired(template, name)}
      >
        <TemplateHelp text={templateFieldHelp(template, name)} />
        <Select {...form.register(name)}>
          <option value="">{t('common.select')}</option>
          <option value="Yes">{t('common.yes')}</option>
          <option value="No">{t('common.no')}</option>
        </Select>
      </Field>
    );
  };

  return (
    <div className="space-y-6">
      <h3 className="text-lg font-semibold text-on-surface">{t('signup.steps.dailyCare')}</h3>

      <div>
        <h4 className="mb-3 text-sm font-semibold uppercase tracking-wide text-on-surface-variant">{t('signup.mealsSection')}</h4>
        <div className="grid gap-4 sm:grid-cols-2">
          {isTemplateFieldActive(template, 'arrivalTime') ? (
            <Field label={templateFieldLabel(template, 'arrivalTime', t('signup.arrivalTime'))} required={isTemplateFieldRequired(template, 'arrivalTime')}>
              <TemplateHelp text={templateFieldHelp(template, 'arrivalTime')} />
              <Input type="time" {...form.register('arrivalTime')} />
            </Field>
          ) : null}
          {yesNo('takesBreakfastAtHome')}
          {yesNo('eatsNurseryMeals')}
          {yesNo('extraMealPreference')}
          {yesNo('sendsExtraSnacks')}
          {yesNo('waterPreference')}
          {yesNo('sendsVitamins')}
          {sendsVitamins === 'Yes' && isTemplateFieldActive(template, 'vitaminDetails') && (
            <Field label={templateFieldLabel(template, 'vitaminDetails', t('signup.vitaminDetails'))} required={isTemplateFieldRequired(template, 'vitaminDetails')}>
              <TemplateHelp text={templateFieldHelp(template, 'vitaminDetails')} />
              <Input {...form.register('vitaminDetails')} placeholder={t('signup.vitaminDetailsHint')} />
            </Field>
          )}
        </div>
      </div>

      <div>
        <h4 className="mb-3 text-sm font-semibold uppercase tracking-wide text-on-surface-variant">{t('signup.diaperSection')}</h4>
        <div className="grid gap-4 sm:grid-cols-2">
          {isTemplateFieldActive(template, 'diaperSupplyMethod') ? (
            <Field label={templateFieldLabel(template, 'diaperSupplyMethod', t('signup.diaperSupplyMethod'))} required={isTemplateFieldRequired(template, 'diaperSupplyMethod')}>
              <TemplateHelp text={templateFieldHelp(template, 'diaperSupplyMethod')} />
              <Select {...form.register('diaperSupplyMethod')}>
                <option value="">{t('common.select')}</option>
                {templateFieldOptions(template, 'diaperSupplyMethod', ['Stock', 'On daily basis']).map((option) => (
                  <option key={option} value={option}>{option === 'Stock' ? t('signup.stock') : option === 'On daily basis' ? t('signup.daily') : option}</option>
                ))}
              </Select>
            </Field>
          ) : null}
          {isTemplateFieldActive(template, 'dailyDiaperCount') ? (
            <Field label={templateFieldLabel(template, 'dailyDiaperCount', t('signup.dailyDiaperCount'))} required={isTemplateFieldRequired(template, 'dailyDiaperCount')}>
              <TemplateHelp text={templateFieldHelp(template, 'dailyDiaperCount')} />
              <Input type="number" {...form.register('dailyDiaperCount')} />
            </Field>
          ) : null}
          {isTemplateFieldActive(template, 'rashCreamUsage') ? (
            <Field label={templateFieldLabel(template, 'rashCreamUsage', t('signup.rashCreamUsage'))} required={isTemplateFieldRequired(template, 'rashCreamUsage')}>
              <TemplateHelp text={templateFieldHelp(template, 'rashCreamUsage')} />
              <Input {...form.register('rashCreamUsage')} />
            </Field>
          ) : null}
          {isTemplateFieldActive(template, 'diaperChangeFrequency') ? (
            <Field label={templateFieldLabel(template, 'diaperChangeFrequency', t('signup.diaperChangeFrequency'))} required={isTemplateFieldRequired(template, 'diaperChangeFrequency')}>
              <TemplateHelp text={templateFieldHelp(template, 'diaperChangeFrequency')} />
              <Input {...form.register('diaperChangeFrequency')} />
            </Field>
          ) : null}
          {isTemplateFieldActive(template, 'toiletTrainingStatus') ? (
            <Field label={templateFieldLabel(template, 'toiletTrainingStatus', t('signup.toiletTrainingStatus'))} required={isTemplateFieldRequired(template, 'toiletTrainingStatus')}>
              <TemplateHelp text={templateFieldHelp(template, 'toiletTrainingStatus')} />
              <Select {...form.register('toiletTrainingStatus')}>
                <option value="">{t('common.select')}</option>
                {templateFieldOptions(template, 'toiletTrainingStatus', ['not_started', 'in_progress', 'completed']).map((option) => (
                  <option key={option} value={option}>
                    {option === 'not_started'
                      ? t('signup.notStarted')
                      : option === 'in_progress'
                        ? t('signup.inProgress')
                        : option === 'completed'
                          ? t('signup.completed')
                          : option}
                  </option>
                ))}
              </Select>
            </Field>
          ) : null}
        </div>
      </div>

      <div>
        <h4 className="mb-3 text-sm font-semibold uppercase tracking-wide text-on-surface-variant">{t('signup.napSection')}</h4>
        <div className="grid gap-4 sm:grid-cols-2">
          {isTemplateFieldActive(template, 'napTimePreference') ? (
            <Field
              label={templateFieldLabel(template, 'napTimePreference', t('signup.napTimePreference'))}
              required={isTemplateFieldRequired(template, 'napTimePreference', true)}
            >
              <TemplateHelp text={templateFieldHelp(template, 'napTimePreference')} />
              <Select
                value={napAccepted}
                onChange={(event) => {
                  const value = event.currentTarget.value;
                  form.setValue('napTimePreference', value, { shouldValidate: true });
                  if (value !== 'Yes') form.setValue('maxNapTime', '', { shouldValidate: true });
                }}
              >
                <option value="">{t('common.select')}</option>
                <option value="Yes">{t('common.yes')}</option>
                <option value="No">{t('common.no')}</option>
              </Select>
            </Field>
          ) : null}
          {napAccepted === 'Yes' && isTemplateFieldActive(template, 'maxNapTime') ? (
            <Field
              label={templateFieldLabel(template, 'maxNapTime', t('signup.maxNapTime'))}
              error={maxNapTimeInvalid ? 'signup.maxNapTimeRange' : undefined}
              required={isTemplateFieldRequired(template, 'maxNapTime', true)}
            >
              <TemplateHelp text={templateFieldHelp(template, 'maxNapTime')} />
              <Select {...form.register('maxNapTime')}>
                <option value="">{t('common.select')}</option>
                {templateFieldOptions(template, 'maxNapTime', [...NAP_DURATION_VALUES]).map((value) => (
                  <option key={value} value={value}>
                    {value === '1'
                      ? t('signup.napDurationOneHour')
                      : NAP_DURATION_VALUES.includes(value as (typeof NAP_DURATION_VALUES)[number])
                        ? t('signup.napDurationHours', { hours: value })
                        : value}
                  </option>
                ))}
              </Select>
            </Field>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function StepPickups({ form, t, files, setFiles, activeRegistrationTemplate }: StepProps) {
  const template = activeRegistrationTemplate;
  const e = form.formState.errors;
  const authorizationOptions = (fieldKey: 'pickupPerson1Authorization' | 'pickupPerson2Authorization') =>
    templateFieldOptions(template, fieldKey, ['anytime', 'scheduled', 'emergency_only']);
  const authorizationLabel = (value: string) => {
    if (value === 'anytime') return t('signup.anytime');
    if (value === 'scheduled') return t('signup.scheduled');
    if (value === 'emergency_only') return t('signup.emergencyOnly');
    return value;
  };
  const pickup1Visible = [
    'pickupPerson1Name',
    'pickupPerson1Phone',
    'pickupPerson1Relation',
    'pickupPerson1Authorization',
    'pickupPerson1Photo',
  ].some((fieldKey) => isTemplateFieldActive(template, fieldKey));
  const pickup2Visible = [
    'pickupPerson2Name',
    'pickupPerson2Phone',
    'pickupPerson2Relation',
    'pickupPerson2Authorization',
    'pickupPerson2Photo',
  ].some((fieldKey) => isTemplateFieldActive(template, fieldKey));
  return (
    <div className="space-y-6">
      <h3 className="text-lg font-semibold text-on-surface">{t('signup.steps.pickups')}</h3>
      {pickup1Visible ? (
        <div className="space-y-4 rounded-2xl border border-outline-variant p-4">
          <p className="text-sm font-medium text-on-surface">{t('signup.pickupPerson')} 1</p>
          <div className="grid gap-4 sm:grid-cols-2">
            {isTemplateFieldActive(template, 'pickupPerson1Name') ? (
              <Field label={templateFieldLabel(template, 'pickupPerson1Name', t('signup.pickupName'))} error={e.pickupPerson1Name?.message} required={isTemplateFieldRequired(template, 'pickupPerson1Name', true)}>
                <TemplateHelp text={templateFieldHelp(template, 'pickupPerson1Name')} />
                <Input {...form.register('pickupPerson1Name')} />
              </Field>
            ) : null}
            {isTemplateFieldActive(template, 'pickupPerson1Phone') ? (
              <Field label={templateFieldLabel(template, 'pickupPerson1Phone', t('signup.pickupPhone'))} error={e.pickupPerson1Phone?.message} required={isTemplateFieldRequired(template, 'pickupPerson1Phone', true)}>
                <TemplateHelp text={templateFieldHelp(template, 'pickupPerson1Phone')} />
                <Input {...phoneInputProps} {...form.register('pickupPerson1Phone')} />
              </Field>
            ) : null}
            {isTemplateFieldActive(template, 'pickupPerson1Relation') ? (
              <Field label={templateFieldLabel(template, 'pickupPerson1Relation', t('signup.pickupRelation'))} required={isTemplateFieldRequired(template, 'pickupPerson1Relation')}>
                <TemplateHelp text={templateFieldHelp(template, 'pickupPerson1Relation')} />
                <Input {...form.register('pickupPerson1Relation')} />
              </Field>
            ) : null}
            {isTemplateFieldActive(template, 'pickupPerson1Authorization') ? (
              <Field label={templateFieldLabel(template, 'pickupPerson1Authorization', t('signup.pickupAuthorization'))} required={isTemplateFieldRequired(template, 'pickupPerson1Authorization')}>
                <TemplateHelp text={templateFieldHelp(template, 'pickupPerson1Authorization')} />
                <Select {...form.register('pickupPerson1Authorization')}>
                  {authorizationOptions('pickupPerson1Authorization').map((option) => (
                    <option key={option} value={option}>{authorizationLabel(option)}</option>
                  ))}
                </Select>
              </Field>
            ) : null}
            {isTemplateFieldActive(template, 'pickupPerson1Photo') ? (
              <FileDropzoneWithPreview
                label={templateFieldLabel(template, 'pickupPerson1Photo', t('signup.pickupPhoto'))}
                file={files.pickupPerson1Photo}
                onChange={(f) => setFiles((prev) => ({ ...prev, pickupPerson1Photo: f }))}
                required={isTemplateFieldRequired(template, 'pickupPerson1Photo', true)}
              />
            ) : null}
          </div>
        </div>
      ) : null}
      {pickup2Visible ? (
        <div className="space-y-4 rounded-2xl border border-outline-variant p-4">
          <p className="text-sm font-medium text-on-surface">{t('signup.pickupPerson')} 2</p>
          <div className="grid gap-4 sm:grid-cols-2">
            {isTemplateFieldActive(template, 'pickupPerson2Name') ? (
              <Field label={templateFieldLabel(template, 'pickupPerson2Name', t('signup.pickupName'))} error={e.pickupPerson2Name?.message} required={isTemplateFieldRequired(template, 'pickupPerson2Name', true)}>
                <TemplateHelp text={templateFieldHelp(template, 'pickupPerson2Name')} />
                <Input {...form.register('pickupPerson2Name')} />
              </Field>
            ) : null}
            {isTemplateFieldActive(template, 'pickupPerson2Phone') ? (
              <Field label={templateFieldLabel(template, 'pickupPerson2Phone', t('signup.pickupPhone'))} error={e.pickupPerson2Phone?.message} required={isTemplateFieldRequired(template, 'pickupPerson2Phone', true)}>
                <TemplateHelp text={templateFieldHelp(template, 'pickupPerson2Phone')} />
                <Input {...phoneInputProps} {...form.register('pickupPerson2Phone')} />
              </Field>
            ) : null}
            {isTemplateFieldActive(template, 'pickupPerson2Relation') ? (
              <Field label={templateFieldLabel(template, 'pickupPerson2Relation', t('signup.pickupRelation'))} required={isTemplateFieldRequired(template, 'pickupPerson2Relation')}>
                <TemplateHelp text={templateFieldHelp(template, 'pickupPerson2Relation')} />
                <Input {...form.register('pickupPerson2Relation')} />
              </Field>
            ) : null}
            {isTemplateFieldActive(template, 'pickupPerson2Authorization') ? (
              <Field label={templateFieldLabel(template, 'pickupPerson2Authorization', t('signup.pickupAuthorization'))} required={isTemplateFieldRequired(template, 'pickupPerson2Authorization')}>
                <TemplateHelp text={templateFieldHelp(template, 'pickupPerson2Authorization')} />
                <Select {...form.register('pickupPerson2Authorization')}>
                  {authorizationOptions('pickupPerson2Authorization').map((option) => (
                    <option key={option} value={option}>{authorizationLabel(option)}</option>
                  ))}
                </Select>
              </Field>
            ) : null}
            {isTemplateFieldActive(template, 'pickupPerson2Photo') ? (
              <FileDropzoneWithPreview
                label={templateFieldLabel(template, 'pickupPerson2Photo', t('signup.pickupPhoto'))}
                file={files.pickupPerson2Photo}
                onChange={(f) => setFiles((prev) => ({ ...prev, pickupPerson2Photo: f }))}
                required={isTemplateFieldRequired(template, 'pickupPerson2Photo', true)}
              />
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function StepConsents({ form, t, activeRegistrationTemplate }: StepProps) {
  const template = activeRegistrationTemplate;
  const e = form.formState.errors;
  const consentQuestions = [
    { id: 'agreeHealthPolicy' as const, label: t('signup.agreeHealthPolicy') },
    { id: 'agreeFinancialAgreement' as const, label: t('signup.agreeFinancialAgreement') },
    { id: 'agreePolicies' as const, label: t('signup.agreePolicies') },
    { id: 'agreeInfoAccuracy' as const, label: t('signup.agreeInfoAccuracy') },
  ].filter((item) => isTemplateFieldActive(template, item.id));

  return (
    <div className="space-y-4">
      <h3 className="text-lg font-semibold text-on-surface">{t('signup.steps.consents')}</h3>
      <p className="text-sm text-on-surface-variant">{t('signup.consentsIntro')}</p>
      {e.agreeHealthPolicy?.message && (
        <p className="text-sm text-error">{t('signup.allConsentsRequired')}</p>
      )}
      {consentQuestions.map((item) => {
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
              {templateFieldLabel(template, item.id, item.label)}
              {isTemplateFieldRequired(template, item.id, true) ? <span className="text-error ms-0.5">*</span> : null}
            </Label>
          </label>
        );
      })}
    </div>
  );
}

function hasTemplateAnswer(value: unknown) {
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === 'string') return value.trim().length > 0;
  return value !== null && value !== undefined && value !== false;
}

function templateValidationPasses(question: RegistrationTemplateQuestion, value: unknown) {
  if (question.required && !hasTemplateAnswer(value)) return false;
  if (!hasTemplateAnswer(value)) return true;

  const validation = question.validation ?? {};
  const textValue = Array.isArray(value) ? value.join(', ') : typeof value === 'string' ? value : String(value ?? '');
  const numericValue = typeof value === 'number' ? value : Number(textValue);

  if (typeof validation.minLength === 'number' && textValue.trim().length < validation.minLength) return false;
  if (typeof validation.maxLength === 'number' && textValue.trim().length > validation.maxLength) return false;
  if (typeof validation.min === 'number' && Number.isFinite(numericValue) && numericValue < validation.min) return false;
  if (typeof validation.max === 'number' && Number.isFinite(numericValue) && numericValue > validation.max) return false;
  if (validation.pattern) {
    try {
      if (!new RegExp(validation.pattern).test(textValue)) return false;
    } catch {
      return true;
    }
  }

  return true;
}

function TemplateQuestionInput({
  question,
  value,
  onChange,
}: {
  question: RegistrationTemplateQuestion;
  value: unknown;
  onChange: (value: unknown) => void;
}) {
  const options = question.options ?? [];
  const stringValue = typeof value === 'string' ? value : '';
  const type: RegistrationQuestionType = question.type;

  if (type === 'long_text') {
    return <Textarea value={stringValue} onChange={(event) => onChange(event.target.value)} />;
  }
  if (type === 'number') {
    return <Input type="number" value={stringValue} onChange={(event) => onChange(event.target.value)} />;
  }
  if (type === 'date') {
    return <Input type="date" value={stringValue} onChange={(event) => onChange(event.target.value)} />;
  }
  if (type === 'yes_no') {
    return (
      <Select value={stringValue} onChange={(event) => onChange(event.target.value)}>
        <option value="">Select</option>
        <option value="Yes">Yes</option>
        <option value="No">No</option>
      </Select>
    );
  }
  if (type === 'single_choice') {
    return (
      <Select value={stringValue} onChange={(event) => onChange(event.target.value)}>
        <option value="">Select</option>
        {options.map((option) => (
          <option key={option} value={option}>{option}</option>
        ))}
      </Select>
    );
  }
  if (type === 'multi_choice') {
    const selected = Array.isArray(value) ? value.map(String) : [];
    return (
      <div className="grid gap-2 sm:grid-cols-2">
        {options.map((option) => (
          <label key={option} className="flex items-center gap-2 rounded-lg border border-outline-variant p-2 text-sm">
            <Checkbox
              checked={selected.includes(option)}
              onCheckedChange={(checked) =>
                onChange(checked === true ? [...selected, option] : selected.filter((item) => item !== option))
              }
            />
            {option}
          </label>
        ))}
      </div>
    );
  }
  if (type === 'file') {
    const fileLabel = value && typeof value === 'object' && 'name' in value
      ? String((value as { name?: unknown }).name ?? '')
      : '';
    return (
      <div className="space-y-2">
        <Input
          type="file"
          onChange={(event) => {
            const file = event.target.files?.[0] ?? null;
            onChange(file ? { name: file.name, type: file.type, size: file.size } : null);
          }}
        />
        {fileLabel ? <p className="text-xs text-on-surface-variant">{fileLabel}</p> : null}
      </div>
    );
  }

  return <Input value={stringValue} onChange={(event) => onChange(event.target.value)} />;
}

function TemplateQuestionsBlock({
  questions,
  answers,
  setAnswers,
}: {
  questions: RegistrationTemplateQuestion[];
  answers: Record<string, unknown>;
  setAnswers: React.Dispatch<React.SetStateAction<Record<string, unknown>>>;
}) {
  if (!questions.length) return null;
  return (
    <section className="space-y-4 rounded-2xl border border-outline-variant bg-surface-container-lowest p-4">
      <h3 className="text-base font-semibold text-on-surface">Additional questions</h3>
      {questions.map((question) => (
        <Field key={question.id} label={question.label} required={question.required}>
          {question.helpText ? <p className="mb-2 text-xs text-on-surface-variant">{question.helpText}</p> : null}
          <TemplateQuestionInput
            question={question}
            value={answers[question.id]}
            onChange={(value) => setAnswers((current) => ({ ...current, [question.id]: value }))}
          />
        </Field>
      ))}
    </section>
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
  activeRegistrationTemplate: RegistrationTemplatePayload | null;
};

export function ParentSignUpPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [stepIndex, setStepIndex] = useState(0);
  const [furthestReached, setFurthestReached] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [files, setFiles] = useState<ParentSignUpFileBundle>(emptyParentSignUpFiles);
  const [templateAnswers, setTemplateAnswers] = useState<Record<string, unknown>>({});

  const initialDraft = useMemo(() => loadDraft(), []);
  const initialValues = useMemo(
    () => normalizeEmergencyContacts({ ...parentSignUpDefaults, ...(initialDraft.values as Partial<ParentSignUpFormValues>) }),
    [initialDraft],
  );

  const form = useForm<ParentSignUpFormValues>({
    resolver: zodResolver(parentSignUpBaseSchema),
    defaultValues: initialValues,
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
  const activeRegistrationTemplate = useMemo(
    () => normalizeRegistrationTemplate(selectedNursery?.active_registration_template),
    [selectedNursery?.active_registration_template],
  );

  // Step order follows whatever order the admin's template has (derived from the same
  // questions_json the editor reorders), falling back to the canonical order when there's
  // no template. Steps with nothing active in them drop out entirely; 'review' stays last.
  const visibleSteps = useMemo(() => {
    const ordered = [...deriveStepOrder(activeRegistrationTemplate?.questions ?? []), 'review'] as SignUpStep[];
    return ordered.filter((step) => step === 'review' || stepHasActiveContent(step, activeRegistrationTemplate));
  }, [activeRegistrationTemplate]);
  // The template resolves asynchronously (after nurseries load), so a step count that
  // was valid a moment ago can shrink — keep the current/furthest indices in range.
  useEffect(() => {
    const maxIndex = Math.max(visibleSteps.length - 1, 0);
    setStepIndex((i) => Math.min(i, maxIndex));
    setFurthestReached((f) => Math.min(f, maxIndex));
  }, [visibleSteps.length]);

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

  const safeStepIndex = Math.min(stepIndex, Math.max(visibleSteps.length - 1, 0));
  const currentStep = visibleSteps[safeStepIndex];
  const isFirst = safeStepIndex === 0;
  const isLast = safeStepIndex === visibleSteps.length - 1;
  const customQuestionsForStep = useMemo(
    () =>
      activeRegistrationTemplate?.questions.filter((question) =>
        question.active && !question.fieldKey && question.step === currentStep,
      ) ?? [],
    [activeRegistrationTemplate?.questions, currentStep],
  );
  const templateRequiredQuestionsComplete = useMemo(() => {
    const questions = activeRegistrationTemplate?.questions ?? [];
    return REGISTRATION_TEMPLATE_STEPS.every((step) =>
      questions
        .filter((question) => question.active && !question.fieldKey && question.step === step)
        .every((question) => templateValidationPasses(question, templateAnswers[question.id])),
    );
  }, [activeRegistrationTemplate?.questions, templateAnswers]);
  const currentTemplateStepComplete = customQuestionsForStep
    .every((question) => templateValidationPasses(question, templateAnswers[question.id]));
  const canContinue = isStepComplete(currentStep, liveValues, files, activeRegistrationTemplate) && currentTemplateStepComplete;
  const canSubmit =
    SIGNUP_STEPS.every((step) => isStepComplete(step, liveValues, files, activeRegistrationTemplate)) &&
    templateRequiredQuestionsComplete;
  const firstMissingStep = useMemo(
    () => firstIncompleteStep(liveValues, files, activeRegistrationTemplate),
    [activeRegistrationTemplate, files, liveValues],
  );

  const errorSteps = useMemo(() => {
    const set = new Set<SignUpStep>();
    const errs = form.formState.errors;
    for (const step of SIGNUP_STEPS) {
      const fields = STEP_FIELDS[step];
      if (fields.some((f) => errs[f as keyof typeof errs])) set.add(step);
    }
    if (currentStep === 'review') {
      for (const step of SIGNUP_STEPS) {
        if (step !== 'review' && !isStepComplete(step, liveValues, files, activeRegistrationTemplate)) set.add(step);
      }
    }
    return set;
  }, [activeRegistrationTemplate, currentStep, files, form.formState.errors, liveValues]);

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
    const nextIdx = safeStepIndex + 1;
    setStepIndex(nextIdx);
    setFurthestReached((f) => Math.max(f, nextIdx));
  };

  const goBack = () => {
    if (!isFirst) setStepIndex(safeStepIndex - 1);
  };

  const jumpTo = (idx: number) => {
    if (idx <= furthestReached) setStepIndex(idx);
  };

  /** Jump to a step by name, skipping over ones currently hidden by the template. */
  const goToStepByName = (step: SignUpStep) => {
    const idx = visibleSteps.indexOf(step);
    if (idx >= 0) setStepIndex(idx);
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
    const crossFieldError = validateCrossFieldRules(values, { checkConsents: false });
    if (crossFieldError) {
      toast.error(t(`signup.${crossFieldError}`));
      return;
    }
    if (!hasAcceptedAllConsents(values, activeRegistrationTemplate)) {
      toast.error(t('signup.allConsentsRequired'));
      goToStepByName('consents');
      return;
    }
    if (!templateStepQuestionsComplete('pickups', values, files, activeRegistrationTemplate)) {
      toast.error(t('signup.pickupPhotoRequired'));
      goToStepByName('pickups');
      return;
    }
    if (!hasCompleteDocuments(files, activeRegistrationTemplate)) {
      toast.error(t('signup.documentsRequired'));
      goToStepByName('documents');
      return;
    }
    autosave.flush();
    setSubmitting(true);
    try {
      await submitParentSignUp(values, files, activeRegistrationTemplate, templateAnswers);
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
    if (target) goToStepByName(target);
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
      activeRegistrationTemplate,
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
        return isTemplateFieldActive(activeRegistrationTemplate, 'medicationConsents') ? (
          <StepMedicationConsents form={form} />
        ) : (
          <div className="space-y-4">
            <h3 className="text-lg font-semibold text-on-surface">{t('signup.steps.medicationConsents')}</h3>
          </div>
        );
      case 'documents':
        return <StepDocuments {...stepProps} />;
      case 'consents':
        return <StepConsents {...stepProps} />;
      case 'review':
        return (
          <StepReview
            values={liveValues}
            files={files}
            onJumpTo={(step) => jumpTo(visibleSteps.indexOf(step))}
          />
        );
      default:
        return null;
    }
  };

  return (
    <SignupShell
      steps={visibleSteps}
      currentIndex={safeStepIndex}
      furthestReached={Math.min(furthestReached, Math.max(visibleSteps.length - 1, 0))}
      errorSteps={errorSteps}
      onJumpTo={jumpTo}
      onSaveAndExit={saveAndExit}
      onResetDraft={resetDraft}
      autosaveState={autosave.state}
      autosavedAgoSeconds={autosave.agoSeconds}
    >
      <form onSubmit={onSubmit} noValidate className="space-y-8">
        {renderCurrentStep()}
        <TemplateQuestionsBlock
          questions={customQuestionsForStep}
          answers={templateAnswers}
          setAnswers={setTemplateAnswers}
        />

        <div className="flex items-center justify-between border-t border-outline-variant pt-6">
          <Button type="button" variant="outline" onClick={goBack} disabled={isFirst}>
            <MaterialSymbol name="arrow_back" size="text-base" />
            {t('signup.back')}
          </Button>

          {isLast ? (
            <div className="flex flex-col items-end gap-2">
              {!canSubmit ? (
                <p className="max-w-xs text-end text-xs text-warning">
                  {firstMissingStep === 'pickups'
                    ? t('signup.pickupPhotoRequired')
                    : firstMissingStep === 'documents'
                      ? t('signup.documentsRequired')
                      : t('signup.completeRequiredBeforeSubmit')}
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
