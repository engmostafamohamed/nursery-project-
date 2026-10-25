import { useCallback, useEffect, useRef, useState } from 'react';

/** idle: nothing changed yet · dirty: a change waits to be saved · saving · saved · error: the last save failed. */
export type AutosaveStatus = 'idle' | 'dirty' | 'saving' | 'saved' | 'error';

/**
 * Saves a value a moment after each change, one save at a time and always the latest value; a
 * change made while a save runs is saved right after it. `flush` saves now (the "Save changes"
 * button, before sending or leaving); what is still unsaved when the component goes away is saved
 * then, and the browser asks before the tab is closed.
 */
export function useAutosave<T, R>(save: (value: T) => Promise<R>, options: { delayMs?: number; onSaved?: (result: R) => void } = {}) {
  const { delayMs = 1200 } = options;
  const [status, setStatus] = useState<AutosaveStatus>('idle');
  const [error, setError] = useState<unknown>(null);
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const pending = useRef<{ value: T } | null>(null);
  const running = useRef<Promise<void> | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saveRef = useRef(save);
  const onSavedRef = useRef(options.onSaved);
  useEffect(() => {
    saveRef.current = save;
    onSavedRef.current = options.onSaved;
  });

  const flush = useCallback(async (): Promise<boolean> => {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
    while (running.current) await running.current;
    const next = pending.current;
    if (!next) return true;
    pending.current = null;
    setStatus('saving');
    let ok = true;
    const run = (async () => {
      try {
        const result = await saveRef.current(next.value);
        setError(null);
        setSavedAt(new Date());
        setStatus(pending.current ? 'dirty' : 'saved');
        onSavedRef.current?.(result);
      } catch (e) {
        ok = false;
        // Keep it to try again, unless something newer is already waiting.
        if (!pending.current) pending.current = next;
        setError(e);
        setStatus('error');
      }
    })();
    running.current = run;
    await run;
    running.current = null;
    // A change made meanwhile has set its own timer.
    return ok;
  }, []);

  const change = useCallback(
    (value: T) => {
      pending.current = { value };
      setStatus((s) => (s === 'saving' ? s : 'dirty'));
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => void flush(), delayMs);
    },
    [delayMs, flush],
  );

  // Leaving the page: save what is left; closing the tab with unsaved changes asks first.
  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => {
      if (pending.current || running.current) e.preventDefault();
    };
    window.addEventListener('beforeunload', warn);
    return () => {
      window.removeEventListener('beforeunload', warn);
      if (pending.current) void flush();
    };
  }, [flush]);

  return { status, error, savedAt, change, flush };
}
