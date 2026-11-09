/*
 * A child's health profile as plain data and rules (no React, no network): what the page shows,
 * what needs attention, who to call, and the checks each form makes before it saves. The database
 * makes the same checks (save_child_health_overview, the allergy foods trigger).
 */
import { isFoodAllergen, type FoodAllergen } from '@/features/food-and-beverage/menu';
import { isValidInternationalMobile, normalizeInternationalMobile } from '@/lib/phoneValidation';

/** Where a link into the profile came from, so its back link returns there (e.g. the food alerts). */
export type HealthBackState = { from?: string; fromLabelKey?: string } | null;

export type HealthViewer = 'staff' | 'parent';

export const BLOOD_TYPES = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'] as const;
export type BloodType = (typeof BLOOD_TYPES)[number];
export const isBloodType = (value: unknown): value is BloodType => (BLOOD_TYPES as readonly unknown[]).includes(value);

/** Mildest first, the order the forms offer them in. */
export const ALLERGY_SEVERITIES = ['mild', 'moderate', 'severe', 'life_threatening'] as const;
export type AllergySeverity = (typeof ALLERGY_SEVERITIES)[number];
export const isAllergySeverity = (value: unknown): value is AllergySeverity => (ALLERGY_SEVERITIES as readonly unknown[]).includes(value);

export const MEDICATION_METHODS = ['oral', 'inhaler', 'injection', 'topical'] as const;
export type MedicationMethod = (typeof MEDICATION_METHODS)[number];
export const CONSENT_STATUSES = ['pending', 'granted', 'denied'] as const;
export type ConsentStatus = (typeof CONSENT_STATUSES)[number];

/** The vaccines offered by name (Egypt's schedule), and "other" for a name typed in. */
export const VACCINE_PRESETS = ['bcg', 'hepb', 'polio', 'dtp', 'hib', 'hepa', 'mmr', 'varicella', 'meningococcal', 'hpv', 'td', 'covid', 'other'] as const;
export type VaccinePreset = (typeof VACCINE_PRESETS)[number];

export const TEXT_MAX = 120;
export const NOTES_MAX = 1000;
/** A medicine or vaccination this many days away is flagged as coming up. */
export const SOON_DAYS = 30;

export type HealthChild = {
  id: string;
  nurseryId: string;
  nameAr: string;
  nameEn: string;
  avatarUrl: string | null;
  dob: string | null;
  gender: 'male' | 'female' | null;
  status: string | null;
  classNameAr: string | null;
  classNameEn: string | null;
  bloodType: BloodType | null;
};

export type HealthRecord = {
  pediatricianName: string | null;
  pediatricianPhone: string | null;
  pediatricianClinic: string | null;
  emergencyContactName: string | null;
  emergencyContactPhone: string | null;
  insuranceProvider: string | null;
  insurancePolicyNumber: string | null;
  insuranceNotes: string | null;
};

export type HealthParent = {
  nameAr: string;
  nameEn: string;
  phone: string | null;
  relationship: string | null;
  isPrimary: boolean;
  isEmergencyContact: boolean;
};

export type HealthContact = { name: string; phone: string | null; relationship: string | null };

/** What the parents wrote about the child's health when they enrolled. */
export type EnrollmentHealth = {
  hasAllergy: boolean | null;
  allergyTypes: string[];
  foodAllergies: string | null;
  allergyOtherDetails: string | null;
  hasMedicalCondition: boolean | null;
  medicalConditionDetails: string | null;
  healthNotes: string | null;
  medicationConsents: string[];
};

export type Allergy = {
  id: string;
  name: string;
  reaction: string | null;
  severity: AllergySeverity;
  treatment: string | null;
  lastReactionDate: string | null;
  foodAllergens: FoodAllergen[];
};

export type Condition = {
  id: string;
  name: string;
  diagnosisDate: string | null;
  severity: string | null;
  treatment: string | null;
  triggers: string | null;
  emergencyPlan: string | null;
};

export type DoseRecord = {
  id: string;
  /** The dose time it was for (HH:MM), or null for a when-needed dose. */
  scheduledTime: string | null;
  status: 'given' | 'skipped';
  skipReason: string | null;
  note: string | null;
  recordedAt: string;
  byAr: string;
  byEn: string;
};

