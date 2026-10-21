import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Fragment, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';

import { AttendanceEventsTimeline } from '@/components/admin/attendance/AttendanceEventsTimeline';
import {
  CorrectAttendanceDialog,
  WaiveChargeDialog,
  type CorrectionTarget,
} from '@/components/admin/attendance/AttendanceActionDialogs';
import { Button } from '@/components/ui/button';
import {
  DataTable,
  StatusPill,
  TableCard,
  TableEmpty,
  TableLoading,
  TablePagination,
  TBody,
  THead,
  Td,
  Th,
  Tr,
} from '@/components/ui/DataTable';
import { FilterBar, SearchInput } from '@/components/ui/FilterBar';
import { FilterField } from '@/components/ui/FilterField';
import { Input } from '@/components/ui/input';
import { MaterialSymbol } from '@/components/ui/MaterialSymbol';
import { PageHeader } from '@/components/ui/PageHeader';
import { Select } from '@/components/ui/select';
import { StatTile } from '@/components/ui/StatTile';
import { useAuthSession } from '@/hooks/useAuthSession';
import { useNurseryClasses } from '@/hooks/useClassStaff';
import { useNurseryLanguagePref, type NurseryLanguagePref } from '@/hooks/useNurseryLanguagePref';
import { usePagination } from '@/hooks/usePagination';
import { useUserProfile } from '@/hooks/useUserProfile';
import {
  attendanceErrorKey,
  fetchAttendanceDays,
  resolveAttendanceReview,
  staffName,
  type AttendanceDay,
  type AttendanceMethod,
} from '@/lib/attendanceApi';
import { addCalendarDaysYmd, getNurseryCalendarDateString } from '@/lib/nurseryDay';
import { supabase } from '@/lib/supabase';
import { cn, formatQueryError } from '@/lib/utils';

type ChildRow = { id: string; full_name_ar: string; full_name_en: string; class_id: string | null };
type LogRow = AttendanceDay & { child: ChildRow };
type MethodFilter = 'all' | AttendanceMethod;

const MAX_RANGE_DAYS = 92;

function childLabel(child: ChildRow, pref: NurseryLanguagePref) {
  const ar = child.full_name_ar?.trim() ?? '';
  const en = child.full_name_en?.trim() ?? '';
  if (pref === 'ar') return ar || en;
  if (pref === 'en') return en || ar;
  return ar && en && ar !== en ? `${ar} / ${en}` : ar || en;
}

