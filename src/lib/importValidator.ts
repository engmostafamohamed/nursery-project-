import { childDateOfBirthBounds } from '@/lib/onboardingDateBounds';

export type ImportRow = {
  parent_name: string;
  parent_email: string;
  parent_phone: string;
  child_name: string;
  child_dob: string;
  child_gender?: string;
  class_name?: string;
  medical_conditions?: string;
  allergies?: string;
  address?: string;
};

export type ImportValidationResult = {
  validRows: ImportRow[];
  invalidRows: Array<{ row: ImportRow; errors: string[] }>;
};

const emailRe = /^\S+@\S+\.\S+$/;
/** Egyptian mobile on a 010 / 011 / 012 / 015 network, with +20, 0 or no prefix (process-import normalizes all three). */
const egPhone = /^(\+20|0)?1[0125][0-9]{8}$/;

function sanitizeText(value: string, max = 500) {
  return value.replace(/<[^>]*>/g, '').trim().slice(0, max);
}

/** Same age range as sign-up and the enrollment wizard: 3 months to 6 years old. */
function isEnrollableAge(dob: Date) {
  const { min, max } = childDateOfBirthBounds();
  const day = dob.toISOString().slice(0, 10);
  return day >= min && day <= max;
}

export function validateImportRows(rows: ImportRow[]): ImportValidationResult {
  const invalidRows: Array<{ row: ImportRow; errors: string[] }> = [];
  const validRows: ImportRow[] = [];
  const seenEmails = new Set<string>();

  for (const raw of rows) {
    const row: ImportRow = {
      ...raw,
      medical_conditions: sanitizeText(raw.medical_conditions ?? ''),
      allergies: sanitizeText(raw.allergies ?? ''),
      address: sanitizeText(raw.address ?? ''),
    };
    const errs: string[] = [];
    if (!row.parent_name || !row.parent_email || !row.parent_phone || !row.child_name || !row.child_dob) errs.push('missing_required');
    if (row.parent_email && !emailRe.test(row.parent_email)) errs.push('invalid_email');
    if (row.parent_phone && !egPhone.test(row.parent_phone)) errs.push('invalid_phone');
    const dob = new Date(row.child_dob);
    if (Number.isNaN(+dob)) errs.push('invalid_dob');
    else if (!isEnrollableAge(dob)) errs.push('age_out_of_range');
    const emailKey = row.parent_email.toLowerCase();
    if (seenEmails.has(emailKey)) errs.push('duplicate_email');
    seenEmails.add(emailKey);
    if (errs.length) invalidRows.push({ row, errors: errs });
    else validRows.push(row);
  }

  return { validRows, invalidRows };
}
