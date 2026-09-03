import { useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';

import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { EmptyState } from '@/components/ui/EmptyState';
import { Input } from '@/components/ui/input';
import { LoadingSkeleton } from '@/components/ui/LoadingSkeleton';
import { Pagination } from '@/components/ui/Pagination';
import { useAuthSession } from '@/hooks/useAuthSession';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { useNurseryLanguagePref } from '@/hooks/useNurseryLanguagePref';
import { usePagination } from '@/hooks/usePagination';
import { useUserProfile } from '@/hooks/useUserProfile';
import { getNurseryCalendarDateString } from '@/lib/nurseryDay';
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
type FilterSelectOption = {
  value: string;
  label: string;
  icon?: string;
  helper?: string;
};

const CHILD_STATUS_OPTIONS: Array<{ value: string; label: string }> = [
  { value: 'active', label: 'Active' },
  { value: 'pending', label: 'Pending' },
  { value: 'inactive', label: 'Inactive' },
  { value: 'graduated', label: 'Graduated' },
  { value: 'withdrawn', label: 'Withdrawn' },
  { value: 'suspended', label: 'Suspended' },
  { value: 'archived', label: 'Archived' },
];

const PAYMENT_FILTER_OPTIONS: FilterSelectOption[] = [
  { value: 'all', label: 'All payments', icon: 'payments', helper: 'Paid and unpaid children' },
  { value: 'paid', label: 'Paid', icon: 'check_circle', helper: 'No previous balance' },
  { value: 'unpaid', label: 'Unpaid', icon: 'error', helper: 'Has previous balance' },
];

const ABSENCE_FILTER_OPTIONS: FilterSelectOption[] = [
  { value: 'all', label: 'All absence', icon: 'event_available', helper: 'Any absence count' },
  { value: 'none', label: '0 days', icon: 'check_circle', helper: 'No absent days' },
  { value: 'some', label: '1-2 days', icon: 'event_note', helper: 'Low absence count' },
  { value: 'three_plus', label: '3+ days', icon: 'warning', helper: 'Needs attention' },
];

function escapeIlike(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/%/g, '\\%').replace(/_/g, '\\_');
}

function startOfMonth(date: string): string {
  return `${date.slice(0, 8)}01`;
}

function daysBetweenInclusive(from: string, to: string): string[] {
  const days: string[] = [];
  const [fy, fm, fd] = from.split('-').map(Number);
  const [ty, tm, td] = to.split('-').map(Number);
  if (!fy || !fm || !fd || !ty || !tm || !td) return days;

  let cursor = Date.UTC(fy, fm - 1, fd);
  const end = Date.UTC(ty, tm - 1, td);
  while (cursor <= end) {
    const day = new Date(cursor);
    const dayOfWeek = day.getUTCDay();
    if (dayOfWeek !== 5 && dayOfWeek !== 6) {
      days.push(day.toISOString().slice(0, 10));
    }
    cursor += 86400000;
  }
  return days;
}

