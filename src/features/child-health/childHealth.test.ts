import { describe, expect, it } from 'vitest';

import ar from '@/locales/ar.json';
import en from '@/locales/en.json';

import {
  ageOn,
  allergyIssues,
  attentionItems,
  carePeople,
  conditionIssues,
  documentIssue,
  isSameAllergy,
  medicationIssues,
  medicationState,
  overviewDraft,
  overviewIssues,
  overviewPayload,
  sortMedications,
  sortVaccinations,
  toChildHealthProfile,
  vaccinationIssues,
  vaccinationState,
  vaccinePresetFor,
  worstSeverity,
  type ChildHealthProfile,
} from './childHealth';
import { allergyRow, healthErrorKey, vaccinationRow } from './childHealthApi';

const today = '2026-11-09';

const profile = (patch: Partial<ChildHealthProfile> = {}): ChildHealthProfile => ({
  viewer: 'staff',
  canEdit: true,
  today,
  child: { id: 'c', nurseryId: 'n', nameAr: 'جنى', nameEn: 'Jana', avatarUrl: null, dob: '2023-11-24', gender: 'female', status: 'active', classNameAr: null, classNameEn: null, bloodType: 'B+' },
  record: { pediatricianName: 'Dr. Hany', pediatricianPhone: null, pediatricianClinic: null, emergencyContactName: null, emergencyContactPhone: null, insuranceProvider: null, insurancePolicyNumber: null, insuranceNotes: null },
  parents: [],
  emergencyContacts: [{ name: 'Mariam', phone: '+201033376233', relationship: 'mother' }],
  medicalPickups: [],
  enrollment: { hasAllergy: null, allergyTypes: [], foodAllergies: null, allergyOtherDetails: null, hasMedicalCondition: null, medicalConditionDetails: null, healthNotes: null, medicationConsents: [] },
  allergies: [],
  conditions: [],
  medications: [],
  vaccinations: [],
  documents: [],
  ...patch,
});

describe('dates', () => {
  it('reads the age in years and months', () => {
    expect(ageOn('2023-11-24', today)).toEqual({ years: 2, months: 11 });
    expect(ageOn('2023-11-09', today)).toEqual({ years: 3, months: 0 });
    expect(ageOn('2026-10-20', today)).toEqual({ years: 0, months: 0 });
    expect(ageOn(null, today)).toBeNull();
  });

  it('flags medicines and vaccinations by date', () => {
    expect(medicationState({ expiryDate: '2026-11-08' }, today)).toBe('expired');
    expect(medicationState({ expiryDate: '2026-12-09' }, today)).toBe('expiring');
    expect(medicationState({ expiryDate: '2026-12-10' }, today)).toBe('ok');
    expect(medicationState({ expiryDate: null }, today)).toBe('no_date');
    expect(vaccinationState({ nextDue: '2026-11-01' }, today)).toBe('overdue');
    expect(vaccinationState({ nextDue: '2026-11-20' }, today)).toBe('due_soon');
    expect(vaccinationState({ nextDue: '2027-03-01' }, today)).toBe('scheduled');
    expect(vaccinationState({ nextDue: null }, today)).toBe('done');
  });

  it('puts what is past or near its date first', () => {
    const meds = [
      { name: 'Zinc', expiryDate: null },
      { name: 'Vitamin D', expiryDate: '2027-05-01' },
      { name: 'Ventolin', expiryDate: '2026-11-01' },
      { name: 'Brufen', expiryDate: '2026-11-20' },
    ];
    expect(sortMedications(meds, today).map((m) => m.name)).toEqual(['Ventolin', 'Brufen', 'Vitamin D', 'Zinc']);
    const vacs = [{ id: 'polio', nextDue: null }, { id: 'mmr', nextDue: '2026-10-30' }, { id: 'hepa', nextDue: '2026-11-20' }, { id: 'dtp', nextDue: '2026-11-15' }];
    expect(sortVaccinations(vacs, today).map((v) => v.id)).toEqual(['mmr', 'dtp', 'hepa', 'polio']);
  });

  it('finds the worst allergy and the one a link points at', () => {
    expect(worstSeverity([{ severity: 'mild' }, { severity: 'severe' }, { severity: 'moderate' }])).toBe('severe');
    expect(worstSeverity([])).toBeNull();
    expect(isSameAllergy('Dust  mites', ' dust mites ')).toBe(true);
    expect(isSameAllergy('Dust mites', '')).toBe(false);
  });
});

