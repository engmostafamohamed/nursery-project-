// Class teams, the teacher's dashboard, messages to families and how parents read them: every text
// these screens show exists in English and Arabic, and so do the notifications the server sends.
import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import ar from './ar.json';
import en from './en.json';

const files = [
  '../pages/admin/settings/ClassTeamPage.tsx',
  '../pages/teacher/TeacherHomePage.tsx',
  '../pages/teacher/TeacherFamilyMessagesPage.tsx',
  '../components/family-messages/FamilyMessageView.tsx',
  '../components/parent/ParentFamilyMessagesCard.tsx',
  '../lib/familyMessageLabels.ts',
  '../pages/admin/AdminChatPage.tsx',
];

function lookup(dict: unknown, key: string): unknown {
  return key.split('.').reduce<unknown>((node, part) => (node && typeof node === 'object' ? (node as Record<string, unknown>)[part] : undefined), dict);
}

describe('class teams and messages to families', () => {
  it.each(files)('every key %s uses exists in English and Arabic', (file) => {
    const code = readFileSync(path.resolve(__dirname, file), 'utf8');
    const keys = [...new Set([...code.matchAll(/\bt\(\s*'([a-zA-Z0-9_.]+)'/g)].map((m) => m[1]))];
    expect(keys.length).toBeGreaterThan(0);
    const missing = keys.flatMap((key) => {
      const exists = (dict: unknown) => typeof lookup(dict, key) === 'string' || typeof lookup(dict, `${key}_other`) === 'string';
      return [...(exists(en) ? [] : [`en: ${key}`]), ...(exists(ar) ? [] : [`ar: ${key}`])];
    });
    expect(missing).toEqual([]);
  });

  it('the notifications the server sends have their words, with every value they use', () => {
    for (const dict of [en, ar]) {
      expect(lookup(dict, 'notificationTemplates.class_team_assigned.body')).toMatch(/\{\{role\}\}.*\{\{class\}\}|\{\{class\}\}.*\{\{role\}\}/);
      expect(lookup(dict, 'notificationTemplates.family_message.title')).toContain('{{sender}}');
      expect(lookup(dict, 'notificationTemplates.family_message.body')).toContain('{{preview}}');
      // The class place the assignment notice names (params.role = { i18n: 'classTeam.roles.<place>' }).
      for (const place of ['lead', 'assistant', 'substitute']) expect(typeof lookup(dict, `classTeam.roles.${place}`)).toBe('string');
    }
  });

  it('the permission, role and menu names', () => {
    for (const dict of [en, ar]) {
      for (const key of ['rbac.features.class_team', 'rbac.systemRoles.head_teacher', 'admin.nav.rbacTeam', 'teacher.nav.team', 'teacher.nav.familyMessages', 'parent.inbox.kinds.staff', 'parent.inbox.filters.staff']) {
        expect(typeof lookup(dict, key), key).toBe('string');
      }
    }
  });
});
