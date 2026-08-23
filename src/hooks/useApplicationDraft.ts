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
  const [state, setState] = useState<AutosaveState>('idle');
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [agoSeconds, setAgoSeconds] = useState<number | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!enabled) {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      setState('idle');
      return;
    }
    setState('saving');
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      try {
        const now = Date.now();
        window.localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(values));
        window.localStorage.setItem(
          DRAFT_META_KEY,
          JSON.stringify({
            savedAt: now,
            furthestStepIndex,
            currentStepIndex,
          } satisfies DraftMeta),
        );
        setSavedAt(now);
        setState('saved');
      } catch {
        setState('error');
      }
    }, DEBOUNCE_MS);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
    // Stringify values for a stable dependency; RHF returns a new object every render
  }, [JSON.stringify(values), currentStepIndex, furthestStepIndex, enabled]);

  // Track a "seconds ago" indicator for UI
  useEffect(() => {
    if (savedAt === null) return;
    const update = () => setAgoSeconds(Math.max(0, Math.round((Date.now() - savedAt) / 1000)));
    update();
    const id = setInterval(update, 10_000);
    return () => clearInterval(id);
  }, [savedAt]);

  const flush = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    try {
      const now = Date.now();
      window.localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(values));
      window.localStorage.setItem(
        DRAFT_META_KEY,
        JSON.stringify({
          savedAt: now,
          furthestStepIndex,
          currentStepIndex,
        } satisfies DraftMeta),
      );
      setSavedAt(now);
      setState('saved');
    } catch {
      setState('error');
    }
  }, [values, currentStepIndex, furthestStepIndex]);

  return { state, savedAt, agoSeconds, flush };
}
