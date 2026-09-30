import { allergyLabel } from '@/lib/allergies';
import { compressImageForUpload } from '@/lib/imageCompression';

import type { ParentSignUpFileBundle } from './parentSignUpFiles';
import type { ParentSignUpFormValues } from './parentSignUpValidation';
import {
  buildRegistrationAnswers,
  type RegistrationTemplatePayload,
} from './registrationTemplates';

const MAX_TOTAL_FILE_PAYLOAD_BYTES = 4.5 * 1024 * 1024;

// children.school_preference is CHECK-constrained to these values. The field used to be a
// free-text input, so a restored draft can still hold arbitrary text — drop it rather than
// letting the insert fail.
const SCHOOL_PREFERENCES = ['british', 'american', 'national', 'ib', 'french', 'canadian', 'other'] as const;

function schoolPreferenceOrNull(value: string): string | null {
  return (SCHOOL_PREFERENCES as readonly string[]).includes(value) ? value : null;
}

// children.gender and family.marital_status are also CHECK-constrained. The registration
// template editor lets admins relabel/reorder these choices, so a value that doesn't match
// the DB's allowed set (a stale draft, or a custom option that isn't a real enum value) is
// dropped instead of failing the insert.
const CHILD_GENDERS = ['male', 'female'] as const;
const MARITAL_STATUSES = ['married', 'divorced', 'separated', 'widowed', 'single'] as const;

function childGenderOrNull(value: string): string | null {
  return (CHILD_GENDERS as readonly string[]).includes(value) ? value : null;
}

function maritalStatusOrNull(value: string): string | null {
  return (MARITAL_STATUSES as readonly string[]).includes(value) ? value : null;
}

function isTemplateFieldActive(template: RegistrationTemplatePayload | null | undefined, fieldKey: string, fallback = true) {
  const question = template?.questions.find((item) => item.fieldKey === fieldKey);
  return question ? question.active : fallback;
}

function filesForTemplate(files: ParentSignUpFileBundle, template: RegistrationTemplatePayload | null | undefined): ParentSignUpFileBundle {
  return {
    childPhoto: isTemplateFieldActive(template, 'childPhoto') ? files.childPhoto : null,
    fatherIdPhoto: isTemplateFieldActive(template, 'fatherIdPhoto') ? files.fatherIdPhoto : null,
    motherIdPhoto: isTemplateFieldActive(template, 'motherIdPhoto') ? files.motherIdPhoto : null,
    birthCertificate: isTemplateFieldActive(template, 'birthCertificate') ? files.birthCertificate : null,
    vaccinationCard: isTemplateFieldActive(template, 'vaccinationCard') ? files.vaccinationCard : null,
    proofOfAddress: isTemplateFieldActive(template, 'proofOfAddress') ? files.proofOfAddress : null,
    medicalReport: isTemplateFieldActive(template, 'medicalReport') ? files.medicalReport : null,
    otherDocument: isTemplateFieldActive(template, 'otherDocument') ? files.otherDocument : null,
    pickupPerson1Photo: isTemplateFieldActive(template, 'pickupPerson1Photo') ? files.pickupPerson1Photo : null,
    pickupPerson2Photo: isTemplateFieldActive(template, 'pickupPerson2Photo') ? files.pickupPerson2Photo : null,
  };
}

type SignupFilePayload = {
  name: string;
  type: string;
  base64: string;
};

async function fileToPayload(file: File | null): Promise<SignupFilePayload | null> {
  if (!file) return null;
  const uploadFile = await compressImageForUpload(file);
  const buffer = await uploadFile.arrayBuffer();
  let binary = '';
  const bytes = new Uint8Array(buffer);
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return {
    name: uploadFile.name,
    type: uploadFile.type || 'application/octet-stream',
    base64: btoa(binary),
  };
}

function estimatePayloadSize(files: Array<SignupFilePayload | null>): number {
  return files.reduce((total, file) => total + (file?.base64.length ?? 0), 0);
}

async function filesToPayload(files: ParentSignUpFileBundle) {
  const payload = {
    childPhoto: await fileToPayload(files.childPhoto),
    fatherIdPhoto: await fileToPayload(files.fatherIdPhoto),
    motherIdPhoto: await fileToPayload(files.motherIdPhoto),
    birthCertificate: await fileToPayload(files.birthCertificate),
    vaccinationCard: await fileToPayload(files.vaccinationCard),
    proofOfAddress: await fileToPayload(files.proofOfAddress),
    medicalReport: await fileToPayload(files.medicalReport),
    otherDocument: await fileToPayload(files.otherDocument),
    pickupPerson1Photo: await fileToPayload(files.pickupPerson1Photo),
    pickupPerson2Photo: await fileToPayload(files.pickupPerson2Photo),
  };

  const totalSize = estimatePayloadSize(Object.values(payload));
  if (totalSize > MAX_TOTAL_FILE_PAYLOAD_BYTES) {
    throw new Error('signupFilesTooLarge');
  }

  return payload;
}

