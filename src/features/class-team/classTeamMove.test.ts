import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { CLASS_TEAM_ROLES, classTeamErrorKey, coTeachers, lead, substitute, teamGaps, type TeamClass } from '@/lib/classTeam';
import { missingTexts, textKeysIn } from '@/test/localeKeys';

const src = path.resolve(__dirname, '../..');

const cls = (id: string, members: Array<[string, string]>): TeamClass =>
  ({
    id,
    name_ar: id,
    name_en: id,
    children_count: 0,
    capacity: null,
    room_number: null,
    members: members.map(([user_id, role]) => ({ user_id, role: role as TeamClass['members'][number]['role'] })),
  }) as TeamClass;

describe('the places in a class team', () => {
  it('are the lead, the co-teacher, the nanny and the backup', () => {
    expect(CLASS_TEAM_ROLES).toEqual(['lead', 'co_teacher', 'nanny', 'substitute']);
  });

  it('read the co-teachers apart from the lead and the backup', () => {
    const c = cls('b1', [['u1', 'lead'], ['u2', 'co_teacher'], ['u3', 'co_teacher'], ['u4', 'substitute'], ['u5', 'nanny']]);
    expect(lead(c)).toBe('u1');
    expect(substitute(c)).toBe('u4');
    expect(coTeachers(c)).toEqual(['u2', 'u3']);
  });

  it('name a class with no co-teacher as missing one', () => {
    expect(teamGaps(cls('b1', [['u1', 'lead']]))).toContain('no_co_teacher');
    expect(teamGaps(cls('b2', [['u1', 'lead'], ['u2', 'co_teacher']]))).not.toContain('no_co_teacher');
  });
});

describe('why a move can be refused', () => {
  it('names the class she is already in', () => {
    expect(classTeamErrorKey(new Error('class_team_same_class'))).toBe('same_class');
  });

  it('names a move across nurseries', () => {
    expect(classTeamErrorKey(new Error('class_team_other_nursery'))).toBe('other_nursery');
  });

  it('names someone who has already left that class', () => {
    expect(classTeamErrorKey(new Error('class_team_not_on_that_class'))).toBe('not_on_that_class');
  });

  it('falls back when the server says something else', () => {
    expect(classTeamErrorKey(new Error('boom'))).toBe('failed');
  });
});

describe('class team texts', () => {
  it('exist in English and Arabic', () => {
    expect(
      missingTexts(
        textKeysIn([
          path.join(src, 'features/class-team/MoveTeacherDialog.tsx'),
          path.join(src, 'features/class-team/ClassTeamCard.tsx'),
          path.join(src, 'features/class-team/useClassTeamEditing.ts'),
          path.join(src, 'pages/teacher/TeacherClassProfilePage.tsx'),
        ]),
      ),
    ).toEqual([]);
  });

  it('name every place a move can put someone in', () => {
    expect(missingTexts(CLASS_TEAM_ROLES.map((r) => `classTeam.roles.${r}`))).toEqual([]);
  });

  it('give the move refusals their words', () => {
    expect(
      missingTexts(['same_class', 'other_nursery', 'not_on_that_class'].map((c) => `classTeam.errors.${c}`)),
    ).toEqual([]);
  });

  it('give the notice a moved teacher receives its words', () => {
    expect(missingTexts(['notificationTemplates.class_team_moved.title', 'notificationTemplates.class_team_moved.body'])).toEqual([]);
  });
});
