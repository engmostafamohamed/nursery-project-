import type { StaffOnboardingFormValues } from './staffOnboardingTypes';
import {
  validateStaffStepCompensation,
  validateStaffStepEmergency,
  validateStaffStepIdentity,
  validateStaffStepPosition,
  validateStaffStepQualifications,
  validateStaffStepSchedule,
} from './staffOnboardingValidation';

/**
 * Wizard step → granular field errors (i18n keys) used by "Next" to highlight
 * the first invalid input and scroll to it. Zero-indexed step numbers match the
 * ones passed to the step panel component.
 *
 *   0 → Identity & contact
 *   1 → Position & employment
 *   2 → Emergency contact
 *   3 → Qualifications & background
 *   4 → Compensation
 *   5 → Schedule
 *   6 → Review (just terms)
 */
export function getStaffStepFieldErrors(
  step: number,
  v: StaffOnboardingFormValues,
): Partial<Record<keyof StaffOnboardingFormValues, string>> {
  if (step === 0) return validateStaffStepIdentity(v).fieldErrors ?? {};
  if (step === 1) return validateStaffStepPosition(v).fieldErrors ?? {};
  if (step === 2) return validateStaffStepEmergency(v).fieldErrors ?? {};
  if (step === 3) return validateStaffStepQualifications(v).fieldErrors ?? {};
  if (step === 4) return validateStaffStepCompensation(v).fieldErrors ?? {};
  if (step === 5) return validateStaffStepSchedule(v).fieldErrors ?? {};
  if (step === 6) {
    return v.termsAccepted ? {} : { termsAccepted: 'staffOnboarding.validation.termsRequired' };
  }
  return {};
}

export function isStaffStepValid(step: number, v: StaffOnboardingFormValues): boolean {
  return Object.keys(getStaffStepFieldErrors(step, v)).length === 0;
}
