// The teacher's classes: today's numbers, the children table's filters, a message's audiences, the
// class team page's numbers and filters, and how a message's sender is shown to parents.
import { describe, expect, it } from 'vitest';

import { candidatesFor, classTeamErrorKey, filterClasses, filterTeachers, teamSummary, type TeamClass, type TeamTeacher } from './classTeam';
import { familyMessageErrorKey, senderParts, type ParentFamilyMessage } from './familyMessages';
import {
  audienceChildren,
  classDay,
  familiesOf,
  filterClassChildren,
  mainParent,
  NO_CHILDREN_FILTERS,
  type MyClassChild,
} from './teacherClasses';

function kid(name: string, patch: Partial<MyClassChild> = {}): MyClassChild {
  return {
    child_id: name, full_name_ar: null, full_name_en: name, child_code: null, avatar_url: null,
    class_id: 'butterflies', class_name_ar: null, class_name_en: 'Butterflies', my_role: 'lead',
    day_status: 'absent', check_in: null, check_out: null, pickup_due_at: null, late_now: false, extra_hours: 0,
    absence_reason: null, absence_note: null, parents: [],
    ...patch,
  };
}

const mona = { id: 'mona', name_ar: 'منى', name_en: 'Mona', phone: '01011111111', relationship: 'mother', is_primary: true };
const karim = { id: 'karim', name_ar: 'كريم', name_en: 'Karim', phone: '01022222222', relationship: 'father', is_primary: false };

const children = [
  kid('Laila', { day_status: 'in_nursery', late_now: true, child_code: 'CH-2026-00007', parents: [karim, mona] }),
  kid('Omar', { day_status: 'excused', parents: [mona] }),
  kid('Adam', { day_status: 'picked_up', class_id: 'stars', class_name_en: 'Stars' }),
  kid('Zain', { day_status: 'absent', class_id: 'stars' }),
  kid('Sara', { day_status: 'not_enrolled' }),
];
const names = (rows: MyClassChild[]) => rows.map((c) => c.full_name_en);

describe("the teacher's day", () => {
  it('counts here, gone home, absent (with notice) and in extra hours now', () => {
    expect(classDay(children)).toEqual({ children: 4, here: 1, pickedUp: 1, absent: 2, withNotice: 1, inExtraNow: 1 });
  });

  it('filters the children by name, code, parent, class and state', () => {
    const list = (patch: Partial<typeof NO_CHILDREN_FILTERS>) => names(filterClassChildren(children, { ...NO_CHILDREN_FILTERS, ...patch }));
    expect(list({})).toEqual(['Laila', 'Omar', 'Adam', 'Zain']);
    expect(list({ search: '00007' })).toEqual(['Laila']);
    expect(list({ search: 'karim' })).toEqual(['Laila']);
    expect(list({ search: '0101111' })).toEqual(['Laila', 'Omar']);
    expect(list({ classId: 'stars' })).toEqual(['Adam', 'Zain']);
    expect(list({ state: 'absent' })).toEqual(['Omar', 'Zain']);
    expect(list({ state: 'extra_now' })).toEqual(['Laila']);
  });

  it("a message's audience: the class, today's absent children, the children in extra hours now", () => {
    expect(names(audienceChildren(children, 'class', 'butterflies'))).toEqual(['Laila', 'Omar']);
    expect(names(audienceChildren(children, 'absent_today', 'all'))).toEqual(['Omar', 'Zain']);
    expect(names(audienceChildren(children, 'extra_hours_now', 'all'))).toEqual(['Laila']);
    expect(familiesOf(children.slice(0, 2))).toBe(2);
    expect(mainParent(children[0])?.name_en).toBe('Mona');
  });
});

describe('the class team page', () => {
  const classes: TeamClass[] = [
    { id: 'b', name_ar: null, name_en: 'Butterflies', capacity: 20, room_number: null, children_count: 18, members: [{ user_id: 'nadia', role: 'lead' }] },
    { id: 's', name_ar: null, name_en: 'Stars', capacity: null, room_number: null, children_count: 9, members: [{ user_id: 'sara', role: 'assistant' }] },
  ];
  const teacher = (id: string, name: string, status = 'active'): TeamTeacher => ({
    id, name_ar: null, name_en: name, email: `${id}@x.test`, phone: null, role: 'teacher', role_title_ar: null, role_title_en: null,
    department: null, status, classes: classes.flatMap((c) => c.members.filter((m) => m.user_id === id).map((m) => ({ class_id: c.id, role: m.role }))),
  });
  const staff = [teacher('nadia', 'Nadia'), teacher('sara', 'Sara'), teacher('huda', 'Huda'), teacher('old', 'Old', 'inactive')];

  it('the numbers at the top', () => {
    expect(teamSummary({ classes, staff })).toEqual({ classes: 2, withoutLead: 1, withoutAssistant: 1, teachers: 3, teachersWithoutClass: 1 });
  });

  it('finds classes by name or team member, or those missing a lead; teachers by name or place', () => {
    expect(filterClasses(classes, staff, 'sara', 'all').map((c) => c.name_en)).toEqual(['Stars']);
    expect(filterClasses(classes, staff, '', 'no_lead').map((c) => c.name_en)).toEqual(['Stars']);
    expect(filterTeachers(staff, '', 'no_class').map((s) => s.name_en)).toEqual(['Huda', 'Old']);
    expect(filterTeachers(staff, '', 'lead').map((s) => s.name_en)).toEqual(['Nadia']);
  });

  it('offers active teachers not already in that place', () => {
    expect(candidatesFor(classes[0], staff, 'lead').map((s) => s.name_en)).toEqual(['Sara', 'Huda']);
  });

  it("names the server's refusals", () => {
    expect(classTeamErrorKey({ message: 'class_team_forbidden' })).toBe('forbidden');
    expect(classTeamErrorKey(new Error('boom'))).toBe('failed');
    expect(familyMessageErrorKey({ message: 'family_message_child_not_in_your_class' })).toBe('child_not_in_your_class');
    expect(familyMessageErrorKey({ message: 'chat_member_not_allowed' })).toBe('chat_member_not_allowed');
  });
});

describe('who sent a message', () => {
  it('name, role, title, department and classes in the reader language', () => {
    const message: ParentFamilyMessage = {
      message_id: 'm', created_at: '2026-10-25T08:00:00Z', body: 'Hi', audience: 'children',
      sender_name_ar: 'نادية', sender_name_en: 'Nadia', sender_role: 'teacher', sender_role_title_ar: 'رئيس المعلمين',
      sender_role_title_en: 'Head of teachers', sender_department: null, sender_class_names_ar: 'الفراشات',
      sender_class_names_en: 'Butterflies', sender_class_role: 'lead', children_ar: 'ليلى', children_en: 'Laila', read_at: null,
    };
    expect(senderParts(message, 'en')).toEqual({ name: 'Nadia', role: 'teacher', title: 'Head of teachers', department: null, classes: 'Butterflies', place: 'lead' });
    expect(senderParts(message, 'ar').title).toBe('رئيس المعلمين');
  });
});
