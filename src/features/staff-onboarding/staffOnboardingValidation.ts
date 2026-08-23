import { z } from 'zod';

import { isStaffAgeValid } from '@/lib/onboardingDateBounds';
import { isValidInternationalMobile } from '@/lib/phoneValidation';
import { isEndTimeAfterStart, isWeeklyHoursValid } from '@/lib/workScheduleValidation';

import type { StaffOnboardingFormValues, StaffPosition } from './staffOnboardingTypes';
import { requiresChildcareQualifications, requiresCriminalCheck } from './staffOnboardingTypes';
import type { StaffOnboardingFileBundle } from './staffOnboardingFiles';
import { isStaffStepValid } from './staffOnboardingStepFieldErrors';

export const nationalId14 = /^[0-9]{14}$/;

export const MIN_SALARY_EGP = 3500;

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const BANK_ACCOUNT_REGEX = /^[0-9]{8,20}$/;
const EG_IBAN_REGEX = /^EG[0-9A-Z]{27}$/;
const TAX_ID_REGEX = /^[0-9]{9,15}$/;

const MAX_YEARS_EXPERIENCE = 50;
const MAX_DEPENDENTS = 20;
const CONTRACT_MAX_YEARS = 10;
/** Criminal-check validity window — 1 year */
const CRIMINAL_CHECK_MAX_AGE_DAYS = 365;
/** Child protection training validity — 2 years */
const CP_TRAINING_MAX_AGE_DAYS = 730;
/** Start date grace — admin may register someone who started up to 30 days ago */
const START_DATE_PAST_GRACE_DAYS = 30;
/** Start date forward — can't schedule more than 1 year into the future */
const START_DATE_FUTURE_MAX_DAYS = 365;

/** Nursery language: which legal name fields are required on staff step 1 (new user). */
export function isStaffNameArRequired(pref: 'ar' | 'en' | 'both'): boolean {
  return pref === 'ar' || pref === 'both';
}

export function isStaffNameEnRequired(pref: 'ar' | 'en' | 'both'): boolean {
  return pref === 'en' || pref === 'both';
}

