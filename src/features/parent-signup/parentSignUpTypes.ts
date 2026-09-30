export type { ParentSignUpFormValues } from './parentSignUpValidation';

export const SIGNUP_STEPS = [
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
  'review',
] as const;

export type SignUpStep = (typeof SIGNUP_STEPS)[number];

export const STEP_FIELDS: Record<SignUpStep, string[]> = {
  child: ['nurseryId', 'childFirstName', 'childMiddleName', 'childLastName', 'childNickname', 'childDob', 'childNationality'],
  parents: ['username', 'password', 'fatherEmail', 'motherEmail'],
  family: [],
  enrollment: [],
  health: [],
  emergency: ['emergencyContacts'],
  dailyCare: ['napTimePreference', 'maxNapTime'],
  pickups: [
    'pickupPerson1Name', 'pickupPerson1Phone',
    'pickupPerson2Name', 'pickupPerson2Phone',
  ],
  medicationConsents: [],
  documents: [],
  consents: ['agreeHealthPolicy', 'agreeFinancialAgreement', 'agreePolicies', 'agreeInfoAccuracy'],
  review: [],
};
