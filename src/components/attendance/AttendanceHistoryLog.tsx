import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { MaterialSymbol } from '@/components/ui/MaterialSymbol';
import { Pagination } from '@/components/ui/Pagination';
import { usePagination } from '@/hooks/usePagination';
import { staffName, type AttendanceDay } from '@/lib/attendanceApi';
import { absenceDays, isAttended, stayMinutes } from '@/lib/childAttendanceHistory';
import { cn } from '@/lib/utils';

type LogFilter = 'all' | 'attended' | 'absent' | 'late';

function useDayFormat() {
  const { i18n } = useTranslation();
  const locale = i18n.language.startsWith('ar') ? 'ar-EG' : 'en-GB';
  return {
    lang: i18n.language,
    longDate: (date: string) =>
      new Date(`${date}T12:00:00`).toLocaleDateString(locale, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }),
    time: (iso: string) => new Date(iso).toLocaleTimeString(locale, { hour: 'numeric', minute: '2-digit', hour12: true }),
    dateTime: (iso: string) =>
      new Date(iso).toLocaleString(locale, { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', hour12: true }),
  };
}

/** "5 h 45 min", or "40 min" under an hour. */
function useSpanLabel() {
  const { t } = useTranslation();
  return (minutes: number) =>
    minutes >= 60
      ? t('attendanceHistory.log.hoursMinutes', { hours: Math.floor(minutes / 60), minutes: minutes % 60 })
      : t('attendanceHistory.log.minutesOnly', { minutes });
}

/** The day's state with an icon and words, never colour alone. */
function DayStatusChip({ day }: { day: AttendanceDay }) {
  const { t } = useTranslation();
  const look = {
    present: { icon: 'check_circle', className: 'border-success/30 bg-success/10 text-success', label: t('attendance.status.present') },
    partial: { icon: 'login', className: 'border-primary/30 bg-primary/10 text-primary', label: t('attendance.status.partial') },
    excused: { icon: 'mark_email_read', className: 'border-warning/30 bg-warning/10 text-warning', label: t('attendanceHistory.series.withNotice') },
    absent: { icon: 'event_busy', className: 'border-error/30 bg-error/10 text-error', label: t('attendanceHistory.series.withoutNotice') },
    holiday: { icon: 'celebration', className: 'border-outline-variant bg-surface-container-low text-on-surface-variant', label: t('attendance.status.holiday') },
  }[day.status as 'present' | 'partial' | 'excused' | 'absent' | 'holiday'];
  if (!look) return null;
  return (
    <span className={cn('inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-semibold', look.className)}>
      <MaterialSymbol name={look.icon} size="text-sm" />
      {look.label}
    </span>
  );
}

/** The family's notice for an absence: reason, note, who sent it and when; or that none came. */
function AbsenceNotice({ day }: { day: AttendanceDay }) {
  const { t } = useTranslation();
  const format = useDayFormat();
  if (day.status !== 'excused') {
    return <p className="text-sm text-on-surface-variant">{t('attendanceHistory.absences.noNoticeText')}</p>;
  }
  const reporter = staffName(day.absenceReportedBy, format.lang);
  return (
    <div className="space-y-1.5 text-sm">
      {day.absenceReason ? (
        <p className="font-medium text-on-surface">
          {t('attendanceHistory.absences.reason')}: {t(`attendance.absence.reasons.${day.absenceReason}`, { defaultValue: day.absenceReason })}
        </p>
      ) : null}
      {day.absenceNote ? (
        <p className="whitespace-pre-line rounded-lg bg-surface-container-lowest px-3 py-2 text-on-surface-variant">“{day.absenceNote}”</p>
      ) : null}
      {reporter || day.absenceReportedAt ? (
        <p className="text-xs text-on-surface-variant">
          {t('attendanceHistory.absences.reportedBy', {
            name: reporter ?? t('attendanceHistory.log.notRecorded'),
            when: day.absenceReportedAt ? format.dateTime(day.absenceReportedAt) : '—',
          })}
        </p>
      ) : null}
    </div>
  );
}

/** Every absence in the period, newest first, with the family's notice. */
export function AttendanceAbsencesList({ days }: { days: AttendanceDay[] }) {
  const { t } = useTranslation();
  const format = useDayFormat();
  const absences = useMemo(() => absenceDays(days), [days]);
  const pager = usePagination(absences, 5, absences.length);

  return (
    <section className="rounded-xl border border-outline-variant bg-surface shadow-sm">
      <header className="border-b border-outline-variant bg-surface-container-lowest px-4 py-3">
        <h3 className="text-sm font-semibold text-on-surface">{t('attendanceHistory.absences.title', { count: absences.length })}</h3>
        <p className="mt-0.5 text-xs text-on-surface-variant">{t('attendanceHistory.absences.subtitle')}</p>
      </header>
      {absences.length ? (
        <ul className="divide-y divide-outline-variant">
          {pager.pageItems.map((day) => (
            <li key={day.date} className="space-y-2 px-4 py-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-semibold text-on-surface">{format.longDate(day.date)}</span>
                <DayStatusChip day={day} />
              </div>
              <AbsenceNotice day={day} />
            </li>
          ))}
        </ul>
      ) : (
        <p className="flex items-center gap-2 px-4 py-6 text-sm text-on-surface-variant">
          <MaterialSymbol name="verified" className="text-success" />
          {t('attendanceHistory.absences.none')}
        </p>
      )}
      <div className="px-4 pb-3">
        <Pagination
          page={pager.page}
          pageCount={pager.pageCount}
          total={pager.total}
          startIndex={pager.startIndex}
          endIndex={pager.endIndex}
          hasPrev={pager.hasPrev}
          hasNext={pager.hasNext}
          onPrev={pager.prev}
          onNext={pager.next}
        />
      </div>
    </section>
  );
}

function Moment({
  icon,
  title,
  time,
  personLabel,
  person,
  relationship,
  photoUrl,
  staffLabel,
  staff,
  method,
}: {
  icon: string;
  title: string;
  time: string;
  personLabel: string;
  person: string | null;
  relationship: string | null;
  photoUrl?: string | null;
  staffLabel: string;
  staff: string | null;
  method: string | null;
}) {
  const { t } = useTranslation();
  return (
    <div className="rounded-lg bg-surface-container-lowest p-3">
      <p className="flex items-center gap-1.5 text-xs font-medium text-on-surface-variant">
        <MaterialSymbol name={icon} size="text-base" />
        {title}
      </p>
      <p className="mt-0.5 text-base font-semibold tabular-nums text-on-surface">{time}</p>
      <dl className="mt-2 space-y-1.5 text-xs">
        <div>
          <dt className="text-on-surface-variant">{personLabel}</dt>
          <dd className="mt-0.5 flex items-center gap-2 font-medium text-on-surface">
            {photoUrl ? <img src={photoUrl} alt="" className="h-7 w-7 shrink-0 rounded-full object-cover ring-1 ring-outline-variant" loading="lazy" /> : null}
            <span className="min-w-0">
              {person ?? <span className="font-normal text-on-surface-variant">{t('attendanceHistory.log.notRecorded')}</span>}
              {person && relationship ? <span className="font-normal text-on-surface-variant"> · {relationship}</span> : null}
            </span>
          </dd>
        </div>
        <div>
          <dt className="text-on-surface-variant">{staffLabel}</dt>
          <dd className="mt-0.5 text-on-surface">
            {staff ?? '—'}
            {method ? <span className="text-on-surface-variant"> · {method}</span> : null}
          </dd>
        </div>
      </dl>
    </div>
  );
}

/**
 * Day by day, newest first: when the child arrived and left, who brought and picked them up, which
 * staff member received and handed them over, late pickups, and the family's notice on absences.
 */
export function AttendanceDayLog({ days, showReview }: { days: AttendanceDay[]; showReview: boolean }) {
  const { t } = useTranslation();
  const format = useDayFormat();
  const spanLabel = useSpanLabel();
  const [filter, setFilter] = useState<LogFilter>('all');

  const filtered = useMemo(() => {
    if (filter === 'attended') return days.filter(isAttended);
    if (filter === 'absent') return absenceDays(days);
    if (filter === 'late') return days.filter((day) => day.extraHours > 0);
    return days;
  }, [days, filter]);
  const pager = usePagination(filtered, 10, `${filter}|${filtered.length}`);

  const filters: Array<{ value: LogFilter; label: string }> = [
    { value: 'all', label: t('attendanceHistory.log.filterAll') },
    { value: 'attended', label: t('attendanceHistory.series.attended') },
    { value: 'absent', label: t('attendanceHistory.log.filterAbsent') },
    { value: 'late', label: t('attendanceHistory.log.filterLate') },
  ];
  const methodLabel = (method: AttendanceDay['checkInMethod']) => (method ? t(`attendance.method.${method}`) : null);

  return (
    <section className="rounded-xl border border-outline-variant bg-surface shadow-sm">
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-outline-variant bg-surface-container-lowest px-4 py-3">
        <div>
          <h3 className="text-sm font-semibold text-on-surface">{t('attendanceHistory.log.title')}</h3>
          <p className="mt-0.5 text-xs text-on-surface-variant">{t('attendanceHistory.log.subtitle')}</p>
        </div>
        <div role="radiogroup" aria-label={t('attendanceHistory.log.filterLabel')} className="flex flex-wrap gap-1.5">
          {filters.map((option) => (
            <button
              key={option.value}
              type="button"
              role="radio"
              aria-checked={filter === option.value}
              onClick={() => setFilter(option.value)}
              className={cn(
                'rounded-full border px-3 py-1 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
                filter === option.value
                  ? 'border-primary bg-primary/10 text-primary'
                  : 'border-outline-variant text-on-surface-variant hover:border-primary/50',
              )}
            >
              {option.label}
            </button>
          ))}
        </div>
      </header>

      {pager.pageItems.length ? (
        <ul className="space-y-3 p-4">
          {pager.pageItems.map((day) => {
            const minutes = stayMinutes(day);
            return (
              <li key={day.date} className="rounded-xl border border-outline-variant p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-semibold text-on-surface">{format.longDate(day.date)}</span>
                    <DayStatusChip day={day} />
                  </div>
                  {minutes !== null ? (
                    <span className="inline-flex items-center gap-1 text-xs text-on-surface-variant">
                      <MaterialSymbol name="timelapse" size="text-sm" />
                      {t('attendanceHistory.log.duration', { time: spanLabel(minutes) })}
                    </span>
                  ) : null}
                </div>

                {isAttended(day) ? (
                  <div className="mt-3 grid gap-3 sm:grid-cols-2">
                    <Moment
                      icon="login"
                      title={t('attendanceHistory.log.arrival')}
                      time={day.checkIn ? format.time(day.checkIn) : '—'}
                      personLabel={t('attendanceHistory.log.broughtBy')}
                      person={staffName(day.dropoffPersonName, format.lang)}
                      relationship={day.dropoffRelationship}
                      staffLabel={t('attendanceHistory.log.receivedBy')}
                      staff={staffName(day.checkedInBy, format.lang)}
                      method={methodLabel(day.checkInMethod)}
                    />
                    <Moment
                      icon="logout"
                      title={t('attendanceHistory.log.departure')}
                      time={day.checkOut ? format.time(day.checkOut) : t('attendanceHistory.log.notCheckedOut')}
                      personLabel={t('attendanceHistory.log.pickedUpBy')}
                      person={day.checkOut ? day.pickupPersonName : null}
                      relationship={day.pickupRelationship}
                      photoUrl={day.pickupPhotoUrl}
                      staffLabel={t('attendanceHistory.log.handedOverBy')}
                      staff={day.checkOut ? staffName(day.checkedOutBy, format.lang) : null}
                      method={day.checkOut ? methodLabel(day.checkOutMethod) : null}
                    />
                  </div>
                ) : day.status === 'excused' || day.status === 'absent' ? (
                  <div className="mt-2">
                    <AbsenceNotice day={day} />
                  </div>
                ) : null}

                {day.extraHours > 0 ? (
                  <p className="mt-3 flex flex-wrap items-center gap-1.5 text-xs text-warning">
                    <MaterialSymbol name="schedule" size="text-sm" />
                    <span className="font-semibold">
                      {t(day.checkOut ? 'attendanceHistory.log.latePickup' : 'attendanceHistory.log.lateNotCheckedOut', {
                        time: spanLabel(day.lateMinutes),
                      })}
                    </span>
                    <span className="text-on-surface-variant">
                      · {t('attendance.extraHoursShort', { hours: day.extraHours })}
                      {day.extraHoursCovered > 0 ? ` · ${t('attendance.coveredByPackage', { hours: day.extraHoursCovered })}` : ''}
                    </span>
                  </p>
                ) : null}

                {showReview && day.needsReview ? (
                  <p className="mt-2 flex items-center gap-1.5 text-xs text-error">
                    <MaterialSymbol name="flag" size="text-sm" />
                    {t('attendance.needsReview')}
                    {day.reviewReason ? ` · ${t(`attendance.reviewReason.${day.reviewReason}`, { defaultValue: day.reviewReason })}` : ''}
                  </p>
                ) : null}
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="px-4 py-8 text-center text-sm text-on-surface-variant">{t('attendanceHistory.log.empty')}</p>
      )}

      <div className="px-4 pb-4">
        <Pagination
          page={pager.page}
          pageCount={pager.pageCount}
          total={pager.total}
          startIndex={pager.startIndex}
          endIndex={pager.endIndex}
          hasPrev={pager.hasPrev}
          hasNext={pager.hasNext}
          onPrev={pager.prev}
          onNext={pager.next}
        />
      </div>
    </section>
  );
}
