import type { ParentSignUpFileBundle } from './parentSignUpFiles';
import type { ParentSignUpFormValues } from './parentSignUpValidation';
import type { SignUpStep } from './parentSignUpTypes';

export const REGISTRATION_TEMPLATE_STEPS = [
  'child',
  'parents',
  'family',
  'enrollment',
  'health',
  'emergency',
  'dailyCare',
  'pickups',
  'medicationConsents',
  'documents',
  'consents',
] as const satisfies readonly Exclude<SignUpStep, 'review'>[];

export type RegistrationTemplateStep = (typeof REGISTRATION_TEMPLATE_STEPS)[number];

export const REGISTRATION_QUESTION_TYPES = [
  'short_text',
  'long_text',
  'number',
  'date',
  'yes_no',
  'single_choice',
  'multi_choice',
  'file',
] as const;

export type RegistrationQuestionType = (typeof REGISTRATION_QUESTION_TYPES)[number];

export type RegistrationQuestionValidation = {
  minLength?: number | null;
  maxLength?: number | null;
  min?: number | null;
  max?: number | null;
  pattern?: string | null;
};

export type RegistrationTemplateQuestion = {
  id: string;
  step: RegistrationTemplateStep;
  fieldKey?: keyof ParentSignUpFormValues | keyof ParentSignUpFileBundle | string;
  label: string;
  helpText?: string;
  type: RegistrationQuestionType;
  required: boolean;
  active: boolean;
  validation?: RegistrationQuestionValidation;
  options?: string[];
};

/** Per-step display customization an admin can set on a template: a custom tab name/icon
 * in the admin editor, and an explicit "hidden" flag the live signup form honors as a
 * cleaner alternative to deactivating every question in a step. The custom name/icon are
 * cosmetic to the admin editor only — parents still see the step's translated name. */
export type RegistrationTemplateStepMeta = {
  label?: string;
  icon?: string;
  hidden?: boolean;
};

export type RegistrationTemplateStepsMeta = Partial<Record<RegistrationTemplateStep, RegistrationTemplateStepMeta>>;

export type RegistrationTemplatePayload = {
  id: string;
  name: string;
  version: number;
  questions: RegistrationTemplateQuestion[];
  stepsMeta?: RegistrationTemplateStepsMeta;
};

export type RegistrationTemplateAnswerMap = Record<string, unknown>;

export const SYSTEM_REQUIRED_REGISTRATION_FIELD_KEYS = [
  'nurseryId',
  'childFirstName',
  'childDob',
  'username',
  'password',
] as const;

export const SYSTEM_ALWAYS_ACTIVE_REGISTRATION_FIELD_KEYS = [
  ...SYSTEM_REQUIRED_REGISTRATION_FIELD_KEYS,
  'fatherFullName',
  'fatherMobile',
  'motherFullName',
  'motherMobile',
] as const;

/** Fields whose live widget and choices are wired directly to system data (e.g. the real
 * nursery list), not to this question's `type`/`options`/`validation` — the signup page
 * renders these with their own dedicated component instead of the generic question renderer.
 * Editing those properties for one of these fields in the template editor has no effect on
 * what parents see, so the editor should lock/hide them rather than imply they do something. */
export const SYSTEM_LIST_DRIVEN_REGISTRATION_FIELD_KEYS = ['nurseryId'] as const;

const q = (
  id: string,
  step: RegistrationTemplateStep,
  fieldKey: RegistrationTemplateQuestion['fieldKey'],
  label: string,
  type: RegistrationQuestionType = 'short_text',
  required = true,
  options?: string[],
): RegistrationTemplateQuestion => ({
  id,
  step,
  fieldKey,
  label,
  type,
  required,
  active: true,
  options,
});

