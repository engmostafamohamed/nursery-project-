import { useQuery } from '@tanstack/react-query';
import { useMemo, useState, type MouseEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router-dom';

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge, type BadgeProps } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { EmptyState } from '@/components/ui/EmptyState';
import { Input } from '@/components/ui/input';
import { LoadingSkeleton } from '@/components/ui/LoadingSkeleton';
import { MaterialSymbol } from '@/components/ui/MaterialSymbol';
import { Pagination } from '@/components/ui/Pagination';
import { useAttendanceDays } from '@/hooks/useAttendanceDays';
import { useAuthSession } from '@/hooks/useAuthSession';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { useNurseryLanguagePref } from '@/hooks/useNurseryLanguagePref';
import { usePagination } from '@/hooks/usePagination';
import { useCan } from '@/hooks/usePermissions';
import { useUserProfile } from '@/hooks/useUserProfile';
import { fetchAttendanceDays, type AttendanceDay } from '@/lib/attendanceApi';
import { fetchAllRows } from '@/lib/fetchAllRows';
import { getNurseryCalendarDateString, NURSERY_CALENDAR_TIMEZONE } from '@/lib/nurseryDay';
import { supabase } from '@/lib/supabase';
import { cn, formatQueryError } from '@/lib/utils';

type ChildItem = {
  id: string;
  full_name_ar: string;
  full_name_en: string;
  avatar_url: string | null;
  class_id: string | null;
  status: string;
  enrollment_date: string | null;
  created_at: string;
  className: string;
  parentNames: string[];
  absentMonthCount: number;
  unpaidBalance: number;
  latestUnpaidInvoice: string | null;
};

type FilterKey = 'all' | 'new' | 'absence_risk' | 'unpaid';
type PaymentFilter = 'all' | 'paid' | 'unpaid';
type AbsenceStatusFilter = 'all' | 'none' | 'some' | 'three_plus';
type TodayFilter = 'all' | 'present' | 'absent';
type SortKey = 'newest' | 'name' | 'absent' | 'balance';
/** in: checked in, still here · left: checked in and picked up · excused: absence reported by a parent. */
type TodayState = 'in' | 'left' | 'absent' | 'excused' | 'closed';
type FilterSelectOption = {
  value: string;
  label: string;
  icon?: string;
  helper?: string;
};

/** Translation keys for this page live under admin.children.list. */
const LIST = 'admin.children.list';

/** get_attendance_days accepts at most a 400-day range. */
const MAX_ABSENCE_RANGE_DAYS = 366;

const CHILD_STATUSES = ['active', 'pending', 'inactive', 'graduated', 'withdrawn', 'suspended', 'archived'];

const STATUS_BADGE: Record<string, BadgeProps['variant']> = {
  active: 'success',
  pending: 'warning',
  suspended: 'error',
  graduated: 'default',
  inactive: 'secondary',
  withdrawn: 'secondary',
  archived: 'secondary',
};

const STATUS_ICON: Record<string, string> = {
  active: 'verified',
  pending: 'hourglass_top',
  inactive: 'pause_circle',
  graduated: 'school',
  withdrawn: 'logout',
  suspended: 'block',
  archived: 'inventory_2',
};

const TODAY_STATE_STYLE: Record<TodayState, { labelKey: string; icon: string; badge: string }> = {
  in: { labelKey: 'present', icon: 'how_to_reg', badge: 'bg-success/10 text-success' },
  left: { labelKey: 'present', icon: 'check_circle', badge: 'bg-success/10 text-success' },
  absent: { labelKey: 'absent', icon: 'person_off', badge: 'bg-error/10 text-error' },
  excused: { labelKey: 'absent', icon: 'event_busy', badge: 'bg-warning/10 text-warning' },
  closed: { labelKey: 'closed', icon: 'event_busy', badge: 'bg-surface-container text-on-surface-variant' },
};

/** The server's day status (get_attendance_days) as the page shows it; null when the child is not expected today. */
function todayState(day: AttendanceDay | undefined): TodayState | null {
  switch (day?.status) {
    case 'partial':
      return 'in';
    case 'present':
      return 'left';
    case 'absent':
      return 'absent';
    case 'excused':
      return 'excused';
    case 'off':
    case 'holiday':
      return 'closed';
    default:
      return null;
  }
}

function escapeIlike(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/%/g, '\\%').replace(/_/g, '\\_');
}

function startOfMonth(date: string): string {
  return `${date.slice(0, 8)}01`;
}

function firstAndFatherName(fullName: string): string {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (parts.length <= 2) return parts.join(' ') || '-';
  return `${parts[0]} ${parts[1]}`;
}

function firstAndLastName(fullName: string): string {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (parts.length <= 2) return parts.join(' ') || '-';
  return `${parts[0]} ${parts[parts.length - 1]}`;
}

function initials(name: string): string {
  const letters = name
    .split(/\s+/)
    .filter((part) => part && part !== '/')
    .slice(0, 2)
    .map((part) => part[0]);
  return letters.join('').toUpperCase() || '?';
}

function humanize(value: string): string {
  return value.replace(/_/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase());
}

