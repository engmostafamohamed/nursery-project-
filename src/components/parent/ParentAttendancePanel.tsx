import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';

import { PeriodFilter } from '@/components/admin/PeriodFilter';
import { Button } from '@/components/ui/button';
import { DataTable, StatusPill, TableCard, TableEmpty, TablePagination, TBody, Td, Th, THead, Tr } from '@/components/ui/DataTable';
import { FilterBar, SearchInput } from '@/components/ui/FilterBar';
import { FilterField } from '@/components/ui/FilterField';
import { Input } from '@/components/ui/input';
import { MaterialSymbol } from '@/components/ui/MaterialSymbol';
import { Select } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { StatTile } from '@/components/ui/StatTile';
import { useAttendanceDays } from '@/hooks/useAttendanceDays';
import { useChildCodes, useChildrenToday } from '@/hooks/useChildrenToday';
import { usePagination } from '@/hooks/usePagination';
import { usePeriodState } from '@/hooks/usePeriodState';
import { averageMinutesToTimeLabel } from '@/lib/attendanceAnalytics';
import { staffName, type AttendanceDay } from '@/lib/attendanceApi';
import { minutesAtNursery, WEEKDAYS, weekdayName } from '@/lib/attendanceKpiDetails';
import { KPI_PERIODS, rangeLabel } from '@/lib/attendancePeriods';
import { isAttended } from '@/lib/childAttendanceHistory';
import { formatMoneyAmount } from '@/lib/money';
import { getNurseryCalendarDateString } from '@/lib/nurseryDay';
import {
  familyDaysFor,
  familyHistoryDays,
  familyPeriod,
  familyToday,
  filterFamilyDays,
  hasFamilyFilters,
  keepParentTile,
  NO_FAMILY_FILTERS,
  sortFamilyDays,
  type FamilyDayState,
  type FamilyFilters,
  type ParentTile,
} from '@/lib/parentAttendance';

type Child = { id: string; nameAr: string; nameEn: string };

const TILE = 'xl:flex-col xl:items-start xl:gap-2';
const STATES: FamilyDayState[] = ['attended', 'absent', 'excused', 'extra'];

/**
 * The family's attendance in one card: today right now, or a month, quarter, half year, year or
 * picked dates. Each number opens the days it counts, with the exact time of arrival and pickup,
 * who brought and picked up the child, and the extra hours; filtered by child (name or code),
 * weekday, date and state. A day opens the child's attendance history.
 */
