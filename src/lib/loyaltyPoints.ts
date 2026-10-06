import { supabase } from '@/lib/supabase';

/**
 * Points for payments and redemptions are written by the server (loyalty_award_payment_points,
 * redeem_loyalty_points). `description` holds only text a person typed (an admin's bonus
 * reason); the app labels every other row from its transaction type and source.
 */
export async function addLoyaltyTransaction(params: {
  nurseryId: string;
  parentId: string;
  transactionType: 'earned' | 'redeemed' | 'expired' | 'bonus';
  points: number;
  source: 'payment' | 'referral' | 'review' | 'birthday' | 'bonus' | 'manual';
  referenceId?: string;
  description?: string;
}) {
  const res = await supabase.from('loyalty_transactions').insert({
    nursery_id: params.nurseryId,
    parent_id: params.parentId,
    transaction_type: params.transactionType,
    points: params.points,
    source: params.source,
    reference_id: params.referenceId ?? null,
    description: params.description ?? null,
  } as never);
  if (res.error) throw res.error;
}

export async function awardReviewPoints(params: {
  nurseryId: string;
  parentId: string;
  referenceId: string;
  hasText: boolean;
  hasReaction: boolean;
}) {
  const points = params.hasText ? 10 : params.hasReaction ? 5 : 0;
  if (!points) return;
  await addLoyaltyTransaction({
    nurseryId: params.nurseryId,
    parentId: params.parentId,
    transactionType: 'earned',
    points,
    source: 'review',
    referenceId: params.referenceId,
  });
}

export async function awardReferralPoints(params: {
  nurseryId: string;
  referringParentId: string;
  newParentId: string;
  referenceId?: string;
}) {
  await addLoyaltyTransaction({
    nurseryId: params.nurseryId,
    parentId: params.referringParentId,
    transactionType: 'earned',
    points: 50,
    source: 'referral',
    referenceId: params.referenceId,
  });
  await addLoyaltyTransaction({
    nurseryId: params.nurseryId,
    parentId: params.newParentId,
    transactionType: 'bonus',
    points: 25,
    source: 'referral',
    referenceId: params.referenceId,
  });
}

// Phase 15: monthly expiration cron will call this utility.
export async function expirePointsStub() {
  return;
}
