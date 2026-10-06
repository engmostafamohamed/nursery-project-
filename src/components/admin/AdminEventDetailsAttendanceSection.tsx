import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { EmptyState } from '@/components/ui/EmptyState';
import { Input } from '@/components/ui/input';
import { LoadingSkeleton } from '@/components/ui/LoadingSkeleton';
import type { AdminEventAttendanceRow, AdminEventDetailRow } from '@/hooks/useAdminEventDetails';
import { localizedNames, templateNotificationRow } from '@/lib/notificationText';
import { supabase } from '@/lib/supabase';
import { getUserInitials } from '@/lib/utils';

type FilterTab = 'all' | 'granted' | 'denied' | 'pending';

type Props = {
  event: AdminEventDetailRow;
  rows: AdminEventAttendanceRow[];
  isLoading: boolean;
  onRefresh: () => void;
  eventTitleForMessage: string;
};

function statusBadgeClass(status: string): string {
  if (status === 'granted') return 'border-transparent bg-success/10 text-success';
  if (status === 'denied') return 'border-transparent bg-error-container text-on-error-container';
  if (status === 'pending') return 'border-transparent bg-warning/10 text-warning';
  return 'border-outline-variant bg-surface-container text-on-surface';
}

function csvEscape(value: string): string {
  if (value.includes('"') || value.includes(',') || value.includes('\n')) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

export function AdminEventDetailsAttendanceSection({
  event,
  rows,
  isLoading,
  onRefresh,
  eventTitleForMessage,
}: Props) {
  const { t, i18n } = useTranslation();
  const [filter, setFilter] = useState<FilterTab>('all');
  const [search, setSearch] = useState('');
  const [reminderOpen, setReminderOpen] = useState(false);
  const [reminderBusy, setReminderBusy] = useState(false);

  const locale = i18n.language.startsWith('ar') ? 'ar-EG' : 'en-GB';
  const dateFmt = new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short', hour12: true });

  const counts = useMemo(() => {
    const total = rows.length;
    const granted = rows.filter((r) => r.status === 'granted').length;
    const denied = rows.filter((r) => r.status === 'denied').length;
    const pending = rows.filter((r) => r.status === 'pending').length;
    return { total, granted, denied, pending };
  }, [rows]);

  const priceNum = event.price ? Number(event.price) : 0;
  const revenue =
    event.is_paid && !Number.isNaN(priceNum) ? priceNum * counts.granted : 0;
  const revenueFmt = new Intl.NumberFormat(locale, { style: 'currency', currency: 'EGP' });

  const pendingParents = useMemo(() => {
    const ids = new Set<string>();
    for (const r of rows) {
      if (r.status === 'pending' && r.parent_id) ids.add(r.parent_id);
    }
    return ids.size;
  }, [rows]);

  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (filter === 'granted' && r.status !== 'granted') return false;
      if (filter === 'denied' && r.status !== 'denied') return false;
      if (filter === 'pending' && r.status !== 'pending') return false;
      if (!q) return true;
      const hay = `${r.child_name_ar} ${r.child_name_en} ${r.parent_name_ar} ${r.parent_name_en}`.toLowerCase();
      return hay.includes(q);
    });
  }, [rows, filter, search]);

  const displayChild = (r: AdminEventAttendanceRow) =>
    (i18n.language.startsWith('ar') ? r.child_name_ar : r.child_name_en) || r.child_name_en;
  const displayParent = (r: AdminEventAttendanceRow) =>
    (i18n.language.startsWith('ar') ? r.parent_name_ar : r.parent_name_en) || r.parent_name_en;

  const exportCsv = () => {
    const headers = [
      t('admin.events.details.csv.child'),
      t('admin.events.details.csv.parent'),
      t('admin.events.details.csv.status'),
      t('admin.events.details.csv.respondedAt'),
      t('admin.events.details.csv.parentNote'),
      t('admin.events.details.csv.payment'),
    ];
    const lines = [headers.join(',')];
    for (const r of filteredRows) {
      const responded = r.responded_at ? dateFmt.format(new Date(r.responded_at)) : '';
      const note = r.parent_note ?? '';
      const pay =
        event.is_paid && r.invoice_status
          ? `${r.invoice_status}${r.invoice_amount ? ` (${r.invoice_amount})` : ''}`
          : '—';
      lines.push(
        [
          csvEscape(displayChild(r)),
          csvEscape(displayParent(r)),
          csvEscape(r.status),
          csvEscape(responded),
          csvEscape(note),
          csvEscape(pay),
        ].join(','),
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
    const pendingRows = rows.filter((r) => r.status === 'pending' && r.parent_id);
    const parentIds = [...new Set(pendingRows.map((r) => r.parent_id!))];
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
      await onRefresh();
    } catch {
      toast.error(t('admin.events.details.reminderError'));
    } finally {
      setReminderBusy(false);
    }
  };

  if (isLoading) {
    return (
      <LoadingSkeleton
        variant="permissionCards"
        permissionCardsLabel={t('admin.events.details.attendanceLoading')}
      />
    );
  }

  if (!rows.length) {
    return (
      <EmptyState
        icon="assignment_ind"
        title={t('admin.events.details.noPermissionsTitle')}
        description={t('admin.events.details.noPermissionsDescription')}
      />
    );
  }

  return (
    <div className="space-y-4">
      <h2 className="text-base font-semibold text-on-surface">{t('admin.events.details.attendanceTitle')}</h2>

      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-xl border border-outline-variant bg-surface-container-lowest p-3">
          <p className="text-xs text-on-surface-variant">{t('admin.events.details.statTotal')}</p>
          <p className="text-lg font-semibold text-on-surface">{counts.total}</p>
        </div>
        <div className="rounded-xl border border-success/40 bg-success/10 p-3">
          <p className="text-xs text-success">{t('admin.events.details.statApproved')}</p>
          <p className="text-lg font-semibold text-success">{counts.granted}</p>
        </div>
        <div className="rounded-xl border border-error/30 bg-error-container/40 p-3">
          <p className="text-xs text-on-error-container">{t('admin.events.details.statDenied')}</p>
          <p className="text-lg font-semibold text-on-error-container">{counts.denied}</p>
        </div>
        <div className="rounded-xl border border-warning/40 bg-warning/10 p-3">
          <p className="text-xs text-warning">{t('admin.events.details.statPending')}</p>
          <p className="text-lg font-semibold text-warning">{counts.pending}</p>
        </div>
      </div>

      {event.is_paid ? (
        <p className="text-sm font-medium text-on-surface">
          {t('admin.events.details.totalRevenue', { amount: revenueFmt.format(revenue) })}
        </p>
      ) : null}

      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <div className="flex flex-wrap gap-2">
          {(['all', 'granted', 'denied', 'pending'] as const).map((key) => (
            <button
              key={key}
              type="button"
              className={`rounded-full px-3 py-1 text-sm ${
                filter === key ? 'bg-primary text-on-primary' : 'bg-surface-container text-on-surface-variant'
              }`}
              onClick={() => setFilter(key)}
            >
              {t(`admin.events.details.filters.${key}`)}
            </button>
          ))}
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Input
            className="sm:w-56"
            placeholder={t('admin.events.details.searchPlaceholder')}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <Button type="button" variant="outline" size="sm" onClick={exportCsv}>
            {t('admin.events.details.exportCsv')}
          </Button>
        </div>
      </div>

      {counts.pending > 0 ? (
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-on-surface-variant">
            {t('admin.events.details.reminderHint', { count: pendingParents })}
          </p>
          <Button type="button" size="sm" variant="secondary" onClick={() => setReminderOpen(true)}>
            {t('admin.events.details.sendReminder')}
          </Button>
        </div>
      ) : null}

      <Dialog open={reminderOpen} onOpenChange={setReminderOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('admin.events.details.reminderTitle')}</DialogTitle>
            <DialogDescription>
              {t('admin.events.details.reminderConfirm', {
                count: pendingParents,
                event: eventTitleForMessage,
              })}
            </DialogDescription>
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

      <div className="overflow-x-auto rounded-xl border border-outline-variant bg-surface-container-lowest">
        <table className="min-w-full text-sm">
          <thead className="bg-surface-container text-on-surface-variant">
            <tr>
              <th className="px-3 py-2 text-start">{t('admin.events.details.table.child')}</th>
              <th className="px-3 py-2 text-start">{t('admin.events.details.table.parent')}</th>
              <th className="px-3 py-2 text-start">{t('admin.events.details.table.permission')}</th>
              <th className="px-3 py-2 text-start">{t('admin.events.details.table.responded')}</th>
              <th className="px-3 py-2 text-start">{t('admin.events.details.table.denialNote')}</th>
              {event.is_paid ? (
                <th className="px-3 py-2 text-start">{t('admin.events.details.table.payment')}</th>
              ) : null}
            </tr>
          </thead>
          <tbody>
            {filteredRows.map((r) => (
              <tr key={r.permission_id} className="border-t border-outline-variant">
                <td className="px-3 py-2">
                  <div className="flex items-center gap-2">
                    <Avatar className="h-8 w-8">
                      {r.avatar_url ? <AvatarImage src={r.avatar_url} alt="" /> : null}
                      <AvatarFallback className="text-xs">
                        {getUserInitials(displayChild(r), null)}
                      </AvatarFallback>
                    </Avatar>
                    <Link to={`/admin/children/${r.child_id}`} className="hover:underline">
                      {displayChild(r)}
                    </Link>
                  </div>
                </td>
                <td className="px-3 py-2">{displayParent(r)}</td>
                <td className="px-3 py-2">
                  <Badge className={statusBadgeClass(r.status)}>
                    {t(`admin.events.details.permissionStatus.${r.status}`, { defaultValue: r.status })}
                  </Badge>
                </td>
                <td className="px-3 py-2">
                  {r.responded_at ? dateFmt.format(new Date(r.responded_at)) : '—'}
                </td>
                <td className="max-w-[12rem] truncate px-3 py-2 text-on-surface-variant">
                  {r.status === 'denied' && r.parent_note ? r.parent_note : '—'}
                </td>
                {event.is_paid ? (
                  <td className="px-3 py-2">
                    {r.invoice_status ? (
                      <span className="text-xs">
                        {t(`admin.events.details.invoiceStatus.${r.invoice_status}`, {
                          defaultValue: r.invoice_status,
                        })}
                        {r.invoice_amount ? ` · ${r.invoice_amount}` : ''}
                      </span>
                    ) : (
                      '—'
                    )}
                  </td>
                ) : null}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
