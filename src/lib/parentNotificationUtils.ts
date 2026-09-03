/** Material Symbol name for notification `type` (parent notification center). */
export function parentNotificationMaterialIcon(type: string): string {
  const t = type.toLowerCase();
  if (t === 'attendance_checkin' || t === 'attendance_checkout' || t.startsWith('attendance')) {
    return 'person_check';
  }
  if (t.startsWith('payment')) return 'payments';
  if (t.startsWith('application')) return 'assignment';
  if (t.startsWith('event')) return 'calendar_month';
  if (t.startsWith('invoice')) return 'receipt';
  if (t === 'broadcast' || t.startsWith('broadcast')) return 'campaign';
  if (t.startsWith('permission') || t.startsWith('survey')) return 'task_alt';
  if (t === 'custom') return 'notifications';
  return 'notifications';
}

export function parentNotificationFallbackPath(type: string): string {
  const t = type.toLowerCase();
  if (t.includes('attendance')) return '/parent';
  if (t.includes('message')) return '/parent/messages';
  if (t.includes('event')) return '/parent/events';
  if (t.includes('invoice') || t.includes('financial') || t.includes('payment')) return '/parent/invoices';
  if (t.includes('application')) return '/parent';
  if (t.includes('media')) return '/parent/media';
  if (t.includes('report') || t.includes('daily_report')) return '/parent/daily-reports';
  if (t.includes('permission') || t.includes('survey')) return '/parent/surveys';
  return '/parent';
}

/** Use `action_link` when it is a safe internal `/parent/*` path; else infer from `type`. */
export function resolveParentNotificationPath(type: string, actionLink: string | null | undefined): string {
  if (actionLink) {
    const trimmed = actionLink.trim();
    if (trimmed.startsWith('/parent') && !trimmed.includes('//')) {
      if (!/^[a-zA-Z][a-zA-Z+.-]*:/.test(trimmed)) {
        return trimmed;
      }
    }
  }
  return parentNotificationFallbackPath(type);
}

export function formatNotificationRelativeTime(sentAt: string, lang: string): string {
  const diffSec = Math.round((Date.now() - new Date(sentAt).getTime()) / 1000);
  const rtf = new Intl.RelativeTimeFormat(lang === 'ar' ? 'ar-EG' : 'en', { numeric: 'auto' });
  if (Math.abs(diffSec) < 60) return rtf.format(-diffSec, 'second');
  const mins = Math.round(diffSec / 60);
  if (Math.abs(mins) < 60) return rtf.format(-mins, 'minute');
  const hours = Math.round(mins / 60);
  if (Math.abs(hours) < 24) return rtf.format(-hours, 'hour');
  const days = Math.round(hours / 24);
  return rtf.format(-days, 'day');
}
