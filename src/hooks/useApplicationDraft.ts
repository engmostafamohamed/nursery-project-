import { useCallback, useEffect, useRef, useState } from 'react';

import type { ParentSignUpFormValues } from '@/features/parent-signup/parentSignUpValidation';

const DRAFT_STORAGE_KEY = 'xo.parentSignup.draft.v1';
const DRAFT_META_KEY = 'xo.parentSignup.meta.v1';
const DEBOUNCE_MS = 800;

export type AutosaveState = 'idle' | 'saving' | 'saved' | 'error';

export type DraftMeta = {
  savedAt: number;
  furthestStepIndex: number;
  currentStepIndex: number;
};

export type RestoredDraft = {
  values: Partial<ParentSignUpFormValues>;
  meta: DraftMeta | null;
};

export function loadDraft(): RestoredDraft {
  if (typeof window === 'undefined') return { values: {}, meta: null };
  try {
    const valuesRaw = window.localStorage.getItem(DRAFT_STORAGE_KEY);
    const metaRaw = window.localStorage.getItem(DRAFT_META_KEY);
    const values = valuesRaw ? (JSON.parse(valuesRaw) as Partial<ParentSignUpFormValues>) : {};
    const meta = metaRaw ? (JSON.parse(metaRaw) as DraftMeta) : null;
    return { values, meta };
  } catch {
    return { values: {}, meta: null };
  }
}

export function clearDraft(): void {
  if (typeof window === 'undefined') return;
  window.localStorage.removeItem(DRAFT_STORAGE_KEY);
  window.localStorage.removeItem(DRAFT_META_KEY);
}

export function useApplicationDraft(
  values: ParentSignUpFormValues,
  currentStepIndex: number,
  furthestStepIndex: number,
  enabled: boolean = true,
) {
  // RHF returns a new values object every render, so the draft is compared as text.
  const valuesJson = JSON.stringify(values);
  const snapshot = `${valuesJson}|${currentStepIndex}|${furthestStepIndex}`;
  // The outcome of the last write and the snapshot it wrote; anything newer is still "saving".
  const [result, setResult] = useState<{ snapshot: string; status: 'saved' | 'error' } | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const write = useCallback(() => {
    try {
      const at = Date.now();
      window.localStorage.setItem(DRAFT_STORAGE_KEY, valuesJson);
      window.localStorage.setItem(
        DRAFT_META_KEY,
        JSON.stringify({
          savedAt: at,
          furthestStepIndex,
          currentStepIndex,
        } satisfies DraftMeta),
      );
      setSavedAt(at);
      setNow(at);
      setResult({ snapshot, status: 'saved' });
    } catch {
      setResult({ snapshot, status: 'error' });
    }
  }, [valuesJson, snapshot, currentStepIndex, furthestStepIndex]);

  useEffect(() => {
    if (!enabled) return;
    timerRef.current = setTimeout(write, DEBOUNCE_MS);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = null;
    };
  }, [enabled, write]);

  // Refresh the "saved N seconds ago" indicator.
  useEffect(() => {
    if (savedAt === null) return;
    const id = setInterval(() => setNow(Date.now()), 10_000);
    return () => clearInterval(id);
  }, [savedAt]);

  const flush = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    write();
  }, [write]);

  const state: AutosaveState = !enabled ? 'idle' : result?.snapshot === snapshot ? result.status : 'saving';
  const agoSeconds = savedAt === null ? null : Math.max(0, Math.round((now - savedAt) / 1000));

  return { state, savedAt, agoSeconds, flush };
}
