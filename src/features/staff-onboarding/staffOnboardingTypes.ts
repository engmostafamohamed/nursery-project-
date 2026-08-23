export type StaffUserMode = 'new' | 'existing';

export type StaffPosition =
  | 'teacher'
  | 'assistant'
  | 'nanny'
  | 'driver'
  | 'kitchen'
  | 'cleaner'
  | 'security'
  | 'admin';

export type StaffEmploymentUi =
  | 'full_time'
  | 'part_time'
  | 'temporary'
  | 'contract'
  | 'intern';

export type StaffMaritalStatus = '' | 'single' | 'married' | 'divorced' | 'widowed';

export type StaffCriminalStatus = '' | 'clear' | 'pending' | 'concerns';

/** Positions whose work places them in direct contact with children.
 * Criminal check is required for these. */
export const CHILD_CONTACT_POSITIONS: ReadonlySet<StaffPosition> = new Set([
  'teacher',
  'assistant',
  'nanny',
  'driver',
  'security',
]);

/** Positions that teach / care for children. Need education + certificate + experience + CP training. */
export const CHILDCARE_POSITIONS: ReadonlySet<StaffPosition> = new Set([
  'teacher',
  'assistant',
  'nanny',
]);

export function requiresCriminalCheck(position: StaffPosition): boolean {
  return CHILD_CONTACT_POSITIONS.has(position);
}

export function requiresChildcareQualifications(position: StaffPosition): boolean {
  return CHILDCARE_POSITIONS.has(position);
}

export type StaffOnboardingFormValues = {
  nurseryLanguagePref: 'ar' | 'en' | 'both';
  userMode: StaffUserMode;
  newNameAr: string;
  newNameEn: string;
  newMobile: string;
  newEmail: string;
  existingUserId: string;
  employeeId: string;
  position: StaffPosition;
  department: string;
  employmentType: StaffEmploymentUi;
  startDate: string;
  contractEndDate: string;
  contractAutoRenewal: boolean;
  probationEndDate: string;
  baseSalary: string;
  allowanceTransport: string;
  allowanceHousing: string;
  allowanceMeal: string;
  allowancePhone: string;
  paymentMethod: 'bank_transfer' | 'cash' | 'check';
  bankName: string;
  bankAccountNumber: string;
  bankIban: string;
  workingDays: number[];
  workStartTime: string;
  workEndTime: string;
  nationalId: string;
  socialInsuranceNumber: string;
  taxId: string;
  dateOfBirth: string;
  gender: '' | 'male' | 'female';
  maritalStatus: StaffMaritalStatus;
  dependents: string;
  criminalCheckDate: string;
  criminalStatus: StaffCriminalStatus;
  ref1Name: string;
  ref1Phone: string;
  ref1Verified: string;
  ref2Name: string;
  ref2Phone: string;
  ref2Verified: string;
  childProtectionTrainingDate: string;
  educationDegree: string;
  teachingCertificate: string;
  yearsExperience: string;
  emergencyName: string;
  emergencyRelationship: string;
  emergencyPhone: string;
  termsAccepted: boolean;
};
