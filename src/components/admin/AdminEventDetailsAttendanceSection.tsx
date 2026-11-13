import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { DataTable, StatusPill, TableCard, TableEmpty, TBody, Td, Th, THead, Tr, type PillTone } from '@/components/ui/DataTable';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { EmptyState } from '@/components/ui/EmptyState';
import { SearchInput } from '@/components/ui/FilterBar';
import { FilterChips } from '@/components/ui/FilterChips';
import { LoadingSkeleton } from '@/components/ui/LoadingSkeleton';
import { MaterialSymbol } from '@/components/ui/MaterialSymbol';
import { StatTile } from '@/components/ui/StatTile';
import type { AdminEventAttendanceRow, AdminEventDetailRow } from '@/hooks/useAdminEventDetails';
import { useMoney } from '@/hooks/useMoney';
import { localName } from '@/lib/bilingualName';
import { localizedNames, templateNotificationRow } from '@/lib/notificationText';
import { supabase } from '@/lib/supabase';
import { getUserInitials } from '@/lib/utils';

const FILTERS = ['all', 'granted', 'pending', 'denied', 'checkedIn'] as const;
type Filter = (typeof FILTERS)[number];

const ANSWER: Record<string, { tone: PillTone; icon: string }> = {
  granted: { tone: 'success', icon: 'task_alt' },
  pending: { tone: 'warning', icon: 'pending_actions' },
  denied: { tone: 'error', icon: 'block' },
};
const INVOICE_TONE: Record<string, PillTone> = { paid: 'success', pending: 'warning', overdue: 'error', cancelled: 'neutral' };

type Props = {
  event: AdminEventDetailRow;
  rows: AdminEventAttendanceRow[];
  isLoading: boolean;
  onRefresh: () => void;
  eventTitleForMessage: string;
};