export function ParentAttendancePanel({ children }: { children: Child[] }) {
  const { t, i18n } = useTranslation();
  const locale = i18n.language.startsWith('ar') ? 'ar-EG' : 'en-GB';
  const [today] = useState(() => getNurseryCalendarDateString());
  const period = usePeriodState('today', today);
  const [selected, setSelected] = useState<ParentTile | null>(null);
  const childIds = useMemo(() => children.map((child) => child.id), [children]);
  const live = useChildrenToday(childIds);
  const codes = useChildCodes(childIds);
  const shown = period.shown;
  const daysQuery = useAttendanceDays({
    childIds,
    from: shown?.from ?? '',
    to: shown?.to ?? '',
    enabled: Boolean(shown && shown.from <= shown.to),
  });
  const isToday = period.choice === 'today';
  const money = (amount: number) => t('invoice.egpAmount', { amount: formatMoneyAmount(Number(amount ?? 0)) });

  const days = useMemo(() => familyHistoryDays(daysQuery.data ?? [], today), [daysQuery.data, today]);
  // Today's list keeps the children who have not come yet (absent so far).
  const todayDays = useMemo(() => (daysQuery.data ?? []).filter((day) => day.date === today), [daysQuery.data, today]);
  const now = useMemo(() => familyToday(live.data ?? []), [live.data]);
  const stats = useMemo(() => familyPeriod(days), [days]);
  const lateNow = useMemo(() => new Set((live.data ?? []).filter((row) => row.late_now).map((row) => row.child_id)), [live.data]);

  const select = (tile: ParentTile) => setSelected((current) => (current === tile ? null : tile));
  const pick = (tile: ParentTile) => ({ className: TILE, onClick: () => select(tile), active: selected === tile });
  const clock = (minutes: number | null) => (minutes === null ? '—' : averageMinutesToTimeLabel(minutes, i18n.language));
  const loading = isToday ? live.isPending : daysQuery.isPending;

  const tileTitle = (tile: ParentTile): string => {
    switch (tile) {
      case 'attended':
        return isToday ? t('parent.attendanceCard.tiles.attendedToday') : t('parent.attendanceCard.tiles.attendedDays');
      case 'in_nursery':
        return t('parent.attendanceCard.tiles.inNursery');
      case 'picked_up':
        return t('parent.attendanceCard.tiles.pickedUp');
      case 'absent':
        return isToday ? t('parent.attendanceCard.tiles.absentToday') : t('parent.attendanceCard.tiles.absentDays');
      case 'late_now':
        return t('parent.attendanceCard.tiles.inExtraNow');
      case 'extra_today':
        return t('parent.attendanceCard.tiles.extraToday');
      case 'rate':
        return t('parent.attendanceCard.tiles.rate');
      case 'extra':
        return t('parent.attendanceCard.tiles.extraDays');
      case 'times':
        return t('parent.attendanceCard.tiles.usualTimes');
    }
  };

  return (
    <TableCard
      title={t('parent.attendanceCard.title')}
      count={shown && shown.from <= shown.to ? rangeLabel(shown, locale) : undefined}
      description={t('parent.attendanceCard.description')}
      filters={
        <PeriodFilter
          state={period}
          choices={KPI_PERIODS}
          onChoose={(next) => setSelected((tile) => keepParentTile(tile, next === 'today'))}
        />
      }
    >
      {!period.valid ? (
        <p className="px-4 py-6 text-sm text-on-surface-variant sm:px-5">{t('periodFilter.chooseDates')}</p>
      ) : loading ? (
        <div className="grid grid-cols-2 gap-3 p-4 sm:grid-cols-3 sm:p-5 xl:grid-cols-6">
          {[1, 2, 3, 4, 5, 6].map((k) => <Skeleton key={k} className="h-24 rounded-xl" />)}
        </div>
      ) : (isToday ? live.isError : daysQuery.isError) ? (
        <div className="m-4 flex flex-wrap items-center gap-3 rounded-xl border border-error/30 bg-error/5 p-3 text-sm text-error sm:m-5" role="alert">
          <MaterialSymbol name="error" className="text-xl" />
          <span className="flex-1">{t('attendanceHistory.loadError')}</span>
          <Button type="button" size="sm" variant="outline" onClick={() => void (isToday ? live.refetch() : daysQuery.refetch())}>
            {t('common.retry')}
          </Button>
        </div>
      ) : isToday ? (
        <div className="grid grid-cols-2 gap-3 p-4 sm:grid-cols-3 sm:p-5 xl:grid-cols-6">
          <StatTile {...pick('attended')} icon="how_to_reg" label={tileTitle('attended')} value={now.attended} helper={t('parent.attendanceCard.ofChildren', { count: now.children })} />
          <StatTile {...pick('in_nursery')} icon="home_work" label={tileTitle('in_nursery')} value={now.inNursery} />
          <StatTile {...pick('picked_up')} icon="logout" label={tileTitle('picked_up')} value={now.pickedUp} tone="success" />
          <StatTile
            {...pick('absent')}
            icon="event_busy"
            label={tileTitle('absent')}
            value={now.absent}
            tone={now.absent > 0 ? 'warning' : 'neutral'}
            helper={now.withNotice > 0 ? t('parent.attendanceCard.withNotice', { count: now.withNotice }) : undefined}
          />
          <StatTile
            {...pick('late_now')}
            icon="schedule"
            label={tileTitle('late_now')}
            value={now.inExtraNow}
            tone={now.inExtraNow > 0 ? 'error' : 'neutral'}
            helper={t('parent.attendanceCard.inExtraNowHint')}
          />
          <StatTile
            {...pick('extra_today')}
            icon="more_time"
            label={tileTitle('extra_today')}
            value={now.extraChildren}
            tone={now.extraChildren > 0 ? 'warning' : 'neutral'}
            helper={t('parent.attendanceCard.hoursFee', { hours: now.extraHours, fee: money(now.extraFee) })}
          />
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 p-4 sm:grid-cols-3 sm:p-5 xl:grid-cols-5">
          <StatTile {...pick('attended')} icon="how_to_reg" label={tileTitle('attended')} value={stats.attended} helper={t('parent.attendanceCard.ofExpected', { count: stats.expected })} />
          <StatTile
            {...pick('rate')}
            icon="percent"
            label={tileTitle('rate')}
            value={stats.ratePct === null ? '—' : `${stats.ratePct}%`}
            tone={stats.ratePct === null ? 'neutral' : stats.ratePct >= 80 ? 'success' : 'warning'}
          />
          <StatTile
            {...pick('absent')}
            icon="event_busy"
            label={tileTitle('absent')}
            value={stats.absent + stats.withNotice}
            tone={stats.absent > 0 ? 'error' : 'neutral'}
            helper={t('parent.attendanceCard.absentSplit', { without: stats.absent, with: stats.withNotice })}
          />
          <StatTile
            {...pick('extra')}
            icon="more_time"
            label={tileTitle('extra')}
            value={stats.extraDays}
            tone={stats.extraDays > 0 ? 'warning' : 'neutral'}
            helper={t('parent.attendanceCard.extraSplit', { children: stats.extraChildren, hours: stats.extraHours, fee: money(stats.extraFee) })}
          />
          <StatTile
            {...pick('times')}
            icon="schedule"
            label={tileTitle('times')}
            value={clock(stats.avgArrival)}
            helper={stats.avgDeparture === null ? undefined : t('parent.attendanceCard.leavesAround', { time: clock(stats.avgDeparture) })}
          />
        </div>
      )}

      {selected && period.valid && !loading ? (
        <FamilyDaysTable
          key={`${selected}|${shown?.from}|${shown?.to}`}
          title={tileTitle(selected)}
          days={familyDaysFor(selected, isToday ? todayDays : days, lateNow)}
          children={children}
          codes={codes.data}
          onClose={() => setSelected(null)}
        />
      ) : period.valid ? (
        <p className="flex items-center gap-1.5 px-4 pb-4 text-xs text-on-surface-variant sm:px-5">
          <MaterialSymbol name="touch_app" className="text-sm" />
          {t('parent.attendanceCard.hint')}
        </p>
      ) : null}
    </TableCard>
  );
}