describe('who to call', () => {
  it('lists each person once, emergency contacts first, with all they are to the child', () => {
    const people = carePeople({
      parents: [
        { nameAr: 'سامح', nameEn: 'Sameh', phone: '+201278758663', relationship: 'father', isPrimary: false, isEmergencyContact: false },
        { nameAr: 'مريم', nameEn: 'Mariam', phone: '+201033376233', relationship: 'mother', isPrimary: true, isEmergencyContact: true },
      ],
      emergencyContacts: [{ name: 'Mariam Hussein', phone: '01033376233', relationship: 'mother' }],
      record: { ...profile().record, emergencyContactName: 'Uncle Ali', emergencyContactPhone: '+201000000008' },
      medicalPickups: [{ name: 'Habiba', phone: '+201278758663', relationship: 'grandmother' }],
    });
    expect(people.map((p) => [p.nameEn, p.tags.join(',')])).toEqual([
      ['Mariam', 'parent,primary,emergency'],
      ['Uncle Ali', 'emergency,nursery'],
      ['Sameh', 'parent,medical'],
    ]);
  });
});

describe('what needs attention', () => {
  it('puts the serious things first and points at their part of the page', () => {
    const items = attentionItems(profile({
      record: { ...profile().record, pediatricianName: null },
      allergies: [{ id: 'a', name: 'Peanuts', reaction: null, severity: 'life_threatening', treatment: null, lastReactionDate: null, foodAllergens: ['peanuts'] }],
      medications: [{ id: 'm', name: 'Ventolin', dosage: null, times: null, method: 'inhaler', storage: null, expiryDate: '2026-11-01', consent: 'pending' }],
      vaccinations: [{ id: 'v', name: 'MMR', dose: 2, givenOn: null, nextDue: '2026-11-15', givenBy: null, batch: null }],
    }));
    expect(items.map((i) => `${i.kind}:${i.section}`)).toEqual([
      'life_threatening_allergy:allergies',
      'medication_expired:medications',
      'consent_missing:medications',
      'vaccination_due_soon:vaccinations',
      'no_pediatrician:contacts',
    ]);
  });

  it('asks for an emergency contact only when nobody with a phone is one', () => {
    expect(attentionItems(profile({ emergencyContacts: [] })).map((i) => i.kind)).toContain('no_emergency_contact');
    expect(attentionItems(profile()).map((i) => i.kind)).not.toContain('no_emergency_contact');
  });

  it('tells staff what the enrollment form mentions that is not recorded', () => {
    const enrollment = { ...profile().enrollment, foodAllergies: 'Strawberries', hasMedicalCondition: true };
    const kinds = (viewer: 'staff' | 'parent') => attentionItems(profile({ viewer, enrollment })).map((i) => `${i.kind}:${i.subject ?? ''}`);
    expect(kinds('staff')).toEqual(['enrollment_allergy_unrecorded:Strawberries', 'enrollment_condition_unrecorded:']);
    expect(kinds('parent')).toEqual([]);
  });
});

