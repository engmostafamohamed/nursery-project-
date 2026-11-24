import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { useAuthSession } from '@/hooks/useAuthSession';
import { useUserProfile } from '@/hooks/useUserProfile';
import {
  computeHealthAlerts,
  todayYmdLocal,
  type HealthAlertItem,
} from '@/lib/healthAlertsCompute';
import { fetchAllRows } from '@/lib/fetchAllRows';
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

      // Everything at once. The health rows are the nursery's own, every page of them; only the
      // active children's are kept below (listing every child id in the request instead made it too
      // long for a big nursery).
      const [childrenRes, classesRes, dismissRes, records, medications, vaccinations, allergies] = await Promise.all([
        supabase
          .from('children')
          .select('id, full_name_ar, full_name_en, class_id, emergency_contacts')
          .eq('nursery_id', nurseryId)
          .eq('status', 'active'),
        supabase.from('classes').select('id, name_ar, name_en').eq('nursery_id', nurseryId),
        supabase.from('child_health_alert_dismissals').select('alert_fingerprint').eq('nursery_id', nurseryId),
        fetchAllRows<ChildHealthRecordsRow>((from, to) =>
          supabase.from('child_health_records').select('*').eq('nursery_id', nurseryId).order('id').range(from, to),
        ),
        fetchAllRows<ChildMedicationsRow>((from, to) =>
          supabase.from('child_medications').select('*').eq('nursery_id', nurseryId).order('id').range(from, to),
        ),
        fetchAllRows<ChildVaccinationsRow>((from, to) =>
          supabase.from('child_vaccinations').select('*').eq('nursery_id', nurseryId).order('id').range(from, to),
        ),
        fetchAllRows<ChildAllergiesRow>((from, to) =>
          supabase.from('child_allergies').select('*').eq('nursery_id', nurseryId).order('id').range(from, to),
        ),
      ]);
      if (childrenRes.error) throw childrenRes.error;
      if (classesRes.error) throw classesRes.error;
      if (dismissRes.error) throw dismissRes.error;

      const children = (childrenRes.data ?? []) as {
        id: string;
        full_name_ar: string;
        full_name_en: string;
        class_id: string | null;
        emergency_contacts: unknown;
      }[];
      const classes = (classesRes.data ?? []) as { id: string; name_ar: string; name_en: string }[];
      const classesById = new Map(classes.map((c) => [c.id, c]));
      if (!children.length) return { alerts: [], classes };
      const activeIds = new Set(children.map((c) => c.id));
      const ofActive = <T extends { child_id: string }>(rows: T[]): T[] => rows.filter((row) => activeIds.has(row.child_id));

      const dismissedFingerprints = new Set(
        ((dismissRes.data ?? []) as { alert_fingerprint: string }[]).map((d) => d.alert_fingerprint),
      );

      const recordsByChildId = new Map(ofActive(records).map((r) => [r.child_id, r]));

      const alerts = computeHealthAlerts({
        today,
        children,
        classesById,
        recordsByChildId,
        medications: ofActive(medications),
        vaccinations: ofActive(vaccinations),
        allergies: ofActive(allergies),
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
