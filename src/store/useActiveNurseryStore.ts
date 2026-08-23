import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface ActiveNurseryState {
  selectedNurseryId: string | null;
  setSelectedNurseryId: (id: string | null) => void;
}

export const ACTIVE_NURSERY_STORAGE_KEY = 'xo-active-nursery';

export const useActiveNurseryStore = create<ActiveNurseryState>()(
  persist(
    (set) => ({
      selectedNurseryId: null,
      setSelectedNurseryId: (id) => set({ selectedNurseryId: id }),
    }),
    {
      name: ACTIVE_NURSERY_STORAGE_KEY,
    },
  ),
);
