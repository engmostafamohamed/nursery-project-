// Module 1 · Admissions & enrollment — the public parent sign-up form and its admin-edited templates.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { parentSignUpDefaults } from './parentSignUpDefaults';
import { emptyParentSignUpFiles } from './parentSignUpFiles';
import { parentSignUpBaseSchema, validateCrossFieldRules, type ParentSignUpFormValues } from './parentSignUpValidation';
import {
  buildRegistrationAnswers,
  deriveStepOrder,
  KNOWN_FIELD_KEYS_BY_STEP,
  moveQuestionInStep,
  moveStepOrder,
  normalizeRegistrationTemplate,
  REGISTRATION_TEMPLATE_STEPS,
  type RegistrationTemplateQuestion,
} from './registrationTemplates';
import {
  nurseryArrivalTime,
  nurseryDepartments,
  nurseryLeadSources,
  nurseryWorkingDayKeys,
  toTimeInputValue,
  type SignupNursery,
} from './signupNurseries';

/** A complete sign-up as of 14 Oct 2026. Override fields to break one rule at a time. */
function signUp(overrides: Partial<ParentSignUpFormValues> = {}): ParentSignUpFormValues {
  return {
    ...parentSignUpDefaults,
    nurseryId: 'n1',
    childFirstName: 'Adam',
    childDob: '2023-05-10',
    fatherFullName: 'Ali Hassan',
    fatherMobile: '01012345678',
    username: 'ali.hassan',
    password: 'longpassword',
    agreeHealthPolicy: true,
    agreeFinancialAgreement: true,
    agreePolicies: true,
    agreeInfoAccuracy: true,
    ...overrides,
  };
}

/** The translation key of the first schema issue on each field, by field path. */
function issues(values: ParentSignUpFormValues): Record<string, string> {
  const result = parentSignUpBaseSchema.safeParse(values);
  const byPath: Record<string, string> = {};
  for (const issue of result.error?.issues ?? []) {
    byPath[issue.path.join('.')] ??= issue.message;
  }
  return byPath;
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-10-14T09:00:00Z'));
});
afterEach(() => {
  vi.useRealTimers();
});

describe('sign-up field rules', () => {
  it('accepts a complete sign-up', () => {
    expect(issues(signUp())).toEqual({});
    expect(validateCrossFieldRules(signUp())).toBeNull();
  });

  it('needs an Egyptian mobile made of digits', () => {
    expect(issues(signUp({ fatherMobile: '0101234567x' }))).toEqual({ fatherMobile: 'signup.phoneDigitsOnly' });
    expect(issues(signUp({ fatherMobile: '01312345678' }))).toEqual({ fatherMobile: 'signup.invalidPhone' });
    expect(issues(signUp({ motherMobile: '01512345678' }))).toEqual({});
  });

  it('checks an email only when one is given', () => {
    expect(issues(signUp({ fatherEmail: 'ali@' }))).toEqual({ fatherEmail: 'signup.invalidEmail' });
    expect(issues(signUp({ fatherEmail: '' }))).toEqual({});
  });

  it('accepts children aged 3 months to 6 years', () => {
    expect(issues(signUp({ childDob: '2026-08-01' }))).toEqual({ childDob: 'signup.childAgeRange' });
    expect(issues(signUp({ childDob: '2019-01-01' }))).toEqual({ childDob: 'signup.childAgeRange' });
    expect(issues(signUp({ childDob: '2023-13-01' })).childDob).toBe('signup.invalidDate');
  });

  it('checks the username and password format', () => {
    expect(issues(signUp({ username: 'ab' }))).toEqual({ username: 'signup.usernameInvalid' });
    expect(issues(signUp({ username: 'ali hassan' }))).toEqual({ username: 'signup.usernameInvalid' });
    expect(issues(signUp({ password: 'short' }))).toEqual({ password: 'signup.passwordTooShort' });
  });

  it('needs a whole emergency contact once one field is filled', () => {
    const contacts = [
      { name: 'Sara', phone: '', relationship: '' },
      { name: '', phone: '', relationship: '' },
    ];
    expect(issues(signUp({ emergencyContacts: contacts }))).toEqual({
      'emergencyContacts.0.phone': 'signup.requiredField',
      'emergencyContacts.0.relationship': 'signup.requiredField',
    });
  });

  it('keeps nap answers to the listed choices', () => {
    expect(issues(signUp({ napTimePreference: 'Maybe' }))).toEqual({ napTimePreference: 'signup.requiredField' });
    expect(issues(signUp({ maxNapTime: '6' }))).toEqual({ maxNapTime: 'signup.maxNapTimeRange' });
    expect(issues(signUp({ napTimePreference: 'Yes', maxNapTime: '1.5' }))).toEqual({});
  });

  it('only accepts known medicines in the medication consents', () => {
    expect(issues(signUp({ medicationConsents: ['panadol'] }))).toEqual({});
    expect(Object.keys(issues(signUp({ medicationConsents: ['aspirin' as never] })))).toEqual(['medicationConsents.0']);
  });
});