export type Medication = {
  id: string;
  name: string;
  dosage: string | null;
  /** Instructions as written (e.g. "after lunch", "when wheezing"). */
  times: string | null;
  method: MedicationMethod;
  storage: string | null;
  expiryDate: string | null;
  consent: ConsentStatus;
  /** The times of day it is given (HH:MM, sorted); none: only when needed. */
  doseTimes: string[];
  startsOn: string | null;
  endsOn: string | null;
  dosesToday: DoseRecord[];
};

/** The most dose times a medicine may have in a day. */
export const MAX_DOSE_TIMES = 6;

export type Vaccination = {
  id: string;
  name: string;
  dose: number;
  givenOn: string | null;
  nextDue: string | null;
  givenBy: string | null;
  batch: string | null;
};

export type HealthDocument = { id: string; labelAr: string; labelEn: string; storagePath: string; createdAt: string };

export type ChildHealthProfile = {
  viewer: HealthViewer;
  canEdit: boolean;
  today: string;
  /** The nursery's time zone, for the times doses were recorded. */
  tz: string;
  child: HealthChild;
  record: HealthRecord;
  parents: HealthParent[];
  emergencyContacts: HealthContact[];
  medicalPickups: HealthContact[];
  enrollment: EnrollmentHealth;
  allergies: Allergy[];
  conditions: Condition[];
  medications: Medication[];
  vaccinations: Vaccination[];
  documents: HealthDocument[];
};

// -----------------------------------------------------------------------------------------------
// Dates

/** `date` plus `days`, as YYYY-MM-DD (calendar days, no time zone). */
export function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** A child's age in whole years and months on `today`, or null without a birth date. */
export function ageOn(dob: string | null, today: string): { years: number; months: number } | null {
  if (!dob || !/^\d{4}-\d{2}-\d{2}/.test(dob)) return null;
  const [by, bm, bd] = dob.slice(0, 10).split('-').map(Number);
  const [ty, tm, td] = today.slice(0, 10).split('-').map(Number);
  let months = (ty - by) * 12 + (tm - bm) - (td < bd ? 1 : 0);
  if (months < 0) months = 0;
  return { years: Math.floor(months / 12), months: months % 12 };
}

export type MedicationState = 'expired' | 'expiring' | 'ok' | 'no_date';
export function medicationState(medication: Pick<Medication, 'expiryDate'>, today: string): MedicationState {
  if (!medication.expiryDate) return 'no_date';
  if (medication.expiryDate < today) return 'expired';
  if (medication.expiryDate <= addDays(today, SOON_DAYS)) return 'expiring';
  return 'ok';
}

export type VaccinationState = 'overdue' | 'due_soon' | 'scheduled' | 'done';
export function vaccinationState(vaccination: Pick<Vaccination, 'nextDue'>, today: string): VaccinationState {
  if (!vaccination.nextDue) return 'done';
  if (vaccination.nextDue < today) return 'overdue';
  if (vaccination.nextDue <= addDays(today, SOON_DAYS)) return 'due_soon';
  return 'scheduled';
}

const MED_RANK: Record<MedicationState, number> = { expired: 0, expiring: 1, ok: 2, no_date: 3 };
const VAC_RANK: Record<VaccinationState, number> = { overdue: 0, due_soon: 1, scheduled: 2, done: 3 };

/** Medicines past or near their date first, then by name. */
export function sortMedications<T extends Pick<Medication, 'expiryDate' | 'name'>>(items: T[], today: string): T[] {
  return [...items].sort((a, b) => MED_RANK[medicationState(a, today)] - MED_RANK[medicationState(b, today)] || a.name.localeCompare(b.name));
}

/** Overdue and coming doses first (soonest first), then the rest as the database ordered them. */
export function sortVaccinations<T extends Pick<Vaccination, 'nextDue'>>(items: T[], today: string): T[] {
  return items
    .map((v, i) => ({ v, i }))
    .sort((a, b) => VAC_RANK[vaccinationState(a.v, today)] - VAC_RANK[vaccinationState(b.v, today)] || (a.v.nextDue ?? '').localeCompare(b.v.nextDue ?? '') || a.i - b.i)
    .map(({ v }) => v);
}

