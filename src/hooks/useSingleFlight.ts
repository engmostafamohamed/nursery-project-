import { useCallback, useRef, useState } from 'react';

/**
 * Runs one async action at a time. A second call while the first is still running (a double
 * click, a key repeat) is ignored synchronously, before React has re-rendered a disabled button.
 */
export function useSingleFlight() {
  const runningRef = useRef(false);
  const [running, setRunning] = useState(false);

  const run = useCallback(async <T,>(action: () => Promise<T>): Promise<T | undefined> => {
    if (runningRef.current) return undefined;
    runningRef.current = true;
    setRunning(true);
    try {
      return await action();
    } finally {
      runningRef.current = false;
      setRunning(false);
    }
  }, []);

  return { run, running };
}
