import { useMemo, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router-dom';

import { Button } from '@/components/ui/button';
import {
  DataTable,
  StatusPill,
  TableEmpty,
  TableLoading,
  TablePager,
  TablePagination,
  TBody,
  Td,
  Th,
  THead,
  Tr,
  type PillTone,
} from '@/components/ui/DataTable';
import { FilterBar, SearchInput } from '@/components/ui/FilterBar';
import { FilterChips } from '@/components/ui/FilterChips';
import { FilterField } from '@/components/ui/FilterField';
import { Input } from '@/components/ui/input';
import { MaterialSymbol } from '@/components/ui/MaterialSymbol';
import { Select } from '@/components/ui/select';
import {
  useAttendanceDayChildren,
  useAttendancePeriodChildren,
  useAttendancePeriodDays,
  useAttendancePeriodLog,
  useAttendancePeriodRecords,
} from '@/hooks/useAttendanceKpiDetails';
import { useNurseryClasses } from '@/hooks/useClassStaff';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { usePagination } from '@/hooks/usePagination';
import type { DateRange } from '@/lib/attendancePeriods';
import {
  childName,
  childRecordLink,
  classOptions,
  dayRowsFor,
  extraHoursByChild,
  filterList,
  minutesAtNursery,
  NO_LIST_FILTERS,
  NO_LOG_FILTERS,
  recordRowsFor,
  reviewLogLink,
  sortPeriodChildren,
  WEEKDAYS,
  weekdayName,
  type AttendanceLogRow,
  type ChildExtraHours,
  type ChildSortKey,
  type DayChildRow,
  type KpiTile,
  type ListFilters,
  type ListRow,
  type LogFilters,
  type PeriodChildRow,
  type PeriodDayRow,
  type PeriodRecordRow,
  type RecordTile,
  type SortDirection,
  type TodayTile,
} from '@/lib/attendanceKpiDetails';
import { formatMoneyAmount } from '@/lib/money';
import { cn } from '@/lib/utils';

type Props = {
  nurseryId: string;
  tile: KpiTile;
  /** Today's live numbers, or a period's. */
  mode: 'today' | 'period';
  /** The days counted (ending today at the latest). */
  range: DateRange;
  /** Where the admin's pages live: /admin, or /xo-admin/nursery for XO staff. */
  basePath: string;
  title: string;
  onClose: () => void;
  /** From the days table: show who attended on that day. */
  onOpenDay: (day: string) => void;
};

/**
 * The list behind the number chosen on the attendance card, for the card's days: the same rows the
 * number counts, searchable by the child's name or code or a parent's name or phone, and by class.
 * Every row with a child opens that child's record on their attendance.
 */
export function AttendanceKpiDetails({ nurseryId, tile, mode, range, basePath, title, onClose, onOpenDay }: Props) {
  const singleDay = range.from === range.to;
  const openChild = (childId: string) => childRecordLink(basePath, childId, range);
  const common = { nurseryId, range, title, onClose, openChild };

  let body: ReactNode;
  if (mode === 'today' || (tile === 'attended' && singleDay)) {
    body = <DayChildren {...common} day={range.to} tile={tile as TodayTile} />;
  } else if (tile === 'attended') {
    body = <PeriodAttendance {...common} />;
  } else if (tile === 'rate') {
    body = <PeriodDays nurseryId={nurseryId} range={range} title={title} onClose={onClose} onOpenDay={onOpenDay} />;
  } else if (tile === 'late') {
    body = <PeriodExtraHours {...common} />;
  } else {
    body = <PeriodRecords {...common} tile={tile as RecordTile} logLink={reviewLogLink(basePath, range)} />;
  }
  return (
    <section className="border-t border-outline-variant" aria-label={title}>
      {body}
    </section>
  );
}

type ListProps = {
  nurseryId: string;
  range: DateRange;
  title: string;
  onClose: () => void;
  openChild: (childId: string) => string;
};

// -----------------------------------------------------------------------------------------------
// Shared pieces

function useDetailFormat() {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const locale = lang.startsWith('ar') ? 'ar-EG' : 'en-GB';
  return {
    lang,
    locale,
    time: (iso: string | null) => (iso ? new Date(iso).toLocaleTimeString(locale, { hour: 'numeric', minute: '2-digit', hour12: true }) : '—'),
    date: (ymd: string | null) =>
      ymd ? new Date(`${ymd}T12:00:00`).toLocaleDateString(locale, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }) : '—',
    dateTime: (iso: string | null) =>
      iso ? new Date(iso).toLocaleString(locale, { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', hour12: true }) : '—',
    money: (amount: number) => t('invoice.egpAmount', { amount: formatMoneyAmount(Number(amount ?? 0)) }),
    hours: (hours: number) => t('attendance.extraHoursShort', { hours: Number(hours) }),
    span: (minutes: number) =>
      minutes >= 60
        ? t('attendanceHistory.log.hoursMinutes', { hours: Math.floor(minutes / 60), minutes: minutes % 60 })
        : t('attendanceHistory.log.minutesOnly', { minutes }),
    pick: (ar: string | null, en: string | null) => (lang.startsWith('ar') ? ar || en : en || ar) || null,
  };
}

/** The list's title, what it shows, an optional action and a close button. */
function DetailHeader({ title, summary, hint, onClose, action }: { title: string; summary: string; hint?: string; onClose: () => void; action?: ReactNode }) {
  const { t } = useTranslation();
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 bg-surface-container-lowest px-4 py-3 sm:px-5">
      <div className="min-w-0">
        <h3 className="flex flex-wrap items-center gap-2 text-sm font-semibold text-on-surface">
          <MaterialSymbol name="list_alt" className="text-base text-primary" />
          {title}
          <span className="rounded-full bg-surface-high px-2 py-0.5 text-xs font-medium tabular-nums text-on-surface-variant">{summary}</span>
        </h3>
        {hint ? <p className="mt-0.5 text-xs text-on-surface-variant">{hint}</p> : null}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {action}
        <Button type="button" variant="ghost" size="icon" aria-label={t('attendance.kpis.details.close')} onClick={onClose}>
          <MaterialSymbol name="close" />
        </Button>
      </div>
    </div>
  );
}

/** Search (child name or code, a parent's name or phone) and class, then any other filters. */
function ListFilterBar({
  search,
  onSearch,
  classId,
  onClass,
  classes,
  canClear,
  onClear,
  children,
}: {
  search: string;
  onSearch: (value: string) => void;
  classId: string;
  onClass: (value: string) => void;
  classes: Array<{ id: string; name: string | null }>;
  canClear: boolean;
  onClear: () => void;
  children?: ReactNode;
}) {
  const { t } = useTranslation();
  return (
    <div className="border-y border-outline-variant px-4 py-3 sm:px-5">
      <FilterBar onClear={onClear} canClear={canClear}>
        <FilterField label={t('attendance.kpis.details.filters.search')} className="sm:flex-[2]">
          <SearchInput value={search} onChange={onSearch} placeholder={t('attendance.kpis.details.filters.searchPlaceholder')} />
        </FilterField>
        <FilterField label={t('attendance.kpis.details.filters.class')}>
          <Select value={classId} onChange={(e) => onClass(e.target.value)}>
            <option value="all">{t('attendance.kpis.details.filters.allClasses')}</option>
            {classes.map((option) => (
              <option key={option.id} value={option.id}>
                {option.name ?? t('attendance.kpis.details.filters.noClass')}
              </option>
            ))}
          </Select>
        </FilterField>
        {children}
      </FilterBar>
    </div>
  );
}

/** The search and class filter of a list held in the browser. */
function useListFilters<T extends ListRow>(all: T[]) {
  const { i18n } = useTranslation();
  const [filters, setFilters] = useState<ListFilters>(NO_LIST_FILTERS);
  const rows = useMemo(() => filterList(all, filters), [all, filters]);
  const classes = useMemo(() => classOptions(all, i18n.language), [all, i18n.language]);
  const bar = (
    <ListFilterBar
      search={filters.search}
      onSearch={(search) => setFilters((f) => ({ ...f, search }))}
      classId={filters.classId}
      onClass={(classId) => setFilters((f) => ({ ...f, classId }))}
      classes={classes}
      canClear={filters.search.trim() !== '' || filters.classId !== 'all'}
      onClear={() => setFilters(NO_LIST_FILTERS)}
    />
  );
  return { rows, bar, resetKey: `${filters.search}|${filters.classId}` };
}

function LoadFailed({ onRetry }: { onRetry: () => void }) {
  const { t } = useTranslation();
  return (
    <div className="m-4 flex flex-wrap items-center gap-3 rounded-xl border border-error/30 bg-error/5 p-3 text-sm text-error sm:m-5" role="alert">
      <MaterialSymbol name="error" className="text-xl" />
      <span className="flex-1">{t('attendance.loadErrorTitle')}</span>
      <Button type="button" size="sm" variant="outline" onClick={onRetry}>
        {t('common.retry')}
      </Button>
    </div>
  );
}

/** The child's name, with their code and class under it. */
function ChildCell({
  row,
}: {
  row: { full_name_ar: string | null; full_name_en: string | null; child_code?: string | null; class_name_ar?: string | null; class_name_en?: string | null };
}) {
  const format = useDetailFormat();
  const className = format.pick(row.class_name_ar ?? null, row.class_name_en ?? null);
  const name = childName(row, format.lang);
  return (
    <div className="min-w-0 max-w-[15rem]">
      <p className="truncate font-medium text-on-surface" title={name}>{name}</p>
      <p className="flex flex-wrap items-center gap-x-1.5 text-xs text-on-surface-variant">
        {row.child_code ? <span className="font-mono" dir="ltr">{row.child_code}</span> : null}
        {row.child_code && className ? <span aria-hidden>·</span> : null}
        {className ? <span className="truncate">{className}</span> : null}
      </p>
    </div>
  );
}

function FatherCell({ row }: { row: { father_name_ar: string | null; father_name_en: string | null } }) {
  const format = useDetailFormat();
  const name = format.pick(row.father_name_ar, row.father_name_en);
  return (
    <span className="line-clamp-2 block min-w-[8rem] max-w-[12rem]" title={name ?? undefined}>
      {name ?? '—'}
    </span>
  );
}

/** A person, with their relation to the child when known. */
function PersonCell({ name, relationship }: { name: string | null; relationship?: string | null }) {
  const { t } = useTranslation();
  if (!name) return <span className="text-on-surface-variant">{t('attendance.kpis.details.notRecorded')}</span>;
  return (
    <span>
      {name}
      {relationship ? <span className="text-on-surface-variant"> · {relationship}</span> : null}
    </span>
  );
}

const RATE_TONE = (rate: number) => (rate >= 80 ? 'bg-success' : rate >= 50 ? 'bg-warning' : 'bg-error');

/** The rate as a number, with a bar beside it (the number carries the meaning, not the colour). */
function RateCell({ rate }: { rate: number }) {
  const value = Number(rate);
  return (
    <div className="flex items-center gap-2">
      <span className="w-12 shrink-0 text-end font-semibold tabular-nums text-on-surface">{value}%</span>
      <span className="h-1.5 w-20 overflow-hidden rounded-full bg-surface-high" aria-hidden>
        <span className={cn('block h-full rounded-full', RATE_TONE(value))} style={{ width: `${Math.min(100, Math.max(0, value))}%` }} />
      </span>
    </div>
  );
}

const INVOICE_TONE: Record<string, PillTone> = { paid: 'success', pending: 'warning', overdue: 'error', cancelled: 'neutral' };

function InvoicePill({ status }: { status: string | null }) {
  const { t } = useTranslation();
  if (!status) return <span className="text-on-surface-variant">{t('attendance.kpis.details.noInvoice')}</span>;
  return <StatusPill tone={INVOICE_TONE[status] ?? 'neutral'}>{t(`invoice.status.${status}`, { defaultValue: status })}</StatusPill>;
}

type Column<T> = { key: string; header: string; align?: 'start' | 'center' | 'end'; cell: (row: T) => ReactNode };

/** A paged table of rows; with `onOpen`, each row opens something. */
function RowsTable<T>({
  rows,
  columns,
  rowKey,
  onOpen,
  resetKey,
  empty,
  minWidth = 720,
}: {
  rows: T[];
  columns: Column<T>[];
  rowKey: (row: T) => string;
  onOpen?: (row: T) => void;
  resetKey: string;
  empty: string;
  minWidth?: number;
}) {
  const pager = usePagination(rows, 20, resetKey);
  if (!rows.length) return <TableEmpty icon="inbox" title={empty} />;
  return (
    <>
      <DataTable minWidth={minWidth}>
        <THead>
          {columns.map((column) => (
            <Th key={column.key} align={column.align}>
              {column.header}
            </Th>
          ))}
        </THead>
        <TBody>
          {pager.pageItems.map((row) => (
            <Tr key={rowKey(row)} onClick={onOpen ? () => onOpen(row) : undefined}>
              {columns.map((column) => (
                <Td key={column.key} align={column.align}>
                  {column.cell(row)}
                </Td>
              ))}
            </Tr>
          ))}
        </TBody>
      </DataTable>
      <TablePagination pager={pager} />
    </>
  );
}

// -----------------------------------------------------------------------------------------------
// One day: today's numbers, and "attendance" for a single day

function DayChildren({ nurseryId, day, tile, title, onClose, openChild }: ListProps & { day: string; tile: TodayTile }) {
  const { t } = useTranslation();
  const format = useDetailFormat();
  const navigate = useNavigate();
  const query = useAttendanceDayChildren(nurseryId, day);
  // When "now" is, for how late a child still here is; read once, a lazy initial state keeps render pure.
  const [now] = useState(() => Date.now());

  const all = useMemo(() => dayRowsFor(tile, query.data ?? []), [tile, query.data]);
  const list = useListFilters(all);

  const child: Column<DayChildRow> = { key: 'child', header: t('attendance.kpis.details.columns.child'), cell: (r) => <ChildCell row={r} /> };
  const arrived: Column<DayChildRow> = {
    key: 'arrived',
    header: t('attendance.kpis.details.columns.arrived'),
    cell: (r) => <span className="whitespace-nowrap font-semibold tabular-nums">{format.time(r.check_in)}</span>,
  };
  const broughtBy: Column<DayChildRow> = {
    key: 'brought',
    header: t('attendance.kpis.details.columns.broughtBy'),
    cell: (r) => <PersonCell name={format.pick(r.dropoff_name_ar, r.dropoff_name_en)} relationship={r.dropoff_relationship} />,
  };
  const receivedBy: Column<DayChildRow> = {
    key: 'received',
    header: t('attendance.kpis.details.columns.receivedBy'),
    cell: (r) => (
      <span>
        {format.pick(r.checked_in_by_ar, r.checked_in_by_en) ?? '—'}
        {r.check_in_method ? <span className="text-on-surface-variant"> · {t(`attendance.method.${r.check_in_method}`, { defaultValue: r.check_in_method })}</span> : null}
      </span>
    ),
  };
  const left: Column<DayChildRow> = {
    key: 'left',
    header: t('attendance.kpis.details.columns.left'),
    cell: (r) =>
      r.check_out ? (
        <span className="whitespace-nowrap font-semibold tabular-nums">{format.time(r.check_out)}</span>
      ) : (
        <StatusPill tone="primary" icon="home_work">{t('attendance.kpis.details.stillHere')}</StatusPill>
      ),
  };
  const stayed: Column<DayChildRow> = {
    key: 'stayed',
    header: t('attendance.kpis.details.columns.stayed'),
    cell: (r) => {
      const minutes = minutesAtNursery(r);
      return minutes === null ? '—' : <span className="whitespace-nowrap">{format.span(minutes)}</span>;
    },
  };
  const pickedUpBy: Column<DayChildRow> = {
    key: 'picked',
    header: t('attendance.kpis.details.columns.pickedUpBy'),
    cell: (r) => (r.check_out ? <PersonCell name={r.pickup_person_name} relationship={r.pickup_relationship} /> : '—'),
  };
  const handedOverBy: Column<DayChildRow> = {
    key: 'handed',
    header: t('attendance.kpis.details.columns.handedOverBy'),
    cell: (r) => (
      <span>
        {format.pick(r.checked_out_by_ar, r.checked_out_by_en) ?? '—'}
        {r.check_out_method ? <span className="text-on-surface-variant"> · {t(`attendance.method.${r.check_out_method}`, { defaultValue: r.check_out_method })}</span> : null}
      </span>
    ),
  };
  const extra: Column<DayChildRow> = {
    key: 'extra',
    header: t('attendance.kpis.details.columns.extraHours'),
    cell: (r) =>
      Number(r.extra_hours) > 0 ? (
        <span className="font-medium text-warning">
          {format.hours(r.extra_hours)}
          {Number(r.extra_hours_covered) > 0 ? (
            <span className="block text-xs font-normal text-on-surface-variant">{t('attendance.coveredByPackage', { hours: Number(r.extra_hours_covered) })}</span>
          ) : null}
        </span>
      ) : (
        <span className="text-on-surface-variant">{t('attendance.kpis.details.none')}</span>
      ),
  };
  const father: Column<DayChildRow> = { key: 'father', header: t('attendance.kpis.details.columns.father'), cell: (r) => <FatherCell row={r} /> };
  const parent: Column<DayChildRow> = {
    key: 'parent',
    header: t('attendance.kpis.details.columns.parent'),
    cell: (r) => (
      <div className="min-w-0">
        <p className="truncate">{format.pick(r.parent_name_ar, r.parent_name_en) ?? '—'}</p>
        {r.parent_phone ? (
          <a href={`tel:${r.parent_phone}`} className="text-xs font-medium text-primary hover:underline" dir="ltr">
            {r.parent_phone}
          </a>
        ) : null}
      </div>
    ),
  };
  const due: Column<DayChildRow> = {
    key: 'due',
    header: t('attendance.kpis.details.columns.dueAt'),
    cell: (r) => <span className="whitespace-nowrap tabular-nums">{format.time(r.pickup_due_at)}</span>,
  };

  const columnsByTile: Record<TodayTile, Column<DayChildRow>[]> = {
    attended: [
      child,
      {
        key: 'status',
        header: t('attendance.kpis.details.columns.status'),
        cell: (r: DayChildRow) =>
          r.day_status === 'in_nursery' ? (
            <StatusPill tone="primary" icon="home_work">{t('attendance.kpis.details.stillHere')}</StatusPill>
          ) : (
            <StatusPill tone="success" icon="logout">{t('attendance.kpis.checkedOut')}</StatusPill>
          ),
      },
      arrived,
      broughtBy,
      { ...left, cell: (r: DayChildRow) => (r.check_out ? <span className="whitespace-nowrap font-semibold tabular-nums">{format.time(r.check_out)}</span> : '—') },
      pickedUpBy,
      stayed,
      extra,
    ],
    in_nursery: [child, father, arrived, broughtBy, receivedBy, due],
    picked_up: [child, arrived, broughtBy, left, pickedUpBy, handedOverBy, stayed, extra],
    absent: [child, father, parent],
    excused: [
      child,
      {
        key: 'reason',
        header: t('attendance.kpis.details.columns.reason'),
        cell: (r: DayChildRow) => (r.absence_reason ? t(`attendance.absence.reasons.${r.absence_reason}`, { defaultValue: r.absence_reason }) : '—'),
      },
      { key: 'note', header: t('attendance.kpis.details.columns.note'), cell: (r: DayChildRow) => <span className="line-clamp-2 max-w-xs">{r.absence_note || '—'}</span> },
      {
        key: 'sent',
        header: t('attendance.kpis.details.columns.sentBy'),
        cell: (r: DayChildRow) => (
          <div>
            <p>{format.pick(r.absence_reported_by_ar, r.absence_reported_by_en) ?? '—'}</p>
            <p className="text-xs text-on-surface-variant">{format.dateTime(r.absence_reported_at)}</p>
          </div>
        ),
      },
      parent,
    ],
    late_now: [
      child,
      arrived,
      due,
      {
        key: 'lateBy',
        header: t('attendance.kpis.details.columns.lateBy'),
        cell: (r: DayChildRow) =>
          r.pickup_due_at ? (
            <span className="font-semibold text-error">{format.span(Math.max(0, Math.floor((now - Date.parse(r.pickup_due_at)) / 60_000)))}</span>
          ) : (
            '—'
          ),
      },
      extra,
      parent,
    ],
    extra_today: [
      child,
      arrived,
      left,
      { key: 'lateBy', header: t('attendance.kpis.details.columns.lateBy'), cell: (r: DayChildRow) => format.span(r.late_minutes) },
      extra,
      { key: 'fee', header: t('attendance.kpis.details.columns.fee'), align: 'end', cell: (r: DayChildRow) => <span className="font-semibold tabular-nums">{format.money(r.extra_fee)}</span> },
      { key: 'invoice', header: t('attendance.kpis.details.columns.invoice'), cell: (r: DayChildRow) => <InvoicePill status={r.invoice_status} /> },
    ],
  };
  const columns = columnsByTile[tile];

  return (
    <>
      <DetailHeader
        title={title}
        summary={t('attendance.kpis.details.childrenCount', { count: all.length })}
        hint={t('attendance.kpis.details.openChild')}
        onClose={onClose}
      />
      {list.bar}
      {query.isPending ? (
        <TableLoading />
      ) : query.isError ? (
        <LoadFailed onRetry={() => void query.refetch()} />
      ) : (
        <RowsTable
          rows={list.rows}
          columns={columns}
          rowKey={(r) => r.child_id}
          onOpen={(r) => navigate(openChild(r.child_id))}
          resetKey={`${tile}|${day}|${list.resetKey}`}
          empty={all.length ? t('attendance.kpis.details.noMatch') : t('attendance.kpis.details.noRows')}
          minWidth={880}
        />
      )}
    </>
  );
}

// -----------------------------------------------------------------------------------------------
// A period's attendance: every child, or every check-in

function PeriodAttendance(props: ListProps) {
  const { t } = useTranslation();
  const [view, setView] = useState<'children' | 'log'>('children');
  const viewSwitch = (
    <FilterChips
      value={view}
      onChange={setView}
      label={t('attendance.kpis.details.view.label')}
      options={[
        { value: 'children', label: t('attendance.kpis.details.view.children') },
        { value: 'log', label: t('attendance.kpis.details.view.log') },
      ]}
    />
  );
  return view === 'children' ? <PeriodChildren {...props} viewSwitch={viewSwitch} /> : <PeriodLog {...props} viewSwitch={viewSwitch} />;
}

function PeriodChildren({ nurseryId, range, title, onClose, openChild, viewSwitch }: ListProps & { viewSwitch: ReactNode }) {
  const { t } = useTranslation();
  const format = useDetailFormat();
  const navigate = useNavigate();
  const query = useAttendancePeriodChildren(nurseryId, range);
  const [sort, setSort] = useState<{ key: ChildSortKey; direction: SortDirection }>({ key: 'name', direction: 'asc' });

  const all = useMemo(() => query.data ?? [], [query.data]);
  const list = useListFilters(all);
  const rows = useMemo(() => sortPeriodChildren(list.rows, sort.key, sort.direction, format.lang), [list.rows, sort, format.lang]);
  const pager = usePagination(rows, 20, `${range.from}|${range.to}|${list.resetKey}|${sort.key}|${sort.direction}`);

  const sortBy = (key: ChildSortKey) => ({
    active: sort.key === key,
    direction: sort.direction,
    // A number column starts with the highest; the name column from A.
    onToggle: () =>
      setSort((current) =>
        current.key === key ? { key, direction: current.direction === 'asc' ? 'desc' : 'asc' } : { key, direction: key === 'name' ? 'asc' : 'desc' },
      ),
  });

  return (
    <>
      <DetailHeader
        title={title}
        summary={t('attendance.kpis.details.childrenCount', { count: all.length })}
        hint={t('attendance.kpis.details.openChild')}
        onClose={onClose}
        action={viewSwitch}
      />
      {list.bar}
      {query.isPending ? (
        <TableLoading />
      ) : query.isError ? (
        <LoadFailed onRetry={() => void query.refetch()} />
      ) : !rows.length ? (
        <TableEmpty icon="inbox" title={all.length ? t('attendance.kpis.details.noMatch') : t('attendance.kpis.details.noRows')} />
      ) : (
        <>
          <DataTable minWidth={880}>
            <THead>
              <Th sort={sortBy('name')}>{t('attendance.kpis.details.columns.child')}</Th>
              <Th>{t('attendance.kpis.details.columns.father')}</Th>
              <Th sort={sortBy('rate')}>{t('attendance.kpis.details.columns.rate')}</Th>
              <Th align="end" sort={sortBy('present')}>{t('attendance.kpis.details.columns.presentDays')}</Th>
              <Th align="end" sort={sortBy('absent')}>{t('attendance.kpis.details.columns.absentDays')}</Th>
              <Th align="end" sort={sortBy('excused')}>{t('attendance.kpis.details.columns.excusedDays')}</Th>
              <Th align="end">{t('attendance.kpis.details.columns.expectedDays')}</Th>
            </THead>
            <TBody>
              {pager.pageItems.map((row: PeriodChildRow) => (
                <Tr key={row.child_id} onClick={() => navigate(openChild(row.child_id))}>
                  <Td>
                    <ChildCell row={row} />
                  </Td>
                  <Td>
                    <FatherCell row={row} />
                  </Td>
                  <Td>
                    <RateCell rate={row.attendance_rate} />
                  </Td>
                  <Td align="end" className="font-semibold tabular-nums text-success">{row.present_days}</Td>
                  <Td align="end" className={cn('tabular-nums', row.absent_days > 0 ? 'font-semibold text-error' : 'text-on-surface-variant')}>{row.absent_days}</Td>
                  <Td align="end" className={cn('tabular-nums', row.excused_days > 0 ? 'text-warning' : 'text-on-surface-variant')}>{row.excused_days}</Td>
                  <Td align="end" className="tabular-nums text-on-surface-variant">{row.expected_days}</Td>
                </Tr>
              ))}
            </TBody>
          </DataTable>
          <TablePagination pager={pager} />
        </>
      )}
    </>
  );
}

const LOG_PAGE_SIZES = [25, 50, 100];

/**
 * Every check-in of the period with the exact times, searched and paged on the server: by the
 * child's name or code, a parent's name or phone, class, weekday and date.
 */
function PeriodLog({ nurseryId, range, onClose, openChild, viewSwitch }: ListProps & { viewSwitch: ReactNode }) {
  const { t } = useTranslation();
  const format = useDetailFormat();
  const navigate = useNavigate();
  const classesQuery = useNurseryClasses(nurseryId);
  const [filters, setFilters] = useState<LogFilters>(NO_LOG_FILTERS);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(LOG_PAGE_SIZES[0]);
  // The search goes to the server once typing pauses.
  const search = useDebouncedValue(filters.search, 350);
  const query = useAttendancePeriodLog(nurseryId, range, { ...filters, search }, page, pageSize);
  const rows = query.data ?? [];
  const total = Number(rows[0]?.total_count ?? 0);
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const set = (patch: Partial<LogFilters>) => {
    setFilters((current) => ({ ...current, ...patch }));
    setPage(1);
  };
  const classes = (classesQuery.data ?? []).map((cl) => ({ id: cl.id, name: format.pick(cl.name_ar, cl.name_en) }));
  const canClear = filters.search.trim() !== '' || filters.classId !== 'all' || filters.weekday !== 'all' || filters.day !== '';

  return (
    <>
      <DetailHeader
        title={t('attendance.kpis.details.view.log')}
        summary={t('attendance.kpis.details.checkInsCount', { count: total })}
        hint={t('attendance.kpis.details.openChild')}
        onClose={onClose}
        action={viewSwitch}
      />
      <ListFilterBar
        search={filters.search}
        onSearch={(value) => set({ search: value })}
        classId={filters.classId}
        onClass={(classId) => set({ classId })}
        classes={classes}
        canClear={canClear}
        onClear={() => {
          setFilters(NO_LOG_FILTERS);
          setPage(1);
        }}
      >
        <FilterField label={t('attendance.kpis.details.filters.weekday')}>
          <Select value={String(filters.weekday)} onChange={(e) => set({ weekday: e.target.value === 'all' ? 'all' : Number(e.target.value) })}>
            <option value="all">{t('attendance.kpis.details.filters.allDays')}</option>
            {WEEKDAYS.map((weekday) => (
              <option key={weekday} value={weekday}>{weekdayName(weekday, format.locale)}</option>
            ))}
          </Select>
        </FilterField>
        <FilterField label={t('attendance.kpis.details.filters.date')}>
          <Input type="date" value={filters.day} min={range.from} max={range.to} onChange={(e) => set({ day: e.target.value })} />
        </FilterField>
      </ListFilterBar>

      {query.isPending ? (
        <TableLoading />
      ) : query.isError ? (
        <LoadFailed onRetry={() => void query.refetch()} />
      ) : !rows.length ? (
        <TableEmpty icon="inbox" title={canClear ? t('attendance.kpis.details.noMatch') : t('attendance.kpis.details.noRows')} />
      ) : (
        <div className={cn('transition-opacity', query.isPlaceholderData && 'opacity-60')} aria-busy={query.isPlaceholderData}>
          <DataTable minWidth={1040}>
            <THead>
              <Th>{t('attendance.kpis.details.columns.date')}</Th>
              <Th>{t('attendance.kpis.details.columns.child')}</Th>
              <Th>{t('attendance.kpis.details.columns.father')}</Th>
              <Th>{t('attendance.kpis.details.columns.arrived')}</Th>
              <Th>{t('attendance.kpis.details.columns.left')}</Th>
              <Th>{t('attendance.kpis.details.columns.stayed')}</Th>
              <Th>{t('attendance.kpis.details.columns.extraHours')}</Th>
            </THead>
            <TBody>
              {rows.map((row: AttendanceLogRow) => {
                const minutes = minutesAtNursery(row);
                return (
                  <Tr key={row.attendance_id} onClick={() => navigate(openChild(row.child_id))}>
                    <Td>
                      <span className="whitespace-nowrap font-medium text-on-surface">{format.date(row.attendance_date)}</span>
                    </Td>
                    <Td>
                      <ChildCell row={row} />
                    </Td>
                    <Td>
                      <FatherCell row={row} />
                    </Td>
                    <Td>
                      <p className="whitespace-nowrap font-semibold tabular-nums text-on-surface">{format.time(row.check_in)}</p>
                      <p className="text-xs text-on-surface-variant">
                        <PersonCell name={format.pick(row.dropoff_name_ar, row.dropoff_name_en)} relationship={row.dropoff_relationship} />
                      </p>
                    </Td>
                    <Td>
                      {row.check_out ? (
                        <>
                          <p className="whitespace-nowrap font-semibold tabular-nums text-on-surface">{format.time(row.check_out)}</p>
                          <p className="text-xs text-on-surface-variant">
                            <PersonCell name={row.pickup_person_name} relationship={row.pickup_relationship} />
                          </p>
                        </>
                      ) : (
                        <StatusPill tone="primary" icon="home_work">{t('attendance.kpis.details.notPickedUp')}</StatusPill>
                      )}
                    </Td>
                    <Td>{minutes === null ? '—' : <span className="whitespace-nowrap">{format.span(minutes)}</span>}</Td>
                    <Td>
                      {Number(row.extra_hours) > 0 ? (
                        <span className="font-medium text-warning">
                          {format.hours(row.extra_hours)}
                          {Number(row.extra_fee) > 0 ? <span className="block text-xs font-normal text-on-surface-variant">{format.money(row.extra_fee)}</span> : null}
                        </span>
                      ) : (
                        <span className="text-on-surface-variant">{t('attendance.kpis.details.none')}</span>
                      )}
                    </Td>
                  </Tr>
                );
              })}
            </TBody>
          </DataTable>
          <TablePager
            page={page}
            pageCount={pageCount}
            total={total}
            startIndex={(page - 1) * pageSize + 1}
            endIndex={(page - 1) * pageSize + rows.length}
            hasPrev={page > 1}
            hasNext={page < pageCount}
            onPrev={() => setPage((p) => Math.max(1, p - 1))}
            onNext={() => setPage((p) => Math.min(pageCount, p + 1))}
            onPageChange={setPage}
            pageSize={pageSize}
            pageSizeOptions={LOG_PAGE_SIZES}
            onPageSizeChange={(size) => {
              setPageSize(size);
              setPage(1);
            }}
          />
        </div>
      )}
    </>
  );
}

// -----------------------------------------------------------------------------------------------
// A period: each school day

function PeriodDays({
  nurseryId,
  range,
  title,
  onClose,
  onOpenDay,
}: {
  nurseryId: string;
  range: DateRange;
  title: string;
  onClose: () => void;
  onOpenDay: (day: string) => void;
}) {
  const { t } = useTranslation();
  const format = useDetailFormat();
  const query = useAttendancePeriodDays(nurseryId, range);
  const rows = query.data ?? [];

  const columns: Column<PeriodDayRow>[] = [
    { key: 'date', header: t('attendance.kpis.details.columns.date'), cell: (r) => <span className="font-medium text-on-surface">{format.date(r.day)}</span> },
    { key: 'rate', header: t('attendance.kpis.details.columns.rate'), cell: (r) => <RateCell rate={r.attendance_rate} /> },
    { key: 'present', header: t('attendance.kpis.details.columns.attended'), align: 'end', cell: (r) => <span className="font-semibold tabular-nums text-success">{r.present}</span> },
    { key: 'absent', header: t('attendance.kpis.details.columns.absent'), align: 'end', cell: (r) => <span className={cn('tabular-nums', r.absent > 0 ? 'font-semibold text-error' : 'text-on-surface-variant')}>{r.absent}</span> },
    { key: 'excused', header: t('attendance.kpis.details.columns.withNotice'), align: 'end', cell: (r) => <span className="tabular-nums">{r.excused}</span> },
    { key: 'expected', header: t('attendance.kpis.details.columns.expected'), align: 'end', cell: (r) => <span className="tabular-nums text-on-surface-variant">{r.expected}</span> },
  ];

  return (
    <>
      <DetailHeader title={title} summary={t('attendance.kpis.details.schoolDaysCount', { count: rows.length })} hint={t('attendance.kpis.details.openDay')} onClose={onClose} />
      {query.isPending ? (
        <TableLoading />
      ) : query.isError ? (
        <LoadFailed onRetry={() => void query.refetch()} />
      ) : (
        <RowsTable
          rows={rows}
          columns={columns}
          rowKey={(r) => r.day}
          onOpen={(r) => onOpenDay(r.day)}
          resetKey={`${range.from}|${range.to}`}
          empty={t('attendance.kpis.details.noRows')}
          minWidth={640}
        />
      )}
    </>
  );
}

// -----------------------------------------------------------------------------------------------
// A period: the children who took extra hours

function PeriodExtraHours({ nurseryId, range, title, onClose, openChild }: ListProps) {
  const { t } = useTranslation();
  const format = useDetailFormat();
  const navigate = useNavigate();
  const query = useAttendancePeriodRecords(nurseryId, range);
  const all = useMemo(() => extraHoursByChild(query.data ?? []), [query.data]);
  const list = useListFilters(all);
  const hours = Math.round(all.reduce((sum, row) => sum + row.hours, 0) * 100) / 100;

  const columns: Column<ChildExtraHours>[] = [
    { key: 'child', header: t('attendance.kpis.details.columns.child'), cell: (r) => <ChildCell row={r} /> },
    { key: 'father', header: t('attendance.kpis.details.columns.father'), cell: (r) => <FatherCell row={r} /> },
    { key: 'days', header: t('attendance.kpis.details.columns.days'), align: 'end', cell: (r) => <span className="font-semibold tabular-nums">{r.days}</span> },
    { key: 'hours', header: t('attendance.kpis.details.columns.extraHours'), align: 'end', cell: (r) => <span className="font-semibold tabular-nums text-warning">{r.hours}</span> },
    { key: 'covered', header: t('attendance.kpis.details.columns.covered'), align: 'end', cell: (r) => <span className="tabular-nums">{r.covered}</span> },
    { key: 'billed', header: t('attendance.kpis.details.columns.billedHours'), align: 'end', cell: (r) => <span className="tabular-nums">{r.billed_hours}</span> },
    { key: 'fee', header: t('attendance.kpis.details.columns.fee'), align: 'end', cell: (r) => <span className="whitespace-nowrap font-semibold tabular-nums">{format.money(r.fee)}</span> },
    { key: 'last', header: t('attendance.kpis.details.columns.lastDay'), cell: (r) => <span className="whitespace-nowrap">{format.date(r.last_day)}</span> },
  ];

  return (
    <>
      <DetailHeader
        title={title}
        summary={t('attendance.kpis.details.childrenHours', { count: all.length, hours })}
        hint={t('attendance.kpis.details.openChild')}
        onClose={onClose}
      />
      {list.bar}
      {query.isPending ? (
        <TableLoading />
      ) : query.isError ? (
        <LoadFailed onRetry={() => void query.refetch()} />
      ) : (
        <RowsTable
          rows={list.rows}
          columns={columns}
          rowKey={(r) => r.child_id}
          onOpen={(r) => navigate(openChild(r.child_id))}
          resetKey={`${range.from}|${range.to}|${list.resetKey}`}
          empty={all.length ? t('attendance.kpis.details.noMatch') : t('attendance.kpis.details.noRows')}
          minWidth={880}
        />
      )}
    </>
  );
}

// -----------------------------------------------------------------------------------------------
// A period: extra hours billed, collected, outstanding, need review

function PeriodRecords({
  nurseryId,
  range,
  tile,
  title,
  onClose,
  openChild,
  logLink,
}: ListProps & { tile: RecordTile; logLink: string }) {
  const { t } = useTranslation();
  const format = useDetailFormat();
  const navigate = useNavigate();
  const query = useAttendancePeriodRecords(nurseryId, range);

  const all = useMemo(() => recordRowsFor(tile, query.data ?? []), [tile, query.data]);
  const list = useListFilters(all);
  const total = all.reduce((sum, row) => sum + Number(row.extra_fee), 0);
  const money = tile === 'billed' || tile === 'collected' || tile === 'outstanding';

  const date: Column<PeriodRecordRow> = { key: 'date', header: t('attendance.kpis.details.columns.date'), cell: (r) => <span className="whitespace-nowrap">{format.date(r.attendance_date)}</span> };
  const child: Column<PeriodRecordRow> = { key: 'child', header: t('attendance.kpis.details.columns.child'), cell: (r) => <ChildCell row={r} /> };
  const fee: Column<PeriodRecordRow> = {
    key: 'fee',
    header: t('attendance.kpis.details.columns.fee'),
    align: 'end',
    cell: (r) =>
      Number(r.extra_fee) > 0 ? (
        <span className="whitespace-nowrap font-semibold tabular-nums">{format.money(r.extra_fee)}</span>
      ) : (
        <span className="text-on-surface-variant">{r.late_charge_waived ? t('attendance.kpis.details.waived') : t('attendance.kpis.details.noCharge')}</span>
      ),
  };
  const invoiceNumber: Column<PeriodRecordRow> = {
    key: 'number',
    header: t('attendance.kpis.details.columns.invoiceNumber'),
    cell: (r) => <span className="font-mono text-xs">{r.invoice_number ?? '—'}</span>,
  };
  const extra: Column<PeriodRecordRow> = {
    key: 'extra',
    header: t('attendance.kpis.details.columns.extraHours'),
    cell: (r) => (Number(r.extra_hours) > 0 ? format.hours(r.extra_hours) : <span className="text-on-surface-variant">{t('attendance.kpis.details.none')}</span>),
  };
  const left: Column<PeriodRecordRow> = {
    key: 'left',
    header: t('attendance.kpis.details.columns.left'),
    cell: (r) => (r.check_out ? <span className="whitespace-nowrap tabular-nums">{format.time(r.check_out)}</span> : t('attendance.kpis.details.notPickedUp')),
  };

  const columnsByTile: Record<Exclude<RecordTile, 'late'>, Column<PeriodRecordRow>[]> = {
    billed: [
      date,
      child,
      extra,
      { key: 'covered', header: t('attendance.kpis.details.columns.covered'), align: 'end', cell: (r: PeriodRecordRow) => <span className="tabular-nums">{Number(r.extra_hours_covered)}</span> },
      { key: 'billedHours', header: t('attendance.kpis.details.columns.billedHours'), align: 'end', cell: (r: PeriodRecordRow) => <span className="tabular-nums">{Number(r.extra_hours_billed)}</span> },
      fee,
      { key: 'invoice', header: t('attendance.kpis.details.columns.invoice'), cell: (r: PeriodRecordRow) => <InvoicePill status={r.invoice_status} /> },
    ],
    collected: [
      date,
      child,
      fee,
      invoiceNumber,
      { key: 'paid', header: t('attendance.kpis.details.columns.paidOn'), cell: (r: PeriodRecordRow) => format.dateTime(r.invoice_paid_at) },
    ],
    outstanding: [
      date,
      child,
      fee,
      invoiceNumber,
      { key: 'status', header: t('attendance.kpis.details.columns.invoice'), cell: (r: PeriodRecordRow) => <InvoicePill status={r.invoice_status} /> },
      { key: 'due', header: t('attendance.kpis.details.columns.dueDate'), cell: (r: PeriodRecordRow) => format.date(r.invoice_due_date) },
    ],
    review: [
      date,
      child,
      {
        key: 'reason',
        header: t('attendance.kpis.details.columns.reviewReason'),
        cell: (r: PeriodRecordRow) => (
          <span className="text-error">{t(`attendance.reviewReason.${r.review_reason ?? 'other'}`, { defaultValue: t('attendance.needsReview') })}</span>
        ),
      },
      { key: 'arrived', header: t('attendance.kpis.details.columns.arrived'), cell: (r: PeriodRecordRow) => <span className="tabular-nums">{format.time(r.check_in)}</span> },
      left,
    ],
  };
  const columns = tile === 'late' ? columnsByTile.billed : columnsByTile[tile];

  return (
    <>
      <DetailHeader
        title={title}
        summary={
          money
            ? t('attendance.kpis.details.daysWithTotal', { count: all.length, amount: format.money(total) })
            : t('attendance.kpis.details.daysCount', { count: all.length })
        }
        hint={t('attendance.kpis.details.openChild')}
        onClose={onClose}
        action={
          tile === 'review' && all.length ? (
            <Button asChild variant="outline" size="sm">
              <Link to={logLink}>
                <MaterialSymbol name="fact_check" className="me-1 text-base" />
                {t('attendance.kpis.details.openLog')}
              </Link>
            </Button>
          ) : null
        }
      />
      {list.bar}
      {query.isPending ? (
        <TableLoading />
      ) : query.isError ? (
        <LoadFailed onRetry={() => void query.refetch()} />
      ) : (
        <RowsTable
          rows={list.rows}
          columns={columns}
          rowKey={(r) => r.attendance_id}
          onOpen={(r) => navigate(openChild(r.child_id))}
          resetKey={`${tile}|${range.from}|${range.to}|${list.resetKey}`}
          empty={all.length ? t('attendance.kpis.details.noMatch') : t('attendance.kpis.details.noRows')}
        />
      )}
    </>
  );
}
