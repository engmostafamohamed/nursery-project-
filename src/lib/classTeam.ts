import { localName } from '@/lib/bilingualName';
// The Teams page (in the Classes section): each class's lead teacher, assistants, nannies and backup
// teacher, what each team is missing, every teacher with their role and classes, and the numbers at
// the top. Plain functions over what get_class_teams returns.

export type ClassTeamRole = 'lead' | 'assistant' | 'nanny' | 'substitute';
export const CLASS_TEAM_ROLES: ClassTeamRole[] = ['lead', 'assistant', 'nanny', 'substitute'];

export type TeamClass = {
  id: string;
  name_ar: string | null;
  name_en: string | null;
  capacity: number | null;
  room_number: string | null;
  children_count: number;
  members: Array<{ user_id: string; role: ClassTeamRole }>;
};

export type TeamTeacher = {
  id: string;
  name_ar: string | null;
  name_en: string | null;
  email: string | null;
  phone: string | null;
  role: string;
  role_title_ar: string | null;
  role_title_en: string | null;
  department: string | null;
  status: string;
  classes: Array<{ class_id: string; role: ClassTeamRole }>;
};

export type TeamChange = {
  id: string;
  class_id: string;
  user_id: string;
  action: 'assigned' | 'changed' | 'removed';
  role: ClassTeamRole | null;
  previous_role: ClassTeamRole | null;
  created_at: string;
  changed_by_ar: string | null;
  changed_by_en: string | null;
};

export type ClassTeams = { classes: TeamClass[]; staff: TeamTeacher[]; changes: TeamChange[]; can_update: boolean };

/** A name in the reader's language, falling back to the other one. */
export function pickName(row: { name_ar: string | null; name_en: string | null }, lang: string): string {
  return localName(row.name_ar, row.name_en, lang.startsWith('ar')) || '—';
}

export function lead(cls: TeamClass): string | null {
  return cls.members.find((m) => m.role === 'lead')?.user_id ?? null;
}
export function substitute(cls: TeamClass): string | null {
  return cls.members.find((m) => m.role === 'substitute')?.user_id ?? null;
}
export function assistants(cls: TeamClass): string[] {
  return cls.members.filter((m) => m.role === 'assistant').map((m) => m.user_id);
}
export function nannies(cls: TeamClass): string[] {
  return cls.members.filter((m) => m.role === 'nanny').map((m) => m.user_id);
}

export type TeamSummary = {
  classes: number;
  withoutLead: number;
  withoutBackup: number;
  withoutAssistant: number;
  withoutNanny: number;
  teachers: number;
  teachersWithoutClass: number;
};

export function teamSummary(data: Pick<ClassTeams, 'classes' | 'staff'>): TeamSummary {
  const active = data.staff.filter((s) => s.status === 'active');
  return {
    classes: data.classes.length,
    withoutLead: data.classes.filter((c) => !lead(c)).length,
    withoutBackup: data.classes.filter((c) => !substitute(c)).length,
    withoutAssistant: data.classes.filter((c) => assistants(c).length === 0).length,
    withoutNanny: data.classes.filter((c) => nannies(c).length === 0).length,
    teachers: active.length,
    teachersWithoutClass: active.filter((s) => s.classes.length === 0).length,
  };
}

export type ClassFilter = 'all' | 'attention' | 'no_lead' | 'no_backup' | 'no_assistant' | 'no_nanny' | 'complete';
export const CLASS_FILTERS: ClassFilter[] = ['all', 'attention', 'no_lead', 'no_backup', 'no_assistant', 'no_nanny', 'complete'];

/**
 * Classes whose name, or a team member's name, holds the search; optionally only those whose team
 * needs attention (anything missing), misses one place, or is complete.
 */
