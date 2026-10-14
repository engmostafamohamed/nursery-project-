// Module 8 · Staff & HR — the staff onboarding wizard's rules, step by step.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { isValidEgyptianNationalId } from '@/lib/staffNationalId';
import { isEndTimeAfterStart, isWeeklyHoursValid } from '@/lib/workScheduleValidation';

import {
  calcProbationEnd,
  employmentUiToDb,
  generateEmployeeId,
  parseWeeklyHours,
  positionToDepartment,
} from './mapStaffOnboardingToProfile';
import { getDefaultStaffOnboardingValues } from './staffOnboardingDefaults';
import { getStaffStepFieldErrors } from './staffOnboardingStepFieldErrors';
import type { StaffOnboardingFormValues } from './staffOnboardingTypes';
import {
  validateStaffStep,
  validateStaffStepCompensation,
  validateStaffStepIdentity,
  validateStaffStepPosition,
  validateStaffStepQualifications,
  validateStaffStepSchedule,
} from './staffOnboardingValidation';

const V = 'staffOnboarding.validation';

/** A complete, valid teacher as of 14 Oct 2026. Override fields to break one rule at a time. */
function teacher(overrides: Partial<StaffOnboardingFormValues> = {}): StaffOnboardingFormValues {
  return {
    ...getDefaultStaffOnboardingValues(),
    newNameAr: 'منى علي',
    newNameEn: 'Mona Ali',
    newMobile: '01012345678',
    newEmail: 'mona@example.com',
    dateOfBirth: '1995-05-01',
    gender: 'female',
    startDate: '2026-10-14',
    emergencyName: 'Ali Hassan',
    emergencyRelationship: 'Father',
    emergencyPhone: '01112345678',
    educationDegree: 'B.Ed',
    teachingCertificate: 'Montessori',
    yearsExperience: '5',
    criminalCheckDate: '2026-06-01',
    criminalStatus: 'clear',
    childProtectionTrainingDate: '2025-12-01',
    baseSalary: '6000',
    bankName: 'CIB',
    bankAccountNumber: '1234567890',
    termsAccepted: true,
    ...overrides,
  };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-10-14T09:00:00Z'));
});
afterEach(() => {
  vi.useRealTimers();
});

describe('a complete teacher', () => {
  it('passes all seven steps', () => {
    const form = teacher();
    for (let step = 0; step < 7; step += 1) {
      expect(validateStaffStep(step, form), `step ${step + 1}`).toBe(true);
      expect(getStaffStepFieldErrors(step, form), `step ${step + 1}`).toEqual({});
    }
  });

  it('cannot finish without accepting the terms', () => {
    expect(validateStaffStep(6, teacher({ termsAccepted: false }))).toBe(false);
    expect(getStaffStepFieldErrors(6, teacher({ termsAccepted: false }))).toEqual({
      termsAccepted: `${V}.termsRequired`,
    });
  });
});

describe('step 1 · identity and contact', () => {
  const errors = (overrides: Partial<StaffOnboardingFormValues>) =>
    validateStaffStepIdentity(teacher(overrides)).fieldErrors ?? {};

  it('asks only for the names the nursery language needs', () => {
    expect(errors({ nurseryLanguagePref: 'ar', newNameEn: '' })).toEqual({});
    expect(errors({ nurseryLanguagePref: 'en', newNameAr: '' })).toEqual({});
    expect(errors({ nurseryLanguagePref: 'both', newNameAr: ' ' })).toEqual({ newNameAr: `${V}.nameArRequired` });
  });

  it('needs a valid mobile and, if given, a valid email', () => {
    expect(errors({ newMobile: '' }).newMobile).toBe(`${V}.mobileRequired`);
    expect(errors({ newMobile: '12345' }).newMobile).toBe(`${V}.mobileInvalid`);
    expect(errors({ newEmail: '' })).toEqual({});
    expect(errors({ newEmail: 'not-an-email' }).newEmail).toBe(`${V}.emailInvalid`);
  });

  it('needs a chosen user when adding an existing account', () => {
    expect(errors({ userMode: 'existing', existingUserId: '' }).existingUserId).toBe(`${V}.selectParent`);
    // Name and mobile are not asked for an existing account.
    expect(errors({ userMode: 'existing', existingUserId: 'u1', newMobile: '', newNameAr: '' })).toEqual({});
  });

  it('accepts staff aged 18 to 70 only', () => {
    expect(errors({ dateOfBirth: '2010-01-01' }).dateOfBirth).toBe(`${V}.ageRangeStaff`);
    expect(errors({ dateOfBirth: '1950-01-01' }).dateOfBirth).toBe(`${V}.ageRangeStaff`);
    expect(errors({ dateOfBirth: '2026-02-30' }).dateOfBirth).toBe(`${V}.ageRangeStaff`);
  });

  it('needs a gender and a sensible number of dependents', () => {
    expect(errors({ gender: '' }).gender).toBe(`${V}.genderRequired`);
    expect(errors({ dependents: '21' }).dependents).toBe(`${V}.dependentsRange`);
    expect(errors({ dependents: '1.5' }).dependents).toBe(`${V}.dependentsRange`);
    expect(errors({ dependents: '' })).toEqual({});
  });
});

