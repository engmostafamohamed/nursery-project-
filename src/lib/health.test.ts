// Module 2 · Child profiles & health — the admin health-alerts board and health notifications.
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { fakeDb } from '@/test/fakeSupabase';
import type {
  ChildAllergiesRow,
  ChildHealthRecordsRow,
  ChildMedicationsRow,
  ChildVaccinationsRow,
} from '@/types/tables/child_health';

import { ALLERGY_OPTIONS, allergyLabel } from './allergies';
import { computeHealthAlerts, todayYmdLocal } from './healthAlertsCompute';
import { fetchParentUserIdsForChild, notifyNurseryAdmins, notifyParentUsers } from './healthNotifications';

vi.mock('@/lib/supabase', () => import('@/test/fakeSupabase'));

const TODAY = '2026-10-14';

const adam = { id: 'c1', full_name_ar: 'آدم', full_name_en: 'Adam', class_id: 'k1' };
const lina = { id: 'c2', full_name_ar: 'لينا', full_name_en: 'Lina', class_id: null };
const classesById = new Map([['k1', { id: 'k1', name_ar: 'الفراشات', name_en: 'Butterflies' }]]);

/** A health record with an emergency contact and a pediatrician, so it raises no alerts. */
function record(childId: string, overrides: Partial<ChildHealthRecordsRow> = {}): ChildHealthRecordsRow {
  return {
    id: `r-${childId}`,
    child_id: childId,
    nursery_id: 'n1',
    blood_type: null,
    pediatrician_name: 'Dr. Hany',
    pediatrician_phone: null,
    pediatrician_clinic: null,
    emergency_contact_name: 'Sara',
    emergency_contact_phone: '01012345678',
    insurance_provider: null,
    insurance_policy_number: null,
    insurance_notes: null,
    medical_documents_json: null,
    created_at: '',
    updated_at: '',
    ...overrides,
  };
}

const medication = (id: string, childId: string, expiry: string | null) =>
  ({ id, child_id: childId, name: `Medicine ${id}`, expiry_date: expiry }) as ChildMedicationsRow;
const vaccination = (id: string, childId: string, nextDue: string | null) =>
  ({ id, child_id: childId, vaccine_name: `Vaccine ${id}`, next_due_date: nextDue }) as ChildVaccinationsRow;
const allergy = (id: string, childId: string, severity: ChildAllergiesRow['severity']) =>
  ({ id, child_id: childId, allergen_name: 'Peanuts', severity }) as ChildAllergiesRow;

function alerts(overrides: Partial<Parameters<typeof computeHealthAlerts>[0]> = {}) {
  return computeHealthAlerts({
    today: TODAY,
    children: [adam, lina],
    classesById,
    recordsByChildId: new Map([
      ['c1', record('c1')],
      ['c2', record('c2')],
    ]),
    medications: [],
    vaccinations: [],
    allergies: [],
    dismissedFingerprints: new Set(),
    ...overrides,
  });
}

