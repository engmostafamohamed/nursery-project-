import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { StatusPill } from '@/components/ui/DataTable';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { LoadError } from '@/components/ui/LoadError';
import { LoadingSkeleton } from '@/components/ui/LoadingSkeleton';
import { MaterialSymbol } from '@/components/ui/MaterialSymbol';
import { localName } from '@/lib/bilingualName';
import { getUserInitials } from '@/lib/utils';

import { eventTimeRange } from './events';
import { rosterSummary } from './teacherEvents';
import type { RosterStatus, TeacherEvent } from './teacherEventsApi';
import { useEventRoster } from './useTeacherEvents';

const GROUP_TONE: Record<RosterStatus, 'success' | 'warning' | 'error'> = { granted: 'success', pending: 'warning', denied: 'error' };

/**
 * Who of the teacher's children is going to an event, who still has to answer and who is not, with
 * each check-in time. On the day, the QR scanner is one tap away.
 */
export function EventRosterDialog({ event, isToday, locale, onClose }: {
  event: TeacherEvent;
  isToday: boolean;
  locale: string;
  onClose: () => void;
}) {
  const { t, i18n } = useTranslation();
  const isAr = i18n.language.startsWith('ar');
  const roster = useEventRoster(event.id);
  const summary = rosterSummary(roster.data ?? []);
  const time = new Intl.DateTimeFormat(locale, { hour: 'numeric', minute: '2-digit', hour12: true });

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-lg" data-testid="event-roster">
        <DialogHeader>
          <DialogTitle>{localName(event.title_ar, event.title_en, isAr)}</DialogTitle>
          <DialogDescription>
            {eventTimeRange(event.starts_at, event.ends_at, locale)}
            {event.location ? ` · ${event.location}` : ''}
          </DialogDescription>
        </DialogHeader>

        {roster.isPending ? (
          <LoadingSkeleton />
        ) : roster.isError ? (
          <LoadError message={t('teacher.events.roster.loadError')} onRetry={() => void roster.refetch()} />
        ) : summary.asked === 0 ? (
          <p className="text-sm text-on-surface-variant">{t('teacher.events.roster.empty')}</p>
        ) : (
          <div className="space-y-4">
            <div className="flex flex-wrap gap-1.5">
              <StatusPill tone={summary.going > 0 ? 'success' : 'neutral'} icon="groups">{t('teacher.events.going', { count: summary.going })}</StatusPill>
              <StatusPill tone={summary.checkedIn > 0 ? 'primary' : 'neutral'} icon="how_to_reg">{t('teacher.events.checkedIn', { count: summary.checkedIn })}</StatusPill>
            </div>
            <div className="max-h-[55vh] space-y-4 overflow-y-auto pe-1">
              {summary.groups.map((group) => (
                <section key={group.status} className="space-y-1">
                  <h3 className="flex items-center gap-2 text-xs font-semibold text-on-surface-variant">
                    <StatusPill tone={GROUP_TONE[group.status]}>{t(`teacher.events.roster.groups.${group.status}`)}</StatusPill>
                    <span className="tabular-nums">{group.children.length}</span>
                  </h3>
                  <ul className="divide-y divide-outline-variant">
                    {group.children.map((child) => {
                      const name = localName(child.name_ar, child.name_en, isAr);
                      const className = localName(child.class_name_ar, child.class_name_en, isAr);
                      return (
                        <li key={child.child_id} className="flex items-center gap-3 py-2" data-testid="roster-child">
                          <Avatar className="h-8 w-8">
                            {child.avatar_url ? <AvatarImage src={child.avatar_url} alt="" /> : null}
                            <AvatarFallback className="text-xs">{getUserInitials(name, null)}</AvatarFallback>
                          </Avatar>
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-medium text-on-surface">{name}</p>
                            {className ? <p className="truncate text-xs text-on-surface-variant">{className}</p> : null}
                          </div>
                          {child.checked_in_at ? (
                            <StatusPill tone="success" icon="how_to_reg">{t('teacher.events.roster.checkedInAt', { time: time.format(new Date(child.checked_in_at)) })}</StatusPill>
                          ) : group.status === 'granted' ? (
                            <span className="text-xs text-on-surface-variant">{t('teacher.events.roster.notCheckedIn')}</span>
                          ) : null}
                        </li>
                      );
                    })}
                  </ul>
                </section>
              ))}
            </div>
          </div>
        )}

        <DialogFooter className="gap-2 sm:gap-0">
          <Button type="button" variant="outline" onClick={onClose}>
            {t('common.close')}
          </Button>
          {isToday && summary.going > 0 ? (
            <Button asChild>
              <Link to="/teacher/scanner">
                <MaterialSymbol name="qr_code_scanner" size="text-base" className="me-1" />
                {t('teacher.events.roster.openScanner')}
              </Link>
            </Button>
          ) : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
