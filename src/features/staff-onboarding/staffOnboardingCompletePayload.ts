import { normalizeInternationalMobile } from '@/lib/phoneValidation';

import { generateEmployeeId } from './mapStaffOnboardingToProfile';
import type { StaffOnboardingFormValues } from './staffOnboardingTypes';

/**
 * JSON body for `staff-onboarding-complete` (camelCase).
 * Keep field names aligned with `supabase/functions/staff-onboarding-complete/mapStaffProfile.ts`.
 */
export type StaffOnboardingCompletePayload = {
  nurseryId: string;
  userMode: StaffOnboardingFormValues['userMode'];
  existingUserId: string;
  newNameAr: string;
  newNameEn: string;
  newMobile: string;
  newEmail: string | null;
  employeeId: string;
  position: StaffOnboardingFormValues['position'];
  employmentType: StaffOnboardingFormValues['employmentType'];
  startDate: string;
  contractEndDate: string;
  contractAutoRenewal: boolean;
  probationEndDate: string;
  baseSalary: string;
  allowanceTransport: string;
  allowanceHousing: string;
  allowanceMeal: string;
  allowancePhone: string;
  paymentMethod: StaffOnboardingFormValues['paymentMethod'];
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
  gender: StaffOnboardingFormValues['gender'];
  maritalStatus: StaffOnboardingFormValues['maritalStatus'];
  dependents: string;
  criminalCheckDate: string;
  criminalStatus: string;
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

export function buildStaffOnboardingCompletePayload(
  v: StaffOnboardingFormValues,
  nurseryId: string,
): StaffOnboardingCompletePayload {
  const emergencyPhone = v.emergencyPhone.trim()
    ? normalizeInternationalMobile(v.emergencyPhone)
    : '';
  return {
    nurseryId,
    userMode: v.userMode,
    existingUserId: v.existingUserId,
    newNameAr: v.newNameAr.trim() || v.newNameEn.trim() || 'مستخدم',
    newNameEn: v.newNameEn.trim() || v.newNameAr.trim() || 'User',
    newMobile: normalizeInternationalMobile(v.newMobile),
    newEmail: v.newEmail.trim() || null,
    employeeId: v.employeeId.trim() || generateEmployeeId(),
    position: v.position,
    employmentType: v.employmentType,
    startDate: v.startDate,
    contractEndDate: v.contractEndDate,
    contractAutoRenewal: v.contractAutoRenewal,
    probationEndDate: v.probationEndDate,
    baseSalary: v.baseSalary,
    allowanceTransport: v.allowanceTransport,
    allowanceHousing: v.allowanceHousing,
    allowanceMeal: v.allowanceMeal,
    allowancePhone: v.allowancePhone,
    paymentMethod: v.paymentMethod,
    bankName: v.bankName,
    bankAccountNumber: v.bankAccountNumber,
    bankIban: v.bankIban,
    workingDays: v.workingDays,
    workStartTime: v.workStartTime,
    workEndTime: v.workEndTime,
    nationalId: v.nationalId,
    socialInsuranceNumber: v.socialInsuranceNumber,
    taxId: v.taxId,
    dateOfBirth: v.dateOfBirth,
    gender: v.gender,
    maritalStatus: v.maritalStatus,
    dependents: v.dependents,
    criminalCheckDate: v.criminalCheckDate,
    criminalStatus: v.criminalStatus,
    ref1Name: v.ref1Name,
    ref1Phone: v.ref1Phone,
    ref1Verified: v.ref1Verified,
    ref2Name: v.ref2Name,
    ref2Phone: v.ref2Phone,
    ref2Verified: v.ref2Verified,
    childProtectionTrainingDate: v.childProtectionTrainingDate,
    educationDegree: v.educationDegree,
    teachingCertificate: v.teachingCertificate,
    yearsExperience: v.yearsExperience,
    emergencyName: v.emergencyName,
    emergencyRelationship: v.emergencyRelationship,
    emergencyPhone,
    termsAccepted: v.termsAccepted,
  };
}
