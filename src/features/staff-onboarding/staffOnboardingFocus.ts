import type { StaffOnboardingFormValues } from './staffOnboardingTypes';

/** Field order for scrolling/focusing the first invalid control per wizard step (0-based).
 *
 *   0 → Identity & contact
 *   1 → Position & employment
 *   2 → Emergency contact
 *   3 → Qualifications & background
 *   4 → Compensation
 *   5 → Schedule
 *   6 → Review
 */
const STEP_FIELD_ORDER: Record<number, (keyof StaffOnboardingFormValues)[]> = {
  0: [
    'newNameAr',
    'newNameEn',
    'newMobile',
    'newEmail',
    'existingUserId',
    'dateOfBirth',
    'gender',
    'dependents',
  ],
  1: ['position', 'startDate', 'contractEndDate'],
  2: ['emergencyName', 'emergencyRelationship', 'emergencyPhone'],
  3: [
    'educationDegree',
    'teachingCertificate',
    'yearsExperience',
    'criminalCheckDate',
    'criminalStatus',
    'childProtectionTrainingDate',
    'ref1Phone',
    'ref2Phone',
  ],
  4: ['baseSalary', 'bankName', 'bankAccountNumber', 'bankIban', 'socialInsuranceNumber', 'taxId'],
  5: ['workingDays', 'workStartTime', 'workEndTime'],
  6: ['termsAccepted'],
};

export function focusFirstStaffInvalidField(
  step: number,
  fieldErrors: Partial<Record<keyof StaffOnboardingFormValues, string>>,
): void {
  const order = STEP_FIELD_ORDER[step];
  if (!order?.length) return;

  requestAnimationFrame(() => {
    for (const key of order) {
      if (!fieldErrors[key]) continue;
      const root = document.querySelector(`[data-staff-field="${String(key)}"]`) as HTMLElement | null;
      if (!root) continue;
      root.scrollIntoView({ behavior: 'smooth', block: 'center' });
      const focusable = root.matches('input, select, textarea')
        ? root
        : (root.querySelector(
            'input:not([type="hidden"]), select, textarea, button:not([disabled])',
          ) as HTMLElement | null);
      focusable?.focus();
      break;
    }
  });
}
