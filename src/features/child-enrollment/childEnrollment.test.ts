// Module 1 · Admissions & enrollment — the admin's child enrollment wizard and the bulk CSV import.
import * as XLSX from 'xlsx';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createImportTemplateCsv, parseImportFile } from '@/lib/csvParser';
import { validateImportRows, type ImportRow } from '@/lib/importValidator';
import { isChildAgeValid, isStaffAgeValid, isValidIsoDate } from '@/lib/onboardingDateBounds';
import { isValidInternationalMobile, normalizeInternationalMobile } from '@/lib/phoneValidation';

import { defaultAllergyRow, getDefaultChildEnrollmentValues } from './childEnrollmentDefaults';
import { emptyChildEnrollmentFiles, type ChildEnrollmentFileBundle } from './childEnrollmentFiles';
import type { ChildEnrollmentFormValues, ExtraPickupRow } from './childEnrollmentTypes';
import { childEnrollmentFullSchema, validateChildStep } from './childEnrollmentValidation';

const pdf = () => new File(['%PDF'], 'doc.pdf', { type: 'application/pdf' });

/** A complete enrollment as of 14 Oct 2026. Override fields to break one rule at a time. */
function child(overrides: Partial<ChildEnrollmentFormValues> = {}): ChildEnrollmentFormValues {
  const defaults = getDefaultChildEnrollmentValues();
  return {
    ...defaults,
    fullNameAr: 'آدم علي',
    fullNameEn: 'Adam Ali',
    dob: '2023-05-10',
    gender: 'male',
    birthCertNumber: 'BC-1001',
    fatherName: 'Ali Hassan',
    fatherMobile: '01012345678',
    emergencyName: 'Sara Ali',
    emergencyMobile: '01112345678',
    consents: { ...defaults.consents, dataPrivacy: true },
    signatureName: 'Ali Hassan',
    ...overrides,
  };
}

function filesWith(overrides: Partial<ChildEnrollmentFileBundle> = {}): ChildEnrollmentFileBundle {
  return { ...emptyChildEnrollmentFiles(), birthCertificate: pdf(), vaccinationCard: pdf(), ...overrides };
}

function pickup(overrides: Partial<ExtraPickupRow> = {}): ExtraPickupRow {
  return {
    fullName: 'Uncle Omar',
    relationship: 'Uncle',
    nationalId: '29001011234567',
    mobile: '01212345678',
    validFrom: '',
    validUntil: '',
    canPickup: true,
    canDropoff: false,
    canMedical: false,
    ...overrides,
  };
}

/** Field paths with a schema issue. */
function issuePaths(values: ChildEnrollmentFormValues): string[] {
  const result = childEnrollmentFullSchema.safeParse(values);
  return [...new Set((result.error?.issues ?? []).map((issue) => issue.path.join('.')))].sort();
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-10-14T09:00:00Z'));
});
afterEach(() => {
  vi.useRealTimers();
});

describe('a complete enrollment', () => {
  it('passes the full check and every wizard step', () => {
    expect(issuePaths(child())).toEqual([]);
    for (let step = 0; step < 7; step += 1) {
      expect(validateChildStep(step, child(), filesWith()), `step ${step + 1}`).toBe(true);
    }
  });
});

describe('step 1 · the child', () => {
  it('needs the birth certificate file', () => {
    expect(validateChildStep(0, child(), filesWith({ birthCertificate: null }))).toBe(false);
  });

  it('needs the English name only when the nursery uses English', () => {
    expect(validateChildStep(0, child({ nurseryLanguagePref: 'ar', fullNameEn: '' }))).toBe(true);
    expect(validateChildStep(0, child({ nurseryLanguagePref: 'both', fullNameEn: '' }))).toBe(false);
  });

  it('accepts children aged 3 months to 6 years', () => {
    expect(validateChildStep(0, child({ dob: '2026-08-01' }))).toBe(false);
    expect(validateChildStep(0, child({ dob: '2020-10-01' }))).toBe(false);
    expect(issuePaths(child({ dob: '2020-10-01' }))).toEqual(['dob']);
  });

  it('needs a gender and a birth certificate number', () => {
    expect(validateChildStep(0, child({ gender: '' }))).toBe(false);
    expect(validateChildStep(0, child({ birthCertNumber: ' ' }))).toBe(false);
  });
});

