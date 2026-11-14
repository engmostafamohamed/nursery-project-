// The addresses of the admin's class, staff and discount pages, written once: the tabs they open (?tab=…) and
// the team a link opens on the Teams page (?edit=…). `base` is /admin, or /xo-admin/nursery when
// XO staff open a nursery (useAdminBasePath).

import type { ClassProfileTab } from '@/features/classes/classProfile';

/** A member of staff's page's tabs, in order (the first is the page without ?tab). */
export const STAFF_TABS = ['personal', 'classes', 'schedule', 'attendance', 'absences', 'tasks', 'documents', 'payroll'] as const;
export type StaffTab = (typeof STAFF_TABS)[number];

const withTab = (path: string, tab: string | undefined, first: string) => (tab && tab !== first ? `${path}?tab=${tab}` : path);

export function adminLinks(base: string) {
  return {
    classes: `${base}/classes`,
    newClass: `${base}/classes/new`,
    /** A class's page, on one of its tabs (children when none). */
    classPage: (classId: string, tab?: ClassProfileTab) => withTab(`${base}/classes/${classId}`, tab, 'children'),
    classEdit: (classId: string) => `${base}/classes/${classId}/edit`,
    classAnnouncements: (classId: string) => `${base}/classes/${classId}/announcements`,
    /** The Teams tab of Classes, with one class's team open when given. */
    teams: (classId?: string | null) => (classId ? `${base}/classes/teams?edit=${classId}` : `${base}/classes/teams`),
    /** A member of staff's page (by their account or HR record), on one of its tabs. */
    staffPage: (staffId: string, tab?: StaffTab) => withTab(`${base}/staff/${staffId}`, tab, 'personal'),
    staffAbsences: `${base}/staff/absences`,
    deals: `${base}/deals`,
    partnerships: `${base}/deals/partners`,
    /** A partner's page: its offer and the families who have it. */
    partnerPage: (partnerId: string) => `${base}/deals/partners/${partnerId}`,
  };
}

export type AdminLinks = ReturnType<typeof adminLinks>;
