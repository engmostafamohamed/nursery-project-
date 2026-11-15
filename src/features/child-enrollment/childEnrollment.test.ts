import { describe, expect, it } from 'vitest';

import {
  applicationStepOf,
  CLASS_STEP,
  DOCUMENTS_STEP,
  ENROLLMENT_STEP_ICONS,
  enrollmentPayload,
  enrollmentStepOf,
  enrollmentStepProblems,
  FAMILY_STEP,
  familyName,
  firstIncompleteStep,
  formsForFamily,
  missingDocuments,
  STEP_COUNT,
  type EnrollmentFamily,
} from './childEnrollment';

const family: EnrollmentFamily = {
  id: 'p1',
  name_ar: 'هاني عادل',
  name_en: 'Hany Adel',
  username: 'hany.adel',
  phone: '+201001234567',
  email: 'hany@example.com',
  children: [{ id: 'c1', name_ar: 'آدم', name_en: 'Adam', status: 'active' }],
  parent_info: {
    father: { full_name: 'Hany Adel', mobile: '01001234567', email: 'hany@example.com' },
    mother: { full_name: 'Mona Samir', mobile: '01117654321' },
    family: { address: '5 Nile St' },
  },
  emergency_contacts: [{ name: 'Grandma', phone: '01012341234', relationship: 'grandmother' }],
};
const pdf = (name: string) => new File(['x'], name, { type: 'application/pdf' });

describe('the admin adding a child, the way a family applies', () => {
  it('starts with the family, runs the application steps, then documents, review and class', () => {
    expect([STEP_COUNT, ENROLLMENT_STEP_ICONS.length]).toEqual([13, 13]);
    expect([applicationStepOf(FAMILY_STEP), applicationStepOf(2), applicationStepOf(10), applicationStepOf(DOCUMENTS_STEP), applicationStepOf(CLASS_STEP)]).toEqual([null, 1, 9, 10, null]);
    expect(enrollmentStepOf(3)).toBe(4); // a review section opens its step
  });

  it("copies the family's parents, address and last child's emergency contacts into the forms", () => {
    const { parentForm, childForm } = formsForFamily(family);
    expect([parentForm.father_full_name, parentForm.mother_full_name, parentForm.mother_mobile, parentForm.address]).toEqual(['Hany Adel', 'Mona Samir', '01117654321', '5 Nile St']);
    expect([childForm.emergency_1_name, childForm.first_name]).toEqual(['Grandma', '']);
  });

  it('asks for the family, the application answers and the required documents, step by step', () => {
    const { parentForm, childForm } = formsForFamily(family);
    expect(enrollmentStepProblems(FAMILY_STEP, null, parentForm, childForm, {})).toEqual({ family: 'childEnrollment.family.required' });
    expect(enrollmentStepProblems(FAMILY_STEP, family, parentForm, childForm, {})).toEqual({});
    expect(Object.keys(enrollmentStepProblems(4, family, parentForm, childForm, {}))).toEqual(expect.arrayContaining(['first_name', 'dob'])); // the child step
    expect(missingDocuments({ birth_certificate: pdf('b.pdf') })).toEqual(['vaccination_card', 'parent_id', 'proof_of_address']);
    expect(Object.keys(enrollmentStepProblems(DOCUMENTS_STEP, family, parentForm, childForm, {}))).toHaveLength(4);
    expect(firstIncompleteStep(null, parentForm, childForm, {})).toBe(FAMILY_STEP);
    expect(firstIncompleteStep(family, parentForm, childForm, {})).toBe(4); // the family's details are copied; the child's are next
  });

  it("sends the answers in the application's own format, and names the family in the reader's language", () => {
    const forms = formsForFamily(family);
    const { parentInfo, childInfo } = enrollmentPayload(family, forms.parentForm, { ...forms.childForm, first_name: 'Laila', last_name: 'Adel' });
    expect(parentInfo.mother).toMatchObject({ full_name: 'Mona Samir' });
    expect(childInfo).toMatchObject({ first_name: 'Laila', last_name: 'Adel', full_name: 'Laila Adel' });
    expect([familyName(family, true), familyName(family, false), familyName({ name_ar: null, name_en: null, username: 'x' }, true)]).toEqual(['هاني عادل', 'Hany Adel', 'x']);
  });
});