describe('step 2 · health', () => {
  it('needs at least one allergy once "has allergies" is ticked', () => {
    expect(validateChildStep(1, child({ hasAllergies: true, allergies: [] }))).toBe(false);
    expect(issuePaths(child({ hasAllergies: true, allergies: [] }))).toEqual(['allergies']);
  });

  it('needs a name for an "other" allergen', () => {
    const other = { ...defaultAllergyRow(), allergenKey: 'other', allergenOther: '' };
    expect(validateChildStep(1, child({ hasAllergies: true, allergies: [other] }))).toBe(false);
    expect(validateChildStep(1, child({ hasAllergies: true, allergies: [{ ...other, allergenOther: 'Kiwi' }] }))).toBe(true);
  });

  it('needs a condition or medicine row once ticked', () => {
    expect(validateChildStep(1, child({ hasConditions: true }))).toBe(false);
    expect(validateChildStep(1, child({ hasMedications: true }))).toBe(false);
  });
});

describe('step 3 · family', () => {
  it('needs at least one parent mobile that works', () => {
    expect(validateChildStep(2, child({ fatherMobile: '', motherMobile: '01112345678' }))).toBe(true);
    expect(validateChildStep(2, child({ fatherMobile: '', motherMobile: '' }))).toBe(false);
    expect(issuePaths(child({ fatherMobile: '', motherMobile: '' }))).toEqual(['fatherMobile']);
  });

  it('flags each invalid mobile', () => {
    expect(issuePaths(child({ fatherMobile: '123', motherMobile: '01112345678' }))).toEqual(['fatherMobile']);
    expect(issuePaths(child({ fatherMobile: '123', motherMobile: '456' }))).toEqual(['fatherMobile', 'motherMobile']);
  });

  it('needs an emergency contact with a valid mobile', () => {
    expect(validateChildStep(2, child({ emergencyName: '' }))).toBe(false);
    expect(validateChildStep(2, child({ emergencyMobile: '12' }))).toBe(false);
  });
});

describe('step 4 · extra pickup people', () => {
  it('needs a 14-digit national ID and a mobile for each named person', () => {
    expect(validateChildStep(3, child({ extraPickups: [pickup()] }))).toBe(true);
    expect(validateChildStep(3, child({ extraPickups: [pickup({ nationalId: '123' })] }))).toBe(false);
    expect(validateChildStep(3, child({ extraPickups: [pickup({ mobile: '' })] }))).toBe(false);
    expect(issuePaths(child({ extraPickups: [pickup({ nationalId: '123', mobile: '' })] }))).toEqual([
      'extraPickups.0.mobile',
      'extraPickups.0.nationalId',
    ]);
  });

  it('skips an empty pickup card', () => {
    expect(validateChildStep(3, child({ extraPickups: [pickup({ fullName: '', nationalId: '', mobile: '' })] }))).toBe(true);
  });
});

describe('steps 6 and 7 · custody, consents and signature', () => {
  it('needs the court order file when custody is by court order', () => {
    expect(validateChildStep(5, child({ custodyStatus: 'court_order' }), filesWith())).toBe(false);
    expect(validateChildStep(5, child({ custodyStatus: 'court_order' }), filesWith({ courtOrder: pdf() }))).toBe(true);
  });

  it('needs the vaccination card, one consent and a signature', () => {
    const noConsents = getDefaultChildEnrollmentValues().consents;
    expect(validateChildStep(6, child(), filesWith({ vaccinationCard: null }))).toBe(false);
    expect(validateChildStep(6, child({ consents: noConsents }), filesWith())).toBe(false);
    expect(validateChildStep(6, child({ signatureName: '' }), filesWith())).toBe(false);
    expect(issuePaths(child({ consents: noConsents, signatureName: '' }))).toEqual(['consents', 'signatureName']);
  });
});

