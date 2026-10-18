import { useCallback, useState } from 'react';

/**
 * Which form fields the user has left (blurred), so a field shows its error once it was touched,
 * and every error shows after an attempt to save. Errors themselves are computed live from the
 * values, so a message disappears as soon as the field is fixed.
 */
export function useTouchedFields<Field extends string>() {
  const [touched, setTouched] = useState<ReadonlySet<Field>>(() => new Set());
  const [all, setAll] = useState(false);

  const touch = useCallback(
    (field: Field) => setTouched((prev) => (prev.has(field) ? prev : new Set(prev).add(field))),
    [],
  );
  const reset = useCallback(() => {
    setTouched(new Set());
    setAll(false);
  }, []);
  const showAll = useCallback(() => setAll(true), []);
  const isShown = (field: Field) => all || touched.has(field);

  return { touch, reset, showAll, isShown };
}
