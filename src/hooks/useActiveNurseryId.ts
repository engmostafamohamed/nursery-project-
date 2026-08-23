import { useCallback, useEffect, useMemo } from 'react';
import { useQueryClient } from '@tanstack/react-query';

import { useActiveNurseryStore } from '@/store/useActiveNurseryStore';
import { useAuthSession } from '@/hooks/useAuthSession';
import { useAvailableNurseries } from '@/hooks/useAvailableNurseries';
import { XO_ACTIVE_NURSERY_STORAGE_KEY, useUserProfile } from '@/hooks/useUserProfile';
import type { UserRow } from '@/types/user';

/**
 * Returns the currently selected nursery for the signed-in admin.
 *
 * - branch_admin (and other single-nursery roles): always uses `profile.nursery_id`.
 * - chain_super_admin / xo_super_admin: uses the persisted picker selection,
 *   falling back to the first available nursery.
 *
 * Use `setActiveNurseryId` (returned) to change the selection from a picker.
 */
export function useActiveNurseryId() {
  const queryClient = useQueryClient();
  const { user } = useAuthSession();
  const { data: profile } = useUserProfile(user?.id);
  const role = profile?.role ?? null;
  const profileNurseryId = profile?.nursery_id ?? null;
  const chainId = profile?.chain_id ?? null;

  const isMultiNurseryAdmin = role === 'chain_super_admin' || role === 'xo_super_admin';

  const availableQuery = useAvailableNurseries({ role, chainId, nurseryId: profileNurseryId });
  const available = availableQuery.data ?? [];

  const selectedNurseryId = useActiveNurseryStore((s) => s.selectedNurseryId);
  const setSelectedNurseryId = useActiveNurseryStore((s) => s.setSelectedNurseryId);

  const setActiveNurseryId = useCallback(
    (id: string | null) => {
      setSelectedNurseryId(id);

      if (typeof window !== 'undefined') {
        if (id) {
          window.localStorage.setItem(XO_ACTIVE_NURSERY_STORAGE_KEY, id);
        } else {
          window.localStorage.removeItem(XO_ACTIVE_NURSERY_STORAGE_KEY);
        }
      }

      if (user?.id && isMultiNurseryAdmin) {
        queryClient.setQueryData<UserRow | null>(['user-profile', user.id], (current) =>
          current ? { ...current, nursery_id: id } : current,
        );
      }
    },
    [isMultiNurseryAdmin, queryClient, setSelectedNurseryId, user?.id],
  );

  // Resolve the active nursery id.
  const activeNurseryId = useMemo<string | null>(() => {
    if (!isMultiNurseryAdmin) return profileNurseryId;
    if (selectedNurseryId && available.some((n) => n.id === selectedNurseryId)) {
      return selectedNurseryId;
    }
    return available[0]?.id ?? null;
  }, [isMultiNurseryAdmin, profileNurseryId, selectedNurseryId, available]);

  // Keep the persisted and profile-overlay selection aligned for multi-nursery admins.
  useEffect(() => {
    if (!isMultiNurseryAdmin) return;
    if (availableQuery.isLoading) return;
    if (!selectedNurseryId && available[0]?.id) {
      setActiveNurseryId(available[0].id);
      return;
    }
    if (selectedNurseryId && !available.some((n) => n.id === selectedNurseryId)) {
      setActiveNurseryId(available[0]?.id ?? null);
    }
  }, [
    isMultiNurseryAdmin,
    availableQuery.isLoading,
    selectedNurseryId,
    available,
    setActiveNurseryId,
  ]);

  return {
    activeNurseryId,
    setActiveNurseryId,
    availableNurseries: available,
    isMultiNurseryAdmin,
    isLoading: availableQuery.isLoading,
  };
}