describe('bulk CSV import', () => {
  const row = (overrides: Partial<ImportRow> = {}): ImportRow => ({
    parent_name: 'Sara Ali',
    parent_email: 'sara@example.com',
    parent_phone: '01012345678',
    child_name: 'Adam Ali',
    child_dob: '2023-05-10',
    ...overrides,
  });
  const errorsOf = (r: ImportRow) => validateImportRows([r]).invalidRows[0]?.errors ?? [];

  it('accepts a complete row', () => {
    expect(validateImportRows([row()]).validRows).toHaveLength(1);
  });

  it('reports every problem in a row', () => {
    expect(errorsOf(row({ child_name: '' }))).toEqual(['missing_required']);
    expect(errorsOf(row({ parent_email: 'sara' }))).toEqual(['invalid_email']);
    expect(errorsOf(row({ child_dob: 'yesterday' }))).toEqual(['invalid_dob']);
    expect(errorsOf(row({ child_dob: '2026-09-01' }))).toEqual(['age_out_of_range']);
    expect(errorsOf(row({ child_dob: '2020-01-01' }))).toEqual(['age_out_of_range']);
  });

  it.each(['01012345678', '+201012345678', '01512345678'])('accepts the phone %s', (phone) => {
    expect(errorsOf(row({ parent_phone: phone }))).toEqual([]);
  });

  it.each(['01312345678', '0101234567', '0101234567890', '01,12345678'])('rejects the phone %s', (phone) => {
    expect(errorsOf(row({ parent_phone: phone }))).toEqual(['invalid_phone']);
  });

  it('accepts the same ages as sign-up and enrollment: 3 months to 6 years', () => {
    expect(errorsOf(row({ child_dob: '2026-07-14' }))).toEqual([]); // exactly 3 months
    expect(errorsOf(row({ child_dob: '2020-10-14' }))).toEqual([]); // exactly 6 years
    expect(errorsOf(row({ child_dob: '2026-07-15' }))).toEqual(['age_out_of_range']);
    expect(errorsOf(row({ child_dob: '2020-10-13' }))).toEqual(['age_out_of_range']);
  });

  it('rejects the same parent email twice, ignoring case', () => {
    const result = validateImportRows([row(), row({ parent_email: 'SARA@example.com', child_name: 'Lina' })]);
    expect(result.validRows).toHaveLength(1);
    expect(result.invalidRows[0].errors).toEqual(['duplicate_email']);
  });

  it('strips HTML from free text', () => {
    const [clean] = validateImportRows([row({ allergies: '<b>Peanuts</b>', address: ' <script>x</script>Cairo ' })]).validRows;
    expect(clean.allergies).toBe('Peanuts');
    expect(clean.address).toBe('xCairo');
  });

  it('reads a CSV file and normalises its headers', async () => {
    const file = new File(['Parent Name, Child DOB \n Sara , 2023-05-10 \n'], 'kids.csv', { type: 'text/csv' });
    expect(await parseImportFile(file)).toEqual({
      headers: ['parent_name', 'child_dob'],
      rows: [{ parent_name: 'Sara', child_dob: '2023-05-10' }],
    });
  });

  it('reads an Excel file the same way', async () => {
    const book = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet([['Parent Name', 'Child Name'], ['Sara', 'Adam']]), 'Kids');
    const bytes = XLSX.write(book, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer;
    const parsed = await parseImportFile(new File([bytes], 'kids.xlsx'));
    expect(parsed.rows).toEqual([{ parent_name: 'Sara', child_name: 'Adam' }]);
  });

  it('refuses other file types', async () => {
    await expect(parseImportFile(new File(['x'], 'kids.pdf'))).rejects.toThrow('Unsupported file type');
  });

  it('the download template has every column the importer needs', async () => {
    const parsed = await parseImportFile(new File([createImportTemplateCsv()], 'template.csv'));
    expect(parsed.headers).toEqual(expect.arrayContaining(['parent_name', 'parent_email', 'parent_phone', 'child_name', 'child_dob']));
  });

  it('the download template’s sample row passes the importer, today and in years to come', async () => {
    for (const today of ['2026-10-14T09:00:00Z', '2031-03-01T09:00:00Z']) {
      vi.setSystemTime(new Date(today));
      const parsed = await parseImportFile(new File([createImportTemplateCsv()], 'template.csv'));
      expect(validateImportRows(parsed.rows as ImportRow[]).invalidRows, today).toEqual([]);
    }
  });
});

describe('shared form checks', () => {
  it.each([
    ['01012345678', true],
    ['+201012345678', true],
    ['+44 7700 900123', true],
    ['1012345678', false],
    ['+1234', false],
    ['', false],
  ])('mobile %s is valid: %s', (mobile, valid) => {
    expect(isValidInternationalMobile(mobile)).toBe(valid);
  });

  it('stores mobiles in +country form, defaulting to Egypt', () => {
    expect(normalizeInternationalMobile('010 1234 5678')).toBe('+201012345678');
    expect(normalizeInternationalMobile('+44 7700-900123')).toBe('+447700900123');
    expect(normalizeInternationalMobile('1012345678')).toBe('');
  });

  it('rejects calendar dates that do not exist', () => {
    expect(isValidIsoDate('2028-02-29')).toBe(true);
    expect(isValidIsoDate('2026-02-29')).toBe(false);
    expect(isValidIsoDate('14/10/2026')).toBe(false);
  });

  it('applies the age ranges on the exact boundary days', () => {
    expect(isChildAgeValid('2026-07-14')).toBe(true); // exactly 3 months
    expect(isChildAgeValid('2026-07-15')).toBe(false);
    expect(isChildAgeValid('2020-10-14')).toBe(true); // exactly 6 years
    expect(isStaffAgeValid('2008-10-14')).toBe(true); // exactly 18
    expect(isStaffAgeValid('2008-10-15')).toBe(false);
  });
});