export const DEFAULT_PARENT_REGISTRATION_QUESTIONS: RegistrationTemplateQuestion[] = [
  q('nursery_id', 'child', 'nurseryId', 'Select Nursery'),
  q('child_first_name', 'child', 'childFirstName', "Child's name"),
  q('child_middle_name', 'child', 'childMiddleName', 'Middle name'),
  q('child_last_name', 'child', 'childLastName', 'Last name'),
  q('child_nickname', 'child', 'childNickname', 'Nickname'),
  q('child_dob', 'child', 'childDob', 'Date of birth', 'date'),
  q('child_nationality', 'child', 'childNationality', 'Nationality'),
  q('child_gender', 'child', 'childGender', 'Gender', 'single_choice', false, ['male', 'female']),
  q('child_photo', 'child', 'childPhoto', 'Child photo', 'file', false),

  q('username', 'parents', 'username', 'Parent username'),
  q('password', 'parents', 'password', 'Password'),
  q('father_full_name', 'parents', 'fatherFullName', 'Father full name', 'short_text', false),
  q('father_job', 'parents', 'fatherJob', 'Father job', 'short_text', false),
  q('father_mobile', 'parents', 'fatherMobile', 'Father mobile', 'short_text', false),
  q('father_email', 'parents', 'fatherEmail', 'Father email', 'short_text', false),
  q('mother_full_name', 'parents', 'motherFullName', 'Mother full name', 'short_text', false),
  q('mother_job', 'parents', 'motherJob', 'Mother job', 'short_text', false),
  q('mother_mobile', 'parents', 'motherMobile', 'Mother mobile', 'short_text', false),
  q('mother_email', 'parents', 'motherEmail', 'Mother email', 'short_text', false),

  q('marital_status', 'family', 'maritalStatus', 'Marital status', 'single_choice', false, ['married', 'divorced', 'widowed', 'single']),
  q('address', 'family', 'address', 'Address', 'long_text', false),
  q('has_siblings', 'family', 'hasSiblings', 'Has siblings', 'yes_no', false),
  q('sibling_ages', 'family', 'siblingAges', 'Sibling ages', 'short_text', false),

  q('department', 'enrollment', 'department', 'Department', 'single_choice', false),
  q('school_preference', 'enrollment', 'schoolPreference', 'Future school preference', 'single_choice', false),
  q('school_admissions_plan', 'enrollment', 'schoolAdmissionsPlan', 'School admissions plan', 'short_text', false),
  q('academic_year', 'enrollment', 'academicYear', 'Academic year', 'single_choice', false),
  q('referral_source', 'enrollment', 'referralSource', 'Referral source', 'single_choice', false),

  q('has_allergy', 'health', 'hasAllergy', 'Has allergy', 'yes_no', false),
  q('allergy_types', 'health', 'allergyTypes', 'Allergy types', 'multi_choice', false),
  q('allergy_details', 'health', 'allergyDetails', 'Allergy details', 'long_text', false),
  q('has_medical_condition', 'health', 'hasMedicalCondition', 'Has medical condition', 'yes_no', false),
  q('medical_condition_details', 'health', 'medicalConditionDetails', 'Medical condition details', 'long_text', false),
  q('behavior_notes', 'health', 'childBehaviorHealthNotes', 'Behavior and health notes', 'long_text', false),

  q('emergency_contacts', 'emergency', 'emergencyContacts', 'Emergency contacts', 'long_text'),
  q('arrival_time', 'dailyCare', 'arrivalTime', 'Arrival time', 'short_text', false),
  q('breakfast_at_home', 'dailyCare', 'takesBreakfastAtHome', 'Takes breakfast at home', 'yes_no', false),
  q('nursery_meals', 'dailyCare', 'eatsNurseryMeals', 'Eats nursery meals', 'yes_no', false),
  q('extra_meals', 'dailyCare', 'extraMealPreference', 'Accept extra meals', 'yes_no', false),
  q('extra_snacks', 'dailyCare', 'sendsExtraSnacks', 'Accept extra snacks', 'yes_no', false),
  q('mineral_water', 'dailyCare', 'waterPreference', 'Accept mineral water', 'yes_no', false),
  q('sends_vitamins', 'dailyCare', 'sendsVitamins', 'Sends vitamins', 'yes_no', false),
  q('vitamin_details', 'dailyCare', 'vitaminDetails', 'Vitamin details', 'long_text', false),
  q('diaper_supply', 'dailyCare', 'diaperSupplyMethod', 'Diaper supply method', 'single_choice', false, ['Stock', 'On daily basis']),
  q('daily_diaper_count', 'dailyCare', 'dailyDiaperCount', 'Daily diaper count', 'number', false),
  q('rash_cream', 'dailyCare', 'rashCreamUsage', 'Rash cream usage', 'short_text', false),
  q('diaper_change_frequency', 'dailyCare', 'diaperChangeFrequency', 'Diaper change frequency', 'short_text', false),
  q('toilet_training', 'dailyCare', 'toiletTrainingStatus', 'Toilet training status', 'single_choice', false, ['not_started', 'in_progress', 'completed']),
  q('nap_time_preference', 'dailyCare', 'napTimePreference', 'Nap time preference', 'yes_no'),
  q('max_nap_time', 'dailyCare', 'maxNapTime', 'Maximum nap time', 'single_choice', false),

  q('pickup_1_name', 'pickups', 'pickupPerson1Name', 'Pickup 1 name'),
  q('pickup_1_phone', 'pickups', 'pickupPerson1Phone', 'Pickup 1 phone'),
  q('pickup_1_relation', 'pickups', 'pickupPerson1Relation', 'Pickup 1 relation', 'short_text', false),
  q('pickup_1_authorization', 'pickups', 'pickupPerson1Authorization', 'Pickup 1 authorization', 'single_choice', false, ['anytime', 'scheduled', 'emergency_only']),
  q('pickup_1_photo', 'pickups', 'pickupPerson1Photo', 'Pickup 1 photo', 'file'),
  q('pickup_2_name', 'pickups', 'pickupPerson2Name', 'Pickup 2 name'),
  q('pickup_2_phone', 'pickups', 'pickupPerson2Phone', 'Pickup 2 phone'),
  q('pickup_2_relation', 'pickups', 'pickupPerson2Relation', 'Pickup 2 relation', 'short_text', false),
  q('pickup_2_authorization', 'pickups', 'pickupPerson2Authorization', 'Pickup 2 authorization', 'single_choice', false, ['anytime', 'scheduled', 'emergency_only']),
  q('pickup_2_photo', 'pickups', 'pickupPerson2Photo', 'Pickup 2 photo', 'file'),
  q('medication_consents', 'medicationConsents', 'medicationConsents', 'Medication consents', 'multi_choice', false),
  q('birth_certificate', 'documents', 'birthCertificate', 'Birth certificate', 'file'),
  q('vaccination_card', 'documents', 'vaccinationCard', 'Vaccination card', 'file'),
  q('father_id', 'documents', 'fatherIdPhoto', 'Father ID photo', 'file'),
  q('mother_id', 'documents', 'motherIdPhoto', 'Mother ID photo', 'file'),
  q('proof_of_address', 'documents', 'proofOfAddress', 'Proof of address', 'file'),
  q('medical_report', 'documents', 'medicalReport', 'Medical report', 'file', false),
  q('other_document', 'documents', 'otherDocument', 'Other document', 'file', false),
  q('health_policy', 'consents', 'agreeHealthPolicy', 'Health policy consent', 'yes_no'),
  q('financial_agreement', 'consents', 'agreeFinancialAgreement', 'Financial agreement consent', 'yes_no'),
  q('policies', 'consents', 'agreePolicies', 'Policies consent', 'yes_no'),
  q('info_accuracy', 'consents', 'agreeInfoAccuracy', 'Information accuracy consent', 'yes_no'),
];

