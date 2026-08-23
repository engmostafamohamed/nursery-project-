import { create } from 'zustand';

interface HelpAiUiState {
  helpOpen: boolean;
  aiOpen: boolean;
  setHelpOpen: (open: boolean) => void;
  setAiOpen: (open: boolean) => void;
  toggleHelp: () => void;
  toggleAi: () => void;
}

export const useHelpAiUiStore = create<HelpAiUiState>((set, get) => ({
  helpOpen: false,
  aiOpen: false,
  setHelpOpen: (open) => set({ helpOpen: open }),
  setAiOpen: (open) => set({ aiOpen: open }),
  toggleHelp: () => set({ helpOpen: !get().helpOpen }),
  toggleAi: () => set({ aiOpen: !get().aiOpen }),
}));