describe('step 2 · position and employment', () => {
  const errors = (overrides: Partial<StaffOnboardingFormValues>) =>
    validateStaffStepPosition(teacher(overrides)).fieldErrors ?? {};

  it('allows a start date up to 30 days back and up to a year ahead', () => {
    expect(errors({ startDate: '2026-09-14' })).toEqual({});
    expect(errors({ startDate: '2026-09-13' }).startDate).toBe(`${V}.startDateTooOld`);
    expect(errors({ startDate: '2027-10-14' })).toEqual({});
    expect(errors({ startDate: '2027-10-15' }).startDate).toBe(`${V}.startDateTooFuture`);
  });

  it('needs a contract end date, after the start, within 10 years', () => {
    const contract = { employmentType: 'contract' as const };
    expect(errors({ ...contract, contractEndDate: '' }).contractEndDate).toBe(`${V}.contractEndRequired`);
    expect(errors({ ...contract, contractEndDate: '2026-10-14' }).contractEndDate).toBe(`${V}.contractEndAfterStart`);
    expect(errors({ ...contract, contractEndDate: '2037-01-01' }).contractEndDate).toBe(`${V}.contractEndTooFar`);
    expect(errors({ ...contract, contractEndDate: '2027-10-14' })).toEqual({});
  });

  it('does not ask a full-time employee for a contract end date', () => {
    expect(errors({ employmentType: 'full_time', contractEndDate: '' })).toEqual({});
  });
});

describe('step 4 · qualifications and background checks', () => {
  const errors = (overrides: Partial<StaffOnboardingFormValues>) =>
    validateStaffStepQualifications(teacher(overrides)).fieldErrors ?? {};
  const noQualifications = {
    educationDegree: '',
    teachingCertificate: '',
    yearsExperience: '',
    childProtectionTrainingDate: '',
  };

  it('needs teaching qualifications for teachers', () => {
    expect(Object.keys(errors(noQualifications)).sort()).toEqual([
      'childProtectionTrainingDate',
      'educationDegree',
      'teachingCertificate',
      'yearsExperience',
    ]);
  });

  it('does not need a teaching certificate for a nanny', () => {
    expect(errors({ position: 'nanny', teachingCertificate: '' })).toEqual({});
  });

  it('needs only a criminal check for a driver', () => {
    expect(errors({ position: 'driver', ...noQualifications })).toEqual({});
    expect(errors({ position: 'driver', criminalCheckDate: '', criminalStatus: '' })).toEqual({
      criminalCheckDate: `${V}.criminalCheckRequired`,
      criminalStatus: `${V}.criminalStatusRequired`,
    });
  });

  it('needs no background checks for kitchen staff', () => {
    expect(errors({ position: 'kitchen', ...noQualifications, criminalCheckDate: '', criminalStatus: '' })).toEqual({});
  });

  it('rejects a criminal check older than a year or dated in the future', () => {
    expect(errors({ criminalCheckDate: '2025-10-13' }).criminalCheckDate).toBe(`${V}.criminalCheckTooOld`);
    expect(errors({ criminalCheckDate: '2026-10-20' }).criminalCheckDate).toBe(`${V}.criminalCheckTooOld`);
  });

  it('rejects child-protection training older than two years', () => {
    expect(errors({ childProtectionTrainingDate: '2024-10-01' }).childProtectionTrainingDate).toBe(
      `${V}.childProtectionTrainingTooOld`,
    );
  });

  it('keeps years of experience between 0 and 50', () => {
    expect(errors({ yearsExperience: '51' }).yearsExperience).toBe(`${V}.yearsExperienceRange`);
    expect(errors({ yearsExperience: '-1' }).yearsExperience).toBe(`${V}.yearsExperienceRange`);
  });

  it('needs a valid phone for every named reference', () => {
    expect(errors({ ref1Name: 'Sara', ref1Phone: '' }).ref1Phone).toBe(`${V}.refPhoneRequired`);
    expect(errors({ ref2Name: 'Omar', ref2Phone: '123' }).ref2Phone).toBe(`${V}.refPhoneInvalid`);
    expect(errors({ ref1Name: '', ref1Phone: '' })).toEqual({});
  });
});