describe('forms', () => {
  it('check the overview as the database does', () => {
    const d = overviewDraft(profile());
    expect(d).toMatchObject({ bloodType: 'B+', pediatricianName: 'Dr. Hany', pediatricianPhone: '' });
    expect(overviewIssues(d)).toEqual({});
    expect(overviewIssues({ ...d, pediatricianPhone: '0100 12', emergencyContactName: 'Ali' })).toEqual({
      pediatricianPhone: 'phone_invalid', emergencyContactPhone: 'contact_phone_required',
    });
    expect(overviewIssues({ ...d, emergencyContactPhone: '01000000008' })).toEqual({ emergencyContactName: 'contact_name_required' });
    expect(overviewIssues({ ...d, bloodType: 'C+', insuranceNotes: 'x'.repeat(1001) })).toEqual({ bloodType: 'blood_type_invalid', insuranceNotes: 'too_long' });
    expect(overviewPayload({ ...d, pediatricianName: ' Dr. Hany ', pediatricianPhone: '0223 456 789', emergencyContactPhone: '' })).toMatchObject({
      pediatrician_name: 'Dr. Hany', pediatrician_phone: '+20223456789', emergency_contact_phone: '',
    });
  });

  it('check allergies, conditions, medicines and vaccinations', () => {
    expect(allergyIssues({ name: ' ', reaction: '', severity: 'mild', treatment: '', lastReactionDate: '2026-12-01', foodAllergens: [] }, today)).toEqual({ name: 'name_required', lastReactionDate: 'date_future' });
    expect(conditionIssues({ name: 'Asthma', severity: '', diagnosisDate: '', treatment: '', triggers: '', emergencyPlan: 'x'.repeat(1001) }, today)).toEqual({ emergencyPlan: 'too_long' });
    expect(medicationIssues({ name: '', dosage: '', times: '', method: 'oral', storage: '', expiryDate: '', consent: 'pending' })).toEqual({ name: 'name_required' });
    const vac = { preset: 'other' as const, customName: '', dose: '0', givenOn: '2026-11-01', nextDue: '2026-10-01', givenBy: '', batch: '' };
    expect(vaccinationIssues(vac, today)).toEqual({ customName: 'name_required', dose: 'dose_invalid', nextDue: 'next_before_given' });
    expect(vaccinationIssues({ ...vac, preset: 'mmr', dose: '2', nextDue: '2027-01-01' }, today)).toEqual({});
  });

  it('turn drafts into rows', () => {
    expect(allergyRow({ name: ' Chocolate ', reaction: '', severity: 'mild', treatment: ' Antihistamine ', lastReactionDate: '', foodAllergens: ['milk'] })).toEqual({
      allergen_name: 'Chocolate', reaction_type: null, severity: 'mild', treatment_protocol: 'Antihistamine', last_reaction_date: null, food_allergens: ['milk'],
    });
    expect(vaccinationRow({ preset: 'mmr', customName: '', dose: '2', givenOn: '', nextDue: '', givenBy: '', batch: '' }, 'MMR')).toMatchObject({ vaccine_name: 'MMR', dose_number: 2 });
  });

  it('find the vaccine a saved name came from, in either language', () => {
    const labels = (p: string) => [(en.health.mohVaccines as Record<string, string>)[p], (ar.health.mohVaccines as Record<string, string>)[p]];
    expect(vaccinePresetFor((ar.health.mohVaccines as Record<string, string>).mmr, labels)).toBe('mmr');
    expect(vaccinePresetFor('Rotavirus', labels)).toBe('other');
  });

  it('check a document before it is uploaded', () => {
    const pdf = new File(['x'], 'card.pdf', { type: 'application/pdf' });
    expect(documentIssue('', pdf)).toEqual({ field: 'name', issue: 'doc_name_required' });
    expect(documentIssue('Card', null)).toEqual({ field: 'file', issue: 'file_required' });
    expect(documentIssue('Card', new File(['x'], 'a.txt', { type: 'text/plain' }))).toEqual({ field: 'file', issue: 'file_type' });
    expect(documentIssue('Card', pdf)).toBeNull();
  });
});