/** Every built-in field key that belongs to a given step, so the signup wizard can tell
 * whether a step still has anything to show once a template turns fields on/off. */
export const KNOWN_FIELD_KEYS_BY_STEP: Record<RegistrationTemplateStep, string[]> = REGISTRATION_TEMPLATE_STEPS.reduce(
  (acc, step) => {
    acc[step] = DEFAULT_PARENT_REGISTRATION_QUESTIONS.filter((question) => question.step === step)
      .map((question) => (question.fieldKey ? String(question.fieldKey) : ''))
      .filter(Boolean);
    return acc;
  },
  {} as Record<RegistrationTemplateStep, string[]>,
);

/**
 * Step and question order isn't a separate field — it's read straight off `questions_json`:
 * a step's position is where its first question first appears in the array, and a step's
 * question order is those questions' relative order within it. Reordering just means
 * moving array entries, and both the admin editor and the live signup form derive the
 * same order from the same array, so they can never drift apart.
 */
export function deriveStepOrder(questions: RegistrationTemplateQuestion[]): RegistrationTemplateStep[] {
  const order: RegistrationTemplateStep[] = [];
  for (const question of questions) {
    if (!order.includes(question.step)) order.push(question.step);
  }
  for (const step of REGISTRATION_TEMPLATE_STEPS) {
    if (!order.includes(step)) order.push(step);
  }
  return order;
}

