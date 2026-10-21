// Who may have the app send an email, SMS or WhatsApp message, and to whom.
//   - Nursery staff (branch admin, manager) for their own nursery; a chain admin for the chain's
//     nurseries; an XO admin anywhere. A named recipient account must belong to that nursery.
//   - A parent only their own verification codes, to themselves.
//   - Nobody else (teachers, signed-out callers).
import type { Channel } from './messaging.ts';
import { SELF_SERVICE_TYPES } from './messageTemplates.ts';

export type CallerProfile = { id: string; role: string; nursery_id: string | null; chain_id: string | null };

export type MessageTarget = {
  channel: Channel;
  type: string;
  nurseryId: string;
  /** The nursery's chain, for chain admins. */
  nurseryChainId: string | null;
  /** The recipient's account, when the message is for a user of the app. */
  userId: string | null;
  /** That account's nursery. */
  recipientNurseryId: string | null;
};

export type Permission = 'allowed' | 'not_staff' | 'other_nursery' | 'recipient_elsewhere' | 'parent_not_self_service';

export function messagePermission(caller: CallerProfile, target: MessageTarget): Permission {
  if (caller.role === 'parent') {
    if (!SELF_SERVICE_TYPES[target.channel].has(target.type)) return 'parent_not_self_service';
    if (target.userId !== caller.id || caller.nursery_id !== target.nurseryId) return 'parent_not_self_service';
    return 'allowed';
  }

  const inScope =
    caller.role === 'xo_super_admin' ||
    (caller.role === 'chain_super_admin' && Boolean(target.nurseryChainId) && target.nurseryChainId === caller.chain_id) ||
    ((caller.role === 'branch_admin' || caller.role === 'manager') && caller.nursery_id === target.nurseryId);
  if (!inScope) {
    return caller.role === 'branch_admin' || caller.role === 'manager' || caller.role === 'chain_super_admin' ? 'other_nursery' : 'not_staff';
  }
  if (target.userId && target.recipientNurseryId !== target.nurseryId) return 'recipient_elsewhere';
  return 'allowed';
}

/** Messages a parent can ask for in a day, per channel (their own verification codes). */
export const PARENT_DAILY_LIMIT = 10;
