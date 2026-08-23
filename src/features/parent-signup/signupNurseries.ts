import { useEffect, useMemo, useState } from 'react';

import { supabase } from '@/lib/supabase';

/** Columns of the public signup_nursery_options view (readable before sign-in). */
export type SignupNursery = {
  id: string;
  name_en: string | null;
  name_ar: string | null;
  city: string | null;
  opens_at: string | null;
  closes_at: string | null;
  working_days: unknown;
  language_pref: string | null;
  lead_sources: unknown;
  departments: unknown;
  standard_start_time: string | null;
};

const NURSERY_COLUMNS =
  'id, name_en, name_ar, city, opens_at, closes_at, working_days, language_pref, lead_sources, departments, standard_start_time';

/** Postgres `time` comes back as HH:MM:SS; <input type="time"> wants HH:MM. */
export function toTimeInputValue(value: string | null): string {
  if (!value) return '';
  const match = /^(\d{2}):(\d{2})/.exec(value);
  return match ? `${match[1]}:${match[2]}` : '';
}

/**
 * The arrival time to pre-fill. nurseries.opens_at is what the nursery shows
 * parents; nursery_settings.standard_start_time is the operational fallback.
 */
export function nurseryArrivalTime(nursery: SignupNursery | null): string {
  if (!nursery) return '';
  return toTimeInputValue(nursery.opens_at) || toTimeInputValue(nursery.standard_start_time);
}

/** working_days is stored either as ['sun','mon'] or as ['0','1'] depending on who wrote it. */
const DAY_KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const;

export function nurseryWorkingDayKeys(nursery: SignupNursery | null): string[] {
  if (!nursery || !Array.isArray(nursery.working_days)) return [];
  const keys = nursery.working_days
    .map((day) => {
      const raw = String(day).trim().toLowerCase();
      if (DAY_KEYS.includes(raw as (typeof DAY_KEYS)[number])) return raw;
      const index = Number(raw);
      return Number.isInteger(index) && index >= 0 && index <= 6 ? DAY_KEYS[index] : null;
    })
    .filter((day): day is string => day !== null);
  // Keep calendar order regardless of how they were stored.
  return DAY_KEYS.filter((day) => keys.includes(day));
}

export function nurseryLeadSources(nursery: SignupNursery | null): string[] {
  if (!nursery || !Array.isArray(nursery.lead_sources)) return [];
  return nursery.lead_sources.map((source) => String(source).trim()).filter(Boolean);
}

/** Departments this nursery offers; XO sets them when creating/editing the nursery. */
export function nurseryDepartments(nursery: SignupNursery | null): string[] {
  if (!nursery || !Array.isArray(nursery.departments)) return [];
  return nursery.departments.map((dept) => String(dept).trim()).filter(Boolean);
}

export function useSignupNurseries() {
  const [nurseries, setNurseries] = useState<SignupNursery[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    async function load() {
      try {
        const { data, error: queryError } = await supabase
          .from('signup_nursery_options')
          .select(NURSERY_COLUMNS)
          .order('name_en');
        if (cancelled) return;
        if (queryError) {
          console.warn('Could not load nurseries from Supabase', queryError);
          setNurseries([]);
          setError(queryError.message);
          return;
        }
        setNurseries((data ?? []) as SignupNursery[]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  return { nurseries, loading, error };
}

export function useSelectedNursery(nurseries: SignupNursery[], nurseryId: string): SignupNursery | null {
  return useMemo(() => nurseries.find((n) => n.id === nurseryId) ?? null, [nurseries, nurseryId]);
}
