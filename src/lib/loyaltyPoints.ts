import { supabase } from '@/lib/supabase';

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

export async function awardPaymentPoints(params: {
  nurseryId: string;
  parentId: string;
  invoiceId: string;
  amount: number;
  pointsPerEgp: number;
  multiplier?: number;
}) {
  const points = Math.floor(params.amount * Math.max(0, params.pointsPerEgp) * (params.multiplier ?? 1));
  if (points <= 0) return;
  await addLoyaltyTransaction({
    nurseryId: params.nurseryId,
    parentId: params.parentId,
    transactionType: 'earned',
    points,
    source: 'payment',
    referenceId: params.invoiceId,
    description: `Points earned from invoice payment (${params.amount.toFixed(2)} EGP)`,
  });
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
    description: 'Points earned from parent review/reaction',
  });
}

export async function redeemLoyaltyPoints(params: {
  nurseryId: string;
  parentId: string;
  invoiceId: string;
  points: number;
  description?: string;
}) {
  await addLoyaltyTransaction({
    nurseryId: params.nurseryId,
    parentId: params.parentId,
    transactionType: 'redeemed',
    points: -Math.abs(params.points),
    source: 'manual',
    referenceId: params.invoiceId,
    description: params.description ?? 'Points redeemed on invoice payment',
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
    description: 'Referral accepted bonus',
  });
  await addLoyaltyTransaction({
    nurseryId: params.nurseryId,
    parentId: params.newParentId,
    transactionType: 'bonus',
    points: 25,
    source: 'referral',
    referenceId: params.referenceId,
    description: 'Welcome referral bonus',
  });
}

// Phase 15: monthly expiration cron will call this utility.
export async function expirePointsStub() {
  return;
}