describe('sign-up rules across fields', () => {
  it.each([
    [{ username: 'x' }, 'usernameInvalid'],
    [{ password: '1234567' }, 'passwordTooShort'],
    [{ fatherFullName: '', motherFullName: '' }, 'atLeastOneParentRequired'],
    [{ fatherMobile: '' }, 'fatherMobileRequired'],
    [{ motherFullName: 'Mona', motherMobile: '' }, 'motherMobileRequired'],
    [{ agreePolicies: false }, 'allConsentsRequired'],
  ] as const)('%o fails with %s', (overrides, error) => {
    expect(validateCrossFieldRules(signUp(overrides))).toBe(error);
  });

  it('accepts a mother-only sign-up', () => {
    expect(validateCrossFieldRules(signUp({ fatherFullName: '', fatherMobile: '', motherFullName: 'Mona', motherMobile: '01112345678' }))).toBeNull();
  });

  it('can skip the consent check before the last step', () => {
    expect(validateCrossFieldRules(signUp({ agreePolicies: false }), { checkConsents: false })).toBeNull();
  });
});

describe('registration templates', () => {
  const question = (id: string, step: RegistrationTemplateQuestion['step'], fieldKey?: string): RegistrationTemplateQuestion => ({
    id,
    step,
    fieldKey,
    label: id,
    type: 'short_text',
    required: false,
    active: true,
  });
  const questions = [question('a', 'parents'), question('b', 'child'), question('c', 'parents'), question('d', 'child')];

  it('orders steps by their first question, then adds the missing steps', () => {
    const order = deriveStepOrder(questions);
    expect(order.slice(0, 2)).toEqual(['parents', 'child']);
    expect([...order].sort()).toEqual([...REGISTRATION_TEMPLATE_STEPS].sort());
  });

  it('moves a question within its own step only', () => {
    expect(moveQuestionInStep(questions, 'c', 'up').map((q) => q.id)).toEqual(['c', 'b', 'a', 'd']);
    // Already first in its step: nothing changes.
    expect(moveQuestionInStep(questions, 'a', 'up')).toBe(questions);
    expect(moveQuestionInStep(questions, 'missing', 'down')).toBe(questions);
  });

  it('moves a whole step and keeps its questions together', () => {
    expect(moveStepOrder(questions, 'child', 'up').map((q) => q.id)).toEqual(['b', 'd', 'a', 'c']);
    expect(moveStepOrder(questions, 'parents', 'up')).toBe(questions);
  });

  it('reads a stored template, or nothing without an id', () => {
    expect(normalizeRegistrationTemplate({ id: 't1', version: '3', questions: [questions[0], null], steps: { child: { hidden: true } } })).toEqual({
      id: 't1',
      name: 'Parent Registration',
      version: 3,
      questions: [questions[0]],
      stepsMeta: { child: { hidden: true } },
    });
    expect(normalizeRegistrationTemplate({ name: 'No id' })).toBeNull();
    expect(normalizeRegistrationTemplate([])).toBeNull();
  });

  it('saves answers for active questions, and file details instead of files', () => {
    const template = normalizeRegistrationTemplate({
      id: 't1',
      questions: [
        question('first_name', 'child', 'childFirstName'),
        { ...question('nickname', 'child', 'childNickname'), active: false },
        question('photo', 'child', 'childPhoto'),
        question('no_field', 'child'),
      ],
    });
    const files = { ...emptyParentSignUpFiles(), childPhoto: new File(['x'], 'adam.jpg', { type: 'image/jpeg' }) };
    expect(buildRegistrationAnswers(template, signUp({ childNickname: 'Dodo' }), files)).toEqual({
      first_name: 'Adam',
      photo: { name: 'adam.jpg', type: 'image/jpeg', size: 1 },
    });
    expect(buildRegistrationAnswers(null, signUp(), files)).toEqual({});
  });

  it('knows which built-in fields each step holds', () => {
    expect(KNOWN_FIELD_KEYS_BY_STEP.child).toContain('nurseryId');
    expect(KNOWN_FIELD_KEYS_BY_STEP.parents).toEqual(expect.arrayContaining(['username', 'password']));
  });
});

describe('nursery options on the sign-up page', () => {
  const nursery = (overrides: Partial<SignupNursery>): SignupNursery => ({
    id: 'n1',
    name_en: 'XO',
    name_ar: 'إكس أو',
    city: null,
    opens_at: null,
    closes_at: null,
    working_days: null,
    language_pref: null,
    lead_sources: null,
    departments: null,
    standard_start_time: null,
    active_registration_template: null,
    ...overrides,
  });

  it('turns a database time into an HH:MM input value', () => {
    expect(toTimeInputValue('07:30:00')).toBe('07:30');
    expect(toTimeInputValue(null)).toBe('');
    expect(toTimeInputValue('soon')).toBe('');
  });

  it('pre-fills arrival from the opening time, else the standard start time', () => {
    expect(nurseryArrivalTime(nursery({ opens_at: '07:30:00', standard_start_time: '08:00:00' }))).toBe('07:30');
    expect(nurseryArrivalTime(nursery({ standard_start_time: '08:00:00' }))).toBe('08:00');
    expect(nurseryArrivalTime(null)).toBe('');
  });

  it('reads working days stored as names or numbers, in calendar order', () => {
    expect(nurseryWorkingDayKeys(nursery({ working_days: ['thu', '0', 'MON', 9, 'x'] }))).toEqual(['sun', 'mon', 'thu']);
    expect(nurseryWorkingDayKeys(nursery({ working_days: 'sun' }))).toEqual([]);
  });

  it('drops blank lead sources and departments', () => {
    expect(nurseryLeadSources(nursery({ lead_sources: [' Facebook ', '', 'Friend'] }))).toEqual(['Facebook', 'Friend']);
    expect(nurseryDepartments(nursery({ departments: ['Baby', ' '] }))).toEqual(['Baby']);
  });
});
