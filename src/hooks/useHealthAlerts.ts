import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { useAuthSession } from '@/hooks/useAuthSession';
import { useUserProfile } from '@/hooks/useUserProfile';
import {
  computeHealthAlerts,
  todayYmdLocal,
  type HealthAlertItem,
} from '@/lib/healthAlertsCompute';
import { supabase } from '@/lib/supabase';
import type { ChildAllergiesRow, ChildHealthRecordsRow, ChildMedicationsRow, ChildVaccinationsRow } from '@/types/tables/child_health';

export type HealthAlertsResult = {
  alerts: HealthAlertItem[];
  classes: { id: string; name_ar: string; name_en: string }[];
};

export function useHealthAlerts() {
  const { user } = useAuthSession();
  const { data: profile } = useUserProfile(user?.id);
  const nurseryId = profile?.nursery_id;

  return useQuery({
    queryKey: ['health-alerts-dashboard', nurseryId],
    queryFn: async (): Promise<HealthAlertsResult> => {
      if (!nurseryId) return { alerts: [], classes: [] };

      const today = todayYmdLocal();

      const [childrenRes, classesRes, dismissRes] = await Promise.all([
        supabase
          .from('children')
          .select('id, full_name_ar, full_name_en, class_id')
          .eq('nursery_id', nurseryId)
          .eq('status', 'active'),
        supabase.from('classes').select('id, name_ar, name_en').eq('nursery_id', nurseryId),
        supabase.from('child_health_alert_dismissals').select('alert_fingerprint').eq('nursery_id', nurseryId),
      ]);
      if (childrenRes.error) throw childrenRes.error;
      if (classesRes.error) throw classesRes.error;
      if (dismissRes.error) throw dismissRes.error;

      const children = (childrenRes.data ?? []) as {
        id: string;
        full_name_ar: string;
        full_name_en: string;
        class_id: string | null;
      }[];
      const classes = (classesRes.data ?? []) as { id: string; name_ar: string; name_en: string }[];
      const classesById = new Map(classes.map((c) => [c.id, c]));
      const childIds = children.map((c) => c.id);
      if (!childIds.length) return { alerts: [], classes };

      const dismissedFingerprints = new Set(
        ((dismissRes.data ?? []) as { alert_fingerprint: string }[]).map((d) => d.alert_fingerprint),
      );

      const [recordsRes, medsRes, vacsRes, alRes] = await Promise.all([
        supabase.from('child_health_records').select('*').eq('nursery_id', nurseryId).in('child_id', childIds),
        supabase.from('child_medications').select('*').eq('nursery_id', nurseryId).in('child_id', childIds),
        supabase.from('child_vaccinations').select('*').eq('nursery_id', nurseryId).in('child_id', childIds),
        supabase.from('child_allergies').select('*').eq('nursery_id', nurseryId).in('child_id', childIds),
      ]);
      if (recordsRes.error) throw recordsRes.error;
      if (medsRes.error) throw medsRes.error;
      if (vacsRes.error) throw vacsRes.error;
      if (alRes.error) throw alRes.error;

      const recordsByChildId = new Map(
        ((recordsRes.data ?? []) as ChildHealthRecordsRow[]).map((r) => [r.child_id, r]),
      );

      const alerts = computeHealthAlerts({
        today,
        children,
        classesById,
        recordsByChildId,
        medications: (medsRes.data ?? []) as ChildMedicationsRow[],
        vaccinations: (vacsRes.data ?? []) as ChildVaccinationsRow[],
        allergies: (alRes.data ?? []) as ChildAllergiesRow[],
        dismissedFingerprints,
      });

      return { alerts, classes };
    },
    enabled: Boolean(nurseryId && user?.id),
  });
}

export function useDismissHealthAlert() {
  const { user } = useAuthSession();
  const { data: profile } = useUserProfile(user?.id);
  const qc = useQueryClient();
  const nurseryId = profile?.nursery_id;

  return useMutation({
    mutationFn: async (args: { childId: string; fingerprint: string }) => {
      if (!nurseryId) throw new Error('Missing nursery');
      const { error } = await supabase.from('child_health_alert_dismissals').insert({
        nursery_id: nurseryId,
        child_id: args.childId,
        alert_fingerprint: args.fingerprint,
        dismissed_by: user?.id ?? null,
      } as never);
      if (error) throw error;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['health-alerts-dashboard'] });
    },
  });
}
