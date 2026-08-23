const STORAGE_KEY = 'xo_pwa_install_events';

export type PwaInstallEventType =
  | 'prompt_shown'
  | 'install_accepted'
  | 'install_dismissed'
  | 'ios_hint_shown'
  | 'install_completed';

type StoredEvent = { type: PwaInstallEventType; at: string };

function readEvents(): StoredEvent[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? (parsed as StoredEvent[]) : [];
  } catch {
    return [];
  }
}

export function trackPwaInstallEvent(type: PwaInstallEventType): void {
  try {
    const next = [...readEvents(), { type, at: new Date().toISOString() }];
    const trimmed = next.slice(-50);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed));
  } catch {
    /* ignore quota */
  }
}

export function getPwaInstallEvents(): StoredEvent[] {
  return readEvents();
}