const SEVERITY_RANK: Record<AllergySeverity, number> = { life_threatening: 0, severe: 1, moderate: 2, mild: 3 };
/** The worst reaction among the allergies, or null without any. */
export function worstSeverity(allergies: Pick<Allergy, 'severity'>[]): AllergySeverity | null {
  return allergies.reduce<AllergySeverity | null>(
    (worst, a) => (worst === null || SEVERITY_RANK[a.severity] < SEVERITY_RANK[worst] ? a.severity : worst),
    null,
  );
}
export const severityTone = (severity: AllergySeverity): 'error' | 'warning' | 'neutral' =>
  severity === 'life_threatening' || severity === 'severe' ? 'error' : severity === 'moderate' ? 'warning' : 'neutral';

/** Whether an allergy is the one a link pointed at (case and spaces ignored). */
export function isSameAllergy(name: string, wanted: string | null | undefined): boolean {
  const norm = (s: string) => s.trim().replace(/\s+/g, ' ').toLowerCase();
  return Boolean(wanted?.trim()) && norm(name) === norm(wanted ?? '');
}

// -----------------------------------------------------------------------------------------------
// Who to call

export type CareTag = 'parent' | 'primary' | 'emergency' | 'medical' | 'nursery';
export type CarePerson = { key: string; nameAr: string; nameEn: string; phone: string | null; relationship: string | null; tags: CareTag[] };

const phoneKey = (phone: string | null) => (phone ?? '').replace(/\D/g, '').replace(/^(20|0)/, '');

/**
 * Everyone the nursery can call about the child, one card per person (matched by phone): the
 * emergency contacts first (parents marked so, the enrollment's, the one the nursery added), then
 * the other parents; the people allowed to authorise medical care are tagged.
 */
export function carePeople(profile: Pick<ChildHealthProfile, 'parents' | 'emergencyContacts' | 'record' | 'medicalPickups'>): CarePerson[] {
  const people: CarePerson[] = [];
  const add = (person: Omit<CarePerson, 'key'>) => {
    const key = phoneKey(person.phone);
    const same = key ? people.find((p) => phoneKey(p.phone) === key) : undefined;
    if (same) {
      for (const tag of person.tags) if (!same.tags.includes(tag)) same.tags.push(tag);
      return;
    }
    people.push({ ...person, key: key || `${person.nameEn || person.nameAr}-${people.length}` });
  };
  for (const p of profile.parents) {
    add({ nameAr: p.nameAr, nameEn: p.nameEn, phone: p.phone, relationship: p.relationship,
      tags: ['parent', ...(p.isPrimary ? (['primary'] as const) : []), ...(p.isEmergencyContact ? (['emergency'] as const) : [])] });
  }
  for (const c of profile.emergencyContacts) {
    if (c.name || c.phone) add({ nameAr: c.name, nameEn: c.name, phone: c.phone, relationship: c.relationship, tags: ['emergency'] });
  }
  if (profile.record.emergencyContactName || profile.record.emergencyContactPhone) {
    const name = profile.record.emergencyContactName ?? '';
    add({ nameAr: name, nameEn: name, phone: profile.record.emergencyContactPhone, relationship: null, tags: ['emergency', 'nursery'] });
  }
  for (const c of profile.medicalPickups) {
    add({ nameAr: c.name, nameEn: c.name, phone: c.phone, relationship: c.relationship, tags: ['medical'] });
  }
  const rank = (p: CarePerson) => (p.tags.includes('emergency') ? 0 : p.tags.includes('parent') ? 1 : 2);
  return people
    .map((p, i) => ({ p, i }))
    .sort((a, b) => rank(a.p) - rank(b.p) || Number(b.p.tags.includes('primary')) - Number(a.p.tags.includes('primary')) || a.i - b.i)
    .map(({ p }) => p);
}

// -----------------------------------------------------------------------------------------------
// What needs attention

export type HealthSection = 'allergies' | 'conditions' | 'medications' | 'vaccinations' | 'contacts';
export type AttentionItem = {
  key: string;
  kind:
    | 'life_threatening_allergy'
    | 'medication_expired'
    | 'medication_expiring'
    | 'consent_missing'
    | 'vaccination_overdue'
    | 'vaccination_due_soon'
    | 'no_emergency_contact'
    | 'no_pediatrician'
    | 'enrollment_allergy_unrecorded'
    | 'enrollment_condition_unrecorded';
  tone: 'error' | 'warning';
  section: HealthSection;
  /** What the text names: an allergy, a medicine, a vaccine, a date, or what the parents wrote. */
  subject?: string;
  date?: string;
};

