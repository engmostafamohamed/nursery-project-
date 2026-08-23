import { useQuery } from '@tanstack/react-query';
import { QRCodeSVG } from 'qrcode.react';
import { useTranslation } from 'react-i18next';

import { supabase } from '@/lib/supabase';

interface EventQrCardProps {
  eventId: string;
  childId: string;
  childName: string;
}

/**
 * Read-only event check-in QR for one child, shown to the parent on the event
 * page. The token is minted server-side when the event is published
 * (event-qr-issue) and is readable here via the qr_tokens parent RLS policy.
 */
export function EventQrCard({ eventId, childId, childName }: EventQrCardProps) {
  const { t } = useTranslation();

  const tokenQuery = useQuery({
    queryKey: ['event-qr-token', eventId, childId],
    queryFn: async (): Promise<string | null> => {
      const { data, error } = await supabase
        .from('qr_tokens')
        .select('token')
        .eq('event_id', eventId)
        .eq('child_id', childId)
        .eq('purpose', 'event')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return (data as { token: string } | null)?.token ?? null;
    },
  });

  const checkedInQuery = useQuery({
    queryKey: ['event-attendance', eventId, childId],
    queryFn: async (): Promise<boolean> => {
      const { data, error } = await supabase
        .from('event_attendance')
        .select('id')
        .eq('event_id', eventId)
        .eq('child_id', childId)
        .maybeSingle();
      if (error) throw error;
      return Boolean(data);
    },
  });

  const token = tokenQuery.data ?? null;
  const value = token ? `${window.location.origin}/qr/verify?token=${encodeURIComponent(token)}` : '';
  const checkedIn = checkedInQuery.data ?? false;

  return (
    <section className="rounded-3xl border border-outline-variant bg-surface-container-lowest p-5 shadow-sm">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-base font-semibold text-on-surface">{childName}</h3>
        {checkedIn ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-success/10 px-2.5 py-0.5 text-xs font-medium text-success">
            <span className="material-symbols-outlined text-sm" aria-hidden>check_circle</span>
            {t('parent.events.details.qr.checkedIn')}
          </span>
        ) : null}
      </div>
      <p className="mt-1 text-sm text-on-surface-variant">{t('parent.events.details.qr.hint')}</p>

      <div className="mt-4 flex justify-center rounded-2xl bg-white p-4">
        {tokenQuery.isPending ? (
          <p className="text-sm text-on-surface-variant">{t('common.loading')}</p>
        ) : token ? (
          <QRCodeSVG value={value} size={200} />
        ) : (
          <p className="text-sm text-on-surface-variant">{t('parent.events.details.qr.notReady')}</p>
        )}
      </div>
    </section>
  );
}
