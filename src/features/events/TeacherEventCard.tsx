import { useTranslation } from 'react-i18next';

import { EventDateBlock } from '@/components/events/EventDateBlock';
import { Button } from '@/components/ui/button';
import { StatusPill } from '@/components/ui/DataTable';
import { MaterialSymbol } from '@/components/ui/MaterialSymbol';
import { localName } from '@/lib/bilingualName';
import { cn } from '@/lib/utils';

import { CATEGORY_ICON, categoryToneOf, eventTimeRange, SCOPE_ICON } from './events';
import type { TeacherEventWhen } from './teacherEvents';
import type { TeacherEvent } from './teacherEventsApi';

/**
 * One event in the teacher's list: its day in the category's colour, when and where, how many of
 * the teacher's children are going and were checked in, and the button to see who.
 */
export function TeacherEventCard({ event, when, locale, onOpen }: {
  event: TeacherEvent;
  when: TeacherEventWhen;
  locale: string;
  onOpen: () => void;
}) {
  const { t, i18n } = useTranslation();
  const title = localName(event.title_ar, event.title_en, i18n.language.startsWith('ar'));

  return (
    <article
      className={cn(
        'flex gap-4 rounded-xl border bg-surface p-4 shadow-sm',
        when === 'today' ? 'border-primary/50' : event.is_urgent && when === 'upcoming' ? 'border-error/40' : 'border-outline-variant',
      )}
      data-testid="teacher-event-card"
    >
      <EventDateBlock startsAt={event.starts_at} category={event.category} locale={locale} />

      <div className="min-w-0 flex-1 space-y-2">
        <div className="space-y-1.5">
          <h3 className="break-words text-base font-semibold text-on-surface">{title}</h3>
          <div className="flex flex-wrap gap-1.5">
            {when === 'today' ? <StatusPill tone="primary" icon="today">{t('teacher.events.todayBadge')}</StatusPill> : null}
            {event.is_urgent ? <StatusPill tone="error" icon="priority_high">{t('admin.events.list.urgentBadge')}</StatusPill> : null}
            <StatusPill tone={categoryToneOf(event.category)} icon={CATEGORY_ICON[event.category]}>
              {t(`admin.events.create.categories.${event.category}`)}
            </StatusPill>
            <StatusPill icon={SCOPE_ICON[event.target_scope]}>{t(`teacher.events.scope.${event.target_scope}`)}</StatusPill>
          </div>
        </div>

        <div className="space-y-1 text-sm text-on-surface-variant">
          <p className="flex items-start gap-1.5">
            <MaterialSymbol name="schedule" size="text-base" className="mt-0.5 shrink-0" />
            {eventTimeRange(event.starts_at, event.ends_at, locale)}
          </p>
          {event.location ? (
            <p className="flex items-start gap-1.5">
              <MaterialSymbol name="location_on" size="text-base" className="mt-0.5 shrink-0" />
              <span className="break-words">{event.location}</span>
            </p>
          ) : null}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-outline-variant pt-2">
          <div className="flex flex-wrap gap-1.5">
            <StatusPill tone={event.going > 0 ? 'success' : 'neutral'} icon="groups">{t('teacher.events.going', { count: event.going })}</StatusPill>
            {event.checked_in > 0 ? (
              <StatusPill tone="primary" icon="how_to_reg">{t('teacher.events.checkedIn', { count: event.checked_in })}</StatusPill>
            ) : null}
          </div>
          <Button type="button" size="sm" variant={when === 'today' ? 'default' : 'outline'} onClick={onOpen} disabled={event.asked === 0} data-testid="teacher-event-open">
            <MaterialSymbol name="checklist" size="text-base" className="me-1" />
            {t('teacher.events.whoIsGoing')}
          </Button>
        </div>
      </div>
    </article>
  );
}
