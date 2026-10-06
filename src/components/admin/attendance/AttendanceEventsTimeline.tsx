import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';

import { Skeleton } from '@/components/ui/skeleton';
import { attendanceErrorKey } from '@/lib/attendanceApi';
import { supabase } from '@/lib/supabase';

type EventRow = {
  id: string;
  event_type: string;
  occurred_at: string;
  method: string | null;
  details: Record<string, unknown> | null;
  actor: { name_ar: string | null; name_en: string | null } | null;
};

/** Audit trail of one attendance day: every scan, rejection, charge, correction and waiver. */
export function AttendanceEventsTimeline({ attendanceId, childId, date }: { attendanceId: string | null; childId: string; date: string }) {
  const { t, i18n } = useTranslation();
  const locale = i18n.language === 'ar' ? 'ar-EG' : 'en-GB';

  const query = useQuery({
    queryKey: ['attendance-events', attendanceId, childId, date],
    queryFn: async (): Promise<EventRow[]> => {
      // Rejected drop-off scans have no attendance row yet, so match by child and day too.
      let request = supabase
        .from('attendance_events')
        .select('id, event_type, occurred_at, method, details, actor:users!attendance_events_actor_id_fkey(name_ar, name_en)')
        .order('occurred_at');
      request = attendanceId
        ? request.or(`attendance_id.eq.${attendanceId},and(child_id.eq.${childId},attendance_id.is.null,occurred_at.gte.${date}T00:00:00,occurred_at.lte.${date}T23:59:59)`)
        : request.eq('child_id', childId).gte('occurred_at', `${date}T00:00:00`).lte('occurred_at', `${date}T23:59:59`);
      const { data, error } = await request;
      if (error) throw error;
      return (data ?? []) as unknown as EventRow[];
    },
  });

  if (query.isPending) return <Skeleton className="h-16 w-full rounded-lg" />;
  if (!query.data?.length) return <p className="text-xs text-on-surface-variant">{t('attendance.logs.noEvents')}</p>;

  const describe = (event: EventRow): string | null => {
    const d = event.details ?? {};
    if (event.event_type === 'scan_rejected' && typeof d.reason === 'string') return t(attendanceErrorKey(d.reason), { minutes: 5 });
    if (event.event_type === 'late_charge') {
      return t('attendance.logs.chargeDetail', {
        hours: d.added_hours ?? 0,
        covered: d.covered_hours ?? 0,
        fee: Number(d.fee ?? 0).toFixed(2),
        source: t(`attendance.logs.source.${String(d.source ?? 'checkout')}`),
      });
    }
    if (event.event_type === 'charge_reduced') {
      return t('attendance.logs.reducedDetail', { hours: d.reduced_hours ?? 0, refund: Number(d.refund ?? 0).toFixed(2) });
    }
    if ((event.event_type === 'correction' || event.event_type === 'charge_waived') && typeof d.reason === 'string') return d.reason;
    if (event.event_type === 'check_out' && typeof d.pickup_person_name === 'string') {
      return t('attendance.pickedUpBy', { name: d.pickup_person_name });
    }
    if (event.event_type === 'absence_reported' && typeof d.reason === 'string') return t(`attendance.absence.reasons.${d.reason}`);
    return null;
  };

  return (
    <ol className="space-y-2 border-s border-outline-variant ps-4">
      {query.data.map((event) => {
        const actor = event.actor
          ? (i18n.language === 'ar' ? event.actor.name_ar || event.actor.name_en : event.actor.name_en || event.actor.name_ar)
          : null;
        const detail = describe(event);
        return (
          <li key={event.id} className="text-xs">
            <p className="font-semibold text-on-surface">
              {new Date(event.occurred_at).toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit', hour12: true })}
              {' · '}
              {t(`attendance.events.${event.event_type}`)}
              {event.method ? ` · ${t(`attendance.method.${event.method}`)}` : ''}
            </p>
            <p className="text-on-surface-variant">
              {actor ? t('attendance.byStaff', { name: actor }) : t('attendance.logs.system')}
              {detail ? ` · ${detail}` : ''}
            </p>
          </li>
        );
      })}
    </ol>
  );
}
