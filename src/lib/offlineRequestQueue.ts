type RetryFn = () => Promise<void>;

type QueuedItem = { id: string; labelKey: string; retry: RetryFn };

const queue: QueuedItem[] = [];
const listeners = new Set<() => void>();

function notify(): void {
  for (const l of listeners) {
    l();
  }
}

export function enqueueOfflineRetry(labelKey: string, retry: RetryFn): string {
  const id = `q-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  queue.push({ id, labelKey, retry });
  notify();
  return id;
}

export function removeQueued(id: string): void {
  const i = queue.findIndex((q) => q.id === id);
  if (i >= 0) {
    queue.splice(i, 1);
    notify();
  }
}

export function getOfflineQueueSnapshot(): ReadonlyArray<{ id: string; labelKey: string }> {
  return queue.map(({ id, labelKey }) => ({ id, labelKey }));
}

export function getPendingCount(): number {
  return queue.length;
}

export function subscribeOfflineQueue(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export async function flushOfflineQueue(): Promise<void> {
  if (typeof navigator !== 'undefined' && !navigator.onLine) return;
  const copy = [...queue];
  for (const item of copy) {
    try {
      await item.retry();
      removeQueued(item.id);
    } catch {
      /* keep for next flush */
    }
  }
}