/** The days behind a number: when each child arrived and left, who brought and picked them up, and the extra hours. */
function FamilyDaysTable({
  title,
  days,
  children,
  codes,
  onClose,
}: {
  title: string;
  days: AttendanceDay[];
  children: Child[];
  codes: Map<string, string | null> | undefined;
  onClose: () => void;
}) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const locale = lang.startsWith('ar') ? 'ar-EG' : 'en-GB';
  const navigate = useNavigate();
  const [filters, setFilters] = useState<FamilyFilters>(NO_FAMILY_FILTERS);
  const byId = useMemo(
    () => new Map(children.map((child) => [child.id, { nameAr: child.nameAr, nameEn: child.nameEn, code: codes?.get(child.id) ?? null }])),
    [children, codes],
  );
  const rows = useMemo(() => sortFamilyDays(filterFamilyDays(days, filters, byId)), [days, filters, byId]);
  const pager = usePagination(rows, 20, JSON.stringify(filters));
  const set = (patch: Partial<FamilyFilters>) => setFilters((current) => ({ ...current, ...patch }));

  const name = (childId: string) => {
    const child = byId.get(childId);
    return (lang.startsWith('ar') ? child?.nameAr || child?.nameEn : child?.nameEn || child?.nameAr) || '—';
  };
  const time = (iso: string | null) => (iso ? new Date(iso).toLocaleTimeString(locale, { hour: 'numeric', minute: '2-digit', hour12: true }) : '—');
  const date = (ymd: string) => new Date(`${ymd}T12:00:00`).toLocaleDateString(locale, { weekday: 'long', day: 'numeric', month: 'short', year: 'numeric' });
  const span = (minutes: number) =>
    minutes >= 60
      ? t('attendanceHistory.log.hoursMinutes', { hours: Math.floor(minutes / 60), minutes: minutes % 60 })
      : t('attendanceHistory.log.minutesOnly', { minutes });
  const stateLabel = (state: FamilyDayState) => {
    if (state === 'attended') return t('parent.attendanceCard.states.attended');
    if (state === 'absent') return t('parent.attendanceCard.states.absent');
    if (state === 'excused') return t('parent.attendanceCard.states.excused');
    return t('parent.attendanceCard.states.extra');
  };

  return (
    <section className="border-t border-outline-variant" aria-label={title}>
      <div className="flex flex-wrap items-center justify-between gap-3 bg-surface-container-lowest px-4 py-3 sm:px-5">
        <div className="min-w-0">
          <h3 className="flex flex-wrap items-center gap-2 text-sm font-semibold text-on-surface">
            <MaterialSymbol name="list_alt" className="text-base text-primary" />
            {title}
            <span className="rounded-full bg-surface-high px-2 py-0.5 text-xs font-medium tabular-nums text-on-surface-variant">
              {t('parent.attendanceCard.daysCount', { count: rows.length })}
            </span>
          </h3>
          <p className="mt-0.5 text-xs text-on-surface-variant">{t('parent.attendanceCard.openDay')}</p>
        </div>
        <Button type="button" variant="ghost" size="icon" aria-label={t('parent.attendanceCard.close')} onClick={onClose}>
          <MaterialSymbol name="close" />
        </Button>
      </div>

      <div className="border-y border-outline-variant px-4 py-3 sm:px-5">
        <FilterBar onClear={() => setFilters(NO_FAMILY_FILTERS)} canClear={hasFamilyFilters(filters)}>
          <FilterField label={t('parent.attendanceCard.filters.search')} className="sm:flex-[2]">
            <SearchInput value={filters.search} onChange={(search) => set({ search })} placeholder={t('parent.attendanceCard.filters.searchPlaceholder')} />
          </FilterField>
          {children.length > 1 ? (
            <FilterField label={t('parent.attendanceCard.filters.child')}>
              <Select value={filters.childId} onChange={(e) => set({ childId: e.target.value })}>
                <option value="all">{t('parent.attendanceCard.filters.allChildren')}</option>
                {children.map((child) => (
                  <option key={child.id} value={child.id}>{name(child.id)}</option>
                ))}
              </Select>
            </FilterField>
          ) : null}
          <FilterField label={t('parent.attendanceCard.filters.weekday')}>
            <Select value={String(filters.weekday)} onChange={(e) => set({ weekday: e.target.value === 'all' ? 'all' : Number(e.target.value) })}>
              <option value="all">{t('parent.attendanceCard.filters.allDays')}</option>
              {WEEKDAYS.map((weekday) => (
                <option key={weekday} value={weekday}>{weekdayName(weekday, locale)}</option>
              ))}
            </Select>
          </FilterField>
          <FilterField label={t('parent.attendanceCard.filters.date')}>
            <Input type="date" value={filters.day} onChange={(e) => set({ day: e.target.value })} />
          </FilterField>
          <FilterField label={t('parent.attendanceCard.filters.state')}>
            <Select value={filters.state} onChange={(e) => set({ state: e.target.value as FamilyFilters['state'] })}>
              <option value="all">{t('parent.attendanceCard.filters.allStates')}</option>
              {STATES.map((state) => (
                <option key={state} value={state}>{stateLabel(state)}</option>
              ))}
            </Select>
          </FilterField>
        </FilterBar>
      </div>

      {!rows.length ? (
        <TableEmpty icon="inbox" title={days.length ? t('parent.attendanceCard.noMatch') : t('parent.attendanceCard.noDays')} />
      ) : (
        <>
          <DataTable minWidth={960}>
            <THead>
              <Th>{t('parent.attendanceCard.columns.date')}</Th>
              <Th>{t('parent.attendanceCard.columns.child')}</Th>
              <Th>{t('parent.attendanceCard.columns.state')}</Th>
              <Th>{t('parent.attendanceCard.columns.arrived')}</Th>
              <Th>{t('parent.attendanceCard.columns.left')}</Th>
              <Th>{t('parent.attendanceCard.columns.stayed')}</Th>
              <Th>{t('parent.attendanceCard.columns.extraHours')}</Th>
            </THead>
            <TBody>
              {pager.pageItems.map((day) => {
                const minutes = minutesAtNursery({ check_in: day.checkIn, check_out: day.checkOut });
                const code = byId.get(day.childId)?.code;
                return (
                  <Tr key={`${day.childId}|${day.date}`} onClick={() => navigate(`/parent/attendance?child=${day.childId}`)}>
                    <Td>
                      <span className="whitespace-nowrap font-medium text-on-surface">{date(day.date)}</span>
                    </Td>
                    <Td>
                      <p className="font-medium text-on-surface">{name(day.childId)}</p>
                      {code ? <p className="font-mono text-xs text-on-surface-variant" dir="ltr">{code}</p> : null}
                    </Td>
                    <Td>
                      {isAttended(day) ? (
                        day.status === 'partial' ? (
                          <StatusPill tone="primary" icon="home_work">{t('parent.attendanceCard.states.here')}</StatusPill>
                        ) : (
                          <StatusPill tone="success" icon="check_circle">{t('parent.attendanceCard.states.attended')}</StatusPill>
                        )
                      ) : day.status === 'excused' ? (
                        <StatusPill tone="warning" icon="mark_email_read">{t('parent.attendanceCard.states.excused')}</StatusPill>
                      ) : (
                        <StatusPill tone="error" icon="event_busy">{t('parent.attendanceCard.states.absent')}</StatusPill>
                      )}
                    </Td>
                    <Td>
                      {day.checkIn ? (
                        <>
                          <p className="whitespace-nowrap font-semibold tabular-nums text-on-surface">{time(day.checkIn)}</p>
                          <p className="text-xs text-on-surface-variant">{staffName(day.dropoffPersonName, lang) ?? t('parent.attendanceCard.notRecorded')}</p>
                        </>
                      ) : (
                        '—'
                      )}
                    </Td>
                    <Td>
                      {day.checkOut ? (
                        <>
                          <p className="whitespace-nowrap font-semibold tabular-nums text-on-surface">{time(day.checkOut)}</p>
                          <p className="text-xs text-on-surface-variant">
                            {day.pickupPersonName ?? t('parent.attendanceCard.notRecorded')}
                            {day.pickupPersonName && day.pickupRelationship ? ` · ${day.pickupRelationship}` : ''}
                          </p>
                        </>
                      ) : day.checkIn ? (
                        <StatusPill tone="primary" icon="home_work">{t('parent.attendanceCard.states.here')}</StatusPill>
                      ) : (
                        '—'
                      )}
                    </Td>
                    <Td>{minutes === null ? '—' : <span className="whitespace-nowrap">{span(minutes)}</span>}</Td>
                    <Td>
                      {day.extraHours > 0 ? (
                        <span className="font-medium text-warning">
                          {t('attendance.extraHoursShort', { hours: day.extraHours })}
                          {day.extraFee > 0 ? (
                            <span className="block text-xs font-normal text-on-surface-variant">
                              {t('invoice.egpAmount', { amount: formatMoneyAmount(day.extraFee) })}
                            </span>
                          ) : null}
                        </span>
                      ) : (
                        <span className="text-on-surface-variant">{t('parent.attendanceCard.none')}</span>
                      )}
                    </Td>
                  </Tr>
                );
              })}
            </TBody>
          </DataTable>
          <TablePagination pager={pager} />
        </>
      )}
    </section>
  );
}
