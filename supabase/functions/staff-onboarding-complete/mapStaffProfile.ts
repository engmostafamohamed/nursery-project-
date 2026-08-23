/** Mirrors client mapStaffOnboardingToProfile + hr_extended shape. */

export type StaffOnboardingCompletePayload = {
  nurseryId: string;
  userMode: 'new' | 'existing';
  existingUserId: string;
  newNameAr: string;
  newNameEn: string;
  newMobile: string;
  newEmail: string | null;
  employeeId: string;
  position: string;
  employmentType: string;
  startDate: string;
  contractEndDate: string;
  contractAutoRenewal: boolean;
  probationEndDate: string;
  baseSalary: string;
  allowanceTransport: string;
  allowanceHousing: string;
  allowanceMeal: string;
  allowancePhone: string;
  paymentMethod: string;
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
  gender: string;
  maritalStatus: string;
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

export function generateEmployeeId(): string {
  const n = Math.floor(100000 + Math.random() * 900000);
  return `EMP-${n}`;
}

export function positionToDepartment(position: string): string {
  switch (position) {
    case 'driver':
      return 'driver';
    case 'kitchen':
      return 'kitchen';
    case 'cleaner':
      return 'maintenance';
    case 'security':
      return 'security';
    case 'admin':
      return 'admin';
    default:
      return 'teaching';
  }
}

export function employmentUiToDb(t: string): string {
  if (t === 'intern') return 'temporary';
  return t;
}

export function calcProbationEnd(startIso: string): string {
  const d = new Date(startIso);
  d.setMonth(d.getMonth() + 3);
  return d.toISOString().slice(0, 10);
}

export function parseWeeklyHours(start: string, end: string, dayCount: number): number {
  const [sh, sm] = start.split(':').map(Number);
  const [eh, em] = end.split(':').map(Number);
  const hours = eh + em / 60 - (sh + sm / 60);
  if (!Number.isFinite(hours) || hours <= 0) return 0;
  return Math.round(hours * dayCount * 10) / 10;
}

export function buildHrExtendedJson(b: StaffOnboardingCompletePayload): Record<string, unknown> {
  const probationEndDate =
    b.probationEndDate ||
    (b.employmentType === 'full_time' || b.employmentType === 'part_time' ? calcProbationEnd(b.startDate) : '');
  return {
    wizardVersion: 1,
    employmentTypeUi: b.employmentType,
    contractEndDate: b.contractEndDate,
    contractAutoRenewal: b.contractAutoRenewal,
    probationEndDate,
    allowances: {
      transport: b.allowanceTransport,
      housing: b.allowanceHousing,
      meal: b.allowanceMeal,
      phone: b.allowancePhone,
    },
    payment: {
      method: b.paymentMethod,
      bankName: b.bankName,
      accountNumber: b.bankAccountNumber,
      iban: b.bankIban,
    },
    schedule: {
      workingDays: b.workingDays,
      start: b.workStartTime,
      end: b.workEndTime,
      weeklyHours: parseWeeklyHours(b.workStartTime, b.workEndTime, b.workingDays.length),
    },
    personal: {
      socialInsuranceNumber: b.socialInsuranceNumber,
      taxId: b.taxId,
      dateOfBirth: b.dateOfBirth,
      gender: b.gender,
      maritalStatus: b.maritalStatus,
      dependents: b.dependents,
    },
    compliance: {
      criminalCheckDate: b.criminalCheckDate,
      criminalStatus: b.criminalStatus,
      references: [
        { name: b.ref1Name, phone: b.ref1Phone, verified: b.ref1Verified },
        { name: b.ref2Name, phone: b.ref2Phone, verified: b.ref2Verified },
      ],
      childProtectionTrainingDate: b.childProtectionTrainingDate,
      education: {
        degree: b.educationDegree,
        certificate: b.teachingCertificate,
        years: b.yearsExperience,
      },
    },
  };
}
