import { useQuery } from '@tanstack/react-query';

import { supabase } from '@/lib/supabase';
import { ACTIVE_NURSERY_STORAGE_KEY } from '@/store/useActiveNurseryStore';
import type { UserRow } from '@/types/user';

// XO super admin has nursery_id=NULL by design. To let them use nursery-scoped
// /admin pages (staff onboarding, attendance, etc.) we overlay a chosen nursery.
// Persisted in localStorage so they can switch via the picker; defaults to the
// first nursery on first load.
export const XO_ACTIVE_NURSERY_STORAGE_KEY = 'xo-admin:active-nursery-id';

function readStoredActiveNurseryId(): string | null {
  if (typeof window === 'undefined') return null;

  const persistedPicker = window.localStorage.getItem(ACTIVE_NURSERY_STORAGE_KEY);
  if (persistedPicker) {
    try {
      const parsed = JSON.parse(persistedPicker) as {
        state?: { selectedNurseryId?: unknown };
      };
      if (typeof parsed.state?.selectedNurseryId === 'string') {
        return parsed.state.selectedNurseryId;
      }
    } catch {
      // Fall through to the legacy plain string key.
    }
  }

  return window.localStorage.getItem(XO_ACTIVE_NURSERY_STORAGE_KEY);
}

function writeStoredActiveNurseryId(id: string): void {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(XO_ACTIVE_NURSERY_STORAGE_KEY, id);
}

async function fetchFirstNurseryId(): Promise<string | null> {
  const { data, error } = await supabase
    .from('nurseries')
    .select('id')
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();
  if (error || !data) return null;
  return (data as { id: string }).id;
}

export function useUserProfile(userId: string | undefined) {
  return useQuery({
    queryKey: ['user-profile', userId],
    queryFn: async (): Promise<UserRow | null> => {
      const { data, error } = await supabase
        .from('users')
        .select(
          'id, nursery_id, chain_id, role, role_id, department, name_ar, name_en, email, phone, status, language_pref, onboarding_completed, created_at, updated_at',
        )
        .eq('id', userId as string)
        .maybeSingle();

      if (error) {
        throw error;
      }

      let profile = data as UserRow | null;

      if (profile && profile.role === 'xo_super_admin' && !profile.nursery_id) {
        const stored = readStoredActiveNurseryId();
        const overlayId = stored ?? (await fetchFirstNurseryId());
        if (overlayId) {
          if (!stored) {
            writeStoredActiveNurseryId(overlayId);
          }
          profile = { ...profile, nursery_id: overlayId };
        }
      }

      return profile;
    },
    enabled: Boolean(userId),
    staleTime: 1000 * 60 * 2,
  });
}