function money(value: number): string {
  return `EGP ${value.toFixed(2)}`;
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

function childStatusLabel(status: string): string {
  const known = CHILD_STATUS_OPTIONS.find((option) => option.value === status);
  if (known) return known.label;
  return status
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function selectOptionLabel(options: FilterSelectOption[], value: string): string {
  return options.find((option) => option.value === value)?.label ?? value;
}

function childStatusIcon(status: string): string {
  if (status === 'active') return 'verified';
  if (status === 'pending') return 'hourglass_top';
  if (status === 'inactive') return 'pause_circle';
  if (status === 'graduated') return 'school';
  if (status === 'withdrawn') return 'logout';
  if (status === 'suspended') return 'block';
  if (status === 'archived') return 'inventory_2';
  return 'label';
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
            'group flex h-12 min-w-[180px] items-center gap-3 rounded-2xl border border-outline-variant bg-surface px-3 text-start text-sm font-semibold text-on-surface shadow-sm transition hover:border-primary/50 hover:bg-surface-container focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/25',
            className,
          )}
          aria-label={label}
        >
          <span className="material-symbols-outlined flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-base text-primary">
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
        <div className="px-3 pb-2 pt-1 text-[0.7rem] font-bold uppercase text-on-surface-variant">
          {label}
        </div>
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
              <span
                className={cn(
                  'material-symbols-outlined text-lg',
                  selectedOption ? 'text-primary' : 'text-on-surface-variant',
                )}
              >
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

export function AdminChildrenListPage() {
  const { t } = useTranslation();
  const { user, loading: authLoading } = useAuthSession();
  const {
    data: profile,
    isPending: profilePending,
    isError: isProfileQueryError,
    error: profileQueryError,
  } = useUserProfile(user?.id);
  const nurseryId = profile?.nursery_id;
  const { data: languagePref = 'both' } = useNurseryLanguagePref(nurseryId);
  const today = getNurseryCalendarDateString();
  const monthStart = startOfMonth(today);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<FilterKey>('all');
  const [classFilter, setClassFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [paymentFilter, setPaymentFilter] = useState<PaymentFilter>('all');
  const [absenceStatusFilter, setAbsenceStatusFilter] = useState<AbsenceStatusFilter>('all');
  const [enrolledFrom, setEnrolledFrom] = useState('');
  const [enrolledTo, setEnrolledTo] = useState('');
  const [absentFromDate, setAbsentFromDate] = useState(monthStart);
  const [absentToDate, setAbsentToDate] = useState(today);
  const debouncedSearch = useDebouncedValue(search.trim(), 300);
  const absenceStart = absentFromDate || monthStart;
  const absenceEnd = absentToDate || today;

  const childrenQuery = useQuery({
    queryKey: ['admin-children-list', nurseryId, debouncedSearch, absenceStart, absenceEnd, languagePref],
    queryFn: async (): Promise<ChildItem[]> => {
      if (!nurseryId) return [];

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
      if (!childRows.length) return [];

      const childIds = childRows.map((child) => child.id);
      const classIds = [...new Set(childRows.map((child) => child.class_id).filter(Boolean) as string[])];

      const [classesRes, linksRes, attendanceRes] = await Promise.all([
        classIds.length
          ? supabase.from('classes').select('id, name_ar, name_en').in('id', classIds)
          : Promise.resolve({ data: [], error: null }),
        supabase.from('parent_children').select('child_id, parent_id').in('child_id', childIds),
        supabase
          .from('attendance_records')
          .select('child_id, attendance_date, check_in')
          .in('child_id', childIds)
          .gte('attendance_date', absenceStart)
          .lte('attendance_date', absenceEnd),
      ]);
      if (classesRes.error) throw classesRes.error;
      if (linksRes.error) throw linksRes.error;
      if (attendanceRes.error) throw attendanceRes.error;

      const classMap = new Map(
        ((classesRes.data ?? []) as Array<{ id: string; name_ar: string | null; name_en: string | null }>).map((row) => [
          row.id,
          languagePref === 'ar' ? row.name_ar || row.name_en || '-' : row.name_en || row.name_ar || '-',
        ]),
      );

      const links = (linksRes.data ?? []) as Array<{ child_id: string; parent_id: string }>;
      const parentIds = [...new Set(links.map((link) => link.parent_id))];
      const [parentsRes, invoicesRes] = await Promise.all([
        parentIds.length
          ? supabase.from('users').select('id, name_ar, name_en').in('id', parentIds)
          : Promise.resolve({ data: [], error: null }),
        parentIds.length
          ? supabase
              .from('invoices')
              .select(
                `
                id,
                generated_invoice_number,
                parent_id,
                amount,
                status,
                created_at,
                payments (
                  amount,
                  status
                )
              `,
              )
              .in('parent_id', parentIds)
              .neq('status', 'cancelled')
          : Promise.resolve({ data: [], error: null }),
      ]);
      if (parentsRes.error) throw parentsRes.error;
      if (invoicesRes.error) throw invoicesRes.error;

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

      const presentDatesByChild = new Map<string, Set<string>>();
      for (const row of (attendanceRes.data ?? []) as Array<{ child_id: string; attendance_date: string; check_in: string | null }>) {
        if (!row.check_in) continue;
        const dates = presentDatesByChild.get(row.child_id) ?? new Set<string>();
        dates.add(row.attendance_date);
        presentDatesByChild.set(row.child_id, dates);
      }

      type InvoiceRow = {
        id: string;
        generated_invoice_number: string | null;
        parent_id: string;
        amount: string | number;
        status: string;
        created_at: string;
        payments: Array<{ amount: string | number; status: string }> | null;
      };
      const invoiceSummaryByParent = new Map<string, { balance: number; invoiceNumber: string | null; invoiceDate: string }>();
      for (const invoice of (invoicesRes.data ?? []) as InvoiceRow[]) {
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

      return childRows.map((child) => {
        const startDate =
          [absenceStart, child.enrollment_date, child.created_at?.slice(0, 10)].filter(Boolean).sort().at(-1) ?? absenceStart;
        const schoolDays = daysBetweenInclusive(startDate, absenceEnd);
        const presentDates = presentDatesByChild.get(child.id) ?? new Set<string>();
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
          absentMonthCount: schoolDays.filter((date) => !presentDates.has(date)).length,
          unpaidBalance,
          latestUnpaidInvoice,
        };
      });
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

  const children = childrenQuery.data ?? [];
  const classOptions = useMemo(() => {
    const seen = new Map<string, string>();
    for (const child of children) {
      if (child.class_id) seen.set(child.class_id, child.className);
    }
    return [...seen.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [children]);
  const classSelectOptions = useMemo<FilterSelectOption[]>(() => {
    return [
      { value: 'all', label: 'All classes', icon: 'school' },
      ...classOptions.map(([id, name]) => ({ value: id, label: name, icon: 'groups' })),
    ];
  }, [classOptions]);
  const statusOptions = useMemo(() => {
    const knownValues = new Set(CHILD_STATUS_OPTIONS.map((option) => option.value));
    const customStatuses = [...new Set(children.map((child) => child.status).filter((status) => status && !knownValues.has(status)))].sort();
    return [
      ...CHILD_STATUS_OPTIONS,
      ...customStatuses.map((status) => ({
        value: status,
        label: childStatusLabel(status),
      })),
    ];
  }, [children]);
  const statusSelectOptions = useMemo<FilterSelectOption[]>(() => {
    return [
      { value: 'all', label: 'All statuses', icon: 'tune' },
      ...statusOptions.map((status) => ({
        ...status,
        icon: childStatusIcon(status.value),
      })),
    ];
  }, [statusOptions]);
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

      const enrolledOn = child.enrollment_date ?? child.created_at.slice(0, 10);
      if (enrolledFrom && enrolledOn < enrolledFrom) return false;
      if (enrolledTo && enrolledOn > enrolledTo) return false;
      return true;
    });
  }, [absenceStatusFilter, children, classFilter, enrolledFrom, enrolledTo, filter, paymentFilter, statusFilter, today]);
  const pager = usePagination(
    filteredChildren,
    15,
    `${filter}|${debouncedSearch}|${classFilter}|${statusFilter}|${paymentFilter}|${absenceStatusFilter}|${enrolledFrom}|${enrolledTo}|${absenceStart}|${absenceEnd}`,
  );

  const stats = useMemo(() => {
    const total = children.length;
    const newThisMonth = children.filter((child) => child.created_at.slice(0, 7) === today.slice(0, 7)).length;
    const absenceRisk = children.filter((child) => child.absentMonthCount >= 3).length;
    const withUnpaid = children.filter((child) => child.unpaidBalance > 0).length;
    const unpaidTotal = children.reduce((sum, child) => sum + child.unpaidBalance, 0);
    return { total, newThisMonth, absenceRisk, withUnpaid, unpaidTotal };
  }, [children, today]);

  const resetFilters = () => {
    setFilter('all');
    setClassFilter('all');
    setStatusFilter('all');
    setPaymentFilter('all');
    setAbsenceStatusFilter('all');
    setEnrolledFrom('');
    setEnrolledTo('');
    setAbsentFromDate(monthStart);
    setAbsentToDate(today);
  };

  const selectedClassName = classOptions.find(([id]) => id === classFilter)?.[1] ?? '';
  const activeFilters = [
    search.trim() ? { label: `Search: ${search.trim()}`, onClear: () => setSearch('') } : null,
    classFilter !== 'all' ? { label: `Class: ${selectedClassName}`, onClear: () => setClassFilter('all') } : null,
    statusFilter !== 'all' ? { label: `Status: ${childStatusLabel(statusFilter)}`, onClear: () => setStatusFilter('all') } : null,
    paymentFilter !== 'all'
      ? { label: `Payment: ${selectOptionLabel(PAYMENT_FILTER_OPTIONS, paymentFilter)}`, onClear: () => setPaymentFilter('all') }
      : null,
    absenceStatusFilter !== 'all'
      ? {
          label: `Absent: ${selectOptionLabel(ABSENCE_FILTER_OPTIONS, absenceStatusFilter)}`,
          onClear: () => {
            setAbsenceStatusFilter('all');
            if (filter === 'absence_risk') setFilter('all');
          },
        }
      : null,
    enrolledFrom ? { label: `Enrolled from: ${enrolledFrom}`, onClear: () => setEnrolledFrom('') } : null,
    enrolledTo ? { label: `Enrolled to: ${enrolledTo}`, onClear: () => setEnrolledTo('') } : null,
    absentFromDate !== monthStart ? { label: `Absent from: ${absentFromDate}`, onClear: () => setAbsentFromDate(monthStart) } : null,
    absentToDate !== today ? { label: `Absent to: ${absentToDate}`, onClear: () => setAbsentToDate(today) } : null,
  ].filter(Boolean) as Array<{ label: string; onClear: () => void }>;

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

  if (!children.length && !debouncedSearch) {
    return (
      <EmptyState
        icon="groups"
        title={t('admin.children.emptyTitle')}
        description={t('admin.children.emptyDescription')}
      />
    );
  }

  return (
    <div className="w-full space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-on-surface">{t('admin.children.title')}</h1>
          <p className="text-sm text-on-surface-variant">
            {stats.total} children | {stats.newThisMonth} new this month | {money(stats.unpaidTotal)} unpaid
          </p>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[
          { key: 'all' as const, label: 'All children', value: stats.total, icon: 'groups', tone: 'text-primary bg-primary/10' },
          { key: 'new' as const, label: 'New this month', value: stats.newThisMonth, icon: 'person_add', tone: 'text-success bg-success/10' },
          { key: 'absence_risk' as const, label: 'Absent 3+ days', value: stats.absenceRisk, icon: 'event_busy', tone: 'text-warning bg-warning/10' },
          { key: 'unpaid' as const, label: 'Unpaid balance', value: stats.withUnpaid, icon: 'receipt_long', tone: 'text-error bg-error/10' },
        ].map((item) => (
          <button
            key={item.key}
            type="button"
            onClick={() => {
              setFilter(item.key);
              if (item.key === 'all') setAbsenceStatusFilter('all');
              if (item.key === 'absence_risk') setAbsenceStatusFilter('three_plus');
            }}
            className={`flex min-h-28 items-center gap-4 rounded-2xl border p-4 text-start shadow-sm transition ${
              filter === item.key
                ? 'border-primary bg-primary/10'
                : 'border-outline-variant bg-surface-container-lowest hover:bg-surface-container'
            }`}
          >
            <span className={`material-symbols-outlined flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-xl ${item.tone}`}>
              {item.icon}
            </span>
            <span>
              <span className="block text-sm font-semibold text-on-surface-variant">{item.label}</span>
              <span className="mt-1 block text-3xl font-bold text-on-surface">{item.value}</span>
              {item.key === 'unpaid' ? (
                <span className="mt-1 block text-xs font-semibold text-error">{money(stats.unpaidTotal)}</span>
              ) : null}
            </span>
          </button>
        ))}
      </div>

      <div className="rounded-3xl border border-outline-variant bg-surface-container-lowest p-3 shadow-sm">
        <div className="flex flex-wrap items-center gap-3">
          <label className="relative min-w-[260px] flex-1">
            <span className="material-symbols-outlined pointer-events-none absolute start-4 top-1/2 -translate-y-1/2 text-xl text-on-surface-variant">
              search
            </span>
            <Input
              placeholder="Search child name"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-12 rounded-2xl border-outline-variant bg-surface ps-12 text-base"
              aria-label={t('admin.children.searchPlaceholder')}
            />
          </label>

          <ModernFilterSelect
            label="Class"
            value={classFilter}
            options={classSelectOptions}
            onChange={setClassFilter}
            className="min-w-[180px]"
          />

          <ModernFilterSelect
            label="Status"
            value={statusFilter}
            options={statusSelectOptions}
            onChange={setStatusFilter}
            className="min-w-[170px]"
          />

          <span className="ms-auto rounded-full bg-surface-container px-4 py-2 text-sm font-semibold text-on-surface">
            {filteredChildren.length} shown
          </span>

          <Button type="button" variant="outline" className="h-12 rounded-2xl px-5" onClick={resetFilters}>
            Reset
          </Button>
        </div>

        <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <ModernFilterSelect
            label="Payment"
            value={paymentFilter}
            options={PAYMENT_FILTER_OPTIONS}
            onChange={(value) => setPaymentFilter(value as PaymentFilter)}
            className="w-full min-w-0"
          />

          <ModernFilterSelect
            label="Absence"
            value={absenceStatusFilter}
            options={ABSENCE_FILTER_OPTIONS}
            onChange={(value) => {
              const next = value as AbsenceStatusFilter;
              setAbsenceStatusFilter(next);
              if (next === 'three_plus') setFilter('absence_risk');
              if (next !== 'three_plus' && filter === 'absence_risk') setFilter('all');
            }}
            className="w-full min-w-0"
          />
        </div>

        <div className="mt-3 grid gap-3 xl:grid-cols-2">
          <div className="rounded-2xl bg-surface/70 p-3">
            <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-on-surface">
              <span className="material-symbols-outlined text-lg text-on-surface-variant">how_to_reg</span>
              Enrollment date
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              <Input type="date" value={enrolledFrom} onChange={(event) => setEnrolledFrom(event.target.value)} className="h-11 rounded-xl bg-surface" />
              <Input type="date" value={enrolledTo} onChange={(event) => setEnrolledTo(event.target.value)} className="h-11 rounded-xl bg-surface" />
            </div>
          </div>

          <div className="rounded-2xl bg-surface/70 p-3">
            <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-on-surface">
              <span className="material-symbols-outlined text-lg text-on-surface-variant">event_busy</span>
              Absence date range
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              <Input type="date" value={absentFromDate} onChange={(event) => setAbsentFromDate(event.target.value)} className="h-11 rounded-xl bg-surface" />
              <Input type="date" value={absentToDate} onChange={(event) => setAbsentToDate(event.target.value)} className="h-11 rounded-xl bg-surface" />
            </div>
          </div>
        </div>

        {activeFilters.length ? (
          <div className="mt-3 flex flex-wrap gap-2">
            {activeFilters.map((item) => (
              <button
                key={item.label}
                type="button"
                onClick={item.onClear}
                className="inline-flex items-center gap-2 rounded-full bg-primary/10 px-3 py-1.5 text-xs font-semibold text-primary"
              >
                {item.label}
                <span className="material-symbols-outlined text-sm">close</span>
              </button>
            ))}
          </div>
        ) : null}
      </div>

      {!filteredChildren.length ? (
        <EmptyState icon="search_off" title={t('admin.children.searchEmptyTitle')} description={t('admin.children.searchEmptyDescription')} />
      ) : (
        <div className="overflow-hidden rounded-2xl border border-outline-variant bg-surface-container-lowest shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1280px] text-[0.95rem]">
              <thead className="bg-surface-container text-sm text-on-surface-variant">
                <tr>
                  <th className="px-4 py-3 text-start font-semibold">Child</th>
                  <th className="px-4 py-3 text-start font-semibold">Class</th>
                  <th className="px-4 py-3 text-start font-semibold">Parent</th>
                  <th className="px-4 py-3 text-start font-semibold">Status</th>
                  <th className="px-4 py-3 text-start font-semibold">Absent</th>
                  <th className="px-4 py-3 text-start font-semibold">Previous payment</th>
                  <th className="px-4 py-3 text-start font-semibold">Enrolled</th>
                  <th className="px-4 py-3 text-start font-semibold">Action</th>
                </tr>
              </thead>
              <tbody>
                {pager.pageItems.map((child) => {
                  const fullName = displayName(child);
                  const name = displayShortName(child);
                  const thumb =
                    child.avatar_url ??
                    `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=eceef0&color=191c1e`;
                  const hasUnpaid = child.unpaidBalance > 0;
                  const parentNames = child.parentNames.map(firstAndLastName);
                  return (
                    <tr key={child.id} className={`border-t border-outline-variant ${hasUnpaid ? 'bg-error/5' : 'bg-surface-low/35'}`}>
                      <td className={`px-4 py-3 ${hasUnpaid ? 'border-s-4 border-error' : 'border-s-4 border-transparent'}`}>
                        <div className="flex items-center gap-3">
                          <img src={thumb} alt="" className="h-11 w-11 shrink-0 rounded-full object-cover" loading="lazy" decoding="async" />
                          <div className="min-w-0">
                            <p className="truncate font-semibold text-on-surface" title={fullName}>{name}</p>
                            <p className="text-xs text-on-surface-variant">{child.id.slice(0, 8)}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-on-surface">{child.className}</td>
                      <td className="px-4 py-3 text-on-surface" title={child.parentNames.join(', ')}>
                        {parentNames.length ? (
                          <div className="space-y-1">
                            {parentNames.map((parentName, index) => (
                              <p key={`${parentName}-${index}`} className="truncate font-medium">
                                {parentName}
                              </p>
                            ))}
                          </div>
                        ) : (
                          '-'
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <span className="rounded-full bg-success/10 px-3 py-1 text-xs font-semibold text-success">
                          {childStatusLabel(child.status)}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className={child.absentMonthCount > 0 ? 'font-semibold text-warning' : 'text-on-surface'}>
                          {child.absentMonthCount}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        {hasUnpaid ? (
                          <div className="font-semibold text-error">
                            {money(child.unpaidBalance)}
                            <p className="text-xs font-medium text-error/80">{child.latestUnpaidInvoice ?? 'Unpaid invoice'}</p>
                          </div>
                        ) : (
                          <span className="font-medium text-success">Paid</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-on-surface">
                        {child.enrollment_date ? new Date(child.enrollment_date).toLocaleDateString() : new Date(child.created_at).toLocaleDateString()}
                      </td>
                      <td className="px-4 py-3">
                        <Button asChild size="sm" variant="outline">
                          <Link to={`/admin/children/${child.id}`}>View</Link>
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
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
