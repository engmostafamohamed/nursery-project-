import { supabase } from '@/lib/supabase';

/**
 * Issue per-child event check-in QR tokens for every targeted child of an event.
 * Server-side (edge function `event-qr-issue`) — idempotent, safe to call again
 * on re-publish. Must run AFTER the event's permission rows exist, since the
 * function derives the target children from those rows.
 */
export async function issueEventQrCodes(eventId: string): Promise<number> {
  const { data, error } = await supabase.functions.invoke('event-qr-issue', {
    body: { event_id: eventId },
  });
  if (error) throw error;
  const payload = data as { issued?: number; error?: string } | null;
  if (payload?.error) throw new Error(payload.error);
  return payload?.issued ?? 0;
}
