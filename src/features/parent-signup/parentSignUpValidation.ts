import { z } from 'zod';

import { MEDICATION_CONSENT_IDS } from '@/lib/admissions/medicationConsentOptions';
import { isChildAgeValid, isValidIsoDate } from '@/lib/onboardingDateBounds';

const medicationConsentIdSchema = z.enum(MEDICATION_CONSENT_IDS);
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const phonePattern = /^\d{11}$/;

const optionalEmail = z.string().refine((value) => !value.trim() || emailPattern.test(value.trim()), 'signup.invalidEmail');
const optionalPhone = z
  .string()
  .refine((value) => !value.trim() || /^\d+$/.test(value.trim()), 'signup.phoneDigitsOnly')
  .refine((value) => !value.trim() || phonePattern.test(value.trim()), 'signup.invalidPhone');
const requiredPhone = z
  .string()
  .min(1, 'signup.requiredField')
  .refine((value) => /^\d+$/.test(value.trim()), 'signup.phoneDigitsOnly')
  .refine((value) => phonePattern.test(value.trim()), 'signup.invalidPhone');
const childDob = z
  .string()
  .min(1, 'signup.requiredField')
  .refine((value) => isValidIsoDate(value), 'signup.invalidDate')
  .refine((value) => isChildAgeValid(value), 'signup.childAgeRange');

export const parentSignUpBaseSchema = z.object({
  nurseryId: z.string().min(1),
  childFirstName: z.string().min(1),
  childMiddleName: z.string().min(1),
  childLastName: z.string().min(1),
  childNickname: z.string().min(1),
  childDob,
  childNationality: z.string().min(1),
  childGender: z.string(),

  fatherFullName: z.string(),
  fatherJob: z.string(),
  fatherMobile: optionalPhone,
  fatherEmail: optionalEmail,

  motherFullName: z.string(),
  motherJob: z.string(),
  motherMobile: optionalPhone,
  motherEmail: optionalEmail,

  // One login for the family. Supabase Auth needs an email, so signup mints
  // <username>@parents.xo.local; the emails above stay as contact details only.
  username: z.string().regex(/^[a-zA-Z0-9._-]{4,32}$/, 'signup.usernameInvalid'),
  password: z.string().min(8, 'signup.passwordTooShort'),

  maritalStatus: z.string(),
  address: z.string(),
  hasSiblings: z.boolean(),
  siblingAges: z.string(),

  department: z.string(),
  schoolPreference: z.string(),
  schoolAdmissionsPlan: z.string(),
  academicYear: z.string(),

  hasAllergy: z.boolean(),
  allergyDetails: z.string(),
  allergyTypes: z.array(z.string()),
  hasMedicalCondition: z.boolean(),
  medicalConditionDetails: z.string(),
  referralSource: z.string(),

  // One contact is required; the parent can add more cards from the form.
  emergencyContacts: z
    .array(
      z.object({
        name: z.string().min(1),
        phone: requiredPhone,
        relationship: z.string().min(1),
      }),
    )
    .min(1),

  pickupPerson1Name: z.string().min(1),
  pickupPerson1Phone: requiredPhone,
  pickupPerson1Relation: z.string(),
  pickupPerson1Authorization: z.string(),
  pickupPerson2Name: z.string().min(1),
  pickupPerson2Phone: requiredPhone,
  pickupPerson2Relation: z.string(),
  pickupPerson2Authorization: z.string(),

  arrivalTime: z.string(),
  takesBreakfastAtHome: z.string(),
  eatsNurseryMeals: z.string(),
  foodAllergies: z.string(),
  sendsExtraSnacks: z.string(),
  sendsVitamins: z.string(),
  vitaminDetails: z.string(),
  waterPreference: z.string(),
  extraMealPreference: z.string(),
  diaperSupplyMethod: z.string(),
  dailyDiaperCount: z.string(),
  rashCreamUsage: z.string(),
  diaperChangeFrequency: z.string(),
  toiletTrainingStatus: z.string(),
  napTimePreference: z.string(),
  maxNapTime: z.string(),

  medicationConsents: z.array(medicationConsentIdSchema),

  agreeHealthPolicy: z.boolean(),
  agreeFinancialAgreement: z.boolean(),
  agreePolicies: z.boolean(),
  agreeInfoAccuracy: z.boolean(),
});

export type ParentSignUpFormValues = z.infer<typeof parentSignUpBaseSchema>;

export function validateCrossFieldRules(data: ParentSignUpFormValues, options: { checkConsents?: boolean } = {}): string | null {
  // The family signs in with one username + password; the parent details below are
  // the record of who the child's parents are, and at least one has to be filled.
  if (!/^[a-zA-Z0-9._-]{4,32}$/.test(data.username.trim())) return 'usernameInvalid';
  if (data.password.trim().length < 8) return 'passwordTooShort';

  const hasFather = data.fatherFullName.trim().length > 0;
  const hasMother = data.motherFullName.trim().length > 0;
  if (!hasFather && !hasMother) return 'atLeastOneParentRequired';

  if (hasFather && !data.fatherMobile.trim()) return 'fatherMobileRequired';
  if (hasMother && !data.motherMobile.trim()) return 'motherMobileRequired';

  if (options.checkConsents !== false && (!data.agreeHealthPolicy || !data.agreeFinancialAgreement || !data.agreePolicies || !data.agreeInfoAccuracy))
    return 'allConsentsRequired';
  return null;
}
