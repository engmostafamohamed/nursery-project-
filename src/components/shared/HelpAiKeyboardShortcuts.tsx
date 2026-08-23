import { useEffect } from 'react';

import { isAiAssistantEnabled, isHelpPanelEnabled } from '@/lib/helpAiPreferences';
import { useHelpAiUiStore } from '@/store/useHelpAiUiStore';

/** Cmd/Ctrl+K → AI, Cmd/Ctrl+/ → Help, Esc closes (handled in panels too). */
export function HelpAiKeyboardShortcuts() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target?.closest('input, textarea, [contenteditable=true]')) {
        if (!(e.metaKey || e.ctrlKey)) return;
      }
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key.toLowerCase() === 'k') {
        if (!isAiAssistantEnabled()) return;
        e.preventDefault();
        useHelpAiUiStore.getState().setAiOpen(true);
        return;
      }
      if (mod && e.key === '/') {
        if (!isHelpPanelEnabled()) return;
        e.preventDefault();
        useHelpAiUiStore.getState().setHelpOpen(true);
        return;
      }
      if (e.key === 'Escape') {
        useHelpAiUiStore.getState().setHelpOpen(false);
        useHelpAiUiStore.getState().setAiOpen(false);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  return null;
}