export function filterClasses(classes: TeamClass[], staff: TeamTeacher[], search: string, filter: ClassFilter): TeamClass[] {
  const q = search.trim().toLowerCase();
  const names = new Map(staff.map((s) => [s.id, `${s.name_ar ?? ''} ${s.name_en ?? ''}`.toLowerCase()]));
  return classes.filter((cls) => {
    if (filter !== 'all') {
      const gaps = teamGaps(cls);
      if (filter === 'attention' && gaps.length === 0) return false;
      if (filter === 'complete' && gaps.length > 0) return false;
      if (filter !== 'attention' && filter !== 'complete' && !gaps.includes(filter)) return false;
    }
    if (!q) return true;
    if (`${cls.name_ar ?? ''} ${cls.name_en ?? ''}`.toLowerCase().includes(q)) return true;
    return cls.members.some((m) => names.get(m.user_id)?.includes(q));
  });
}

export type TeacherFilter = 'all' | 'no_class' | 'lead' | 'assistant' | 'nanny' | 'substitute';

export function filterTeachers(staff: TeamTeacher[], search: string, filter: TeacherFilter): TeamTeacher[] {
  const q = search.trim().toLowerCase();
  return staff.filter((s) => {
    if (filter === 'no_class' && s.classes.length > 0) return false;
    if (filter !== 'all' && filter !== 'no_class' && !s.classes.some((c) => c.role === filter)) return false;
    if (!q) return true;
    return [s.name_ar, s.name_en, s.email, s.phone].join(' ').toLowerCase().includes(q);
  });
}

/** The teachers who can take a place in a class: active, and not already in that place. */
export function candidatesFor(cls: TeamClass, staff: TeamTeacher[], role: ClassTeamRole): TeamTeacher[] {
  return staff.filter((s) => s.status === 'active' && !cls.members.some((m) => m.user_id === s.id && m.role === role));
}

/** The server's refusal as a locale key under classTeam.errors (unknown ones fall back to `failed`). */
export function classTeamErrorKey(error: unknown): string {
  const message = String((error as { message?: unknown })?.message ?? error ?? '');
  const known = ['class_team_forbidden', 'class_team_not_a_teacher', 'class_team_teacher_inactive', 'class_team_class_not_found'];
  const hit = known.find((code) => message.includes(code));
  return hit ? hit.replace('class_team_', '') : 'failed';
}

export type TeamGap = 'no_lead' | 'no_backup' | 'no_assistant' | 'no_nanny';

/** What a class's team is missing, the most serious first. */
export function teamGaps(cls: TeamClass): TeamGap[] {
  const gaps: TeamGap[] = [];
  if (!lead(cls)) gaps.push('no_lead');
  if (!substitute(cls)) gaps.push('no_backup');
  if (assistants(cls).length === 0) gaps.push('no_assistant');
  if (nannies(cls).length === 0) gaps.push('no_nanny');
  return gaps;
}

export type TeamStatus = 'no_lead' | 'incomplete' | 'complete';

/** A team in one word: no lead teacher (cannot send daily reports), something else missing, or complete. */
export function teamStatus(cls: TeamClass): TeamStatus {
  const gaps = teamGaps(cls);
  if (gaps.includes('no_lead')) return 'no_lead';
  return gaps.length ? 'incomplete' : 'complete';
}

/** Teams that need attention first. */
export const TEAM_STATUS_RANK: Record<TeamStatus, number> = { no_lead: 0, incomplete: 1, complete: 2 };
/** The classes that need attention first, then by name. */
export function sortByTeamStatus(classes: TeamClass[]): TeamClass[] {
  return [...classes].sort((a, b) => TEAM_STATUS_RANK[teamStatus(a)] - TEAM_STATUS_RANK[teamStatus(b)] || (a.name_en ?? '').localeCompare(b.name_en ?? ''));
}

/** How many other classes someone already leads (a lead of several classes is worth a second look). */
export function otherClassesLed(teacher: Pick<TeamTeacher, 'classes'> | undefined, classId: string): number {
  return teacher ? teacher.classes.filter((c) => c.role === 'lead' && c.class_id !== classId).length : 0;
}