function csvCell(value: unknown): string {
  const s = value == null ? '' : String(value);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** Every check-in/out with who scanned it, how, the pickup person and the extra-hours charge. */
export function AdminAttendanceLogsPage() {
  const { t, i18n } = useTranslation();
  const queryClient = useQueryClient();
  const { user } = useAuthSession();
  const { data: profile } = useUserProfile(user?.id);
  const nurseryId = profile?.nursery_id ?? undefined;
  const { data: languagePref = 'both' } = useNurseryLanguagePref(nurseryId);
  const { data: classes } = useNurseryClasses(nurseryId);
  const today = getNurseryCalendarDateString();
  const [from, setFrom] = useState(addCalendarDaysYmd(today, -6));
  const [to, setTo] = useState(today);
  const [classId, setClassId] = useState('all');
  const [search, setSearch] = useState('');
  const [method, setMethod] = useState<MethodFilter>('all');
  const [lateOnly, setLateOnly] = useState(false);
  const [reviewOnly, setReviewOnly] = useState(false);
  const [includeAbsences, setIncludeAbsences] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [correcting, setCorrecting] = useState<CorrectionTarget | null>(null);
  const [waiving, setWaiving] = useState<{ attendanceId: string; childName: string; date: string; fee: number } | null>(null);
  const locale = i18n.language === 'ar' ? 'ar-EG' : 'en-GB';
  const canManage = profile?.role === 'branch_admin' || profile?.role === 'manager'
    || profile?.role === 'chain_super_admin' || profile?.role === 'xo_super_admin';

  const rangeError = !from || !to
    ? t('attendance.logs.errors.rangeRequired')
    : from > to
      ? t('attendance.logs.errors.fromAfterTo')
      : addCalendarDaysYmd(from, MAX_RANGE_DAYS) < to
        ? t('attendance.logs.errors.rangeTooLong', { days: MAX_RANGE_DAYS })
        : undefined;

  const query = useQuery({
    queryKey: ['admin-attendance-logs', nurseryId, from, to],
    queryFn: async (): Promise<LogRow[]> => {
      if (!nurseryId) return [];
      const { data, error } = await supabase
        .from('children')
        .select('id, full_name_ar, full_name_en, class_id')
        .eq('nursery_id', nurseryId);
      if (error) throw error;
      const children = (data ?? []) as ChildRow[];
      const byId = new Map(children.map((c) => [c.id, c]));
      const days = await fetchAttendanceDays(children.map((c) => c.id), from, to);
      return days.flatMap((day) => {
        const child = byId.get(day.childId);
        return child ? [{ ...day, child }] : [];
      });
    },
    enabled: Boolean(nurseryId) && !rangeError,
  });

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (query.data ?? []).filter((row) => {
      const recorded = row.status === 'present' || row.status === 'partial';
      if (!recorded && !(includeAbsences && (row.status === 'absent' || row.status === 'excused'))) return false;
      if (classId !== 'all' && row.child.class_id !== classId) return false;
      if (q && !childLabel(row.child, languagePref).toLowerCase().includes(q)) return false;
      if (method !== 'all' && row.checkInMethod !== method && row.checkOutMethod !== method) return false;
      if (lateOnly && row.extraHours <= 0) return false;
      if (reviewOnly && !row.needsReview) return false;
      return true;
    });
  }, [query.data, search, classId, languagePref, method, lateOnly, reviewOnly, includeAbsences]);

  const totals = useMemo(() => ({
    records: rows.filter((r) => r.checkIn).length,
    late: rows.filter((r) => r.extraHours > 0).length,
    hours: rows.reduce((sum, r) => sum + r.extraHours, 0),
    covered: rows.reduce((sum, r) => sum + r.extraHoursCovered, 0),
    fee: rows.reduce((sum, r) => sum + r.extraFee, 0),
    review: rows.filter((r) => r.needsReview).length,
  }), [rows]);

  const pager = usePagination(rows, 20, `${from}|${to}|${classId}|${search}|${method}|${lateOnly}|${reviewOnly}|${includeAbsences}`);

  const time = (iso: string | null) =>
    iso ? new Date(iso).toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit', hour12: true }) : '—';
  const day = (ymd: string) => new Date(`${ymd}T12:00:00`).toLocaleDateString(locale, { weekday: 'short', day: '2-digit', month: 'short' });

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ['admin-attendance-logs'] });
    void queryClient.invalidateQueries({ queryKey: ['attendance-events'] });
    void queryClient.invalidateQueries({ queryKey: ['attendance-days'] });
  };

  const resolve = async (row: LogRow) => {
    if (!row.attendanceId) return;
    try {
      await resolveAttendanceReview(row.attendanceId);
      toast.success(t('attendance.logs.reviewResolved'));
      refresh();
    } catch (error) {
      toast.error(t(attendanceErrorKey(error)));
    }
  };

  const exportCsv = () => {
    const header = [
      'date', 'child', 'status', 'check_in', 'checked_in_by', 'check_in_method', 'check_out', 'checked_out_by',
      'check_out_method', 'picked_up_by', 'relationship', 'late_minutes', 'extra_hours', 'covered_by_package',
      'billed_hours', 'extra_fee', 'charge_status', 'waived', 'invoice_status', 'needs_review', 'absence_reason',
    ];
    const lines = rows.map((r) => [
      r.date, childLabel(r.child, languagePref), r.status, r.checkIn ?? '', staffName(r.checkedInBy, i18n.language) ?? '',
      r.checkInMethod ?? '', r.checkOut ?? '', staffName(r.checkedOutBy, i18n.language) ?? '', r.checkOutMethod ?? '',
      r.pickupPersonName ?? '', r.pickupRelationship ?? '', r.lateMinutes, r.extraHours, r.extraHoursCovered,
      r.extraHoursBilled, r.extraFee.toFixed(2), r.lateChargeStatus ?? '', r.lateChargeWaived ? 'yes' : '',
      r.invoiceStatus ?? '', r.needsReview ? (r.reviewReason ?? 'yes') : '', r.absenceReason ?? '',
    ].map(csvCell).join(','));
    const blob = new Blob(['﻿' + [header.join(','), ...lines].join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `attendance-logs-${from}-${to}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const defaultFrom = addCalendarDaysYmd(today, -6);
  const filtersActive =
    from !== defaultFrom || to !== today || classId !== 'all' || method !== 'all' || Boolean(search.trim()) || lateOnly || reviewOnly || includeAbsences;
  const clearFilters = () => {
    setFrom(defaultFrom);
    setTo(today);
    setClassId('all');
    setMethod('all');
    setSearch('');
    setLateOnly(false);
    setReviewOnly(false);
    setIncludeAbsences(false);
  };
  const toggles = [
    { key: 'late', label: t('attendance.logs.lateOnly'), on: lateOnly, set: setLateOnly },
    { key: 'review', label: t('attendance.logs.reviewOnly'), on: reviewOnly, set: setReviewOnly },
    { key: 'absences', label: t('attendance.logs.includeAbsences'), on: includeAbsences, set: setIncludeAbsences },
  ];

  return (
    <div className="space-y-5 pb-8">
      <PageHeader
        icon="receipt_long"
        title={t('attendance.logs.title')}
        description={t('attendance.logs.subtitle')}
        actions={
          <>
            <Button asChild variant="outline">
              <Link to="/admin/attendance">
                <MaterialSymbol name="how_to_reg" size="text-base" className="me-1" />
                {t('admin.attendance.title')}
              </Link>
            </Button>
            <Button type="button" variant="outline" className="gap-1" onClick={exportCsv} disabled={!rows.length}>
              <MaterialSymbol name="download" size="text-lg" />
              {t('admin.attendanceAnalytics.exportCsv')}
            </Button>
          </>
        }
      >
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
          <StatTile icon="how_to_reg" label={t('attendance.logs.totals.records')} value={totals.records} />
          <StatTile
            icon="schedule"
            label={t('attendance.logs.totals.late')}
            value={totals.late}
            tone={totals.late > 0 ? 'warning' : 'neutral'}
            onClick={() => setLateOnly((on) => !on)}
            active={lateOnly}
          />
          <StatTile icon="more_time" label={t('attendance.logs.totals.hours')} value={totals.hours} tone="neutral" />
          <StatTile icon="inventory_2" label={t('attendance.logs.totals.covered')} value={totals.covered} tone="neutral" />
          <StatTile icon="payments" label={t('attendance.logs.totals.fee')} value={t('invoice.egpAmount', { amount: totals.fee.toFixed(2) })} tone={totals.fee > 0 ? 'warning' : 'neutral'} />
          <StatTile
            icon="flag"
            label={t('attendance.logs.totals.review')}
            value={totals.review}
            tone={totals.review > 0 ? 'error' : 'success'}
            onClick={() => setReviewOnly((on) => !on)}
            active={reviewOnly}
          />
        </div>
      </PageHeader>

      <TableCard
        title={t('attendance.logs.title')}
        count={query.isPending || rangeError ? undefined : t('attendance.logs.resultsCount', { count: rows.length })}
        filters={
          <div className="space-y-3">
            <FilterBar>
              <FilterField label={t('admin.attendanceAnalytics.from')}>
                <Input type="date" value={from} max={today} onChange={(e) => setFrom(e.target.value)} className={cn(rangeError && 'border-error ring-1 ring-error/30')} aria-invalid={Boolean(rangeError)} />
              </FilterField>
              <FilterField label={t('admin.attendanceAnalytics.to')}>
                <Input type="date" value={to} max={today} onChange={(e) => setTo(e.target.value)} className={cn(rangeError && 'border-error ring-1 ring-error/30')} aria-invalid={Boolean(rangeError)} />
              </FilterField>
              <FilterField label={t('admin.attendance.classLabel')}>
                <Select value={classId} onChange={(e) => setClassId(e.target.value)}>
                  <option value="all">{t('common.allClasses')}</option>
                  {classes?.map((c) => (
                    <option key={c.id} value={c.id}>
                      {languagePref === 'en' ? c.name_en || c.name_ar : c.name_ar || c.name_en}
                    </option>
                  ))}
                </Select>
              </FilterField>
              <FilterField label={t('attendance.logs.method')}>
                <Select value={method} onChange={(e) => setMethod(e.target.value as MethodFilter)}>
                  <option value="all">{t('common.all', { defaultValue: 'All' })}</option>
                  <option value="qr_parent">{t('attendance.method.qr_parent')}</option>
                  <option value="qr_custom">{t('attendance.method.qr_custom')}</option>
                  <option value="manual">{t('attendance.method.manual')}</option>
                </Select>
              </FilterField>
              <FilterField label={t('common.search')} className="sm:flex-[2]">
                <SearchInput value={search} onChange={setSearch} placeholder={t('admin.attendance.searchPlaceholder')} />
              </FilterField>
            </FilterBar>
            <div className="flex flex-wrap items-center gap-2">
              {toggles.map((toggle) => (
                <button
                  key={toggle.key}
                  type="button"
                  aria-pressed={toggle.on}
                  onClick={() => toggle.set(!toggle.on)}
                  className={cn(
                    'inline-flex h-9 items-center gap-1.5 rounded-full border px-3 text-xs font-semibold transition-colors',
                    toggle.on ? 'border-primary bg-primary/10 text-primary' : 'border-outline-variant bg-surface text-on-surface-variant hover:bg-surface-high',
                  )}
                >
                  <MaterialSymbol name={toggle.on ? 'check_box' : 'check_box_outline_blank'} size="text-base" />
                  {toggle.label}
                </button>
              ))}
              <Button type="button" variant="ghost" className="ms-auto" onClick={clearFilters} disabled={!filtersActive}>
                <MaterialSymbol name="filter_alt_off" size="text-base" className="me-1" />
                {t('common.clearFilters')}
              </Button>
            </div>
            {rangeError ? <p className="text-xs font-medium text-error">{rangeError}</p> : null}
          </div>
        }
        pagination={query.isPending || query.isError || !rows.length ? null : <TablePagination pager={pager} pageSizeOptions={[20, 50, 100]} />}
      >
        {query.isPending && !rangeError ? (
          <TableLoading rows={6} />
        ) : query.isError ? (
          <TableEmpty
            icon="error"
            title={t('attendance.loadErrorTitle')}
            description={formatQueryError(query.error)}
            action={
              <Button type="button" variant="outline" onClick={() => void query.refetch()}>
                {t('common.retry')}
              </Button>
            }
          />
        ) : !rows.length ? (
          <TableEmpty icon="receipt_long" title={t('attendance.logs.emptyTitle')} description={t('attendance.logs.emptyDescription')} />
        ) : (
          <DataTable minWidth={1180}>
            <THead>
              <Th>{t('parent.attendanceHistory.colDate')}</Th>
              <Th>{t('admin.children.childColumn', { defaultValue: 'Child' })}</Th>
              <Th>{t('parent.attendanceHistory.colCheckIn')}</Th>
              <Th>{t('parent.attendanceHistory.colCheckOut')}</Th>
              <Th>{t('parent.attendanceHistory.colPickup')}</Th>
              <Th>{t('attendance.columns.extraTime')}</Th>
              <Th>{t('attendance.columns.amount')}</Th>
              <Th>{t('attendance.columns.actions')}</Th>
            </THead>
            <TBody>
              {pager.pageItems.map((row) => {
                const key = `${row.childId}|${row.date}`;
                const name = childLabel(row.child, languagePref);
                return (
                  <Fragment key={key}>
                    <Tr className={cn(row.needsReview && 'bg-warning/5')}>
                      <Td className="whitespace-nowrap align-top font-medium text-on-surface">{day(row.date)}</Td>
                      <Td className="align-top">
                        <Link to={`/admin/attendance/child/${row.childId}`} className="font-semibold text-on-surface hover:text-primary">{name}</Link>
                        {row.status === 'absent' || row.status === 'excused' ? (
                          <p className="text-xs text-on-surface-variant">
                            {t(`attendance.status.${row.status}`)}
                            {row.absenceReason ? ` · ${t(`attendance.absence.reasons.${row.absenceReason}`)}` : ''}
                          </p>
                        ) : null}
                        {row.needsReview ? (
                          <StatusPill tone="warning" icon="flag" className="mt-1">
                            {t(`attendance.reviewReason.${row.reviewReason ?? 'other'}`, { defaultValue: t('attendance.needsReview') })}
                          </StatusPill>
                        ) : null}
                      </Td>
                      <Td className="align-top text-on-surface-variant">
                        <p className="text-on-surface">{time(row.checkIn)}</p>
                        {row.checkIn ? (
                          <p className="text-xs">
                            {staffName(row.checkedInBy, i18n.language) ?? '—'}
                            {row.checkInMethod ? ` · ${t(`attendance.method.${row.checkInMethod}`)}` : ''}
                          </p>
                        ) : null}
                      </Td>
                      <Td className="align-top text-on-surface-variant">
                        <p className="text-on-surface">{time(row.checkOut)}</p>
                        {row.checkOut ? (
                          <p className="text-xs">
                            {staffName(row.checkedOutBy, i18n.language) ?? '—'}
                            {row.checkOutMethod ? ` · ${t(`attendance.method.${row.checkOutMethod}`)}` : ''}
                          </p>
                        ) : row.checkIn ? (
                          <p className="text-xs">{t('attendance.status.inNursery')}</p>
                        ) : null}
                      </Td>
                      <Td className="align-top text-on-surface-variant">
                        {row.pickupPersonName ? (
                          <>
                            <p className="text-on-surface">{row.pickupPersonName}</p>
                            {row.pickupRelationship ? <p className="text-xs">{row.pickupRelationship}</p> : null}
                          </>
                        ) : '—'}
                      </Td>
                      <Td className="align-top text-xs">
                        {row.extraHours > 0 || row.lateMinutes > 0 ? (
                          <>
                            <p className="font-semibold text-warning">{t('attendance.extraHoursShort', { hours: row.extraHours })}</p>
                            <p className="text-on-surface-variant">
                              {t('attendance.lateMinutes', { minutes: row.lateMinutes })}
                              {row.extraHoursCovered > 0 ? ` · ${t('attendance.coveredByPackage', { hours: row.extraHoursCovered })}` : ''}
                            </p>
                          </>
                        ) : <span className="text-on-surface-variant">—</span>}
                      </Td>
                      <Td className="align-top text-xs">
                        {row.lateChargeWaived ? (
                          <StatusPill tone="success">{t('attendance.waived')}</StatusPill>
                        ) : row.extraFee > 0 ? (
                          <>
                            <p className="font-semibold tabular-nums text-on-surface">{row.extraFee.toFixed(2)}</p>
                            <p className="text-on-surface-variant">
                              {row.lateChargeStatus === 'provisional' ? `${t('attendance.provisional')} · ` : ''}
                              {row.invoiceStatus ? t(`attendance.invoiceStatus.${row.invoiceStatus}`, { defaultValue: row.invoiceStatus }) : ''}
                            </p>
                          </>
                        ) : <span className="text-on-surface-variant">—</span>}
                      </Td>
                      <Td className="align-top">
                        <div className="flex flex-wrap gap-1">
                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            aria-expanded={expanded === key}
                            className={cn(expanded === key && 'bg-primary/10 text-primary')}
                            onClick={() => setExpanded(expanded === key ? null : key)}
                          >
                            <MaterialSymbol name="history" size="text-base" />
                            <span className="ms-1">{t('attendance.logs.timeline')}</span>
                          </Button>
                          {canManage && row.attendanceId ? (
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              onClick={() => setCorrecting({ attendanceId: row.attendanceId!, date: row.date, childName: name, checkIn: row.checkIn, checkOut: row.checkOut })}
                            >
                              {t('attendance.correct.action')}
                            </Button>
                          ) : null}
                          {canManage && row.attendanceId && row.extraHours > 0 && !row.lateChargeWaived ? (
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              onClick={() => setWaiving({ attendanceId: row.attendanceId!, childName: name, date: row.date, fee: row.extraFee })}
                            >
                              {t('attendance.waive.action')}
                            </Button>
                          ) : null}
                          {canManage && row.needsReview && row.attendanceId ? (
                            <Button type="button" size="sm" variant="outline" onClick={() => void resolve(row)}>
                              {t('attendance.logs.resolve')}
                            </Button>
                          ) : null}
                        </div>
                      </Td>
                    </Tr>
                    {expanded === key ? (
                      <tr>
                        <td colSpan={8} className="bg-surface-container-lowest px-6 py-3">
                          <AttendanceEventsTimeline attendanceId={row.attendanceId} childId={row.childId} date={row.date} />
                        </td>
                      </tr>
                    ) : null}
                  </Fragment>
                );
              })}
            </TBody>
          </DataTable>
        )}
      </TableCard>

      <CorrectAttendanceDialog
        key={correcting?.attendanceId ?? 'none'}
        target={correcting}
        onClose={() => setCorrecting(null)}
        onDone={() => {
          setCorrecting(null);
          toast.success(t('attendance.correct.saved'));
          refresh();
        }}
      />
      <WaiveChargeDialog
        key={waiving?.attendanceId ?? 'none-waive'}
        target={waiving}
        onClose={() => setWaiving(null)}
        onDone={(manualRefund) => {
          setWaiving(null);
          toast.success(manualRefund ? t('attendance.waive.doneManualRefund') : t('attendance.waive.done'));
          refresh();
        }}
      />
    </div>
  );
}
