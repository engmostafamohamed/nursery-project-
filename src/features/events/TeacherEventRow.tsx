import { useTranslation } from 'react-i18next';

import { EventDateBlock } from '@/components/events/EventDateBlock';
import { Button } from '@/components/ui/button';
import { StatusPill, Td, Tr } from '@/components/ui/DataTable';
import { MaterialSymbol } from '@/components/ui/MaterialSymbol';
import { localName } from '@/lib/bilingualName';
import { cn } from '@/lib/utils';

import { CATEGORY_ICON, categoryToneOf, eventTimeRange, SCOPE_ICON } from './events';
import type { TeacherEventWhen } from './teacherEvents';
import type { TeacherEvent } from './teacherEventsApi';

/**
 * One event in the teacher's events table: its day in the category's colour, the name with its
 * kind and who it is for, when and where, how many of the teacher's children are going and were
 * checked in, and the button to see who.
 */
export function TeacherEventRow({ event, when, locale, onOpen }: {
  event: TeacherEvent;
  when: TeacherEventWhen;
  locale: string;
  onOpen: () => void;
}) {
  const { t, i18n } = useTranslation();
  const title = localName(event.title_ar, event.title_en, i18n.language.startsWith('ar'));

  return (
    <Tr className={cn(when === 'today' && 'bg-primary/5')} data-testid="teacher-event-row">
      <Td className="w-16">
        <EventDateBlock startsAt={event.starts_at} category={event.category} locale={locale} className="h-12 w-11" />
      </Td>
      <Td className="min-w-[12rem]">
        <span className="block break-words font-semibold text-on-surface">{title}</span>
        <span className="mt-1 flex flex-wrap gap-1.5">
          {when === 'today' ? <StatusPill tone="primary" icon="today">{t('teacher.events.todayBadge')}</StatusPill> : null}
          {event.is_urgent ? <StatusPill tone="error" icon="priority_high">{t('admin.events.list.urgentBadge')}</StatusPill> : null}
          <StatusPill tone={categoryToneOf(event.category)} icon={CATEGORY_ICON[event.category]}>
            {t(`admin.events.create.categories.${event.category}`)}
          </StatusPill>
          <StatusPill icon={SCOPE_ICON[event.target_scope]}>{t(`teacher.events.scope.${event.target_scope}`)}</StatusPill>
        </span>
      </Td>
      <Td className="whitespace-nowrap text-on-surface">{eventTimeRange(event.starts_at, event.ends_at, locale)}</Td>
      <Td className="max-w-[12rem]">
        <span className="block truncate text-on-surface-variant" title={event.location ?? undefined}>{event.location || '—'}</span>
      </Td>
      <Td>
        <span className="flex flex-wrap gap-1.5">
          <StatusPill tone={event.going > 0 ? 'success' : 'neutral'} icon="groups">{t('teacher.events.going', { count: event.going })}</StatusPill>
          {event.checked_in > 0 ? <StatusPill tone="primary" icon="how_to_reg">{t('teacher.events.checkedIn', { count: event.checked_in })}</StatusPill> : null}
        </span>
      </Td>
      <Td align="end">
        <Button type="button" size="sm" variant={when === 'today' ? 'default' : 'outline'} onClick={onOpen} disabled={event.asked === 0} data-testid="teacher-event-open">
          <MaterialSymbol name="checklist" size="text-base" className="me-1" />
          {t('teacher.events.whoIsGoing')}
        </Button>
      </Td>
    </Tr>
  );
}