describe('health alerts', () => {
  it('raises nothing when every record is complete', () => {
    expect(alerts()).toEqual([]);
  });

  it('flags a medicine that expired before today, not one that expires today', () => {
    const result = alerts({ medications: [medication('m1', 'c1', '2026-10-13'), medication('m2', 'c1', TODAY), medication('m3', 'c1', null)] });
    expect(result.map((a) => a.fingerprint)).toEqual(['med_expired:m1']);
    expect(result[0]).toMatchObject({ type: 'medication_expired', urgency: 'high', detailEn: 'Medicine m1', classNameEn: 'Butterflies' });
  });

  it('flags an overdue vaccination', () => {
    const result = alerts({ vaccinations: [vaccination('v1', 'c2', '2026-09-01'), vaccination('v2', 'c2', '2026-11-01')] });
    expect(result.map((a) => a.fingerprint)).toEqual(['vac_overdue:v1']);
    expect(result[0].classNameEn).toBe(''); // Lina has no class
  });

  it('flags severe and life-threatening allergies only', () => {
    const result = alerts({
      allergies: [allergy('a1', 'c1', 'mild'), allergy('a2', 'c1', 'moderate'), allergy('a3', 'c1', 'severe'), allergy('a4', 'c2', 'life_threatening')],
    });
    expect(result.map((a) => [a.fingerprint, a.urgency])).toEqual([
      ['allergy_lt:a4', 'critical'],
      ['allergy_severe:a3', 'high'],
    ]);
  });

  it('flags a missing emergency contact only when both name and phone are blank', () => {
    const records = new Map([
      ['c1', record('c1', { emergency_contact_name: ' ', emergency_contact_phone: null })],
      ['c2', record('c2', { emergency_contact_name: null })],
    ]);
    expect(alerts({ recordsByChildId: records }).map((a) => a.fingerprint)).toEqual(['miss_emergency:c1']);
  });

  it('treats a child with no health record as missing both contacts', () => {
    const result = alerts({ recordsByChildId: new Map([['c1', record('c1')]]) });
    expect(result.map((a) => a.fingerprint)).toEqual(['miss_emergency:c2', 'miss_pediatrician:c2']);
  });

  it('ignores rows for children outside the list', () => {
    expect(alerts({ medications: [medication('m1', 'someone-else', '2020-01-01')] })).toEqual([]);
  });

  it('hides alerts the admin dismissed', () => {
    const result = alerts({
      allergies: [allergy('a3', 'c1', 'severe')],
      dismissedFingerprints: new Set(['allergy_severe:a3']),
    });
    expect(result).toEqual([]);
  });

  it('sorts by urgency, then by child name', () => {
    const result = alerts({
      recordsByChildId: new Map(),
      medications: [medication('m1', 'c2', '2026-01-01'), medication('m2', 'c1', '2026-01-01')],
      allergies: [allergy('a1', 'c2', 'life_threatening')],
    });
    expect(result.map((a) => `${a.urgency}:${a.childNameEn}`)).toEqual([
      'critical:Lina',
      'high:Adam',
      'high:Lina',
      'medium:Adam',
      'medium:Adam',
      'medium:Lina',
      'medium:Lina',
    ]);
  });

  it('today is the local calendar day', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-13T22:30:00Z')); // 01:30 on the 14th in Cairo
    expect(todayYmdLocal()).toBe('2026-10-14');
    vi.useRealTimers();
  });
});

describe('allergy names', () => {
  it('shows the name in the reader’s language', () => {
    expect(allergyLabel('peanuts', false)).toBe('Peanuts');
    expect(allergyLabel('peanuts', true)).toBe('الفول السوداني');
  });

  it('shows a value typed by the parent as it is', () => {
    expect(allergyLabel('kiwi', false)).toBe('kiwi');
  });

  it('every option has a unique value and both languages', () => {
    const values = ALLERGY_OPTIONS.map((o) => o.value);
    expect(new Set(values).size).toBe(values.length);
    expect(values).toContain('other');
    for (const option of ALLERGY_OPTIONS) {
      expect(option.en.trim() && option.ar.trim(), option.value).toBeTruthy();
    }
  });
});

describe('health notifications', () => {
  beforeEach(() => {
    fakeDb.reset();
  });

  it('notifies each nursery admin once, from the template', async () => {
    fakeDb.setRows('users', [{ id: 'admin-1' }, { id: 'admin-2' }]);
    await notifyNurseryAdmins({ nurseryId: 'n1', type: 'child_health_update_request', params: { child: { en: 'Adam' } } });

    const [lookup] = fakeDb.queries;
    expect(lookup.filters).toEqual([
      ['eq', 'nursery_id', 'n1'],
      ['in', 'role', ['branch_admin', 'chain_super_admin']],
    ]);
    expect(fakeDb.inserted('notifications')).toEqual([
      expect.objectContaining({ user_id: 'admin-1', template_key: 'child_health_update_request', channel: 'push', read: false }),
      expect.objectContaining({ user_id: 'admin-2', template_params: { child: { en: 'Adam' } } }),
    ]);
  });

  it('writes nothing when the nursery has no admins', async () => {
    await notifyNurseryAdmins({ nurseryId: 'n1', type: 'x' });
    expect(fakeDb.inserted('notifications')).toEqual([]);
  });

  it('notifies each parent once, even when listed twice', async () => {
    await notifyParentUsers({ nurseryId: 'n1', parentUserIds: ['p1', 'p2', 'p1'], type: 'x', actionLink: '/parent' });
    expect(fakeDb.inserted('notifications').map((row) => (row as { user_id: string }).user_id)).toEqual(['p1', 'p2']);
  });

  it('passes a database error on to the caller', async () => {
    fakeDb.failTable('notifications', 'permission denied');
    await expect(notifyParentUsers({ nurseryId: 'n1', parentUserIds: ['p1'], type: 'x' })).rejects.toMatchObject({
      message: 'permission denied',
    });
  });

  it('finds the parents of a child', async () => {
    fakeDb.setRows('parent_children', [{ parent_id: 'p1' }, { parent_id: 'p2' }]);
    expect(await fetchParentUserIdsForChild('c1')).toEqual(['p1', 'p2']);
    expect(fakeDb.queries[0].filters).toEqual([['eq', 'child_id', 'c1']]);
  });
});