describe('reading the database', () => {
  it('maps get_child_health_profile defensively', () => {
    const p = toChildHealthProfile({
      viewer: 'parent', can_edit: false, today: '2026-11-09',
      child: { id: 'c', nursery_id: 'n', name_ar: 'جنى', name_en: 'Jana', dob: '2023-11-24', gender: 'x', blood_type: 'Z' },
      record: { pediatrician_name: '  ' },
      emergency_contacts: [{ name: 'Mariam', phone: '+20100' }, { name: '', phone: null }, 'junk'],
      enrollment: { has_allergy: 'yes', allergy_types: ['eggs', 'other', 3], medication_consents: ['cetal'] },
      allergies: [{ id: 'a', allergen_name: 'Milk', severity: 'odd', food_allergens: ['milk', 'bogus'] }],
      medications: [{ id: 'm', name: 'X', administration_method: 'spray', parent_consent_status: 'granted' }],
    });
    expect(p.viewer).toBe('parent');
    expect(p.child).toMatchObject({ gender: null, bloodType: null });
    expect(p.record.pediatricianName).toBeNull();
    expect(p.emergencyContacts).toEqual([{ name: 'Mariam', phone: '+20100', relationship: null }]);
    expect(p.enrollment).toMatchObject({ hasAllergy: true, allergyTypes: ['eggs'], medicationConsents: ['cetal'] });
    expect(p.allergies[0]).toMatchObject({ severity: 'severe', foodAllergens: ['milk'] });
    expect(p.medications[0]).toMatchObject({ method: 'oral', consent: 'granted' });
    expect(p.parents).toEqual([]);
  });

  it('names what went wrong', () => {
    expect(healthErrorKey({ message: 'health_phone_invalid' })).toBe('health.profile.errors.phone_invalid');
    expect(healthErrorKey({ code: '42501', message: 'new row violates row-level security policy' })).toBe('health.profile.errors.forbidden');
    expect(healthErrorKey({ message: 'TypeError: Failed to fetch' })).toBe('health.profile.errors.network');
    expect(healthErrorKey(null)).toBe('health.profile.errors.failed');
  });
});

describe('texts', () => {
  it('exist in both languages for every kind the page shows', () => {
    const lookup = (dict: unknown, key: string) =>
      key.split('.').reduce<unknown>((node, part) => (node && typeof node === 'object' ? (node as Record<string, unknown>)[part] : undefined), dict);
    const keys = [
      ...['life_threatening_allergy', 'medication_expired', 'medication_expiring', 'consent_missing', 'vaccination_overdue', 'vaccination_due_soon',
        'no_emergency_contact', 'no_pediatrician', 'enrollment_allergy_unrecorded', 'enrollment_allergy_unrecorded_plain',
        'enrollment_condition_unrecorded', 'enrollment_condition_unrecorded_plain'].map((k) => `health.profile.attention.${k}`),
      ...['parent', 'primary', 'emergency', 'medical', 'nursery'].map((k) => `health.profile.contacts.tags.${k}`),
      ...['allergy', 'condition', 'medication', 'vaccination'].flatMap((k) => [`health.profile.saved.${k}`, `health.profile.deleted.${k}`]),
      'health.profile.saved.overview',
      ...['name_required', 'too_long', 'date_future', 'phone_invalid', 'contact_phone_required', 'contact_name_required', 'blood_type_invalid',
        'dose_invalid', 'next_before_given', 'doc_name_required', 'file_required', 'file_type', 'file_size', 'request_required'].map((k) => `health.profile.issues.${k}`),
      ...['forbidden', 'phone_invalid', 'contact_incomplete', 'blood_type_invalid', 'text_too_long', 'network', 'failed', 'title'].map((k) => `health.profile.errors.${k}`),
      ...['expired', 'expiring', 'ok'].map((k) => `health.profile.medication.${k}`),
      ...['pending', 'granted', 'denied'].map((k) => `health.profile.medication.consent.${k}`),
      ...['overdue', 'due_soon', 'scheduled', 'done'].map((k) => `health.profile.vaccination.${k}`),
      'health.profile.gender.male', 'health.profile.gender.female',
    ];
    for (const key of keys) {
      expect(typeof lookup(en, key), `en ${key}`).toBe('string');
      expect(typeof lookup(ar, key), `ar ${key}`).toBe('string');
    }
    for (const form of ['zero', 'one', 'two', 'few', 'many', 'other']) {
      for (const key of ['age.years', 'age.months', 'facts.expired', 'facts.overdue', 'facts.dueSoon']) {
        expect(typeof lookup(ar, `health.profile.${key}_${form}`), `ar ${key}_${form}`).toBe('string');
      }
    }
  });
});
