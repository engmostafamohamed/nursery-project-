import { describe, expect, it } from 'vitest';

import { adminLinks } from './adminLinks';

describe('the admin’s class and staff links', () => {
  const links = adminLinks('/admin');
  const xo = adminLinks('/xo-admin/nursery');

  it('open a class on a tab, the first tab without ?tab', () => {
    expect(links.classPage('c1')).toBe('/admin/classes/c1');
    expect(links.classPage('c1', 'children')).toBe('/admin/classes/c1');
    expect(links.classPage('c1', 'team')).toBe('/admin/classes/c1?tab=team');
    expect(xo.classEdit('c1')).toBe('/xo-admin/nursery/classes/c1/edit');
  });

  it('open the Teams tab, with one class’s team when given', () => {
    expect(links.teams()).toBe('/admin/classes/teams');
    expect(links.teams(null)).toBe('/admin/classes/teams');
    expect(links.teams('c1')).toBe('/admin/classes/teams?edit=c1');
  });

  it('open a member of staff on a tab', () => {
    expect(links.staffPage('u1')).toBe('/admin/staff/u1');
    expect(links.staffPage('u1', 'personal')).toBe('/admin/staff/u1');
    expect(links.staffPage('u1', 'absences')).toBe('/admin/staff/u1?tab=absences');
    expect(links.staffAbsences).toBe('/admin/staff/absences');
  });
});