async function readFunctionError(response?: Response): Promise<string | null> {
  if (!response) return null;

  try {
    const contentType = response.headers.get('Content-Type') ?? '';
    if (contentType.includes('application/json')) {
      const body = (await response.clone().json()) as { error?: string; error_message?: string };
      return body.error_message ?? body.error ?? null;
    }

    const text = await response.clone().text();
    return text.trim() || null;
  } catch {
    return null;
  }
}

async function invokeParentSignupComplete(body: unknown) {
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
  const authKey = import.meta.env.VITE_SUPABASE_LEGACY_ANON_KEY || import.meta.env.VITE_SUPABASE_ANON_KEY;
  const response = await fetch(`${supabaseUrl}/functions/v1/parent-signup-complete`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: authKey,
      Authorization: `Bearer ${authKey}`,
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const functionMessage = await readFunctionError(response);
    throw new Error(functionMessage || `parent-signup-complete failed with status ${response.status}`);
  }

  return (await response.json()) as { error?: string };
}

export async function submitParentSignUp(
  v: ParentSignUpFormValues,
  files: ParentSignUpFileBundle,
  registrationTemplate?: RegistrationTemplatePayload | null,
  customRegistrationAnswers: Record<string, unknown> = {},
): Promise<{ success: boolean }> {
  // The family gets one account (username + password). A parent block is sent when
  // their name is filled — the emails on it are contact details, not credentials.
  const hasFather = v.fatherFullName.trim().length > 0;
  const hasMother = v.motherFullName.trim().length > 0;
  const visibleFiles = filesForTemplate(files, registrationTemplate);

  const filePayload = await filesToPayload(visibleFiles);

  // Staff screens read food_allergies as one line, so flatten the picked list.
  const allergySummary = v.hasAllergy
    ? v.allergyTypes
        .map((a) => (a === 'other' ? v.allergyDetails.trim() : allergyLabel(a, false)))
        .filter(Boolean)
        .join(', ')
    : '';

  const childFullName = [v.childFirstName, v.childMiddleName, v.childLastName].filter(Boolean).join(' ');

  const emergencyContacts = (v.emergencyContacts ?? [])
    .filter((contact) => contact.name.trim() || contact.phone.trim())
    .map((contact) => ({
      name: contact.name.trim(),
      relationship: contact.relationship.trim(),
      phone: contact.phone.trim(),
    }));

  // Yes/No answers are stored as booleans; the removed free-text fields
  // (snack type, nursery meal preference, time between meals, unfinished-snack
  // action, diaper change schedule) are no longer collected at all.
  const yesNo = (value: string) => (value === 'Yes' ? true : value === 'No' ? false : null);
  const pickup1Active = [
    'pickupPerson1Name',
    'pickupPerson1Phone',
    'pickupPerson1Relation',
    'pickupPerson1Authorization',
    'pickupPerson1Photo',
  ].some((fieldKey) => isTemplateFieldActive(registrationTemplate, fieldKey));
  const pickup2Active = [
    'pickupPerson2Name',
    'pickupPerson2Phone',
    'pickupPerson2Relation',
    'pickupPerson2Authorization',
    'pickupPerson2Photo',
  ].some((fieldKey) => isTemplateFieldActive(registrationTemplate, fieldKey));
  const pickups = [
    pickup1Active && (v.pickupPerson1Name.trim() || v.pickupPerson1Phone.trim() || visibleFiles.pickupPerson1Photo)
      ? {
          slot: 1,
          name: v.pickupPerson1Name.trim(),
          phone: v.pickupPerson1Phone.trim(),
          relation: v.pickupPerson1Relation.trim() || null,
          authorization: v.pickupPerson1Authorization,
          photo_path: null,
        }
      : null,
    pickup2Active && (v.pickupPerson2Name.trim() || v.pickupPerson2Phone.trim() || visibleFiles.pickupPerson2Photo)
      ? {
          slot: 2,
          name: v.pickupPerson2Name.trim(),
          phone: v.pickupPerson2Phone.trim(),
          relation: v.pickupPerson2Relation.trim() || null,
          authorization: v.pickupPerson2Authorization,
          photo_path: null,
        }
      : null,
  ].filter((pickup): pickup is NonNullable<typeof pickup> => Boolean(pickup));

  const dailyCarePreferences = {
    arrival_time: v.arrivalTime || null,
    takes_breakfast_at_home: yesNo(v.takesBreakfastAtHome),
    eats_nursery_meals: yesNo(v.eatsNurseryMeals),
    accepts_extra_meals: yesNo(v.extraMealPreference),
    accepts_extra_snacks: yesNo(v.sendsExtraSnacks),
    accepts_mineral_water: yesNo(v.waterPreference),
    sends_vitamins: yesNo(v.sendsVitamins),
    vitamin_details: v.sendsVitamins === 'Yes' ? v.vitaminDetails.trim() || null : null,
    food_allergies: allergySummary || null,
    allergy_types: v.hasAllergy ? v.allergyTypes : [],
    allergy_other_details: v.hasAllergy && v.allergyTypes.includes('other')
      ? v.allergyDetails.trim() || null
      : null,
    has_medical_condition: v.hasMedicalCondition,
    medical_condition_details: v.hasMedicalCondition ? v.medicalConditionDetails.trim() || null : null,
    child_behavior_health_notes: v.childBehaviorHealthNotes.trim() || null,
    diaper_supply_method: v.diaperSupplyMethod === 'Stock' ? ('stock' as const) : v.diaperSupplyMethod === 'On daily basis' ? ('daily' as const) : null,
    daily_diaper_count: v.dailyDiaperCount ? parseInt(v.dailyDiaperCount, 10) || null : null,
    rash_cream_usage: v.rashCreamUsage || null,
    diaper_change_frequency: v.diaperChangeFrequency || null,
    toilet_training_status: v.toiletTrainingStatus || null,
    nap_time_preference: v.napTimePreference || null,
    max_nap_time: v.napTimePreference === 'Yes' ? v.maxNapTime || null : null,
    emergency_medications: v.medicationConsents && v.medicationConsents.length > 0 ? v.medicationConsents : null,
  };

  const payload = await invokeParentSignupComplete({
      nursery_id: v.nurseryId || null,
      // One family login; the function mints <username>@parents.xo.local for auth.
      credentials: { username: v.username.trim(), password: v.password.trim() },
      files: filePayload,
      child: {
        full_name_ar: childFullName,
        full_name_en: childFullName,
        first_name: v.childFirstName.trim(),
        middle_name: v.childMiddleName.trim() || null,
        last_name: v.childLastName.trim(),
        nickname: v.childNickname.trim() || null,
        dob: v.childDob,
        gender: childGenderOrNull(v.childGender),
        nationality: v.childNationality.trim() || null,
        department: v.department || null,
        school_preference: schoolPreferenceOrNull(v.schoolPreference),
        school_admissions_plan: v.schoolAdmissionsPlan || null,
        academic_year: v.academicYear || null,
        has_siblings: v.hasSiblings,
        sibling_ages: v.siblingAges || null,
        avatar_url: null,
        birth_certificate_path: null,
        vaccination_card_path: null,
        daily_care_preferences: dailyCarePreferences,
        emergency_contacts: emergencyContacts,
        home_address: v.address || null,
      },
      family: {
        marital_status: maritalStatusOrNull(v.maritalStatus),
        address: v.address || null,
        referral_source: v.referralSource || null,
      },
      father: hasFather
        ? {
            full_name: v.fatherFullName.trim(),
            job: v.fatherJob.trim() || null,
            mobile: v.fatherMobile.trim(),
            email: v.fatherEmail.trim() || null,
            id_photo_path: null,
          }
        : null,
      mother: hasMother
        ? {
            full_name: v.motherFullName.trim(),
            job: v.motherJob.trim() || null,
            mobile: v.motherMobile.trim(),
            email: v.motherEmail.trim() || null,
            id_photo_path: null,
          }
        : null,
      pickups,
      consents: {
        health_policy: v.agreeHealthPolicy,
        financial_agreement: v.agreeFinancialAgreement,
        policies: v.agreePolicies,
        info_accuracy: v.agreeInfoAccuracy,
      },
      registration_template: registrationTemplate
        ? {
            id: registrationTemplate.id,
            name: registrationTemplate.name,
            version: registrationTemplate.version,
            questions: registrationTemplate.questions,
          }
        : null,
      registration_answers: {
        ...buildRegistrationAnswers(registrationTemplate ?? null, v, visibleFiles),
        ...customRegistrationAnswers,
      },
  });

  if (payload?.error) {
    throw new Error(payload.error);
  }

  return { success: true };
}