/** Re-lays out `questions` so each step's questions are grouped together in `stepOrder`,
 * preserving each step's internal question order. Used after moving a step earlier/later. */
export function reorderQuestionsByStepOrder(
  questions: RegistrationTemplateQuestion[],
  stepOrder: RegistrationTemplateStep[],
): RegistrationTemplateQuestion[] {
  const groups = new Map<RegistrationTemplateStep, RegistrationTemplateQuestion[]>();
  for (const question of questions) {
    const list = groups.get(question.step) ?? [];
    list.push(question);
    groups.set(question.step, list);
  }
  return stepOrder.flatMap((step) => groups.get(step) ?? []);
}

/** Swaps one question with its neighbor within its own step (array order = display order). */
export function moveQuestionInStep(
  questions: RegistrationTemplateQuestion[],
  questionId: string,
  direction: 'up' | 'down',
): RegistrationTemplateQuestion[] {
  const idx = questions.findIndex((question) => question.id === questionId);
  if (idx < 0) return questions;
  const step = questions[idx].step;
  const stepIndices = questions.reduce<number[]>((acc, question, i) => (question.step === step ? [...acc, i] : acc), []);
  const posInStep = stepIndices.indexOf(idx);
  const swapWith = direction === 'up' ? posInStep - 1 : posInStep + 1;
  if (swapWith < 0 || swapWith >= stepIndices.length) return questions;
  const otherIdx = stepIndices[swapWith];
  const next = [...questions];
  [next[idx], next[otherIdx]] = [next[otherIdx], next[idx]];
  return next;
}

/** Swaps one step with its neighbor in the derived step order, then re-lays out the
 * question array to match. */
export function moveStepOrder(
  questions: RegistrationTemplateQuestion[],
  step: RegistrationTemplateStep,
  direction: 'up' | 'down',
): RegistrationTemplateQuestion[] {
  const order = deriveStepOrder(questions);
  const idx = order.indexOf(step);
  const swapWith = direction === 'up' ? idx - 1 : idx + 1;
  if (swapWith < 0 || swapWith >= order.length) return questions;
  const nextOrder = [...order];
  [nextOrder[idx], nextOrder[swapWith]] = [nextOrder[swapWith], nextOrder[idx]];
  return reorderQuestionsByStepOrder(questions, nextOrder);
}

export function normalizeRegistrationTemplate(value: unknown): RegistrationTemplatePayload | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const questions = Array.isArray(record.questions)
    ? record.questions.filter((item): item is RegistrationTemplateQuestion => Boolean(item) && typeof item === 'object')
    : [];
  const id = typeof record.id === 'string' ? record.id : '';
  const name = typeof record.name === 'string' ? record.name : 'Parent Registration';
  const version = Number(record.version ?? 1);
  const stepsMeta =
    record.steps && typeof record.steps === 'object' && !Array.isArray(record.steps)
      ? (record.steps as RegistrationTemplateStepsMeta)
      : undefined;
  return id ? { id, name, version: Number.isFinite(version) ? version : 1, questions, stepsMeta } : null;
}

export function buildRegistrationAnswers(
  template: RegistrationTemplatePayload | null,
  values: ParentSignUpFormValues,
  files: ParentSignUpFileBundle,
): RegistrationTemplateAnswerMap {
  if (!template) return {};
  return template.questions.reduce<RegistrationTemplateAnswerMap>((acc, question) => {
    if (!question.active) return acc;
    const fieldKey = question.fieldKey;
    if (!fieldKey) return acc;
    if (fieldKey in files) {
      const file = files[fieldKey as keyof ParentSignUpFileBundle];
      acc[question.id] = file ? { name: file.name, type: file.type, size: file.size } : null;
      return acc;
    }
    acc[question.id] = values[fieldKey as keyof ParentSignUpFormValues] ?? null;
    return acc;
  }, {});
}