function daysBetween(a: string, b: string): number {
  const ta = Date.parse(a);
  const tb = Date.parse(b);
  if (!Number.isFinite(ta) || !Number.isFinite(tb)) return Number.NaN;
  return Math.round((ta - tb) / 86_400_000);
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function isDateWithinPastDays(dateStr: string, maxDays: number): boolean {
  if (!dateStr) return false;
  const diff = daysBetween(todayIso(), dateStr);
  if (!Number.isFinite(diff)) return false;
  return diff >= 0 && diff <= maxDays;
}

const baseFields = {
  nurseryLanguagePref: z.enum(['ar', 'en', 'both']),
  userMode: z.enum(['new', 'existing']),
  newNameAr: z.string(),
  newNameEn: z.string(),
  newMobile: z.string(),
  newEmail: z.string(),
  existingUserId: z.string(),
  employeeId: z.string(),
  // Positions are now dynamic — created via /admin/settings/positions and stored
  // in public.positions. The form holds the position key (string). Validation
  // just requires a non-empty value; whether it actually exists is enforced by
  // the FK constraint on staff_profiles.position_id (set by the DB trigger
  // trg_derive_position_id from the position text key).
  position: z.string().min(1, 'staffOnboarding.validation.positionRequired'),
  department: z.string(),
  employmentType: z.enum(['full_time', 'part_time', 'temporary', 'contract', 'intern']),
  startDate: z.string(),
  contractEndDate: z.string(),
  contractAutoRenewal: z.boolean(),
  probationEndDate: z.string(),
  baseSalary: z.string(),
  allowanceTransport: z.string(),
  allowanceHousing: z.string(),
  allowanceMeal: z.string(),
  allowancePhone: z.string(),
  paymentMethod: z.enum(['bank_transfer', 'cash', 'check']),
  bankName: z.string(),
  bankAccountNumber: z.string(),
  bankIban: z.string(),
  workingDays: z.array(z.number().min(0).max(6)),
  workStartTime: z.string(),
  workEndTime: z.string(),
  nationalId: z.string(),
  socialInsuranceNumber: z.string(),
  taxId: z.string(),
  dateOfBirth: z.string(),
  gender: z
    .union([z.literal(''), z.literal('male'), z.literal('female')])
    .refine((v) => v === 'male' || v === 'female', {
      message: 'staffOnboarding.validation.genderRequired',
    }),
  maritalStatus: z.union([
    z.literal(''),
    z.literal('single'),
    z.literal('married'),
    z.literal('divorced'),
    z.literal('widowed'),
  ]),
  dependents: z.string(),
  criminalCheckDate: z.string(),
  criminalStatus: z.union([
    z.literal(''),
    z.literal('clear'),
    z.literal('pending'),
    z.literal('concerns'),
  ]),
  ref1Name: z.string(),
  ref1Phone: z.string(),
  ref1Verified: z.string(),
  ref2Name: z.string(),
  ref2Phone: z.string(),
  ref2Verified: z.string(),
  childProtectionTrainingDate: z.string(),
  educationDegree: z.string(),
  teachingCertificate: z.string(),
  yearsExperience: z.string(),
  emergencyName: z.string(),
  emergencyRelationship: z.string(),
  emergencyPhone: z.string(),
  termsAccepted: z.boolean(),
};

function issue(ctx: z.RefinementCtx, path: string, message: string) {
  ctx.addIssue({ code: 'custom', path: [path], message });
}

export const staffOnboardingFullSchema = z.object(baseFields).superRefine((data, ctx) => {
  const position = data.position as StaffPosition;

  // --- 1. Identity & contact -----------------------------------------------
  if (data.userMode === 'new') {
    const pref = data.nurseryLanguagePref;
    if (isStaffNameArRequired(pref) && !data.newNameAr.trim()) {
      issue(ctx, 'newNameAr', 'staffOnboarding.validation.nameArRequired');
    }
    if (isStaffNameEnRequired(pref) && !data.newNameEn.trim()) {
      issue(ctx, 'newNameEn', 'staffOnboarding.validation.nameEnRequired');
    }
    const mobileRaw = data.newMobile.trim();
    if (!mobileRaw) {
      issue(ctx, 'newMobile', 'staffOnboarding.validation.mobileRequired');
    } else if (!isValidInternationalMobile(mobileRaw.replace(/\s/g, ''))) {
      issue(ctx, 'newMobile', 'staffOnboarding.validation.mobileInvalid');
    }
    const email = data.newEmail.trim();
    if (email && !EMAIL_REGEX.test(email)) {
      issue(ctx, 'newEmail', 'staffOnboarding.validation.emailInvalid');
    }
  } else if (!data.existingUserId) {
    issue(ctx, 'existingUserId', 'staffOnboarding.validation.selectParent');
  }

  if (!isStaffAgeValid(data.dateOfBirth)) {
    issue(ctx, 'dateOfBirth', 'staffOnboarding.validation.ageRangeStaff');
  }

  const dependentsTrim = data.dependents.trim();
  if (dependentsTrim) {
    const deps = Number(dependentsTrim);
    if (!Number.isInteger(deps) || deps < 0 || deps > MAX_DEPENDENTS) {
      issue(ctx, 'dependents', 'staffOnboarding.validation.dependentsRange');
    }
  }

  // --- 2. Position & employment --------------------------------------------
  if (data.startDate) {
    const fromToday = daysBetween(data.startDate, todayIso());
    if (Number.isFinite(fromToday)) {
      if (fromToday < -START_DATE_PAST_GRACE_DAYS) {
        issue(ctx, 'startDate', 'staffOnboarding.validation.startDateTooOld');
      } else if (fromToday > START_DATE_FUTURE_MAX_DAYS) {
        issue(ctx, 'startDate', 'staffOnboarding.validation.startDateTooFuture');
      }
    }
  }

  if (data.employmentType === 'temporary' || data.employmentType === 'contract') {
    if (!data.contractEndDate?.trim()) {
      issue(ctx, 'contractEndDate', 'staffOnboarding.validation.contractEndRequired');
    } else if (data.startDate && data.contractEndDate <= data.startDate) {
      issue(ctx, 'contractEndDate', 'staffOnboarding.validation.contractEndAfterStart');
    } else if (data.startDate) {
      const span = daysBetween(data.contractEndDate, data.startDate);
      if (Number.isFinite(span) && span > CONTRACT_MAX_YEARS * 365) {
        issue(ctx, 'contractEndDate', 'staffOnboarding.validation.contractEndTooFar');
      }
    }
  }

  // --- 3. Emergency contact (ALWAYS REQUIRED) ------------------------------
  if (!data.emergencyName.trim()) {
    issue(ctx, 'emergencyName', 'staffOnboarding.validation.emergencyNameRequired');
  }
  if (!data.emergencyRelationship.trim()) {
    issue(ctx, 'emergencyRelationship', 'staffOnboarding.validation.emergencyRelRequired');
  }
  const epRaw = data.emergencyPhone.trim().replace(/\s/g, '');
  if (!epRaw) {
    issue(ctx, 'emergencyPhone', 'staffOnboarding.validation.emergencyPhoneRequired');
  } else if (!isValidInternationalMobile(epRaw)) {
    issue(ctx, 'emergencyPhone', 'staffOnboarding.validation.mobileInvalid');
  }

  // --- 4. Qualifications & background (role-aware) -------------------------
  if (requiresChildcareQualifications(position)) {
    if (!data.educationDegree.trim()) {
      issue(ctx, 'educationDegree', 'staffOnboarding.validation.educationRequired');
    }
    if (position !== 'nanny' && !data.teachingCertificate.trim()) {
      issue(ctx, 'teachingCertificate', 'staffOnboarding.validation.teachingCertRequired');
    }
    const yearsTrim = data.yearsExperience.trim();
    if (!yearsTrim) {
      issue(ctx, 'yearsExperience', 'staffOnboarding.validation.yearsExperienceRequired');
    }
  }
  const yearsTrim = data.yearsExperience.trim();
  if (yearsTrim) {
    const yrs = Number(yearsTrim);
    if (!Number.isFinite(yrs) || yrs < 0 || yrs > MAX_YEARS_EXPERIENCE) {
      issue(ctx, 'yearsExperience', 'staffOnboarding.validation.yearsExperienceRange');
    }
  }

  if (requiresCriminalCheck(position)) {
    if (!data.criminalCheckDate.trim()) {
      issue(ctx, 'criminalCheckDate', 'staffOnboarding.validation.criminalCheckRequired');
    } else if (!isDateWithinPastDays(data.criminalCheckDate, CRIMINAL_CHECK_MAX_AGE_DAYS)) {
      issue(ctx, 'criminalCheckDate', 'staffOnboarding.validation.criminalCheckTooOld');
    }
    if (!data.criminalStatus) {
      issue(ctx, 'criminalStatus', 'staffOnboarding.validation.criminalStatusRequired');
    }
  }

  if (requiresChildcareQualifications(position)) {
    if (!data.childProtectionTrainingDate.trim()) {
      issue(
        ctx,
        'childProtectionTrainingDate',
        'staffOnboarding.validation.childProtectionTrainingRequired',
      );
    } else if (!isDateWithinPastDays(data.childProtectionTrainingDate, CP_TRAINING_MAX_AGE_DAYS)) {
      issue(
        ctx,
        'childProtectionTrainingDate',
        'staffOnboarding.validation.childProtectionTrainingTooOld',
      );
    }
  }

  // References — optional, but if a name is given the phone is required + valid.
  if (data.ref1Name.trim()) {
    const r1 = data.ref1Phone.trim().replace(/\s/g, '');
    if (!r1) {
      issue(ctx, 'ref1Phone', 'staffOnboarding.validation.refPhoneRequired');
    } else if (!isValidInternationalMobile(r1)) {
      issue(ctx, 'ref1Phone', 'staffOnboarding.validation.refPhoneInvalid');
    }
  }
  if (data.ref2Name.trim()) {
    const r2 = data.ref2Phone.trim().replace(/\s/g, '');
    if (!r2) {
      issue(ctx, 'ref2Phone', 'staffOnboarding.validation.refPhoneRequired');
    } else if (!isValidInternationalMobile(r2)) {
      issue(ctx, 'ref2Phone', 'staffOnboarding.validation.refPhoneInvalid');
    }
  }

  // --- 5. Compensation -----------------------------------------------------
  const salaryNum = Number(data.baseSalary);
  if (!Number.isFinite(salaryNum) || salaryNum < MIN_SALARY_EGP) {
    issue(ctx, 'baseSalary', 'staffOnboarding.validation.salaryMinimum');
  }

  if (data.paymentMethod === 'bank_transfer') {
    if (!data.bankName.trim()) {
      issue(ctx, 'bankName', 'staffOnboarding.validation.required');
    }
    const acct = data.bankAccountNumber.trim();
    if (!acct) {
      issue(ctx, 'bankAccountNumber', 'staffOnboarding.validation.required');
    } else if (!BANK_ACCOUNT_REGEX.test(acct)) {
      issue(ctx, 'bankAccountNumber', 'staffOnboarding.validation.bankAccountFormat');
    }
    const iban = data.bankIban.trim().replace(/\s/g, '').toUpperCase();
    if (iban && !EG_IBAN_REGEX.test(iban)) {
      issue(ctx, 'bankIban', 'staffOnboarding.validation.ibanFormat');
    }
  }

  const si = data.socialInsuranceNumber.trim();
  if (si && !/^[0-9]{8,20}$/.test(si)) {
    issue(ctx, 'socialInsuranceNumber', 'staffOnboarding.validation.socialInsuranceFormat');
  }
  const taxTrim = data.taxId.trim();
  if (taxTrim && !TAX_ID_REGEX.test(taxTrim)) {
    issue(ctx, 'taxId', 'staffOnboarding.validation.taxIdFormat');
  }

  // --- 6. Schedule ---------------------------------------------------------
  const wd = data.workingDays.length;
  if (wd < 1 || wd > 6) {
    issue(ctx, 'workingDays', 'staffOnboarding.validation.workingDaysRange');
  } else if (!isEndTimeAfterStart(data.workStartTime, data.workEndTime)) {
    issue(ctx, 'workEndTime', 'staffOnboarding.validation.workHoursInvalid');
  } else if (!isWeeklyHoursValid(data.workStartTime, data.workEndTime, wd)) {
    issue(ctx, 'workEndTime', 'staffOnboarding.validation.workHoursInvalid');
  }

  // --- 7. Review -----------------------------------------------------------
  if (!data.termsAccepted) {
    issue(ctx, 'termsAccepted', 'staffOnboarding.validation.termsRequired');
  }
});

// =============================================================================
// Per-step validators invoked by the wizard when the user clicks "Next".
// Returns granular field errors so the wizard can highlight the first invalid
// input and scroll to it.
// =============================================================================

type FieldErrors<K extends keyof StaffOnboardingFormValues> = Partial<Record<K, string>>;

/** Step 1 — identity & contact */
export function validateStaffStepIdentity(v: StaffOnboardingFormValues): {
  ok: boolean;
  fieldErrors?: FieldErrors<
    | 'newNameAr'
    | 'newNameEn'
    | 'newMobile'
    | 'newEmail'
    | 'existingUserId'
    | 'dateOfBirth'
    | 'gender'
    | 'dependents'
  >;
} {
  const errors: FieldErrors<
    | 'newNameAr'
    | 'newNameEn'
    | 'newMobile'
    | 'newEmail'
    | 'existingUserId'
    | 'dateOfBirth'
    | 'gender'
    | 'dependents'
  > = {};

  if (v.userMode === 'existing') {
    if (!v.existingUserId) errors.existingUserId = 'staffOnboarding.validation.selectParent';
  } else {
    const pref = v.nurseryLanguagePref;
    if (isStaffNameArRequired(pref) && !v.newNameAr.trim()) {
      errors.newNameAr = 'staffOnboarding.validation.nameArRequired';
    }
    if (isStaffNameEnRequired(pref) && !v.newNameEn.trim()) {
      errors.newNameEn = 'staffOnboarding.validation.nameEnRequired';
    }
    const mobileRaw = v.newMobile.trim().replace(/\s/g, '');
    if (!mobileRaw) {
      errors.newMobile = 'staffOnboarding.validation.mobileRequired';
    } else if (!isValidInternationalMobile(mobileRaw)) {
      errors.newMobile = 'staffOnboarding.validation.mobileInvalid';
    }
    const email = v.newEmail.trim();
    if (email && !EMAIL_REGEX.test(email)) {
      errors.newEmail = 'staffOnboarding.validation.emailInvalid';
    }
  }

  if (!isStaffAgeValid(v.dateOfBirth)) {
    errors.dateOfBirth = 'staffOnboarding.validation.ageRangeStaff';
  }
  if (!v.gender) {
    errors.gender = 'staffOnboarding.validation.genderRequired';
  }

  const dependentsTrim = v.dependents.trim();
  if (dependentsTrim) {
    const deps = Number(dependentsTrim);
    if (!Number.isInteger(deps) || deps < 0 || deps > MAX_DEPENDENTS) {
      errors.dependents = 'staffOnboarding.validation.dependentsRange';
    }
  }

  return Object.keys(errors).length ? { ok: false, fieldErrors: errors } : { ok: true };
}

/** Step 2 — position & employment */
export function validateStaffStepPosition(v: StaffOnboardingFormValues): {
  ok: boolean;
  fieldErrors?: FieldErrors<'position' | 'startDate' | 'contractEndDate'>;
} {
  const errors: FieldErrors<'position' | 'startDate' | 'contractEndDate'> = {};
  if (!v.position) errors.position = 'staffOnboarding.validation.required';
  if (!v.startDate?.trim()) {
    errors.startDate = 'staffOnboarding.validation.required';
  } else {
    const fromToday = daysBetween(v.startDate, todayIso());
    if (Number.isFinite(fromToday)) {
      if (fromToday < -START_DATE_PAST_GRACE_DAYS) {
        errors.startDate = 'staffOnboarding.validation.startDateTooOld';
      } else if (fromToday > START_DATE_FUTURE_MAX_DAYS) {
        errors.startDate = 'staffOnboarding.validation.startDateTooFuture';
      }
    }
  }
  if (v.employmentType === 'temporary' || v.employmentType === 'contract') {
    if (!v.contractEndDate?.trim()) {
      errors.contractEndDate = 'staffOnboarding.validation.contractEndRequired';
    } else if (v.startDate && v.contractEndDate <= v.startDate) {
      errors.contractEndDate = 'staffOnboarding.validation.contractEndAfterStart';
    } else if (v.startDate) {
      const span = daysBetween(v.contractEndDate, v.startDate);
      if (Number.isFinite(span) && span > CONTRACT_MAX_YEARS * 365) {
        errors.contractEndDate = 'staffOnboarding.validation.contractEndTooFar';
      }
    }
  }
  return Object.keys(errors).length ? { ok: false, fieldErrors: errors } : { ok: true };
}

/** Step 3 — emergency contact (now required) */
export function validateStaffStepEmergency(v: StaffOnboardingFormValues): {
  ok: boolean;
  fieldErrors?: FieldErrors<'emergencyName' | 'emergencyRelationship' | 'emergencyPhone'>;
} {
  const errors: FieldErrors<'emergencyName' | 'emergencyRelationship' | 'emergencyPhone'> = {};
  if (!v.emergencyName.trim()) {
    errors.emergencyName = 'staffOnboarding.validation.emergencyNameRequired';
  }
  if (!v.emergencyRelationship.trim()) {
    errors.emergencyRelationship = 'staffOnboarding.validation.emergencyRelRequired';
  }
  const ep = v.emergencyPhone.trim().replace(/\s/g, '');
  if (!ep) {
    errors.emergencyPhone = 'staffOnboarding.validation.emergencyPhoneRequired';
  } else if (!isValidInternationalMobile(ep)) {
    errors.emergencyPhone = 'staffOnboarding.validation.mobileInvalid';
  }
  return Object.keys(errors).length ? { ok: false, fieldErrors: errors } : { ok: true };
}

/** Step 4 — qualifications & background (role-aware) */
export function validateStaffStepQualifications(v: StaffOnboardingFormValues): {
  ok: boolean;
  fieldErrors?: FieldErrors<
    | 'educationDegree'
    | 'teachingCertificate'
    | 'yearsExperience'
    | 'criminalCheckDate'
    | 'criminalStatus'
    | 'childProtectionTrainingDate'
    | 'ref1Phone'
    | 'ref2Phone'
  >;
} {
  const position = v.position as StaffPosition;
  const errors: FieldErrors<
    | 'educationDegree'
    | 'teachingCertificate'
    | 'yearsExperience'
    | 'criminalCheckDate'
    | 'criminalStatus'
    | 'childProtectionTrainingDate'
    | 'ref1Phone'
    | 'ref2Phone'
  > = {};

  if (requiresChildcareQualifications(position)) {
    if (!v.educationDegree.trim()) {
      errors.educationDegree = 'staffOnboarding.validation.educationRequired';
    }
    if (position !== 'nanny' && !v.teachingCertificate.trim()) {
      errors.teachingCertificate = 'staffOnboarding.validation.teachingCertRequired';
    }
    if (!v.yearsExperience.trim()) {
      errors.yearsExperience = 'staffOnboarding.validation.yearsExperienceRequired';
    }
  }
  const yearsTrim = v.yearsExperience.trim();
  if (yearsTrim) {
    const yrs = Number(yearsTrim);
    if (!Number.isFinite(yrs) || yrs < 0 || yrs > MAX_YEARS_EXPERIENCE) {
      errors.yearsExperience = 'staffOnboarding.validation.yearsExperienceRange';
    }
  }

  if (requiresCriminalCheck(position)) {
    if (!v.criminalCheckDate.trim()) {
      errors.criminalCheckDate = 'staffOnboarding.validation.criminalCheckRequired';
    } else if (!isDateWithinPastDays(v.criminalCheckDate, CRIMINAL_CHECK_MAX_AGE_DAYS)) {
      errors.criminalCheckDate = 'staffOnboarding.validation.criminalCheckTooOld';
    }
    if (!v.criminalStatus) {
      errors.criminalStatus = 'staffOnboarding.validation.criminalStatusRequired';
    }
  }

  if (requiresChildcareQualifications(position)) {
    if (!v.childProtectionTrainingDate.trim()) {
      errors.childProtectionTrainingDate =
        'staffOnboarding.validation.childProtectionTrainingRequired';
    } else if (!isDateWithinPastDays(v.childProtectionTrainingDate, CP_TRAINING_MAX_AGE_DAYS)) {
      errors.childProtectionTrainingDate =
        'staffOnboarding.validation.childProtectionTrainingTooOld';
    }
  }

  if (v.ref1Name.trim()) {
    const r1 = v.ref1Phone.trim().replace(/\s/g, '');
    if (!r1) errors.ref1Phone = 'staffOnboarding.validation.refPhoneRequired';
    else if (!isValidInternationalMobile(r1)) errors.ref1Phone = 'staffOnboarding.validation.refPhoneInvalid';
  }
  if (v.ref2Name.trim()) {
    const r2 = v.ref2Phone.trim().replace(/\s/g, '');
    if (!r2) errors.ref2Phone = 'staffOnboarding.validation.refPhoneRequired';
    else if (!isValidInternationalMobile(r2)) errors.ref2Phone = 'staffOnboarding.validation.refPhoneInvalid';
  }

  return Object.keys(errors).length ? { ok: false, fieldErrors: errors } : { ok: true };
}

/** Step 5 — compensation */
export function validateStaffStepCompensation(v: StaffOnboardingFormValues): {
  ok: boolean;
  fieldErrors?: FieldErrors<
    | 'baseSalary'
    | 'bankName'
    | 'bankAccountNumber'
    | 'bankIban'
    | 'socialInsuranceNumber'
    | 'taxId'
  >;
} {
  const errors: FieldErrors<
    | 'baseSalary'
    | 'bankName'
    | 'bankAccountNumber'
    | 'bankIban'
    | 'socialInsuranceNumber'
    | 'taxId'
  > = {};
  const salaryNum = Number(v.baseSalary);
  if (!Number.isFinite(salaryNum) || salaryNum < MIN_SALARY_EGP) {
    errors.baseSalary = 'staffOnboarding.validation.salaryMinimum';
  }
  if (v.paymentMethod === 'bank_transfer') {
    if (!v.bankName.trim()) errors.bankName = 'staffOnboarding.validation.required';
    const acct = v.bankAccountNumber.trim();
    if (!acct) {
      errors.bankAccountNumber = 'staffOnboarding.validation.required';
    } else if (!BANK_ACCOUNT_REGEX.test(acct)) {
      errors.bankAccountNumber = 'staffOnboarding.validation.bankAccountFormat';
    }
    const iban = v.bankIban.trim().replace(/\s/g, '').toUpperCase();
    if (iban && !EG_IBAN_REGEX.test(iban)) {
      errors.bankIban = 'staffOnboarding.validation.ibanFormat';
    }
  }
  const si = v.socialInsuranceNumber.trim();
  if (si && !/^[0-9]{8,20}$/.test(si)) {
    errors.socialInsuranceNumber = 'staffOnboarding.validation.socialInsuranceFormat';
  }
  const taxTrim = v.taxId.trim();
  if (taxTrim && !TAX_ID_REGEX.test(taxTrim)) {
    errors.taxId = 'staffOnboarding.validation.taxIdFormat';
  }
  return Object.keys(errors).length ? { ok: false, fieldErrors: errors } : { ok: true };
}

/** Step 6 — schedule */
export function validateStaffStepSchedule(v: StaffOnboardingFormValues): {
  ok: boolean;
  fieldErrors?: FieldErrors<'workingDays' | 'workEndTime'>;
} {
  const errors: FieldErrors<'workingDays' | 'workEndTime'> = {};
  const wd = v.workingDays.length;
  if (wd < 1 || wd > 6) {
    errors.workingDays = 'staffOnboarding.validation.workingDaysRange';
  } else if (!isEndTimeAfterStart(v.workStartTime, v.workEndTime)) {
    errors.workEndTime = 'staffOnboarding.validation.workHoursInvalid';
  } else if (!isWeeklyHoursValid(v.workStartTime, v.workEndTime, wd)) {
    errors.workEndTime = 'staffOnboarding.validation.workHoursInvalid';
  }
  return Object.keys(errors).length ? { ok: false, fieldErrors: errors } : { ok: true };
}

export function validateStaffDocuments(
  _files: StaffOnboardingFileBundle,
  _position: string,
): { ok: boolean; fieldErrors?: Partial<Record<keyof StaffOnboardingFileBundle, string>> } {
  return { ok: true };
}

/** Delegated by the wizard for each step. */
export function validateStaffStep(step: number, v: StaffOnboardingFormValues): boolean {
  const s = step + 1;
  if (s === 1) return validateStaffStepIdentity(v).ok;
  if (s === 2) return validateStaffStepPosition(v).ok;
  if (s === 3) return validateStaffStepEmergency(v).ok;
  if (s === 4) return validateStaffStepQualifications(v).ok;
  if (s === 5) return validateStaffStepCompensation(v).ok;
  if (s === 6) return validateStaffStepSchedule(v).ok;
  if (s === 7) return v.termsAccepted;
  return isStaffStepValid(step, v);
}

// Back-compat exports for callers that still reference the old name.
export const validateStaffStep1 = validateStaffStepIdentity;
