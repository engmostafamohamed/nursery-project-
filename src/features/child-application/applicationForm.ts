import type { ParentAccountProfile } from '@/hooks/useParentAccountProfile';
import { NAP_DURATION_VALUES } from '@/features/parent-signup/parentSignUpValidation';
import { OTHER_ALLERGY_VALUE } from '@/lib/allergies';
import { isChildAgeValid, isValidIsoDate } from '@/lib/onboardingDateBounds';
import { egyptianMobilePattern } from '@/lib/phoneValidation';

/*
 * The child application form, shared by the family's application page and the admin's add-child
 * form: its two halves (the parents and the child), how they are read from and merged back into
 * the stored application (parent_info_json, child_info_json), and what each step requires.
 */

export const requiredDocs = ['birth_certificate', 'vaccination_card', 'parent_id', 'proof_of_address'] as const;
export const applicationDocumentTypes = [...requiredDocs, 'medical_report', 'other'] as const;
export const requiredParentFields = ['full_name', 'email', 'phone', 'address', 'emergency_contact'] as const;
export const requiredChildFields = ['first_name', 'middle_name', 'last_name', 'nickname', 'dob', 'nationality'] as const;
export const DOCUMENTS_STEP = 10;
export const REVIEW_STEP = 11;

export const applicationStepIcons = [
  'account_circle',
  'home',
  'child_care',
  'school',
  'health_and_safety',
  'emergency',
  'restaurant',
  'directions_car',
  'medication',
  'upload_file',
  'task_alt',
  'inventory_2',
  'credit_card',
];

export function latestDocumentsByType(docs: Array<Record<string, unknown>>) {
  const uploadedAt = (doc: Record<string, unknown>) => {
    const time = new Date(String(doc.uploaded_at ?? '')).getTime();
    return Number.isFinite(time) ? time : -Infinity;
  };
  const hasFile = (doc: Record<string, unknown>) => typeof doc.file_url === 'string' && doc.file_url.trim().length > 0;

  return docs.reduce<Record<string, Record<string, unknown>>>((acc, doc) => {
    const type = String(doc.document_type ?? '');
    if (!type) return acc;
    const current = acc[type];
    if (!current) {
      acc[type] = doc;
      return acc;
    }

    const docHasFile = hasFile(doc);
    const currentHasFile = hasFile(current);
    if (docHasFile !== currentHasFile) {
      if (docHasFile) acc[type] = doc;
      return acc;
    }

    if (uploadedAt(doc) > uploadedAt(current)) acc[type] = doc;
    return acc;
  }, {});
}

export function hasDocumentFile(doc: Record<string, unknown> | undefined) {
  return typeof doc?.file_url === 'string' && doc.file_url.trim().length > 0;
}

export type JsonRecord = Record<string, unknown>;
export const EMPTY_RECORD: JsonRecord = {};
export type UserProfileInfo = {
  name_ar?: string | null;
  name_en?: string | null;
  email?: string | null;
  phone?: string | null;
} | null | undefined;

export type ParentApplicationParentForm = {
  full_name: string;
  email: string;
  phone: string;
  national_id: string;
  address: string;
  emergency_contact: string;
  father_full_name: string;
  father_job: string;
  father_mobile: string;
  father_email: string;
  father_national_id: string;
  mother_full_name: string;
  mother_job: string;
  mother_mobile: string;
  mother_email: string;
  mother_national_id: string;
  marital_status: string;
  referral_source: string;
  password_recovery_contact: string;
  pickup_1_name: string;
  pickup_1_phone: string;
  pickup_1_relation: string;
  pickup_1_authorization: string;
  pickup_2_name: string;
  pickup_2_phone: string;
  pickup_2_relation: string;
  pickup_2_authorization: string;
};

