import { useEffect, useState } from 'react';

/** The current time, updated every `intervalMs` (for "due in…" and colours that change with the clock). */
export function useNow(intervalMs = 30_000): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}