/** The things to deal with, the most serious first. */
export function attentionItems(profile: ChildHealthProfile): AttentionItem[] {
  const { today } = profile;
  const items: AttentionItem[] = [];
  for (const a of profile.allergies) {
    if (a.severity === 'life_threatening') items.push({ key: `allergy-${a.id}`, kind: 'life_threatening_allergy', tone: 'error', section: 'allergies', subject: a.name });
  }
  for (const m of profile.medications) {
    const state = medicationState(m, today);
    if (state === 'expired') items.push({ key: `med-${m.id}`, kind: 'medication_expired', tone: 'error', section: 'medications', subject: m.name, date: m.expiryDate ?? undefined });
    else if (state === 'expiring') items.push({ key: `med-${m.id}`, kind: 'medication_expiring', tone: 'warning', section: 'medications', subject: m.name, date: m.expiryDate ?? undefined });
    if (m.consent !== 'granted') items.push({ key: `consent-${m.id}`, kind: 'consent_missing', tone: m.consent === 'denied' ? 'error' : 'warning', section: 'medications', subject: m.name });
  }
  for (const v of profile.vaccinations) {
    const state = vaccinationState(v, today);
    if (state === 'overdue') items.push({ key: `vac-${v.id}`, kind: 'vaccination_overdue', tone: 'error', section: 'vaccinations', subject: v.name, date: v.nextDue ?? undefined });
    else if (state === 'due_soon') items.push({ key: `vac-${v.id}`, kind: 'vaccination_due_soon', tone: 'warning', section: 'vaccinations', subject: v.name, date: v.nextDue ?? undefined });
  }
  if (!carePeople(profile).some((p) => p.tags.includes('emergency') && p.phone)) {
    items.push({ key: 'no-emergency', kind: 'no_emergency_contact', tone: 'error', section: 'contacts' });
  }
  if (!profile.record.pediatricianName?.trim()) {
    items.push({ key: 'no-pediatrician', kind: 'no_pediatrician', tone: 'warning', section: 'contacts' });
  }
  if (profile.viewer === 'staff') {
    const e = profile.enrollment;
    const allergyText = [e.foodAllergies, e.allergyOtherDetails].filter(Boolean).join(' · ');
    if (profile.allergies.length === 0 && (e.hasAllergy === true || e.allergyTypes.length > 0 || allergyText)) {
      items.push({ key: 'enrollment-allergy', kind: 'enrollment_allergy_unrecorded', tone: 'warning', section: 'allergies', subject: allergyText || undefined });
    }
    if (profile.conditions.length === 0 && (e.hasMedicalCondition === true || e.medicalConditionDetails)) {
      items.push({ key: 'enrollment-condition', kind: 'enrollment_condition_unrecorded', tone: 'warning', section: 'conditions', subject: e.medicalConditionDetails ?? undefined });
    }
  }
  return items.sort((a, b) => Number(a.tone === 'warning') - Number(b.tone === 'warning'));
}

// -----------------------------------------------------------------------------------------------
// Form checks (each returns the problems by field; an empty object means it can be saved)

type Issues<K extends string> = Partial<Record<K, string>>;
const tooLong = (value: string, max = TEXT_MAX) => value.trim().length > max;

export type OverviewDraft = {
  bloodType: string;
  pediatricianName: string;
  pediatricianPhone: string;
  pediatricianClinic: string;
  emergencyContactName: string;
  emergencyContactPhone: string;
  insuranceProvider: string;
  insurancePolicyNumber: string;
  insuranceNotes: string;
};
export type OverviewField = keyof OverviewDraft;

export function overviewDraft(profile: Pick<ChildHealthProfile, 'child' | 'record'>): OverviewDraft {
  const r = profile.record;
  return {
    bloodType: profile.child.bloodType ?? '',
    pediatricianName: r.pediatricianName ?? '',
    pediatricianPhone: r.pediatricianPhone ?? '',
    pediatricianClinic: r.pediatricianClinic ?? '',
    emergencyContactName: r.emergencyContactName ?? '',
    emergencyContactPhone: r.emergencyContactPhone ?? '',
    insuranceProvider: r.insuranceProvider ?? '',
    insurancePolicyNumber: r.insurancePolicyNumber ?? '',
    insuranceNotes: r.insuranceNotes ?? '',
  };
}