export type ParentApplicationChildForm = {
  first_name: string;
  middle_name: string;
  last_name: string;
  full_name: string;
  nickname: string;
  dob: string;
  gender: string;
  nationality: string;
  department: string;
  school_preference: string;
  school_admissions_plan: string;
  academic_year: string;
  has_siblings: boolean;
  sibling_ages: string;
  has_allergy: boolean;
  allergy_types: string[];
  allergy_details: string;
  has_medical_condition: boolean;
  medical_conditions: string;
  allergies: string;
  special_needs: string;
  photo_privacy: boolean;
  emergency_1_name: string;
  emergency_1_phone: string;
  emergency_1_relationship: string;
  emergency_2_name: string;
  emergency_2_phone: string;
  emergency_2_relationship: string;
  arrival_time: string;
  takes_breakfast_at_home: string;
  eats_nursery_meals: string;
  extra_meal_preference: string;
  sends_extra_snacks: string;
  water_preference: string;
  sends_vitamins: string;
  vitamin_details: string;
  diaper_supply_method: string;
  daily_diaper_count: string;
  rash_cream_usage: string;
  diaper_change_frequency: string;
  toilet_training_status: string;
  nap_time_preference: string;
  max_nap_time: string;
  medication_consents: string[];
};

export function isRecord(value: unknown): value is JsonRecord {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

export function recordAt(source: JsonRecord, key: string): JsonRecord {
  const value = source[key];
  return isRecord(value) ? value : {};
}

export function arrayRecordAt(source: JsonRecord, key: string): JsonRecord[] {
  const value = source[key];
  return Array.isArray(value) ? value.filter(isRecord) : [];
}

export function readText(source: JsonRecord, key: string) {
  const value = source[key];
  return typeof value === 'string' ? value : value == null ? '' : String(value);
}

export function readFirstText(source: JsonRecord, keys: string[]) {
  for (const key of keys) {
    const value = readText(source, key).trim();
    if (value) return value;
  }
  return '';
}

export function readBool(source: JsonRecord, key: string) {
  return source[key] === true || source[key] === 'true';
}

export function boolToYesNo(value: unknown) {
  if (value === true) return 'Yes';
  if (value === false) return 'No';
  return typeof value === 'string' ? value : '';
}

export function yesNoToBool(value: string) {
  if (value === 'Yes') return true;
  if (value === 'No') return false;
  return null;
}

export function splitFullName(fullName: string) {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  return {
    firstName: parts[0] ?? '',
    middleName: parts.length > 2 ? parts.slice(1, -1).join(' ') : '',
    lastName: parts.length > 1 ? parts[parts.length - 1] : '',
  };
}

export function primaryParentKey(parentInfo: JsonRecord): 'mother' | 'father' | null {
  if (isRecord(parentInfo.mother)) return 'mother';
  if (isRecord(parentInfo.father)) return 'father';
  return null;
}

export function primaryParentInfo(parentInfo: JsonRecord) {
  const key = primaryParentKey(parentInfo);
  return key ? recordAt(parentInfo, key) : {};
}

export function emergencyContactSummary(contact: JsonRecord) {
  return [
    readFirstText(contact, ['name', 'full_name']),
    readFirstText(contact, ['phone', 'mobile']),
    readFirstText(contact, ['relationship', 'relation']),
  ].filter(Boolean).join(' - ');
}

export function parentFormFromApplication(
  parentInfo: JsonRecord,
  childInfo: JsonRecord,
  profile: UserProfileInfo,
  account?: ParentAccountProfile | null,
  fallbackChildInfo: JsonRecord = {},
): ParentApplicationParentForm {
  const father = recordAt(parentInfo, 'father');
  const mother = recordAt(parentInfo, 'mother');
  const family = recordAt(parentInfo, 'family');
  const primary = primaryParentInfo(parentInfo);
  const pickups = arrayRecordAt(parentInfo, 'pickups');
  const childEmergencyContacts = arrayRecordAt(childInfo, 'emergency_contacts');
  const fallbackEmergencyContacts = arrayRecordAt(fallbackChildInfo, 'emergency_contacts');
  const copiedEmergencyContact = emergencyContactSummary(childEmergencyContacts[0] ?? {});
  const fallbackCopiedEmergencyContact = emergencyContactSummary(fallbackEmergencyContacts[0] ?? {});
  const accountFather = account?.father;
  const accountMother = account?.mother;
  const accountFamily = account?.family;

  return {
    full_name: readFirstText(parentInfo, ['full_name', 'parent_name', 'name', 'name_ar', 'name_en']) || readFirstText(primary, ['full_name', 'name']) || accountFather?.fullName || profile?.name_ar || profile?.name_en || '',
    email: readFirstText(parentInfo, ['email', 'parent_email']) || readFirstText(primary, ['email']) || accountFather?.email || profile?.email || '',
    phone: readFirstText(parentInfo, ['phone', 'mobile', 'mobile_phone', 'parent_phone']) || readFirstText(primary, ['mobile', 'phone', 'mobile_phone']) || accountFather?.mobile || profile?.phone || '',
    national_id: readFirstText(parentInfo, ['national_id']) || readFirstText(father, ['national_id']) || readFirstText(mother, ['national_id']) || accountFather?.nationalId || accountMother?.nationalId || '',
    address: readFirstText(parentInfo, ['address', 'home_address']) || readFirstText(family, ['address', 'home_address']) || accountFamily?.address || '',
    emergency_contact: readFirstText(parentInfo, ['emergency_contact']) || readFirstText(family, ['emergency_contact']) || accountFamily?.emergencyContact || copiedEmergencyContact || fallbackCopiedEmergencyContact,
    father_full_name: readFirstText(father, ['full_name', 'name']) || readFirstText(parentInfo, ['father_full_name', 'fatherFullName']) || accountFather?.fullName || '',
    father_job: readFirstText(father, ['job', 'occupation']) || readFirstText(parentInfo, ['father_job', 'fatherJob']) || accountFather?.job || '',
    father_mobile: readFirstText(father, ['mobile', 'phone', 'mobile_phone']) || readFirstText(parentInfo, ['father_mobile', 'fatherMobile', 'father_phone']) || accountFather?.mobile || '',
    father_email: readFirstText(father, ['email']) || readFirstText(parentInfo, ['father_email', 'fatherEmail']) || accountFather?.email || '',
    father_national_id: readFirstText(father, ['national_id']) || readFirstText(parentInfo, ['father_national_id', 'fatherNationalId']) || accountFather?.nationalId || '',
    mother_full_name: readFirstText(mother, ['full_name', 'name']) || readFirstText(parentInfo, ['mother_full_name', 'motherFullName']) || accountMother?.fullName || '',
    mother_job: readFirstText(mother, ['job', 'occupation']) || readFirstText(parentInfo, ['mother_job', 'motherJob']) || accountMother?.job || '',
    mother_mobile: readFirstText(mother, ['mobile', 'phone', 'mobile_phone']) || readFirstText(parentInfo, ['mother_mobile', 'motherMobile', 'mother_phone']) || accountMother?.mobile || '',
    mother_email: readFirstText(mother, ['email']) || readFirstText(parentInfo, ['mother_email', 'motherEmail']) || accountMother?.email || '',
    mother_national_id: readFirstText(mother, ['national_id']) || readFirstText(parentInfo, ['mother_national_id', 'motherNationalId']) || accountMother?.nationalId || '',
    marital_status: readFirstText(family, ['marital_status']) || readFirstText(parentInfo, ['marital_status']) || accountFamily?.maritalStatus || '',
    referral_source: readFirstText(family, ['referral_source']) || readFirstText(parentInfo, ['referral_source']),
    password_recovery_contact: readFirstText(family, ['password_recovery_contact']) || readFirstText(parentInfo, ['password_recovery_contact']),
    pickup_1_name: readText(pickups[0] ?? {}, 'name'),
    pickup_1_phone: readText(pickups[0] ?? {}, 'phone'),
    pickup_1_relation: readText(pickups[0] ?? {}, 'relation'),
    pickup_1_authorization: readText(pickups[0] ?? {}, 'authorization') || 'anytime',
    pickup_2_name: readText(pickups[1] ?? {}, 'name'),
    pickup_2_phone: readText(pickups[1] ?? {}, 'phone'),
    pickup_2_relation: readText(pickups[1] ?? {}, 'relation'),
    pickup_2_authorization: readText(pickups[1] ?? {}, 'authorization') || 'anytime',
  };
}

export function childFormFromApplication(childInfo: JsonRecord, fallbackChildInfo: JsonRecord = {}): ParentApplicationChildForm {
  const dailyCare = recordAt(childInfo, 'daily_care_preferences');
  const emergency = arrayRecordAt(childInfo, 'emergency_contacts');
  const fallbackEmergency = arrayRecordAt(fallbackChildInfo, 'emergency_contacts');
  const emergencySource = emergency.length > 0 ? emergency : fallbackEmergency;
  const fullName = readText(childInfo, 'full_name') || readText(childInfo, 'full_name_en') || readText(childInfo, 'full_name_ar');
  const splitName = splitFullName(fullName);
  const allergyTypes = dailyCare.allergy_types;
  const medicationConsents = dailyCare.emergency_medications;

  return {
    first_name: readText(childInfo, 'first_name') || splitName.firstName,
    middle_name: readText(childInfo, 'middle_name') || splitName.middleName,
    last_name: readText(childInfo, 'last_name') || splitName.lastName,
    full_name: fullName,
    nickname: readText(childInfo, 'nickname'),
    dob: readText(childInfo, 'dob'),
    gender: readText(childInfo, 'gender'),
    nationality: readText(childInfo, 'nationality'),
    department: readText(childInfo, 'department'),
    school_preference: readText(childInfo, 'school_preference'),
    school_admissions_plan: readText(childInfo, 'school_admissions_plan'),
    academic_year: readText(childInfo, 'academic_year'),
    has_siblings: readBool(childInfo, 'has_siblings'),
    sibling_ages: readText(childInfo, 'sibling_ages'),
    has_allergy: readBool(dailyCare, 'has_allergy') || (Array.isArray(allergyTypes) && allergyTypes.length > 0) || Boolean(readText(dailyCare, 'food_allergies') || readText(childInfo, 'allergies')),
    allergy_types: Array.isArray(allergyTypes) ? allergyTypes.filter((value): value is string => typeof value === 'string') : [],
    allergy_details: readText(dailyCare, 'allergy_other_details'),
    has_medical_condition: readBool(dailyCare, 'has_medical_condition') || Boolean(readText(dailyCare, 'medical_condition_details') || readText(childInfo, 'medical_conditions')),
    medical_conditions: readText(childInfo, 'medical_conditions') || readText(dailyCare, 'medical_condition_details'),
    allergies: readText(childInfo, 'allergies') || readText(dailyCare, 'food_allergies'),
    special_needs: readText(childInfo, 'special_needs') || readText(dailyCare, 'child_behavior_health_notes'),
    photo_privacy: readBool(childInfo, 'photo_privacy'),
    emergency_1_name: readText(emergencySource[0] ?? {}, 'name'),
    emergency_1_phone: readText(emergencySource[0] ?? {}, 'phone'),
    emergency_1_relationship: readText(emergencySource[0] ?? {}, 'relationship'),
    emergency_2_name: readText(emergencySource[1] ?? {}, 'name'),
    emergency_2_phone: readText(emergencySource[1] ?? {}, 'phone'),
    emergency_2_relationship: readText(emergencySource[1] ?? {}, 'relationship'),
    arrival_time: readText(dailyCare, 'arrival_time'),
    takes_breakfast_at_home: boolToYesNo(dailyCare.takes_breakfast_at_home),
    eats_nursery_meals: boolToYesNo(dailyCare.eats_nursery_meals),
    extra_meal_preference: boolToYesNo(dailyCare.accepts_extra_meals),
    sends_extra_snacks: boolToYesNo(dailyCare.accepts_extra_snacks),
    water_preference: boolToYesNo(dailyCare.accepts_mineral_water),
    sends_vitamins: boolToYesNo(dailyCare.sends_vitamins),
    vitamin_details: readText(dailyCare, 'vitamin_details'),
    diaper_supply_method: readText(dailyCare, 'diaper_supply_method'),
    daily_diaper_count: readText(dailyCare, 'daily_diaper_count'),
    rash_cream_usage: readText(dailyCare, 'rash_cream_usage'),
    diaper_change_frequency: readText(dailyCare, 'diaper_change_frequency'),
    toilet_training_status: readText(dailyCare, 'toilet_training_status'),
    nap_time_preference: readText(dailyCare, 'nap_time_preference'),
    max_nap_time: readText(dailyCare, 'max_nap_time'),
    medication_consents: Array.isArray(medicationConsents)
      ? medicationConsents.filter((value): value is string => typeof value === 'string')
      : [],
  };
}

export function contactFromFields(name: string, phone: string, relationship: string) {
  if (!name.trim() && !phone.trim() && !relationship.trim()) return null;
  return { name: name.trim(), phone: phone.trim(), relationship: relationship.trim() };
}

export function pickupFromFields(name: string, phone: string, relation: string, authorization: string) {
  if (!name.trim() && !phone.trim() && !relation.trim()) return null;
  return { name: name.trim(), phone: phone.trim(), relation: relation.trim() || null, authorization: authorization || 'anytime' };
}

export function parentRequiredValue(form: ParentApplicationParentForm, field: (typeof requiredParentFields)[number]) {
  if (field === 'full_name') return form.full_name || form.father_full_name || form.mother_full_name;
  if (field === 'email') return form.email || form.father_email || form.mother_email;
  if (field === 'phone') return form.phone || form.father_mobile || form.mother_mobile;
  return form[field];
}

export const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const phonePattern = egyptianMobilePattern;
export const nationalIdPattern = /^\d{14}$/;
export const digitsOnly = (value: string) => value.replace(/\D/g, '');
export const phoneInputProps = {
  type: 'tel',
  inputMode: 'numeric' as const,
  pattern: '[0-9]*',
  maxLength: 11,
};
export const nationalIdInputProps = {
  type: 'text',
  inputMode: 'numeric' as const,
  pattern: '[0-9]*',
  maxLength: 14,
};

export function hasText(value: string) {
  return value.trim().length > 0;
}

export function isOptionalEmailValid(value: string) {
  return !hasText(value) || emailPattern.test(value.trim());
}

export function isPhoneValid(value: string) {
  return phonePattern.test(value.trim());
}

export function isOptionalNationalIdValid(value: string) {
  return !hasText(value) || nationalIdPattern.test(value.trim());
}

/** Field name → i18n key of the message shown under that field. */
export type FieldErrors = Record<string, string>;

/**
 * Per-field validation for one application step. A step is complete exactly when this
 * returns no errors, so the inline messages and the Next/submit gates can't disagree.
 */
export function applicationStepFieldErrors(step: number, parentForm: ParentApplicationParentForm, childForm: ParentApplicationChildForm): FieldErrors {
  const errors: FieldErrors = {};
  const requireText = (field: string, value: string) => {
    if (!hasText(value)) errors[field] = 'signup.requiredField';
  };
  const requirePhone = (field: string, value: string) => {
    if (!hasText(value)) errors[field] = 'signup.requiredField';
    else if (!isPhoneValid(value)) errors[field] = 'signup.invalidPhone';
  };

  if (step === 1) {
    const parents = (['father', 'mother'] as const).map((prefix) => ({
      prefix,
      started: hasText(parentForm[`${prefix}_full_name`]) || hasText(parentForm[`${prefix}_mobile`]) ||
        hasText(parentForm[`${prefix}_email`]) || hasText(parentForm[`${prefix}_national_id`]),
    }));
    const noneStarted = parents.every((parent) => !parent.started);
    // One complete parent is enough; with neither started, point at the father's fields.
    const checked = noneStarted ? [parents[0]] : parents.filter((parent) => parent.started);
    for (const { prefix } of checked) {
      if (noneStarted) {
        errors[`${prefix}_full_name`] = 'signup.oneParentRequired';
        errors[`${prefix}_mobile`] = 'signup.oneParentRequired';
      } else {
        requireText(`${prefix}_full_name`, parentForm[`${prefix}_full_name`]);
        requirePhone(`${prefix}_mobile`, parentForm[`${prefix}_mobile`]);
      }
      if (!isOptionalEmailValid(parentForm[`${prefix}_email`])) errors[`${prefix}_email`] = 'signup.invalidEmail';
      if (!isOptionalNationalIdValid(parentForm[`${prefix}_national_id`])) errors[`${prefix}_national_id`] = 'signup.invalidNationalId';
    }
    // Email is required at submission (see requiredParentFields), so require it here too.
    if (!hasText(parentRequiredValue(parentForm, 'email'))) {
      for (const { prefix } of checked) errors[`${prefix}_email`] = 'signup.requiredField';
    }
  }
  if (step === 2) {
    requireText('address', parentForm.address);
    requireText('emergency_contact', parentForm.emergency_contact);
    if (childForm.has_siblings) requireText('sibling_ages', childForm.sibling_ages);
  }
  if (step === 3) {
    requireText('first_name', childForm.first_name);
    requireText('middle_name', childForm.middle_name);
    requireText('last_name', childForm.last_name);
    requireText('nickname', childForm.nickname);
    requireText('nationality', childForm.nationality);
    if (!hasText(childForm.dob)) errors.dob = 'signup.requiredField';
    else if (!isValidIsoDate(childForm.dob)) errors.dob = 'signup.invalidDate';
    else if (!isChildAgeValid(childForm.dob)) errors.dob = 'signup.childAgeRange';
  }
  if (step === 5) {
    if (childForm.has_allergy) {
      if (childForm.allergy_types.length === 0) errors.allergy_types = 'signup.allergyTypeRequired';
      if (childForm.allergy_types.includes(OTHER_ALLERGY_VALUE)) requireText('allergy_details', childForm.allergy_details);
    }
    if (childForm.has_medical_condition) requireText('medical_conditions', childForm.medical_conditions);
  }
  if (step === 6) {
    for (const n of [1, 2] as const) {
      requireText(`emergency_${n}_name`, childForm[`emergency_${n}_name`]);
      requirePhone(`emergency_${n}_phone`, childForm[`emergency_${n}_phone`]);
      requireText(`emergency_${n}_relationship`, childForm[`emergency_${n}_relationship`]);
    }
  }
  if (step === 7) {
    if (childForm.nap_time_preference !== 'Yes' && childForm.nap_time_preference !== 'No') {
      errors.nap_time_preference = 'signup.requiredField';
    } else if (
      childForm.nap_time_preference === 'Yes' &&
      !NAP_DURATION_VALUES.includes(childForm.max_nap_time as (typeof NAP_DURATION_VALUES)[number])
    ) {
      errors.max_nap_time = 'signup.requiredField';
    }
  }
  if (step === 8) {
    for (const n of [1, 2] as const) {
      requireText(`pickup_${n}_name`, parentForm[`pickup_${n}_name`]);
      requirePhone(`pickup_${n}_phone`, parentForm[`pickup_${n}_phone`]);
    }
  }
  return errors;
}

export function hasCompleteApplicationStep(step: number, parentForm: ParentApplicationParentForm, childForm: ParentApplicationChildForm) {
  return Object.keys(applicationStepFieldErrors(step, parentForm, childForm)).length === 0;
}

export function mergeParentInfo(parentInfo: JsonRecord, form: ParentApplicationParentForm): JsonRecord {
  const primaryFullName = form.full_name.trim() || form.father_full_name.trim() || form.mother_full_name.trim();
  const primaryEmail = form.email.trim() || form.father_email.trim() || form.mother_email.trim();
  const primaryPhone = form.phone.trim() || form.father_mobile.trim() || form.mother_mobile.trim();
  const primaryNationalId = form.national_id.trim() || form.father_national_id.trim() || form.mother_national_id.trim();
  const next: JsonRecord = {
    ...parentInfo,
    full_name: primaryFullName,
    email: primaryEmail,
    phone: primaryPhone,
    national_id: primaryNationalId || null,
    address: form.address.trim(),
    emergency_contact: form.emergency_contact.trim(),
  };

  const father = { ...recordAt(parentInfo, 'father') };
  if (form.father_full_name.trim() || form.father_mobile.trim() || form.father_email.trim() || form.father_job.trim() || form.father_national_id.trim()) {
    next.father = {
      ...father,
      full_name: form.father_full_name.trim(),
      job: form.father_job.trim() || null,
      mobile: form.father_mobile.trim(),
      email: form.father_email.trim() || null,
      national_id: form.father_national_id.trim() || null,
    };
  }

  const mother = { ...recordAt(parentInfo, 'mother') };
  if (form.mother_full_name.trim() || form.mother_mobile.trim() || form.mother_email.trim() || form.mother_job.trim() || form.mother_national_id.trim()) {
    next.mother = {
      ...mother,
      full_name: form.mother_full_name.trim(),
      job: form.mother_job.trim() || null,
      mobile: form.mother_mobile.trim(),
      email: form.mother_email.trim() || null,
      national_id: form.mother_national_id.trim() || null,
    };
  }

  // The account's own name, email and mobile fill the main parent's only where they are empty: the
  // father's and mother's own fields (edited in the form) are never written over by the account's.
  const primary = primaryParentKey(next);
  if (primary && isRecord(next[primary])) {
    const record = next[primary] as JsonRecord;
    next[primary] = {
      ...record,
      full_name: readText(record, 'full_name') || primaryFullName,
      email: readText(record, 'email') || primaryEmail || null,
      mobile: readText(record, 'mobile') || primaryPhone,
    };
  }

  next.family = {
    ...recordAt(parentInfo, 'family'),
    address: form.address.trim() || null,
    marital_status: form.marital_status || null,
    emergency_contact: form.emergency_contact.trim() || null,
    password_recovery_contact: form.password_recovery_contact.trim() || null,
    referral_source: form.referral_source || null,
  };

  next.pickups = [
    pickupFromFields(form.pickup_1_name, form.pickup_1_phone, form.pickup_1_relation, form.pickup_1_authorization),
    pickupFromFields(form.pickup_2_name, form.pickup_2_phone, form.pickup_2_relation, form.pickup_2_authorization),
  ].filter(Boolean);

  return next;
}

export function mergeChildInfo(childInfo: JsonRecord, form: ParentApplicationChildForm): JsonRecord {
  const emergencyContacts = [
    contactFromFields(form.emergency_1_name, form.emergency_1_phone, form.emergency_1_relationship),
    contactFromFields(form.emergency_2_name, form.emergency_2_phone, form.emergency_2_relationship),
  ].filter(Boolean);
  const dailyCare = {
    ...recordAt(childInfo, 'daily_care_preferences'),
    arrival_time: form.arrival_time || null,
    takes_breakfast_at_home: yesNoToBool(form.takes_breakfast_at_home),
    eats_nursery_meals: yesNoToBool(form.eats_nursery_meals),
    accepts_extra_meals: yesNoToBool(form.extra_meal_preference),
    accepts_extra_snacks: yesNoToBool(form.sends_extra_snacks),
    accepts_mineral_water: yesNoToBool(form.water_preference),
    sends_vitamins: yesNoToBool(form.sends_vitamins),
    vitamin_details: form.sends_vitamins === 'Yes' ? form.vitamin_details.trim() || null : null,
    food_allergies: form.has_allergy ? form.allergies.trim() || null : null,
    allergy_types: form.has_allergy ? form.allergy_types : [],
    allergy_other_details: form.has_allergy && form.allergy_types.includes(OTHER_ALLERGY_VALUE)
      ? form.allergy_details.trim() || null
      : null,
    has_allergy: form.has_allergy,
    has_medical_condition: form.has_medical_condition,
    medical_condition_details: form.has_medical_condition ? form.medical_conditions.trim() || null : null,
    child_behavior_health_notes: form.special_needs.trim() || null,
    diaper_supply_method: form.diaper_supply_method || null,
    daily_diaper_count: form.daily_diaper_count ? Number(form.daily_diaper_count) || null : null,
    rash_cream_usage: form.rash_cream_usage.trim() || null,
    diaper_change_frequency: form.diaper_change_frequency.trim() || null,
    toilet_training_status: form.toilet_training_status || null,
    nap_time_preference: form.nap_time_preference || null,
    max_nap_time: form.nap_time_preference ? form.max_nap_time || null : null,
    emergency_medications: form.medication_consents.length > 0 ? form.medication_consents : null,
  };

  const fullName = [form.first_name, form.middle_name, form.last_name].map((part) => part.trim()).filter(Boolean).join(' ') || form.full_name.trim();
  return {
    ...childInfo,
    full_name: fullName,
    full_name_ar: fullName,
    full_name_en: fullName,
    first_name: form.first_name.trim(),
    middle_name: form.middle_name.trim() || null,
    last_name: form.last_name.trim(),
    nickname: form.nickname.trim() || null,
    dob: form.dob,
    gender: form.gender || null,
    nationality: form.nationality.trim() || null,
    department: form.department || null,
    school_preference: form.school_preference || null,
    school_admissions_plan: form.school_admissions_plan || null,
    academic_year: form.academic_year || null,
    has_siblings: form.has_siblings,
    sibling_ages: form.has_siblings ? form.sibling_ages.trim() || null : null,
    medical_conditions: form.has_medical_condition ? form.medical_conditions.trim() : '',
    allergies: form.has_allergy ? form.allergies.trim() : '',
    special_needs: form.special_needs.trim(),
    photo_privacy: form.photo_privacy,
    daily_care_preferences: dailyCare,
    emergency_contacts: emergencyContacts,
    home_address: readText(childInfo, 'home_address'),
  };
}
