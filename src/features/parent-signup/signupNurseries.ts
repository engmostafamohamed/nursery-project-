import { useEffect, useMemo, useState } from 'react';

import { supabase } from '@/lib/supabase';
import { WEEKDAY_KEYS, weekdayNumbers } from '@/lib/weekdays';

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
  active_registration_template: unknown;
};

const NURSERY_COLUMNS =
  'id, name_en, name_ar, city, opens_at, closes_at, working_days, language_pref, lead_sources, departments, standard_start_time, active_registration_template';

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

/** The nursery's working days as 'sun'…'sat' in calendar order, however they were stored. */
export function nurseryWorkingDayKeys(nursery: SignupNursery | null): string[] {
  return nursery ? weekdayNumbers(nursery.working_days).map((d) => WEEKDAY_KEYS[d]) : [];
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
