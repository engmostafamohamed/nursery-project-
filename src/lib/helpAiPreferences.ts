const KEYS = {
  helpPanel: 'xo-help-panel-enabled',
  aiAssistant: 'xo-ai-assistant-enabled',
} as const;

function readBool(key: string, defaultValue: boolean): boolean {
  if (typeof globalThis === 'undefined' || !('localStorage' in globalThis)) return defaultValue;
  try {
    const raw = globalThis.localStorage.getItem(key);
    if (raw === null) return defaultValue;
    return raw === 'true';
  } catch {
    return defaultValue;
  }
}

function writeBool(key: string, value: boolean): void {
  if (typeof globalThis === 'undefined' || !('localStorage' in globalThis)) return;
  try {
    globalThis.localStorage.setItem(key, value ? 'true' : 'false');
  } catch {
    /* ignore */
  }
}

export function isHelpPanelEnabled(): boolean {
  return readBool(KEYS.helpPanel, true);
}

export function isAiAssistantEnabled(): boolean {
  return readBool(KEYS.aiAssistant, true);
}

export function setHelpPanelEnabled(enabled: boolean): void {
  writeBool(KEYS.helpPanel, enabled);
}

export function setAiAssistantEnabled(enabled: boolean): void {
  writeBool(KEYS.aiAssistant, enabled);
}