function ModernFilterSelect({
  label,
  value,
  options,
  onChange,
  className,
}: {
  label: string;
  value: string;
  options: FilterSelectOption[];
  onChange: (value: string) => void;
  className?: string;
}) {
  const selected = options.find((option) => option.value === value) ?? options[0];

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className={cn(
            'group flex h-11 min-w-0 items-center gap-2 rounded-xl border border-outline-variant bg-surface px-2.5 text-start text-sm font-semibold text-on-surface transition hover:border-primary/50 hover:bg-surface-container focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/25',
            className,
          )}
          aria-label={label}
        >
          <span className="material-symbols-outlined flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-base text-primary">
            {selected?.icon ?? 'tune'}
          </span>
          <span className="min-w-0 flex-1 truncate">{selected?.label ?? label}</span>
          <span className="material-symbols-outlined text-lg text-on-surface-variant transition group-data-[state=open]:rotate-180">
            expand_more
          </span>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="start"
        sideOffset={8}
        className="max-h-80 w-[var(--radix-dropdown-menu-trigger-width)] min-w-[14rem] overflow-y-auto rounded-2xl border-outline-variant bg-surface-container-lowest p-2 shadow-xl"
      >
        <div className="px-3 pb-2 pt-1 text-[0.7rem] font-bold uppercase text-on-surface-variant">{label}</div>
        {options.map((option) => {
          const selectedOption = option.value === value;
          return (
            <DropdownMenuItem
              key={option.value}
              onSelect={() => onChange(option.value)}
              className={cn(
                'flex cursor-pointer items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold text-on-surface outline-none transition-colors focus:bg-surface-container',
                selectedOption && 'bg-primary/10 text-primary focus:bg-primary/10',
              )}
            >
              <span className={cn('material-symbols-outlined text-lg', selectedOption ? 'text-primary' : 'text-on-surface-variant')}>
                {selectedOption ? 'check_circle' : option.icon ?? 'radio_button_unchecked'}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate">{option.label}</span>
                {option.helper ? (
                  <span className="block truncate text-xs font-medium text-on-surface-variant">{option.helper}</span>
                ) : null}
              </span>
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function DateRangeField({
  label,
  icon,
  from,
  to,
  onFrom,
  onTo,
}: {
  label: string;
  icon: string;
  from: string;
  to: string;
  onFrom: (value: string) => void;
  onTo: (value: string) => void;
}) {
  const { t } = useTranslation();
  return (
    <fieldset className="min-w-0">
      <legend className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-on-surface-variant">
        <MaterialSymbol name={icon} size="text-base" />
        {label}
      </legend>
      <div className="grid grid-cols-2 gap-2">
        <Input
          type="date"
          value={from}
          max={to || undefined}
          onChange={(event) => onFrom(event.target.value)}
          className="h-11 rounded-xl bg-surface"
          aria-label={`${label} · ${t(`${LIST}.filters.from`)}`}
        />
        <Input
          type="date"
          value={to}
          min={from || undefined}
          onChange={(event) => onTo(event.target.value)}
          className="h-11 rounded-xl bg-surface"
          aria-label={`${label} · ${t(`${LIST}.filters.to`)}`}
        />
      </div>
    </fieldset>
  );
}

function ChildAvatar({ name, url, className }: { name: string; url: string | null; className?: string }) {
  // Initials are drawn locally: no child names leave the app to build a placeholder image.
  return (
    <Avatar className={cn('h-11 w-11', className)}>
      {url ? <AvatarImage src={url} alt="" /> : <AvatarFallback className="bg-primary/10 text-primary">{initials(name)}</AvatarFallback>}
    </Avatar>
  );
}

function TodayStatusCell({ day, loading, locale }: { day: AttendanceDay | undefined; loading: boolean; locale: string }) {
  const { t } = useTranslation();
  if (loading) return <span className="text-xs text-on-surface-variant">{t(`${LIST}.today.loading`)}</span>;
  const state = todayState(day);
  if (!state || !day) return <span className="text-on-surface-variant">-</span>;

  const time = (iso: string | null) =>
    iso
      ? new Date(iso).toLocaleTimeString(locale, { hour: 'numeric', minute: '2-digit', hour12: true, timeZone: NURSERY_CALENDAR_TIMEZONE })
      : '-';
  const style = TODAY_STATE_STYLE[state];
  const reason = day.absenceReason
    ? t(`attendance.absence.reasons.${day.absenceReason}`, { defaultValue: humanize(day.absenceReason) })
    : null;
  const detail = {
    in: t(`${LIST}.today.hereSince`, { time: time(day.checkIn) }),
    left: t(`${LIST}.today.pickedUp`, { from: time(day.checkIn), to: time(day.checkOut) }),
    absent: t(`${LIST}.today.noCheckIn`),
    excused: reason ? t(`${LIST}.today.reportedReason`, { reason }) : t(`${LIST}.today.reported`),
    closed: t(`${LIST}.today.closedDetail`),
  }[state];

  return (
    <div className="min-w-0">
      <span className={cn('inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold', style.badge)}>
        <span className="material-symbols-outlined text-sm" aria-hidden>
          {style.icon}
        </span>
        {t(`${LIST}.today.${style.labelKey}`)}
      </span>
      <p className="mt-1 truncate text-xs text-on-surface-variant">{detail}</p>
    </div>
  );
}

export function AdminChildrenListPage() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const locale = i18n.language === 'ar' ? 'ar-EG' : 'en-US';
  const listSeparator = i18n.language === 'ar' ? '، ' : ', ';
  const { user, loading: authLoading } = useAuthSession();
  const {
    data: profile,
    isPending: profilePending,
    isError: isProfileQueryError,
    error: profileQueryError,
  } = useUserProfile(user?.id);
  const nurseryId = profile?.nursery_id;
  const canEnroll = useCan('child_enrollment');
  const { data: languagePref = 'both' } = useNurseryLanguagePref(nurseryId);
  const today = getNurseryCalendarDateString();
  const monthStart = startOfMonth(today);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<FilterKey>('all');
  const [classFilter, setClassFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [paymentFilter, setPaymentFilter] = useState<PaymentFilter>('all');
  const [absenceStatusFilter, setAbsenceStatusFilter] = useState<AbsenceStatusFilter>('all');
  const [todayFilter, setTodayFilter] = useState<TodayFilter>('all');
  const [sort, setSort] = useState<SortKey>('newest');
  const [showMoreFilters, setShowMoreFilters] = useState(false);
  const [enrolledFrom, setEnrolledFrom] = useState('');
  const [enrolledTo, setEnrolledTo] = useState('');
  const [absentFromDate, setAbsentFromDate] = useState(monthStart);
  const [absentToDate, setAbsentToDate] = useState(today);
  const debouncedSearch = useDebouncedValue(search.trim(), 300);
  const absenceStart = absentFromDate || monthStart;
  const absenceEnd = absentToDate || today;

  const childrenQuery = useQuery({
    queryKey: ['admin-children-list', nurseryId, debouncedSearch, absenceStart, absenceEnd, languagePref],
    queryFn: async (): Promise<{ rows: ChildItem[]; unpaidTotal: number }> => {
      if (!nurseryId) return { rows: [], unpaidTotal: 0 };

      let q = supabase
        .from('children')
        .select('id, full_name_ar, full_name_en, avatar_url, class_id, status, enrollment_date, created_at')
        .eq('nursery_id', nurseryId)
        .order('created_at', { ascending: false });

      if (debouncedSearch.length > 0) {
        const pat = `%${escapeIlike(debouncedSearch)}%`;
        q = q.or(`full_name_ar.ilike.${pat},full_name_en.ilike.${pat}`);
      }

      const { data, error } = await q;
      if (error) throw error;
      const childRows = (data ?? []) as Array<{
        id: string;
        full_name_ar: string;
        full_name_en: string;
        avatar_url: string | null;
        class_id: string | null;
        status: string;
        enrollment_date: string | null;
        created_at: string;
      }>;
      if (!childRows.length) return { rows: [], unpaidTotal: 0 };

      const childIds = childRows.map((child) => child.id);
      const classIds = [...new Set(childRows.map((child) => child.class_id).filter(Boolean) as string[])];

      const [classesRes, linksRes, absenceDays] = await Promise.all([
        classIds.length
          ? supabase.from('classes').select('id, name_ar, name_en').in('id', classIds)
          : Promise.resolve({ data: [], error: null }),
        supabase.from('parent_children').select('child_id, parent_id').in('child_id', childIds),
        // Day statuses from the server, which knows the nursery's working days, holidays and each
        // child's enrollment date. A range the server rejects (reversed, or over a year) counts nothing.
        absenceStart <= absenceEnd && Date.parse(absenceEnd) - Date.parse(absenceStart) <= MAX_ABSENCE_RANGE_DAYS * 86_400_000
          ? fetchAttendanceDays(childIds, absenceStart, absenceEnd)
          : Promise.resolve([] as AttendanceDay[]),
      ]);
      if (classesRes.error) throw classesRes.error;
      if (linksRes.error) throw linksRes.error;

      const classMap = new Map(
        ((classesRes.data ?? []) as Array<{ id: string; name_ar: string | null; name_en: string | null }>).map((row) => [
          row.id,
          languagePref === 'ar' ? row.name_ar || row.name_en || '-' : row.name_en || row.name_ar || '-',
        ]),
      );

      type InvoiceRow = {
        id: string;
        generated_invoice_number: string | null;
        parent_id: string;
        amount: string | number;
        status: string;
        created_at: string;
        payments: Array<{ amount: string | number; status: string }> | null;
      };
      const links = (linksRes.data ?? []) as Array<{ child_id: string; parent_id: string }>;
      const parentIds = [...new Set(links.map((link) => link.parent_id))];
      const [parentsRes, invoiceRows] = await Promise.all([
        parentIds.length
          ? supabase.from('users').select('id, name_ar, name_en').in('id', parentIds)
          : Promise.resolve({ data: [], error: null }),
        // Only open invoices of this nursery matter for balances; page through in case there are many.
        parentIds.length
          ? fetchAllRows<InvoiceRow>((start, end) =>
              supabase
                .from('invoices')
                .select('id, generated_invoice_number, parent_id, amount, status, created_at, payments ( amount, status )')
                .eq('nursery_id', nurseryId)
                .in('parent_id', parentIds)
                .not('status', 'in', '(paid,cancelled)')
                .order('created_at')
                .order('id')
                .range(start, end)
                .returns<InvoiceRow[]>(),
            )
          : Promise.resolve([] as InvoiceRow[]),
      ]);
      if (parentsRes.error) throw parentsRes.error;

      const parentMap = new Map(
        ((parentsRes.data ?? []) as Array<{ id: string; name_ar: string | null; name_en: string | null }>).map((row) => [
          row.id,
          languagePref === 'ar' ? row.name_ar || row.name_en || 'Parent' : row.name_en || row.name_ar || 'Parent',
        ]),
      );
      const parentIdsByChild = links.reduce<Record<string, string[]>>((acc, link) => {
        acc[link.child_id] = [...(acc[link.child_id] ?? []), link.parent_id];
        return acc;
      }, {});

      // School days missed, with or without a reason from the parent.
      const absentDaysByChild = new Map<string, number>();
      for (const day of absenceDays) {
        if (day.status === 'absent' || day.status === 'excused') {
          absentDaysByChild.set(day.childId, (absentDaysByChild.get(day.childId) ?? 0) + 1);
        }
      }

      const invoiceSummaryByParent = new Map<string, { balance: number; invoiceNumber: string | null; invoiceDate: string }>();
      for (const invoice of invoiceRows) {
        const invoiceAmount = Number(invoice.amount ?? 0);
        const rawPaid = (invoice.payments ?? [])
          .filter((payment) => payment.status === 'completed')
          .reduce((sum, payment) => sum + Number(payment.amount ?? 0), 0);
        const balance = Math.max(0, invoiceAmount - rawPaid);
        if (balance <= 0 || invoice.status === 'paid') continue;
        const current = invoiceSummaryByParent.get(invoice.parent_id);
        const isNewer = !current || new Date(invoice.created_at).getTime() >= new Date(current.invoiceDate).getTime();
        invoiceSummaryByParent.set(invoice.parent_id, {
          balance: (current?.balance ?? 0) + balance,
          invoiceNumber: isNewer ? invoice.generated_invoice_number ?? invoice.id.slice(0, 8) : current.invoiceNumber,
          invoiceDate: isNewer ? invoice.created_at : current.invoiceDate,
        });
      }

      const rows = childRows.map((child) => {
        const linkedParentIds = parentIdsByChild[child.id] ?? [];
        const parentNames = linkedParentIds.map((id) => parentMap.get(id)).filter(Boolean) as string[];
        let unpaidBalance = 0;
        let latestUnpaidInvoice: string | null = null;
        let latestInvoiceDate = '';

        for (const parentId of linkedParentIds) {
          const summary = invoiceSummaryByParent.get(parentId);
          if (!summary) continue;
          unpaidBalance += summary.balance;
          if (!latestUnpaidInvoice || new Date(summary.invoiceDate).getTime() > new Date(latestInvoiceDate).getTime()) {
            latestUnpaidInvoice = summary.invoiceNumber;
            latestInvoiceDate = summary.invoiceDate;
          }
        }

        return {
          ...child,
          className: child.class_id ? classMap.get(child.class_id) ?? '-' : '-',
          parentNames,
          absentMonthCount: absentDaysByChild.get(child.id) ?? 0,
          unpaidBalance,
          latestUnpaidInvoice,
        };
      });
      // A family's balance is shown on each of its children, so the total adds each family once.
      const unpaidTotal = [...invoiceSummaryByParent.values()].reduce((sum, summary) => sum + summary.balance, 0);
      return { rows, unpaidTotal };
    },
    enabled: Boolean(nurseryId),
  });

  const waitingForAuthOrProfile = authLoading || (Boolean(user?.id) && profilePending);

  const displayName = useMemo(() => {
    return (child: ChildItem) => {
      const ar = typeof child.full_name_ar === 'string' ? child.full_name_ar.trim() : '';
      const en = typeof child.full_name_en === 'string' ? child.full_name_en.trim() : '';
      if (languagePref === 'ar') return ar || en || '-';
      if (languagePref === 'en') return en || ar || '-';
      if (ar && en) return `${ar} / ${en}`;
      return ar || en || '-';
    };
  }, [languagePref]);

  const displayShortName = useMemo(() => {
    return (child: ChildItem) => firstAndFatherName(displayName(child));
  }, [displayName]);

  const money = useMemo(() => {
    const format = new Intl.NumberFormat(locale, { style: 'currency', currency: 'EGP', maximumFractionDigits: 2 });
    return (value: number) => format.format(value);
  }, [locale]);
  const formatDate = (iso: string) => new Date(iso).toLocaleDateString(locale, { day: 'numeric', month: 'short', year: 'numeric' });
  const statusLabel = (status: string) => t(`${LIST}.status.${status}`, { defaultValue: humanize(status) });

  const children = useMemo(() => childrenQuery.data?.rows ?? [], [childrenQuery.data]);

  // Today's status of every active child, from the same server function as the attendance pages
  // (it knows working days, holidays and absences reported by parents). Polls while the page is open.
  const activeChildIds = useMemo(() => children.filter((child) => child.status === 'active').map((child) => child.id), [children]);
  const todayQuery = useAttendanceDays({ childIds: activeChildIds, from: today, to: today, refetchInterval: 60_000 });
  const todayDays = useMemo(() => new Map((todayQuery.data ?? []).map((day) => [day.childId, day])), [todayQuery.data]);
  const todayLoading = todayQuery.isLoading;
  const todayStats = useMemo(() => {
    const count = { in: 0, left: 0, absent: 0, excused: 0, closed: 0 };
    for (const day of todayDays.values()) {
      const state = todayState(day);
      if (state) count[state] += 1;
    }
    const present = count.in + count.left;
    const absent = count.absent + count.excused;
    return { present, here: count.in, absent, reported: count.excused, closed: count.closed > 0 && present + absent === 0 };
  }, [todayDays]);
  const todayValue = (count: number) => (todayLoading ? '…' : todayQuery.isError ? '-' : count);
  const todayNote = (text: string) =>
    todayLoading
      ? undefined
      : todayQuery.isError
        ? t(`${LIST}.cards.loadFailed`)
        : todayStats.closed
          ? t(`${LIST}.cards.closedToday`)
          : text;

  const todayOptions: FilterSelectOption[] = [
    { value: 'all', label: t(`${LIST}.filters.allToday`), icon: 'today', helper: t(`${LIST}.filters.allTodayHelp`) },
    { value: 'present', label: t(`${LIST}.filters.presentToday`), icon: 'how_to_reg', helper: t(`${LIST}.filters.presentTodayHelp`) },
    { value: 'absent', label: t(`${LIST}.filters.absentToday`), icon: 'person_off', helper: t(`${LIST}.filters.absentTodayHelp`) },
  ];
  const paymentOptions: FilterSelectOption[] = [
    { value: 'all', label: t(`${LIST}.filters.allPayments`), icon: 'payments' },
    { value: 'paid', label: t(`${LIST}.filters.paid`), icon: 'check_circle', helper: t(`${LIST}.filters.paidHelp`) },
    { value: 'unpaid', label: t(`${LIST}.filters.unpaid`), icon: 'error', helper: t(`${LIST}.filters.unpaidHelp`) },
  ];
  const absenceOptions: FilterSelectOption[] = [
    { value: 'all', label: t(`${LIST}.filters.anyAbsence`), icon: 'event_available' },
    { value: 'none', label: t(`${LIST}.filters.absenceNone`), icon: 'check_circle' },
    { value: 'some', label: t(`${LIST}.filters.absenceSome`), icon: 'event_note' },
    { value: 'three_plus', label: t(`${LIST}.filters.absenceMany`), icon: 'warning', helper: t(`${LIST}.filters.absenceManyHelp`) },
  ];
  const sortOptions: FilterSelectOption[] = [
    { value: 'newest', label: t(`${LIST}.sort.newest`), icon: 'schedule' },
    { value: 'name', label: t(`${LIST}.sort.name`), icon: 'sort_by_alpha' },
    { value: 'absent', label: t(`${LIST}.sort.absent`), icon: 'event_busy' },
    { value: 'balance', label: t(`${LIST}.sort.balance`), icon: 'receipt_long' },
  ];

  const classOptions = useMemo(() => {
    const seen = new Map<string, string>();
    for (const child of children) {
      if (child.class_id) seen.set(child.class_id, child.className);
    }
    return [...seen.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [children]);
  const classSelectOptions: FilterSelectOption[] = [
    { value: 'all', label: t(`${LIST}.filters.allClasses`), icon: 'school' },
    ...classOptions.map(([id, name]) => ({ value: id, label: name, icon: 'groups' })),
  ];
  const statusValues = useMemo(() => {
    const custom = [...new Set(children.map((child) => child.status).filter((status) => status && !CHILD_STATUSES.includes(status)))].sort();
    return [...CHILD_STATUSES, ...custom];
  }, [children]);
  const statusSelectOptions: FilterSelectOption[] = [
    { value: 'all', label: t(`${LIST}.filters.allStatuses`), icon: 'tune' },
    ...statusValues.map((status) => ({ value: status, label: statusLabel(status), icon: STATUS_ICON[status] ?? 'label' })),
  ];

  const filteredChildren = useMemo(() => {
    return children.filter((child) => {
      if (filter === 'new' && child.created_at.slice(0, 7) !== today.slice(0, 7)) return false;
      if (filter === 'absence_risk' && child.absentMonthCount < 3) return false;
      if (filter === 'unpaid' && child.unpaidBalance <= 0) return false;
      if (classFilter !== 'all' && child.class_id !== classFilter) return false;
      if (statusFilter !== 'all' && child.status !== statusFilter) return false;
      if (paymentFilter === 'paid' && child.unpaidBalance > 0) return false;
      if (paymentFilter === 'unpaid' && child.unpaidBalance <= 0) return false;
      if (absenceStatusFilter === 'none' && child.absentMonthCount !== 0) return false;
      if (absenceStatusFilter === 'some' && (child.absentMonthCount < 1 || child.absentMonthCount > 2)) return false;
      if (absenceStatusFilter === 'three_plus' && child.absentMonthCount < 3) return false;
      if (todayFilter !== 'all') {
        const state = todayState(todayDays.get(child.id));
        if (todayFilter === 'present' && state !== 'in' && state !== 'left') return false;
        if (todayFilter === 'absent' && state !== 'absent' && state !== 'excused') return false;
      }

      const enrolledOn = child.enrollment_date ?? child.created_at.slice(0, 10);
      if (enrolledFrom && enrolledOn < enrolledFrom) return false;
      if (enrolledTo && enrolledOn > enrolledTo) return false;
      return true;
    });
  }, [absenceStatusFilter, children, classFilter, enrolledFrom, enrolledTo, filter, paymentFilter, statusFilter, today, todayDays, todayFilter]);

  // 'newest' keeps the server order (created_at, newest first).
  const sortedChildren = useMemo(() => {
    if (sort === 'newest') return filteredChildren;
    const list = [...filteredChildren];
    if (sort === 'name') list.sort((a, b) => displayName(a).localeCompare(displayName(b), locale));
    if (sort === 'absent') list.sort((a, b) => b.absentMonthCount - a.absentMonthCount);
    if (sort === 'balance') list.sort((a, b) => b.unpaidBalance - a.unpaidBalance);
    return list;
  }, [displayName, filteredChildren, locale, sort]);

  const pager = usePagination(
    sortedChildren,
    15,
    `${filter}|${debouncedSearch}|${classFilter}|${statusFilter}|${paymentFilter}|${absenceStatusFilter}|${todayFilter}|${sort}|${enrolledFrom}|${enrolledTo}|${absenceStart}|${absenceEnd}`,
  );

  const stats = useMemo(() => {
    const total = children.length;
    const newThisMonth = children.filter((child) => child.created_at.slice(0, 7) === today.slice(0, 7)).length;
    const absenceRisk = children.filter((child) => child.absentMonthCount >= 3).length;
    const withUnpaid = children.filter((child) => child.unpaidBalance > 0).length;
    const unpaidTotal = childrenQuery.data?.unpaidTotal ?? 0;
    return { total, newThisMonth, absenceRisk, withUnpaid, unpaidTotal };
  }, [children, childrenQuery.data, today]);

  const resetFilters = () => {
    setSearch('');
    setFilter('all');
    setClassFilter('all');
    setStatusFilter('all');
    setPaymentFilter('all');
    setAbsenceStatusFilter('all');
    setTodayFilter('all');
    setEnrolledFrom('');
    setEnrolledTo('');
    setAbsentFromDate(monthStart);
    setAbsentToDate(today);
  };

  const optionLabel = (options: FilterSelectOption[], value: string) => options.find((option) => option.value === value)?.label ?? value;
  const chip = (labelKey: string, value: string, onClear: () => void) => ({
    label: t(`${LIST}.filters.chip`, { label: t(`${LIST}.filters.${labelKey}`), value }),
    onClear,
  });
  const cardFilterLabel = filter === 'new' ? t(`${LIST}.cards.newThisMonth`) : filter === 'unpaid' ? t(`${LIST}.cards.unpaid`) : null;
  const activeFilters = [
    cardFilterLabel ? { label: cardFilterLabel, onClear: () => setFilter('all') } : null,
    todayFilter !== 'all' ? chip('today', optionLabel(todayOptions, todayFilter), () => setTodayFilter('all')) : null,
    classFilter !== 'all' ? chip('class', optionLabel(classSelectOptions, classFilter), () => setClassFilter('all')) : null,
    statusFilter !== 'all' ? chip('status', statusLabel(statusFilter), () => setStatusFilter('all')) : null,
    paymentFilter !== 'all' ? chip('payment', optionLabel(paymentOptions, paymentFilter), () => setPaymentFilter('all')) : null,
    absenceStatusFilter !== 'all'
      ? chip('absence', optionLabel(absenceOptions, absenceStatusFilter), () => {
          setAbsenceStatusFilter('all');
          if (filter === 'absence_risk') setFilter('all');
        })
      : null,
    enrolledFrom ? chip('enrolledFrom', enrolledFrom, () => setEnrolledFrom('')) : null,
    enrolledTo ? chip('enrolledTo', enrolledTo, () => setEnrolledTo('')) : null,
    absentFromDate !== monthStart ? chip('absentFrom', absentFromDate, () => setAbsentFromDate(monthStart)) : null,
    absentToDate !== today ? chip('absentTo', absentToDate, () => setAbsentToDate(today)) : null,
  ].filter(Boolean) as Array<{ label: string; onClear: () => void }>;
  const moreFiltersCount = [
    paymentFilter !== 'all',
    absenceStatusFilter !== 'all',
    Boolean(enrolledFrom),
    Boolean(enrolledTo),
    absentFromDate !== monthStart,
    absentToDate !== today,
  ].filter(Boolean).length;
  const anyFilterActive = activeFilters.length > 0 || search.trim().length > 0;

  // The whole row opens the record; links and buttons inside it keep their own behaviour.
  const openFromRow = (event: MouseEvent<HTMLTableRowElement>, childId: string) => {
    if ((event.target as HTMLElement).closest('a, button')) return;
    navigate(childId);
  };

  if (waitingForAuthOrProfile || (Boolean(nurseryId) && childrenQuery.isPending)) {
    return <LoadingSkeleton />;
  }

  if (isProfileQueryError) {
    return (
      <p className="text-base text-destructive" role="alert">
        {formatQueryError(profileQueryError)}
      </p>
    );
  }

  if (user && !nurseryId) {
    return (
      <p className="text-base text-destructive" role="alert">
        {t('admin.children.missingNursery')}
      </p>
    );
  }

  if (childrenQuery.isError) {
    return (
      <p className="text-base text-destructive" role="alert">
        {formatQueryError(childrenQuery.error)}
      </p>
    );
  }

  const enrollButton = canEnroll ? (
    <Button asChild className="h-11 gap-1.5 rounded-xl px-4">
      <Link to="enroll">
        <MaterialSymbol name="person_add" size="text-lg" />
        {t(`${LIST}.enroll`)}
      </Link>
    </Button>
  ) : null;

  if (!children.length && !debouncedSearch) {
    return (
      <EmptyState
        icon="groups"
        title={t('admin.children.emptyTitle')}
        description={t(`${LIST}.emptyDescription`)}
        action={enrollButton}
      />
    );
  }

  const cards = [
    {
      key: 'all',
      label: t(`${LIST}.cards.all`),
      value: stats.total,
      icon: 'groups',
      tone: 'text-primary bg-primary/10',
      selected: filter === 'all' && todayFilter === 'all',
      onSelect: () => {
        setFilter('all');
        setAbsenceStatusFilter('all');
        setTodayFilter('all');
      },
    },
    {
      key: 'present_today',
      label: t(`${LIST}.cards.presentToday`),
      value: todayValue(todayStats.present),
      icon: 'how_to_reg',
      tone: 'text-success bg-success/10',
      note: todayNote(t(`${LIST}.cards.hereNow`, { count: todayStats.here })),
      noteTone: 'text-success',
      selected: todayFilter === 'present',
      onSelect: () => setTodayFilter(todayFilter === 'present' ? 'all' : 'present'),
    },
    {
      key: 'absent_today',
      label: t(`${LIST}.cards.absentToday`),
      value: todayValue(todayStats.absent),
      icon: 'person_off',
      tone: 'text-error bg-error/10',
      note: todayNote(t(`${LIST}.cards.reportedByParents`, { count: todayStats.reported })),
      noteTone: 'text-on-surface-variant',
      selected: todayFilter === 'absent',
      onSelect: () => setTodayFilter(todayFilter === 'absent' ? 'all' : 'absent'),
    },
    {
      key: 'new',
      label: t(`${LIST}.cards.newThisMonth`),
      value: stats.newThisMonth,
      icon: 'person_add',
      tone: 'text-primary bg-primary/10',
      selected: filter === 'new',
      onSelect: () => setFilter(filter === 'new' ? 'all' : 'new'),
    },
    {
      key: 'absence_risk',
      label: t(`${LIST}.cards.absenceRisk`),
      value: stats.absenceRisk,
      icon: 'event_busy',
      tone: 'text-warning bg-warning/10',
      selected: filter === 'absence_risk',
      onSelect: () => {
        const next = filter === 'absence_risk' ? 'all' : 'absence_risk';
        setFilter(next);
        setAbsenceStatusFilter(next === 'all' ? 'all' : 'three_plus');
      },
    },
    {
      key: 'unpaid',
      label: t(`${LIST}.cards.unpaid`),
      value: stats.withUnpaid,
      icon: 'receipt_long',
      tone: 'text-error bg-error/10',
      note: money(stats.unpaidTotal),
      noteTone: 'text-error',
      selected: filter === 'unpaid',
      onSelect: () => setFilter(filter === 'unpaid' ? 'all' : 'unpaid'),
    },
  ];

  return (
    <div className="w-full space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold text-on-surface">{t('admin.children.title')}</h1>
          <p className="mt-1 text-sm text-on-surface-variant">{t(`${LIST}.subtitle`)}</p>
        </div>
        {enrollButton}
      </header>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 2xl:grid-cols-6">
        {cards.map((card) => (
          <button
            key={card.key}
            type="button"
            onClick={card.onSelect}
            aria-pressed={card.selected}
            className={cn(
              'flex min-w-0 items-center gap-3 rounded-2xl border p-3.5 text-start shadow-sm transition sm:p-4',
              card.selected
                ? 'border-primary bg-primary/5 ring-1 ring-primary'
                : 'border-outline-variant bg-surface-container-lowest hover:border-primary/40 hover:bg-surface-container',
            )}
          >
            <span className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-xl', card.tone)}>
              <MaterialSymbol name={card.icon} size="text-xl" />
            </span>
            <span className="min-w-0">
              <span className="block truncate text-xs font-semibold text-on-surface-variant">{card.label}</span>
              <span className="block text-2xl font-bold leading-tight tabular-nums text-on-surface">{card.value}</span>
              {card.note ? <span className={cn('line-clamp-2 block text-xs font-medium', card.noteTone)}>{card.note}</span> : null}
            </span>
          </button>
        ))}
      </div>

      <section className="rounded-2xl border border-outline-variant bg-surface-container-lowest p-3 shadow-sm sm:p-4">
        <div className="flex flex-wrap items-center gap-2">
          <label className="relative min-w-0 flex-[2_1_16rem]">
            <MaterialSymbol
              name="search"
              size="text-xl"
              className="pointer-events-none absolute start-3 top-1/2 -translate-y-1/2 text-on-surface-variant"
            />
            <Input
              placeholder={t('admin.children.searchPlaceholder')}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-11 rounded-xl bg-surface pe-10 ps-10"
              aria-label={t('admin.children.searchPlaceholder')}
            />
            {search ? (
              <button
                type="button"
                onClick={() => setSearch('')}
                aria-label={t(`${LIST}.clearSearch`)}
                className="absolute end-2 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full text-on-surface-variant hover:bg-surface-container"
              >
                <MaterialSymbol name="close" size="text-lg" />
              </button>
            ) : null}
          </label>
          <ModernFilterSelect
            label={t(`${LIST}.filters.today`)}
            value={todayFilter}
            options={todayOptions}
            onChange={(value) => setTodayFilter(value as TodayFilter)}
            className="flex-[1_1_10rem]"
          />
          <ModernFilterSelect
            label={t(`${LIST}.filters.class`)}
            value={classFilter}
            options={classSelectOptions}
            onChange={setClassFilter}
            className="flex-[1_1_10rem]"
          />
          <ModernFilterSelect
            label={t(`${LIST}.filters.status`)}
            value={statusFilter}
            options={statusSelectOptions}
            onChange={setStatusFilter}
            className="flex-[1_1_10rem]"
          />
          <ModernFilterSelect
            label={t(`${LIST}.filters.sort`)}
            value={sort}
            options={sortOptions}
            onChange={(value) => setSort(value as SortKey)}
            className="flex-[1_1_10rem]"
          />
          <Button
            type="button"
            variant="outline"
            className={cn('h-11 gap-1.5 rounded-xl px-3', showMoreFilters && 'border-primary text-primary')}
            onClick={() => setShowMoreFilters((open) => !open)}
            aria-expanded={showMoreFilters}
          >
            <MaterialSymbol name="tune" size="text-lg" />
            {t(showMoreFilters ? `${LIST}.filters.less` : `${LIST}.filters.more`)}
            {moreFiltersCount ? (
              <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1 text-[0.7rem] font-bold text-white">
                {moreFiltersCount}
              </span>
            ) : null}
          </Button>
        </div>

        {showMoreFilters ? (
          <div className="mt-3 grid gap-3 border-t border-outline-variant pt-3 md:grid-cols-2 xl:grid-cols-4">
            <div className="min-w-0">
              <p className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-on-surface-variant">
                <MaterialSymbol name="payments" size="text-base" />
                {t(`${LIST}.filters.payment`)}
              </p>
              <ModernFilterSelect
                label={t(`${LIST}.filters.payment`)}
                value={paymentFilter}
                options={paymentOptions}
                onChange={(value) => setPaymentFilter(value as PaymentFilter)}
                className="w-full"
              />
            </div>
            <div className="min-w-0">
              <p className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-on-surface-variant">
                <MaterialSymbol name="event_note" size="text-base" />
                {t(`${LIST}.filters.absence`)}
              </p>
              <ModernFilterSelect
                label={t(`${LIST}.filters.absence`)}
                value={absenceStatusFilter}
                options={absenceOptions}
                onChange={(value) => {
                  const next = value as AbsenceStatusFilter;
                  setAbsenceStatusFilter(next);
                  if (next === 'three_plus') setFilter('absence_risk');
                  if (next !== 'three_plus' && filter === 'absence_risk') setFilter('all');
                }}
                className="w-full"
              />
            </div>
            <DateRangeField
              label={t(`${LIST}.filters.enrolledRange`)}
              icon="how_to_reg"
              from={enrolledFrom}
              to={enrolledTo}
              onFrom={setEnrolledFrom}
              onTo={setEnrolledTo}
            />
            <DateRangeField
              label={t(`${LIST}.filters.absenceRange`)}
              icon="event_busy"
              from={absentFromDate}
              to={absentToDate}
              onFrom={setAbsentFromDate}
              onTo={setAbsentToDate}
            />
          </div>
        ) : null}

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <span className="text-sm font-semibold text-on-surface">
            {t(`${LIST}.filters.shown`, { count: filteredChildren.length, total: children.length })}
          </span>
          {activeFilters.map((item) => (
            <button
              key={item.label}
              type="button"
              onClick={item.onClear}
              className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold text-primary transition hover:bg-primary/15"
            >
              {item.label}
              <MaterialSymbol name="close" size="text-sm" />
            </button>
          ))}
          {anyFilterActive ? (
            <button type="button" onClick={resetFilters} className="text-xs font-semibold text-on-surface-variant underline-offset-2 hover:text-primary hover:underline">
              {t(`${LIST}.filters.clearAll`)}
            </button>
          ) : null}
        </div>
      </section>

      {!filteredChildren.length ? (
        <EmptyState
          icon="search_off"
          title={t('admin.children.searchEmptyTitle')}
          description={t(`${LIST}.emptyFiltered`)}
          action={
            anyFilterActive ? (
              <Button type="button" variant="outline" onClick={resetFilters}>
                {t(`${LIST}.filters.clearAll`)}
              </Button>
            ) : null
          }
        />
      ) : (
        <>
          {/* Phones: one card per child. */}
          <ul className="space-y-3 md:hidden">
            {pager.pageItems.map((child) => {
              const name = displayShortName(child);
              const hasUnpaid = child.unpaidBalance > 0;
              return (
                <li key={child.id}>
                  <Link
                    to={child.id}
                    className={cn(
                      'block rounded-2xl border bg-surface-container-lowest p-4 shadow-sm transition hover:border-primary/40',
                      hasUnpaid ? 'border-error/40' : 'border-outline-variant',
                    )}
                  >
                    <div className="flex items-start gap-3">
                      <ChildAvatar name={name} url={child.avatar_url} className="h-12 w-12" />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-start justify-between gap-2">
                          <p className="truncate font-semibold text-on-surface">{name}</p>
                          <Badge variant={STATUS_BADGE[child.status] ?? 'secondary'} className="shrink-0">
                            {statusLabel(child.status)}
                          </Badge>
                        </div>
                        <p className="truncate text-xs text-on-surface-variant">
                          {child.class_id ? child.className : t(`${LIST}.noClass`)}
                          {child.parentNames.length ? ` · ${child.parentNames.map(firstAndLastName).join(listSeparator)}` : ''}
                        </p>
                      </div>
                    </div>
                    <div className="mt-3 flex items-end justify-between gap-3 border-t border-outline-variant pt-3">
                      <TodayStatusCell day={todayDays.get(child.id)} loading={todayLoading && child.status === 'active'} locale={locale} />
                      <div className="shrink-0 text-end text-xs">
                        <p className={cn(child.absentMonthCount >= 3 ? 'font-semibold text-error' : 'text-on-surface-variant')}>
                          {t(`${LIST}.absentDays`, { count: child.absentMonthCount })}
                        </p>
                        {hasUnpaid ? <p className="font-semibold text-error">{money(child.unpaidBalance)}</p> : null}
                      </div>
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>

          {/* Tablets and up: the project's standard table. */}
          <section className="hidden overflow-hidden rounded-2xl border border-outline-variant bg-surface shadow-sm md:block">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1080px] text-sm">
                <thead className="bg-surface-container-lowest text-xs uppercase text-on-surface-variant">
                  <tr>
                    <th className="px-4 py-3 text-start font-semibold">{t(`${LIST}.columns.child`)}</th>
                    <th className="px-4 py-3 text-start font-semibold">{t(`${LIST}.columns.parent`)}</th>
                    <th className="px-4 py-3 text-start font-semibold">{t(`${LIST}.columns.status`)}</th>
                    <th className="px-4 py-3 text-start font-semibold">{t(`${LIST}.columns.today`)}</th>
                    <th
                      className="px-4 py-3 text-start font-semibold"
                      title={t(`${LIST}.columns.absentDaysHint`, { from: absenceStart, to: absenceEnd })}
                    >
                      {t(`${LIST}.columns.absentDays`)}
                    </th>
                    <th className="px-4 py-3 text-start font-semibold">{t(`${LIST}.columns.balance`)}</th>
                    <th className="px-4 py-3 text-start font-semibold">{t(`${LIST}.columns.enrolled`)}</th>
                    <th className="px-4 py-3">
                      <span className="sr-only">{t(`${LIST}.columns.open`)}</span>
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-outline-variant">
                  {pager.pageItems.map((child) => {
                    const fullName = displayName(child);
                    const name = displayShortName(child);
                    const hasUnpaid = child.unpaidBalance > 0;
                    return (
                      <tr
                        key={child.id}
                        onClick={(event) => openFromRow(event, child.id)}
                        className="group cursor-pointer bg-surface transition hover:bg-surface-container-lowest"
                      >
                        <td className={cn('border-s-4 px-4 py-3', hasUnpaid ? 'border-s-error' : 'border-s-transparent')}>
                          <div className="flex items-center gap-3">
                            <ChildAvatar name={name} url={child.avatar_url} />
                            <div className="min-w-0">
                              <Link to={child.id} title={fullName} className="block max-w-[15rem] truncate font-semibold text-on-surface hover:text-primary">
                                {name}
                              </Link>
                              <p className="truncate text-xs text-on-surface-variant">
                                {child.class_id ? child.className : t(`${LIST}.noClass`)}
                              </p>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-on-surface" title={child.parentNames.join(', ')}>
                          {child.parentNames.length ? (
                            <div className="max-w-[12rem] space-y-0.5">
                              {child.parentNames.map((parentName, index) => (
                                <p key={`${parentName}-${index}`} className="truncate">
                                  {firstAndLastName(parentName)}
                                </p>
                              ))}
                            </div>
                          ) : (
                            <span className="text-xs text-on-surface-variant">{t(`${LIST}.noParent`)}</span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <Badge variant={STATUS_BADGE[child.status] ?? 'secondary'}>{statusLabel(child.status)}</Badge>
                        </td>
                        <td className="max-w-[13rem] px-4 py-3">
                          <TodayStatusCell day={todayDays.get(child.id)} loading={todayLoading && child.status === 'active'} locale={locale} />
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className={cn(
                              'inline-flex min-w-8 justify-center rounded-full px-2 py-0.5 text-xs font-semibold tabular-nums',
                              child.absentMonthCount >= 3
                                ? 'bg-error/10 text-error'
                                : child.absentMonthCount > 0
                                  ? 'bg-warning/10 text-warning'
                                  : 'bg-surface-container text-on-surface-variant',
                            )}
                          >
                            {child.absentMonthCount}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          {hasUnpaid ? (
                            <div>
                              <p className="font-semibold tabular-nums text-error">{money(child.unpaidBalance)}</p>
                              <p className="text-xs text-error/80">
                                {child.latestUnpaidInvoice
                                  ? t(`${LIST}.unpaidInvoice`, { number: child.latestUnpaidInvoice })
                                  : t(`${LIST}.unpaid`)}
                              </p>
                            </div>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-xs font-semibold text-success">
                              <MaterialSymbol name="check_circle" size="text-sm" />
                              {t(`${LIST}.paid`)}
                            </span>
                          )}
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 text-on-surface-variant">
                          {formatDate(child.enrollment_date ?? child.created_at)}
                        </td>
                        <td className="px-4 py-3 text-end">
                          <MaterialSymbol
                            name="chevron_right"
                            size="text-xl"
                            className="text-on-surface-variant transition group-hover:text-primary rtl:rotate-180"
                          />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}

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
  );
}