function csvEscape(value: string): string {
  return /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

/**
 * The families of one event: who was asked, each answer, the payment of a paid event, and who the
 * QR scanner checked in at the event. The admin can remind the families still to answer and export
 * the list.
 */
export function AdminEventDetailsAttendanceSection({ event, rows, isLoading, onRefresh, eventTitleForMessage }: Props) {
  const { t, i18n } = useTranslation();
  const money = useMoney();
  const isAr = i18n.language.startsWith('ar');
  const [filter, setFilter] = useState<Filter>('all');
  const [search, setSearch] = useState('');
  const [reminderOpen, setReminderOpen] = useState(false);
  const [reminderBusy, setReminderBusy] = useState(false);

  const locale = isAr ? 'ar-EG' : 'en-GB';
  const dateFmt = new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short', hour12: true });
  const checkInFmt = new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', hour12: true });

  const counts = useMemo(
    () => ({
      all: rows.length,
      granted: rows.filter((r) => r.status === 'granted').length,
      pending: rows.filter((r) => r.status === 'pending').length,
      denied: rows.filter((r) => r.status === 'denied').length,
      checkedIn: rows.filter((r) => r.checked_in_at).length,
    }),
    [rows],
  );

  // Families can be reminded only while the event is open and still to come.
  const [nowMs] = useState(Date.now);
  const canRemind = event.status === 'active' && !event.cancelled_at && new Date(event.starts_at).getTime() > nowMs;
  const pendingParents = useMemo(() => new Set(rows.filter((r) => r.status === 'pending' && r.parent_id).map((r) => r.parent_id)).size, [rows]);

  const displayChild = (r: AdminEventAttendanceRow) => localName(r.child_name_ar, r.child_name_en, isAr);
  const displayParent = (r: AdminEventAttendanceRow) => localName(r.parent_name_ar, r.parent_name_en, isAr);

  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (filter === 'checkedIn' ? !r.checked_in_at : filter !== 'all' && r.status !== filter) return false;
      if (!q) return true;
      return `${r.child_name_ar} ${r.child_name_en} ${r.parent_name_ar} ${r.parent_name_en}`.toLowerCase().includes(q);
    });
  }, [rows, filter, search]);

  const toggle = (next: Filter) => setFilter((current) => (current === next ? 'all' : next));
  const answerText = (status: string) => t(`admin.events.details.permissionStatus.${status}`, { defaultValue: status });
  const invoiceText = (r: AdminEventAttendanceRow) =>
    r.invoice_status
      ? `${t(`admin.events.details.invoiceStatus.${r.invoice_status}`, { defaultValue: r.invoice_status })}${r.invoice_amount ? ` · ${money(Number(r.invoice_amount))}` : ''}`
      : '';

  const exportCsv = () => {
    const headers = ['child', 'parent', 'status', 'respondedAt', 'checkedIn', 'parentNote', ...(event.is_paid ? ['payment'] : [])].map((key) =>
      t(`admin.events.details.csv.${key}`),
    );
    const lines = [headers.join(',')];
    for (const r of filteredRows) {
      lines.push(
        [
          displayChild(r),
          displayParent(r),
          answerText(r.status),
          r.responded_at ? dateFmt.format(new Date(r.responded_at)) : '',
          r.checked_in_at ? dateFmt.format(new Date(r.checked_in_at)) : '',
          r.parent_note ?? '',
          ...(event.is_paid ? [invoiceText(r)] : []),
        ]
          .map(csvEscape)
          .join(','),
      );
    }
    const blob = new Blob([`\uFEFF${lines.join('\n')}`], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `event-attendance-${event.id}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success(t('admin.events.details.exportSuccess'));
  };

  const sendReminders = async () => {
    const parentIds = [...new Set(rows.filter((r) => r.status === 'pending' && r.parent_id).map((r) => r.parent_id!))];
    if (!parentIds.length) return;
    setReminderBusy(true);
    try {
      const inserts = parentIds.map((userId) =>
        templateNotificationRow({
          nurseryId: event.nursery_id,
          userId,
          type: 'permission_reminder',
          params: { event: localizedNames(event.title_ar, event.title_en) },
          actionLink: `/parent/events/${event.id}`,
        }),
      );
      const { error } = await supabase.from('notifications').insert(inserts as never);
      if (error) throw error;
      toast.success(t('admin.events.details.reminderSuccess', { count: parentIds.length }));
      setReminderOpen(false);
      onRefresh();
    } catch {
      toast.error(t('admin.events.details.reminderError'));
    } finally {
      setReminderBusy(false);
    }
  };

  if (isLoading) {
    return <LoadingSkeleton variant="permissionCards" permissionCardsLabel={t('admin.events.details.attendanceLoading')} />;
  }

  if (!rows.length) {
    return <EmptyState icon="assignment_ind" title={t('admin.events.details.noPermissionsTitle')} description={t('admin.events.details.noPermissionsDescription')} />;
  }

  const price = event.is_paid ? Number(event.price ?? 0) : 0;

  return (
    <div className="space-y-4" data-testid="event-families">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <StatTile icon="groups" label={t('admin.events.details.statTotal')} value={counts.all} onClick={() => setFilter('all')} active={filter === 'all'} />
        <StatTile icon="task_alt" tone="success" label={t('admin.events.details.statApproved')} value={counts.granted} onClick={() => toggle('granted')} active={filter === 'granted'} />
        <StatTile
          icon="pending_actions"
          tone={counts.pending > 0 ? 'warning' : 'neutral'}
          label={t('admin.events.details.statPending')}
          value={counts.pending}
          onClick={() => toggle('pending')}
          active={filter === 'pending'}
        />
        <StatTile
          icon="block"
          tone={counts.denied > 0 ? 'error' : 'neutral'}
          label={t('admin.events.details.statDenied')}
          value={counts.denied}
          onClick={() => toggle('denied')}
          active={filter === 'denied'}
        />
        <StatTile
          icon="how_to_reg"
          tone={counts.checkedIn > 0 ? 'primary' : 'neutral'}
          label={t('admin.events.details.statCheckedIn')}
          value={counts.checkedIn}
          helper={counts.granted > 0 ? t('admin.events.details.checkedInOf', { going: counts.granted }) : undefined}
          onClick={() => toggle('checkedIn')}
          active={filter === 'checkedIn'}
        />
      </div>

      {counts.pending > 0 && canRemind ? (
        <section className="flex flex-col gap-3 rounded-xl border border-warning/40 bg-warning/10 p-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="flex items-start gap-2 text-sm text-on-surface">
            <MaterialSymbol name="notifications_active" size="text-lg" className="shrink-0 text-warning" />
            {t('admin.events.details.reminderHint', { count: pendingParents })}
          </p>
          <Button type="button" size="sm" className="shrink-0" onClick={() => setReminderOpen(true)}>
            {t('admin.events.details.sendReminder')}
          </Button>
        </section>
      ) : null}

      <TableCard
        title={t('admin.events.details.attendanceTitle')}
        count={String(filteredRows.length)}
        description={price > 0 ? t('admin.events.details.totalRevenue', { amount: money(price * counts.granted) }) : undefined}
        actions={
          <Button type="button" variant="outline" size="sm" onClick={exportCsv}>
            <MaterialSymbol name="download" size="text-base" className="me-1" />
            {t('admin.events.details.exportCsv')}
          </Button>
        }
        filters={
          <div className="space-y-3">
            <FilterChips
              label={t('admin.events.details.attendanceTitle')}
              value={filter}
              onChange={setFilter}
              options={FILTERS.map((key) => ({ value: key, label: t(`admin.events.details.filters.${key}`), count: counts[key] }))}
            />
            <SearchInput value={search} onChange={setSearch} placeholder={t('admin.events.details.searchPlaceholder')} className="sm:max-w-sm" />
          </div>
        }
      >
        {filteredRows.length === 0 ? (
          <TableEmpty icon="filter_alt_off" title={t('admin.events.details.noMatches')} />
        ) : (
          <DataTable minWidth={event.is_paid ? 900 : 780}>
            <THead>
              <Th>{t('admin.events.details.table.child')}</Th>
              <Th>{t('admin.events.details.table.parent')}</Th>
              <Th>{t('admin.events.details.table.permission')}</Th>
              <Th>{t('admin.events.details.table.responded')}</Th>
              <Th>{t('admin.events.details.table.checkedIn')}</Th>
              <Th>{t('admin.events.details.table.denialNote')}</Th>
              {event.is_paid ? <Th>{t('admin.events.details.table.payment')}</Th> : null}
            </THead>
            <TBody>
              {filteredRows.map((r) => (
                <Tr key={r.permission_id} data-testid="event-family-row">
                  <Td>
                    <div className="flex items-center gap-2">
                      <Avatar className="h-8 w-8">
                        {r.avatar_url ? <AvatarImage src={r.avatar_url} alt="" /> : null}
                        <AvatarFallback className="text-xs">{getUserInitials(displayChild(r), null)}</AvatarFallback>
                      </Avatar>
                      <Link to={`/admin/children/${r.child_id}`} className="font-medium text-on-surface hover:text-primary hover:underline">
                        {displayChild(r)}
                      </Link>
                    </div>
                  </Td>
                  <Td>{displayParent(r)}</Td>
                  <Td>
                    <StatusPill tone={ANSWER[r.status]?.tone ?? 'neutral'} icon={ANSWER[r.status]?.icon}>
                      {answerText(r.status)}
                    </StatusPill>
                  </Td>
                  <Td className="text-on-surface-variant">{r.responded_at ? dateFmt.format(new Date(r.responded_at)) : '—'}</Td>
                  <Td>
                    {r.checked_in_at ? (
                      <StatusPill tone="success" icon="how_to_reg">{checkInFmt.format(new Date(r.checked_in_at))}</StatusPill>
                    ) : (
                      <span className="text-on-surface-variant">—</span>
                    )}
                  </Td>
                  <Td className="max-w-[12rem] truncate text-on-surface-variant">{r.status === 'denied' && r.parent_note ? r.parent_note : '—'}</Td>
                  {event.is_paid ? (
                    <Td>
                      {r.invoice_status ? <StatusPill tone={INVOICE_TONE[r.invoice_status] ?? 'neutral'}>{invoiceText(r)}</StatusPill> : '—'}
                    </Td>
                  ) : null}
                </Tr>
              ))}
            </TBody>
          </DataTable>
        )}
      </TableCard>

      <Dialog open={reminderOpen} onOpenChange={setReminderOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('admin.events.details.reminderTitle')}</DialogTitle>
            <DialogDescription>{t('admin.events.details.reminderConfirm', { count: pendingParents, event: eventTitleForMessage })}</DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button type="button" variant="outline" onClick={() => setReminderOpen(false)}>
              {t('common.cancel')}
            </Button>
            <Button type="button" disabled={reminderBusy} onClick={() => void sendReminders()}>
              {t('admin.events.details.reminderSend')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
