/**
 * Who can DM whom. Bound to working relationships at the nursery; nothing else.
 *
 * - Parent ↔ teacher of their child's class
 * - Parent ↔ branch admin of their nursery
 * - Teacher ↔ parents of children in their classes
 * - Teacher ↔ teacher (same nursery)
 * - Teacher ↔ branch admin (same nursery)
 * - Branch admin ↔ anyone in their nursery
 * - Branch admin ↔ chain admin (their chain)
 * - Chain admin ↔ anyone in their chain (admin/teacher/parent)
 * - XO super admin: read-only oversight; never initiator
 */

export type ChatRole = 'parent' | 'teacher' | 'branch_admin' | 'chain_super_admin' | 'xo_super_admin';

export type ChatActor = {
  id: string;
  role: ChatRole;
  nursery_id: string | null;
  chain_id: string | null;
  /** For teachers: ids of classes they staff. */
  classIds?: string[];
  /** For parents: ids of classes their children are in. */
  childClassIds?: string[];
};

/**
 * Can `from` initiate or reply to a thread with `to`? Symmetrical for the v1
 * design — if A can chat with B, B can chat with A. (XO admin reads only via
 * a separate oversight surface, not by being a participant.)
 */
export function canChatWith(from: ChatActor, to: ChatActor): boolean {
  if (from.id === to.id) return false;
  if (from.role === 'xo_super_admin' || to.role === 'xo_super_admin') return false;

  // Chain admin (either side) can chat with anyone else in the chain.
  if (from.role === 'chain_super_admin' || to.role === 'chain_super_admin') {
    if (!from.chain_id || !to.chain_id) return false;
    return from.chain_id === to.chain_id;
  }

  // Beyond chain-admin reach, everything must share a nursery.
  if (!from.nursery_id || !to.nursery_id) return false;
  if (from.nursery_id !== to.nursery_id) return false;

  // Branch admin ↔ anyone in their nursery.
  if (from.role === 'branch_admin' || to.role === 'branch_admin') return true;

  // Teacher ↔ teacher (same nursery).
  if (from.role === 'teacher' && to.role === 'teacher') return true;

  // Parent ↔ teacher of their child's class.
  if (from.role === 'parent' && to.role === 'teacher') {
    return classOverlap(from.childClassIds, to.classIds);
  }
  if (from.role === 'teacher' && to.role === 'parent') {
    return classOverlap(to.childClassIds, from.classIds);
  }

  // Parent ↔ parent: never.
  if (from.role === 'parent' && to.role === 'parent') return false;

  return false;
}

function classOverlap(a: string[] | undefined, b: string[] | undefined): boolean {
  if (!a?.length || !b?.length) return false;
  const set = new Set(a);
  for (const id of b) if (set.has(id)) return true;
  return false;
}

/**
 * Filter a list of candidate users down to those `from` is allowed to chat with.
 * Pass already-loaded classIds / childClassIds on each candidate.
 */
export function filterEligibleRecipients(from: ChatActor, candidates: ChatActor[]): ChatActor[] {
  return candidates.filter((to) => canChatWith(from, to));
}
