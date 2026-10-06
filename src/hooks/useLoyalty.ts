import { useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { addLoyaltyTransaction } from '@/lib/loyaltyPoints';
import { redeemLoyaltyPoints } from '@/lib/paymentApi';
import { supabase } from '@/lib/supabase';

export function useLoyalty(params: { parentId?: string; nurseryId?: string; enabled?: boolean }) {
  const qc = useQueryClient();

  const query = useQuery({
    queryKey: ['loyalty-transactions', params.parentId, params.nurseryId],
    queryFn: async () => {
      if (!params.parentId || !params.nurseryId || params.enabled === false) return [];
      const res = await supabase
        .from('loyalty_transactions')
        .select('*')
        .eq('nursery_id', params.nurseryId)
        .eq('parent_id', params.parentId)
        .order('created_at', { ascending: false });
      if (res.error) throw res.error;
      return (res.data ?? []) as Array<Record<string, unknown>>;
    },
    enabled: Boolean(params.parentId && params.nurseryId && params.enabled !== false),
  });

  const adminLeaderboardQuery = useQuery({
    queryKey: ['loyalty-admin-leaderboard', params.nurseryId],
    queryFn: async () => {
      if (!params.nurseryId || params.enabled === false) return [];
      const res = await supabase
        .from('loyalty_transactions')
        .select('parent_id, points, transaction_type, created_at')
        .eq('nursery_id', params.nurseryId);
      if (res.error) throw res.error;
      const rows = (res.data ?? []) as Array<Record<string, unknown>>;
      const map = new Map<string, { balance: number; earned: number; redeemed: number }>();
      rows.forEach((r) => {
        const id = String(r.parent_id);
        const curr = map.get(id) ?? { balance: 0, earned: 0, redeemed: 0 };
        const pts = Number(r.points ?? 0);
        curr.balance += pts;
        if (pts > 0) curr.earned += pts;
        if (pts < 0) curr.redeemed += Math.abs(pts);
        map.set(id, curr);
      });
      const parentIds = [...map.keys()];
      const usersRes = parentIds.length ? await supabase.from('users').select('id, name_ar, name_en').in('id', parentIds) : { data: [], error: null };
      if (usersRes.error) throw usersRes.error;
      const userMap = new Map(((usersRes.data ?? []) as Array<Record<string, unknown>>).map((u) => [String(u.id), String(u.name_ar ?? u.name_en ?? 'Parent')]));
      return [...map.entries()]
        .map(([parentId, data]) => ({ parentId, parentName: userMap.get(parentId) ?? 'Parent', ...data }))
        .sort((a, b) => b.balance - a.balance);
    },
    enabled: Boolean(params.nurseryId && params.enabled !== false),
  });

  const adminMonthlyQuery = useQuery({
    queryKey: ['loyalty-admin-monthly', params.nurseryId],
    queryFn: async () => {
      if (!params.nurseryId || params.enabled === false) return [];
      const month = new Date().toISOString().slice(0, 7);
      const res = await supabase
        .from('loyalty_transactions')
        .select('points, created_at')
        .eq('nursery_id', params.nurseryId)
        .gte('created_at', `${month}-01T00:00:00`);
      if (res.error) throw res.error;
      return (res.data ?? []) as Array<Record<string, unknown>>;
    },
    enabled: Boolean(params.nurseryId && params.enabled !== false),
  });

  const manualAward = useMutation({
    mutationFn: async (payload: { nurseryId: string; parentId: string; points: number; reason: string }) => {
      await addLoyaltyTransaction({
        nurseryId: payload.nurseryId,
        parentId: payload.parentId,
        transactionType: 'bonus',
        points: Math.max(1, Math.floor(payload.points)),
        source: 'bonus',
        // The admin's reason is shown as written; without one the app labels it by type.
        description: payload.reason.trim() || undefined,
      });
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['loyalty-transactions'] });
      void qc.invalidateQueries({ queryKey: ['loyalty-admin-leaderboard'] });
    },
  });

  // The server checks the balance, the per-invoice cap and the open amount, then records the
  // points and the discount line together; the same idempotency key never redeems twice.
  const redeemMutation = useMutation({
    mutationFn: (payload: { invoiceId: string; points: number; idempotencyKey: string }) => redeemLoyaltyPoints(payload),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['loyalty-transactions'] });
      void qc.invalidateQueries({ queryKey: ['invoice-details'] });
      void qc.invalidateQueries({ queryKey: ['parent-invoices'] });
      void qc.invalidateQueries({ queryKey: ['payment-history'] });
    },
  });

  const summary = useMemo(() => {
    const rows = query.data ?? [];
    const balance = rows.reduce((sum, r) => sum + Number(r.points ?? 0), 0);
    const earnedTotal = rows.filter((r) => Number(r.points ?? 0) > 0).reduce((sum, r) => sum + Number(r.points ?? 0), 0);
    const tiers = { silver: 0, gold: 1000, platinum: 5000 };
    const tier = earnedTotal >= tiers.platinum ? 'platinum' : earnedTotal >= tiers.gold ? 'gold' : 'silver';
    const nextTierPoints = tier === 'silver' ? tiers.gold : tier === 'gold' ? tiers.platinum : tiers.platinum;
    const progress = tier === 'platinum' ? 100 : Math.min(100, (earnedTotal / nextTierPoints) * 100);
    return { balance, earnedTotal, tier, nextTierPoints, progress };
  }, [query.data]);

  const adminStats = useMemo(() => {
    const rows = adminLeaderboardQuery.data ?? [];
    const raw = adminMonthlyQuery.data ?? [];
    const pointsAwardedThisMonth = raw.filter((r) => Number(r.points ?? 0) > 0).reduce((s, r) => s + Number(r.points ?? 0), 0);
    const pointsRedeemedThisMonth = raw.filter((r) => Number(r.points ?? 0) < 0).reduce((s, r) => s + Math.abs(Number(r.points ?? 0)), 0);
    const averagePointsPerParent = rows.length ? rows.reduce((s, r) => s + r.balance, 0) / rows.length : 0;
    return { pointsAwardedThisMonth, pointsRedeemedThisMonth, averagePointsPerParent };
  }, [adminLeaderboardQuery.data, adminMonthlyQuery.data]);

  return {
    transactions: query.data ?? [],
    summary,
    leaderboard: adminLeaderboardQuery.data ?? [],
    adminStats,
    isLoading: query.isLoading || adminLeaderboardQuery.isLoading || adminMonthlyQuery.isLoading,
    redeemPoints: redeemMutation.mutateAsync,
    awardManualBonus: manualAward.mutateAsync,
  };
}