describe('step 5 · compensation', () => {
  const errors = (overrides: Partial<StaffOnboardingFormValues>) =>
    validateStaffStepCompensation(teacher(overrides)).fieldErrors ?? {};

  it('needs at least the 3,500 EGP minimum salary', () => {
    expect(errors({ baseSalary: '3499' }).baseSalary).toBe(`${V}.salaryMinimum`);
    expect(errors({ baseSalary: '' }).baseSalary).toBe(`${V}.salaryMinimum`);
    expect(errors({ baseSalary: '3500' })).toEqual({});
  });

  it('checks bank details for a bank transfer', () => {
    expect(errors({ bankName: '' }).bankName).toBe(`${V}.required`);
    expect(errors({ bankAccountNumber: '12-34' }).bankAccountNumber).toBe(`${V}.bankAccountFormat`);
    expect(errors({ bankIban: 'EG12' }).bankIban).toBe(`${V}.ibanFormat`);
    expect(errors({ bankIban: 'eg38 0019 0005 0000 0000 2631 8000 2' })).toEqual({});
  });

  it('skips bank details for cash', () => {
    expect(errors({ paymentMethod: 'cash', bankName: '', bankAccountNumber: '' })).toEqual({});
  });

  it('checks the format of insurance and tax numbers when given', () => {
    expect(errors({ socialInsuranceNumber: '123' }).socialInsuranceNumber).toBe(`${V}.socialInsuranceFormat`);
    expect(errors({ taxId: '12345678' }).taxId).toBe(`${V}.taxIdFormat`);
    expect(errors({ socialInsuranceNumber: '', taxId: '' })).toEqual({});
  });
});

describe('step 6 · schedule', () => {
  const errors = (overrides: Partial<StaffOnboardingFormValues>) =>
    validateStaffStepSchedule(teacher(overrides)).fieldErrors ?? {};

  it('needs 1 to 6 working days', () => {
    expect(errors({ workingDays: [] }).workingDays).toBe(`${V}.workingDaysRange`);
    expect(errors({ workingDays: [0, 1, 2, 3, 4, 5, 6] }).workingDays).toBe(`${V}.workingDaysRange`);
  });

  it('needs the day to end after it starts', () => {
    expect(errors({ workStartTime: '16:00', workEndTime: '08:00' }).workEndTime).toBe(`${V}.workHoursInvalid`);
  });

  it('caps the week at 60 hours', () => {
    expect(errors({ workingDays: [0, 1, 2, 3, 4, 5], workStartTime: '08:00', workEndTime: '18:00' })).toEqual({});
    expect(
      errors({ workingDays: [0, 1, 2, 3, 4, 5], workStartTime: '08:00', workEndTime: '18:30' }).workEndTime,
    ).toBe(`${V}.workHoursInvalid`);
  });
});

describe('working hours', () => {
  it('compares clock times', () => {
    expect(isEndTimeAfterStart('08:00', '08:01')).toBe(true);
    expect(isEndTimeAfterStart('08:00', '08:00')).toBe(false);
    expect(isEndTimeAfterStart('08:00', 'late')).toBe(false);
  });

  it('adds up the week to one decimal place', () => {
    expect(parseWeeklyHours('08:00', '16:00', 5)).toBe(40);
    expect(parseWeeklyHours('08:00', '14:20', 3)).toBe(19);
    expect(parseWeeklyHours('16:00', '08:00', 5)).toBe(0);
  });

  it('isWeeklyHoursValid rejects 0 or 7 days', () => {
    expect(isWeeklyHoursValid('08:00', '16:00', 0)).toBe(false);
    expect(isWeeklyHoursValid('08:00', '16:00', 7)).toBe(false);
    expect(isWeeklyHoursValid('08:00', '16:00', 6)).toBe(true);
  });
});

describe('Egyptian national ID', () => {
  it.each([
    ['29501011234567', true],
    ['30101011234567', true],
    ['2950 1011 2345 67', true],
    ['19501011234567', false],
    ['2950101123456', false],
    ['2950101123456a', false],
  ])('%s is valid: %s', (id, valid) => {
    expect(isValidEgyptianNationalId(id)).toBe(valid);
  });
});

describe('saving the staff profile', () => {
  it.each([
    ['teacher', 'teaching'],
    ['nanny', 'teaching'],
    ['driver', 'driver'],
    ['cleaner', 'maintenance'],
    ['admin', 'admin'],
  ] as const)('a %s goes in the %s department', (position, department) => {
    expect(positionToDepartment(position)).toBe(department);
  });

  it('stores an intern as a temporary contract', () => {
    expect(employmentUiToDb('intern')).toBe('temporary');
    expect(employmentUiToDb('part_time')).toBe('part_time');
  });

  it('ends probation three months after the start date', () => {
    expect(calcProbationEnd('2026-10-14')).toBe('2027-01-14');
  });

  it('makes employee IDs like EMP-123456', () => {
    expect(generateEmployeeId()).toMatch(/^EMP-\d{6}$/);
  });
});