export function overviewIssues(d: OverviewDraft): Issues<OverviewField> {
  const issues: Issues<OverviewField> = {};
  if (d.bloodType && !isBloodType(d.bloodType)) issues.bloodType = 'blood_type_invalid';
  for (const field of ['pediatricianName', 'pediatricianClinic', 'emergencyContactName', 'insuranceProvider', 'insurancePolicyNumber'] as const) {
    if (tooLong(d[field])) issues[field] = 'too_long';
  }
  if (tooLong(d.insuranceNotes, NOTES_MAX)) issues.insuranceNotes = 'too_long';
  for (const field of ['pediatricianPhone', 'emergencyContactPhone'] as const) {
    if (d[field].trim() && !isValidInternationalMobile(d[field])) issues[field] = 'phone_invalid';
  }
  if (d.emergencyContactName.trim() && !d.emergencyContactPhone.trim()) issues.emergencyContactPhone = 'contact_phone_required';
  if (!d.emergencyContactName.trim() && d.emergencyContactPhone.trim() && !issues.emergencyContactPhone) issues.emergencyContactName = 'contact_name_required';
  return issues;
}

/** The overview as save_child_health_overview takes it: trimmed, phones as +digits, blanks empty. */
export function overviewPayload(d: OverviewDraft): Record<string, string> {
  const phone = (v: string) => (v.trim() ? normalizeInternationalMobile(v) : '');
  return {
    blood_type: d.bloodType,
    pediatrician_name: d.pediatricianName.trim(),
    pediatrician_phone: phone(d.pediatricianPhone),
    pediatrician_clinic: d.pediatricianClinic.trim(),
    emergency_contact_name: d.emergencyContactName.trim(),
    emergency_contact_phone: phone(d.emergencyContactPhone),
    insurance_provider: d.insuranceProvider.trim(),
    insurance_policy_number: d.insurancePolicyNumber.trim(),
    insurance_notes: d.insuranceNotes.trim(),
  };
}

export type AllergyDraft = { name: string; reaction: string; severity: AllergySeverity; treatment: string; lastReactionDate: string; foodAllergens: FoodAllergen[] };
export function allergyIssues(d: AllergyDraft, today: string): Issues<'name' | 'reaction' | 'treatment' | 'lastReactionDate'> {
  const issues: Issues<'name' | 'reaction' | 'treatment' | 'lastReactionDate'> = {};
  if (!d.name.trim()) issues.name = 'name_required';
  else if (tooLong(d.name)) issues.name = 'too_long';
  if (tooLong(d.reaction)) issues.reaction = 'too_long';
  if (tooLong(d.treatment, NOTES_MAX)) issues.treatment = 'too_long';
  if (d.lastReactionDate && d.lastReactionDate > today) issues.lastReactionDate = 'date_future';
  return issues;
}

export type ConditionDraft = { name: string; severity: string; diagnosisDate: string; treatment: string; triggers: string; emergencyPlan: string };
export function conditionIssues(d: ConditionDraft, today: string): Issues<keyof ConditionDraft> {
  const issues: Issues<keyof ConditionDraft> = {};
  if (!d.name.trim()) issues.name = 'name_required';
  else if (tooLong(d.name)) issues.name = 'too_long';
  if (tooLong(d.severity)) issues.severity = 'too_long';
  for (const field of ['treatment', 'triggers', 'emergencyPlan'] as const) if (tooLong(d[field], NOTES_MAX)) issues[field] = 'too_long';
  if (d.diagnosisDate && d.diagnosisDate > today) issues.diagnosisDate = 'date_future';
  return issues;
}

export type MedicationDraft = {
  name: string;
  dosage: string;
  times: string;
  method: MedicationMethod;
  storage: string;
  expiryDate: string;
  consent: ConsentStatus;
  doseTimes: string[];
  startsOn: string;
  endsOn: string;
};
export function medicationIssues(d: MedicationDraft): Issues<keyof MedicationDraft> {
  const issues: Issues<keyof MedicationDraft> = {};
  if (!d.name.trim()) issues.name = 'name_required';
  else if (tooLong(d.name)) issues.name = 'too_long';
  for (const field of ['dosage', 'times', 'storage'] as const) if (tooLong(d[field])) issues[field] = 'too_long';
  const times = d.doseTimes.filter(Boolean);
  if (times.length !== d.doseTimes.length || times.some((t) => !/^([01]\d|2[0-3]):[0-5]\d$/.test(t))) issues.doseTimes = 'time_invalid';
  else if (new Set(times).size !== times.length) issues.doseTimes = 'time_repeated';
  else if (times.length > MAX_DOSE_TIMES) issues.doseTimes = 'too_many_times';
  if (d.startsOn && d.endsOn && d.endsOn < d.startsOn) issues.endsOn = 'ends_before_start';
  return issues;
}

