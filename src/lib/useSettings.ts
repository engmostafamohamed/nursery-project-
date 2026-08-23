import { useMemo } from 'react';

import { DEFAULT_SETTINGS } from '@/components/admin/settings/settingsConfig';
import { useAuthSession } from '@/hooks/useAuthSession';
import { useNurserySettings } from '@/hooks/useNurserySettings';
import { useUserProfile } from '@/hooks/useUserProfile';
import type { NurserySettingsRow } from '@/types/tables/nursery_settings';

export type SettingsObject = Omit<NurserySettingsRow, 'id' | 'nursery_id' | 'created_at' | 'updated_at'>;

export function useSettings() {
  const { user } = useAuthSession();
  const { data: profile } = useUserProfile(user?.id);
  const { settings, isLoading } = useNurserySettings(profile?.nursery_id);

  const value = useMemo(() => {
    const merged = { ...DEFAULT_SETTINGS, ...(settings ?? {}) } as Record<string, unknown>;
    return merged as SettingsObject;
  }, [settings]);

  return {
    settings: value,
    isLoading,
    nurseryId: profile?.nursery_id ?? null,
  };
}
