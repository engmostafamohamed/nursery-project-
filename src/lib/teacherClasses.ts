// The teacher's own classes and children (get_my_classes / get_my_class_children): today's numbers,
// the children table's filters, and which children a message to families goes to.

export type ClassPlace = 'lead' | 'assistant' | 'substitute';

export type MyClass = {
  class_id: string;
  name_ar: string | null;
  name_en: string | null;
  my_role: ClassPlace;
  children_count: number;
  team: Array<{ user_id: string; name_ar: string | null; name_en: string | null; role: ClassPlace }>;
};

export type ChildParent = {
  id: string;
  name_ar: string | null;
  name_en: string | null;
  phone: string | null;
  relationship: string | null;
  is_primary: boolean;
};

export type MyClassChild = {
  child_id: string;
  full_name_ar: string | null;
  full_name_en: string | null;
  child_code: string | null;
  avatar_url: string | null;
  class_id: string;
  class_name_ar: string | null;
  class_name_en: string | null;
  my_role: ClassPlace;
  day_status: 'in_nursery' | 'picked_up' | 'excused' | 'absent' | 'off' | 'not_enrolled';
  check_in: string | null;
  check_out: string | null;
  pickup_due_at: string | null;
  late_now: boolean;
  extra_hours: number;
  absence_reason: string | null;
  absence_note: string | null;
  parents: ChildParent[];
};

export type ClassDay = {
  children: number;
  here: number;
  pickedUp: number;
  absent: number;
  withNotice: number;
  inExtraNow: number;
};

/** Today in the teacher's classes (children not enrolled yet are left out). */
export function classDay(children: MyClassChild[]): ClassDay {
  const enrolled = children.filter((c) => c.day_status !== 'not_enrolled');
  return {
    children: enrolled.length,
    here: enrolled.filter((c) => c.day_status === 'in_nursery').length,
    pickedUp: enrolled.filter((c) => c.day_status === 'picked_up').length,
    absent: enrolled.filter((c) => c.day_status === 'absent' || c.day_status === 'excused').length,
    withNotice: enrolled.filter((c) => c.day_status === 'excused').length,
    inExtraNow: enrolled.filter((c) => c.late_now).length,
  };
}

export type ChildState = 'all' | 'here' | 'picked_up' | 'absent' | 'extra_now';

export function inState(child: MyClassChild, state: ChildState): boolean {
  switch (state) {
    case 'all':
      return child.day_status !== 'not_enrolled';
    case 'here':
      return child.day_status === 'in_nursery';
    case 'picked_up':
      return child.day_status === 'picked_up';
    case 'absent':
      return child.day_status === 'absent' || child.day_status === 'excused';
    case 'extra_now':
      return child.late_now;
  }
}

export type ChildrenFilters = { search: string; classId: string; state: ChildState };
export const NO_CHILDREN_FILTERS: ChildrenFilters = { search: '', classId: 'all', state: 'all' };

/** By the child's name or code or a parent's name or phone, by class, and by today's state. */
export function filterClassChildren(children: MyClassChild[], filters: ChildrenFilters): MyClassChild[] {
  const words = filters.search.trim().toLowerCase().split(/\s+/).filter(Boolean);
  return children.filter((child) => {
    if (filters.classId !== 'all' && child.class_id !== filters.classId) return false;
    if (!inState(child, filters.state)) return false;
    if (words.length) {
      const haystack = [
        child.full_name_ar,
        child.full_name_en,
        child.child_code,
        ...child.parents.flatMap((p) => [p.name_ar, p.name_en, p.phone]),
      ]
        .join(' ')
        .toLowerCase();
      if (!words.every((word) => haystack.includes(word))) return false;
    }
    return true;
  });
}

/** How the children of a message were chosen (stored with the message). */
export type FamilyAudience = 'child' | 'children' | 'class' | 'absent_today' | 'extra_hours_now';

/** The children a message's audience starts from; the teacher can then untick any. */
export function audienceChildren(children: MyClassChild[], audience: Exclude<FamilyAudience, 'child'>, classId: string): MyClassChild[] {
  const inClass = children.filter((c) => c.day_status !== 'not_enrolled' && (classId === 'all' || c.class_id === classId));
  if (audience === 'absent_today') return inClass.filter((c) => inState(c, 'absent'));
  if (audience === 'extra_hours_now') return inClass.filter((c) => c.late_now);
  return inClass;
}

/** The families a message reaches: every parent of each chosen child, once. */
export function familiesOf(children: MyClassChild[]): number {
  return new Set(children.flatMap((c) => c.parents.map((p) => p.id))).size;
}

/** The parent to talk to first: the primary one, else the first. */
export function mainParent(child: MyClassChild): ChildParent | null {
  return child.parents.find((p) => p.is_primary) ?? child.parents[0] ?? null;
}