export type VaccinationDraft = { preset: VaccinePreset; customName: string; dose: string; givenOn: string; nextDue: string; givenBy: string; batch: string };
export function vaccinationIssues(d: VaccinationDraft, today: string): Issues<keyof VaccinationDraft> {
  const issues: Issues<keyof VaccinationDraft> = {};
  if (d.preset === 'other' && !d.customName.trim()) issues.customName = 'name_required';
  else if (d.preset === 'other' && tooLong(d.customName)) issues.customName = 'too_long';
  if (!/^\d{1,2}$/.test(d.dose.trim()) || Number(d.dose) < 1 || Number(d.dose) > 10) issues.dose = 'dose_invalid';
  if (d.givenOn && d.givenOn > today) issues.givenOn = 'date_future';
  if (d.nextDue && d.givenOn && d.nextDue <= d.givenOn) issues.nextDue = 'next_before_given';
  for (const field of ['givenBy', 'batch'] as const) if (tooLong(d[field])) issues[field] = 'too_long';
  return issues;
}

/** The preset a stored vaccine name was saved from (either language), or "other". */
export function vaccinePresetFor(name: string, labelsOf: (preset: VaccinePreset) => string[]): VaccinePreset {
  const wanted = name.trim().toLowerCase();
  return VACCINE_PRESETS.find((p) => p !== 'other' && labelsOf(p).some((l) => l.trim().toLowerCase() === wanted)) ?? 'other';
}

export const DOCUMENT_MAX_BYTES = 10 * 1024 * 1024;
export const DOCUMENT_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];

/** The problem with a document about to be uploaded, or null. */
export function documentIssue(name: string, file: File | null): { field: 'name' | 'file'; issue: string } | null {
  if (!name.trim()) return { field: 'name', issue: 'doc_name_required' };
  if (name.trim().length > TEXT_MAX) return { field: 'name', issue: 'too_long' };
  if (!file) return { field: 'file', issue: 'file_required' };
  if (!DOCUMENT_TYPES.includes(file.type)) return { field: 'file', issue: 'file_type' };
  if (file.size > DOCUMENT_MAX_BYTES) return { field: 'file', issue: 'file_size' };
  return null;
}

// -----------------------------------------------------------------------------------------------
// Reading the database's answer

const str = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v : null);
const text = (v: unknown): string => (typeof v === 'string' ? v : '');
const bool = (v: unknown): boolean | null => (typeof v === 'boolean' ? v : v === 'true' || v === 'yes' ? true : v === 'false' || v === 'no' ? false : null);
const list = (v: unknown): Record<string, unknown>[] => (Array.isArray(v) ? v.filter((x): x is Record<string, unknown> => Boolean(x) && typeof x === 'object') : []);
const strings = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string' && x.trim() !== '') : []);
const obj = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {});

