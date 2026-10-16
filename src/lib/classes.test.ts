// Module 3 · Classes & courses — who teaches each class (lead, backup, assistants), and placing a
// newly enrolled child in a class.
import { beforeEach, describe, expect, it, vi } from 'vitest';

import i18n from '@/lib/i18n';
import { fakeDb } from '@/test/fakeSupabase';
import type { ClassStaffRole } from '@/types/tables';

import {
  classStaffBadgeVariant,
  classStaffRoleKey,
  compareClassStaffRoles,
  groupClassStaff,
} from './classStaff';
import { activateEnrollment } from './enrollmentActivation';

vi.mock('@/lib/supabase', () => import('@/test/fakeSupabase'));

const ROLES: ClassStaffRole[] = ['lead', 'substitute', 'assistant'];

describe('class staff roles', () => {
  it('names each role in both languages', () => {
    for (const role of ROLES) {
      const key = classStaffRoleKey(role);
      expect(i18n.exists(key, { lng: 'en' }) && i18n.exists(key, { lng: 'ar' }), role).toBe(true);
    }
    expect(i18n.t(classStaffRoleKey('substitute'), { lng: 'en' })).toBe('Backup');
  });

  it('shows the lead, the backup and assistants with different badges', () => {
    expect(new Set(ROLES.map(classStaffBadgeVariant)).size).toBe(3);
    expect(classStaffBadgeVariant('lead')).toBe('default');
  });

  it('lists the lead first, then the backup, then assistants', () => {
    expect(['assistant', 'substitute', 'lead'].sort((a, b) => compareClassStaffRoles(a as ClassStaffRole, b as ClassStaffRole))).toEqual([
      'lead',
      'substitute',
      'assistant',
    ]);
  });
});

describe('groupClassStaff', () => {
  const people = new Map([
    ['u1', { name: 'Sara' }],
    ['u2', { name: 'Mona' }],
    ['u3', { name: 'Hoda' }],
    ['u4', { name: 'Laila' }],
  ]);

  it('splits a class into its lead, backup and assistants', () => {
    const staff = groupClassStaff(
      [
        { user_id: 'u3', role: 'assistant' },
        { user_id: 'u1', role: 'lead' },
        { user_id: 'u2', role: 'substitute' },
        { user_id: 'u4', role: 'assistant' },
      ],
      people,
    );
    expect(staff).toEqual({
      lead: { name: 'Sara' },
      substitute: { name: 'Mona' },
      assistants: [{ name: 'Hoda' }, { name: 'Laila' }],
    });
  });

  it('leaves a role empty when nobody has it', () => {
    expect(groupClassStaff([{ user_id: 'u1', role: 'lead' }], people)).toEqual({
      lead: { name: 'Sara' },
      substitute: null,
      assistants: [],
    });
  });

  it('skips staff whose details the viewer cannot read', () => {
    expect(
      groupClassStaff(
        [
          { user_id: 'hidden', role: 'substitute' },
          { user_id: 'hidden', role: 'assistant' },
        ],
        people,
      ),
    ).toEqual({ lead: null, substitute: null, assistants: [] });
  });
});

describe('enrolling a child', () => {
  beforeEach(() => {
    fakeDb.reset();
  });

  it('asks the server to put the child in the chosen class', async () => {
    fakeDb.setRpcResult('approve_application_enrollment', { childId: 'c1', parentId: 'p1', classId: 'k1' });
    const result = await activateEnrollment({ applicationId: 'a1', nurseryId: 'n1', classId: 'k1' });
    expect(result).toEqual({ childId: 'c1', parentId: 'p1', classId: 'k1' });
    expect(fakeDb.queries[0].payload).toEqual({
      p_application_id: 'a1',
      p_nursery_id: 'n1',
      p_auto_generate_first_invoice: true,
      p_class_id: 'k1',
    });
  });

  it('sends no class when none is chosen, so the child waits unassigned', async () => {
    fakeDb.setRpcResult('approve_application_enrollment', { childId: 'c1', parentId: 'p1' });
    const result = await activateEnrollment({ applicationId: 'a1', nurseryId: 'n1', classId: null });
    expect(result.classId).toBeNull();
    expect(fakeDb.queries[0].payload).not.toHaveProperty('p_class_id');
  });

  it('fails clearly when the server returns no child', async () => {
    fakeDb.setRpcResult('approve_application_enrollment', null);
    await expect(activateEnrollment({ applicationId: 'a1', nurseryId: 'n1' })).rejects.toThrow('did not return an active child');
  });

  it('passes a refused class on to the caller', async () => {
    fakeDb.failTable('approve_application_enrollment', 'enrollment_class_not_found');
    await expect(activateEnrollment({ applicationId: 'a1', nurseryId: 'n1', classId: 'gone' })).rejects.toMatchObject({
      message: 'enrollment_class_not_found',
    });
  });
});
