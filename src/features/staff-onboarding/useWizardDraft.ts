import { useCallback, useEffect, useRef } from 'react';

import type { FieldValues, Path, UseFormReturn } from 'react-hook-form';

export function useWizardDraft<T extends FieldValues>(form: UseFormReturn<T>, storageKey: string, enabled: boolean) {
  const hydrated = useRef(false);

  useEffect(() => {
    if (!enabled || hydrated.current) return;
    try {
      const raw = globalThis.localStorage.getItem(storageKey);
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<T>;
        Object.keys(parsed).forEach((k) => {
          form.setValue(k as Path<T>, parsed[k as keyof typeof parsed] as T[keyof T]);
        });
      }
    } catch {
      /* ignore */
    }
    hydrated.current = true;
  }, [enabled, form, storageKey]);

  const saveDraft = useCallback(() => {
    if (!enabled) return;
    try {
      const values = form.getValues();
      globalThis.localStorage.setItem(storageKey, JSON.stringify(values));
    } catch {
      /* ignore */
    }
  }, [enabled, form, storageKey]);

  const clearDraft = useCallback(() => {
    try {
      globalThis.localStorage.removeItem(storageKey);
    } catch {
      /* ignore */
    }
  }, [storageKey]);

  return { saveDraft, clearDraft };
}