/** get_child_health_profile's answer, checked and in the app's shape. */
export function toChildHealthProfile(raw: unknown): ChildHealthProfile {
  const r = obj(raw);
  const c = obj(r.child);
  const rec = obj(r.record);
  const e = obj(r.enrollment);
  const contact = (x: Record<string, unknown>): HealthContact => ({
    name: text(x.name).trim(),
    phone: str(x.phone),
    relationship: str(x.relationship) ?? str(x.relation),
  });
  return {
    viewer: r.viewer === 'parent' ? 'parent' : 'staff',
    canEdit: r.can_edit === true,
    today: typeof r.today === 'string' ? r.today.slice(0, 10) : new Date().toISOString().slice(0, 10),
    tz: typeof r.tz === 'string' && r.tz ? r.tz : 'Africa/Cairo',
    child: {
      id: text(c.id),
      nurseryId: text(c.nursery_id),
      nameAr: text(c.name_ar),
      nameEn: text(c.name_en),
      avatarUrl: str(c.avatar_url),
      dob: str(c.dob),
      gender: c.gender === 'male' || c.gender === 'female' ? c.gender : null,
      status: str(c.status),
      classNameAr: str(c.class_name_ar),
      classNameEn: str(c.class_name_en),
      bloodType: isBloodType(c.blood_type) ? c.blood_type : null,
    },
    record: {
      pediatricianName: str(rec.pediatrician_name),
      pediatricianPhone: str(rec.pediatrician_phone),
      pediatricianClinic: str(rec.pediatrician_clinic),
      emergencyContactName: str(rec.emergency_contact_name),
      emergencyContactPhone: str(rec.emergency_contact_phone),
      insuranceProvider: str(rec.insurance_provider),
      insurancePolicyNumber: str(rec.insurance_policy_number),
      insuranceNotes: str(rec.insurance_notes),
    },
    parents: list(r.parents).map((p) => ({
      nameAr: text(p.name_ar),
      nameEn: text(p.name_en),
      phone: str(p.phone),
      relationship: str(p.relationship),
      isPrimary: p.is_primary === true,
      isEmergencyContact: p.is_emergency_contact === true,
    })),
    emergencyContacts: list(r.emergency_contacts).map(contact).filter((x) => x.name || x.phone),
    medicalPickups: list(r.medical_pickups).map(contact),
    enrollment: {
      hasAllergy: bool(e.has_allergy),
      allergyTypes: strings(e.allergy_types).filter((t) => t !== 'other'),
      foodAllergies: str(e.food_allergies),
      allergyOtherDetails: str(e.allergy_other_details),
      hasMedicalCondition: bool(e.has_medical_condition),
      medicalConditionDetails: str(e.medical_condition_details),
      healthNotes: str(e.health_notes),
      medicationConsents: strings(e.medication_consents),
    },
    allergies: list(r.allergies).map((a) => ({
      id: text(a.id),
      name: text(a.allergen_name),
      reaction: str(a.reaction_type),
      severity: isAllergySeverity(a.severity) ? a.severity : 'severe',
      treatment: str(a.treatment_protocol),
      lastReactionDate: str(a.last_reaction_date),
      foodAllergens: strings(a.food_allergens).filter(isFoodAllergen),
    })),
    conditions: list(r.conditions).map((x) => ({
      id: text(x.id),
      name: text(x.condition_name),
      diagnosisDate: str(x.diagnosis_date),
      severity: str(x.severity),
      treatment: str(x.treatment_protocol),
      triggers: str(x.trigger_factors),
      emergencyPlan: str(x.emergency_response_plan),
    })),
    medications: list(r.medications).map((m) => ({
      id: text(m.id),
      name: text(m.name),
      dosage: str(m.dosage),
      times: str(m.administration_times),
      method: (MEDICATION_METHODS as readonly unknown[]).includes(m.administration_method) ? (m.administration_method as MedicationMethod) : 'oral',
      storage: str(m.storage_requirements),
      expiryDate: str(m.expiry_date),
      consent: (CONSENT_STATUSES as readonly unknown[]).includes(m.parent_consent_status) ? (m.parent_consent_status as ConsentStatus) : 'pending',
      doseTimes: strings(m.dose_times).map((t) => t.slice(0, 5)).sort(),
      startsOn: str(m.starts_on),
      endsOn: str(m.ends_on),
      dosesToday: list(m.doses_today).map((d) => ({
        id: text(d.id),
        scheduledTime: str(d.scheduled_time),
        status: d.status === 'skipped' ? 'skipped' : 'given',
        skipReason: str(d.skip_reason),
        note: str(d.note),
        recordedAt: text(d.recorded_at),
        byAr: text(d.by_ar),
        byEn: text(d.by_en),
      })),
    })),
    vaccinations: list(r.vaccinations).map((v) => ({
      id: text(v.id),
      name: text(v.vaccine_name),
      dose: Number(v.dose_number) || 1,
      givenOn: str(v.date_administered),
      nextDue: str(v.next_due_date),
      givenBy: str(v.administered_by),
      batch: str(v.batch_number),
    })),
    documents: list(r.documents).map((d) => ({
      id: text(d.id),
      labelAr: text(d.label_ar),
      labelEn: text(d.label_en),
      storagePath: text(d.storage_path),
      createdAt: text(d.created_at),
    })),
  };
}
