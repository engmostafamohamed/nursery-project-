import { useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';

import { ParentPermissionCardView } from '@/components/parent/ParentPermissionCard';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { EmptyState } from '@/components/ui/EmptyState';
import { Label } from '@/components/ui/label';
import { LoadingSkeleton } from '@/components/ui/LoadingSkeleton';
import { Textarea } from '@/components/ui/textarea';
import { useAuthSession } from '@/hooks/useAuthSession';
import {
  parentPermissionsCountsQueryKey,
  useParentPermissionCards,
  useParentPermissionCounts,
  type ParentPermissionCard,
  type ParentPermissionTab,
} from '@/hooks/useParentPermissionsPage';
import { generateEventInvoice, getInvoiceForPermission } from '@/lib/eventInvoices';
import { useSettings } from '@/lib/useSettings';
import { supabase } from '@/lib/supabase';

const TABS: ParentPermissionTab[] = ['pending', 'granted', 'denied'];

export function ParentPermissionsPage() {
  const { t, i18n } = useTranslation();
  const { user } = useAuthSession();
  const { settings } = useSettings();
  const queryClient = useQueryClient();
  const parentId = user?.id;
  const [tab, setTab] = useState<ParentPermissionTab>('pending');
  const [denyTarget, setDenyTarget] = useState<ParentPermissionCard | null>(null);
  const [denyNote, setDenyNote] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [busyAction, setBusyAction] = useState<'approve' | 'deny' | null>(null);

  const countsQuery = useParentPermissionCounts(parentId);
  const cardsQuery = useParentPermissionCards(parentId, tab);
  const counts = countsQuery.data ?? { pending: 0, granted: 0, denied: 0 };
  const cards = useMemo(() => cardsQuery.data ?? [], [cardsQuery.data]);

  const locale = i18n.language.startsWith('ar') ? 'ar-EG' : 'en-GB';
  const dateFmt = new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short', hour12: true });
  const priceFmt = new Intl.NumberFormat(locale, { style: 'currency', currency: 'EGP' });

  const grouped = useMemo(() => {
    const map = new Map<string, ParentPermissionCard[]>();
    for (const c of cards) {
      const list = map.get(c.child_id) ?? [];
      list.push(c);
      map.set(c.child_id, list);
    }
    return [...map.entries()];
  }, [cards]);

  const displayTitle = (row: ParentPermissionCard) =>
    (i18n.language.startsWith('ar') ? row.title_ar : row.title_en) || row.title_en || row.title_ar;
  const displayChild = (row: ParentPermissionCard) =>
    (i18n.language.startsWith('ar') ? row.childNameAr : row.childNameEn) || row.childNameEn || row.childNameAr;

  const invalidateAll = async () => {
    await queryClient.invalidateQueries({ queryKey: ['parent-permissions-page', parentId] });
    await queryClient.invalidateQueries({ queryKey: parentPermissionsCountsQueryKey(parentId) });
    await queryClient.invalidateQueries({ queryKey: ['parent-event-permissions', parentId] });
    await queryClient.invalidateQueries({ queryKey: ['parent-dashboard-feed', parentId] });
    await queryClient.invalidateQueries({ queryKey: ['parent-invoices', parentId] });
  };

  const onApprove = async (row: ParentPermissionCard) => {
    if (!parentId) return;
    setBusyId(row.id);
    setBusyAction('approve');
    try {
      const { error } = await supabase
        .from('permissions')
        .update({ status: 'granted', responded_at: new Date().toISOString() } as never)
        .eq('id', row.id);
      if (error) throw error;

      try {
        let invoice = await getInvoiceForPermission(row.id);
        if (!invoice) {
          invoice = await generateEventInvoice({
            permissionId: row.id,
            eventId: row.event_id,
            childId: row.child_id,
            invoiceDueDays: Number(settings.invoice_due_days ?? 7),
          });
        }
        if (invoice) {
          await supabase.from('notifications').insert({
            user_id: parentId,
            type: 'event_invoice_generated',
          title_ar: 'تم إصدار فاتورة فعالية',
            title_en: 'Event invoice generated',
          body_ar: `تم إصدار فاتورة للفعالية ${row.title_ar}: ${invoice.amount} جنيه.`,
            body_en: `Invoice generated for ${row.title_en}: EGP ${invoice.amount}.`,
            channel: 'push',
          } as never);
        }
      } catch (invErr) {
        console.error('event invoice generation failed (non-blocking)', invErr);
      }

      toast.success(t('parent.permissions.toastGranted', { title: displayTitle(row) }));
      await invalidateAll();
    } catch {
      toast.error(t('parent.permissions.updateError'));
    } finally {
      setBusyId(null);
      setBusyAction(null);
    }
  };

  const confirmDeny = async () => {
    if (!denyTarget) return;
    setBusyId(denyTarget.id);
    setBusyAction('deny');
    try {
      const note = denyNote.trim() || null;
      const { error } = await supabase
        .from('permissions')
        .update({
          status: 'denied',
          parent_note: note,
          responded_at: new Date().toISOString(),
        } as never)
        .eq('id', denyTarget.id);
      if (error) throw error;
      toast.success(t('parent.permissions.toastDenied', { title: displayTitle(denyTarget) }));
      setDenyTarget(null);
      setDenyNote('');
      await invalidateAll();
    } catch {
      toast.error(t('parent.permissions.updateError'));
    } finally {
      setBusyId(null);
      setBusyAction(null);
    }
  };

  const showLoading = Boolean(parentId) && (countsQuery.isPending || cardsQuery.isPending);
  const showError = cardsQuery.isError;

  return (
    <div className="mx-auto max-w-lg lg:max-w-none space-y-4 px-4 pb-28 pt-2">
      <h1 className="text-lg font-semibold text-on-surface">{t('parent.permissions.title')}</h1>

      <div className="flex flex-wrap gap-3 rounded-2xl border border-outline-variant bg-surface-container-lowest p-3">
        <div className="flex items-center gap-2 text-sm text-on-surface-variant">
          <span className="material-symbols-outlined text-lg text-primary" aria-hidden>assignment</span>
          {t('parent.permissions.totalCount', { count: counts.pending + counts.granted + counts.denied })}
        </div>
        {counts.pending > 0 ? (
          <div className="flex items-center gap-2 text-sm text-on-surface-variant">
            <span className="material-symbols-outlined text-lg text-primary" aria-hidden>pending_actions</span>
            {t('parent.permissions.pendingCount', { count: counts.pending })}
          </div>
        ) : null}
      </div>

      <div className="flex gap-2 overflow-x-auto pb-1" role="tablist" aria-label={t('parent.permissions.tabListLabel')}>
        {TABS.map((key) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={tab === key}
            className={`shrink-0 rounded-full px-3 py-1.5 text-sm font-medium transition-colors ${
              tab === key ? 'bg-primary text-on-primary' : 'bg-surface-container text-on-surface-variant'
            }`}
            onClick={() => setTab(key)}
          >
            {t(`parent.permissions.tabs.${key}`)} ({counts[key]})
          </button>
        ))}
      </div>

      {showLoading ? (
        <LoadingSkeleton
          variant="permissionCards"
          permissionCardsLabel={t('parent.permissions.loadingLabel')}
        />
      ) : null}

      {showError ? (
        <p className="text-sm text-error" role="alert">
          {t('parent.permissions.loadError')}
        </p>
      ) : null}

      {!showLoading && !showError && !cards.length ? (
        <EmptyState
          icon="verified_user"
          title={
            tab === 'pending'
              ? t('parent.permissions.emptyTitlePending')
              : t('parent.permissions.emptyTitleTab', { tab: t(`parent.permissions.tabs.${tab}`) })
          }
          description={
            tab === 'pending'
              ? t('parent.permissions.emptyDescriptionPending')
              : t('parent.permissions.emptyDescriptionTab')
          }
        />
      ) : null}

      {!showLoading && !showError && cards.length > 0
        ? grouped.map(([childId, rows]) => (
            <section key={childId} className="space-y-3">
              <h2 className="text-sm font-medium text-on-surface-variant">{displayChild(rows[0]!)}</h2>
              {rows.map((row) => (
                <ParentPermissionCardView
                  key={row.id}
                  row={row}
                  tab={tab}
                  busyId={busyId}
                  busyAction={busyAction}
                  dateFmt={dateFmt}
                  priceFmt={priceFmt}
                  onApprove={(r) => void onApprove(r)}
                  onDenyOpen={(r) => {
                    setDenyNote('');
                    setDenyTarget(r);
                  }}
                />
              ))}
            </section>
          ))
        : null}

      <Dialog open={Boolean(denyTarget)} onOpenChange={(open) => !open && setDenyTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('parent.permissions.denyTitle')}</DialogTitle>
            <DialogDescription>
              {denyTarget
                ? t('parent.permissions.denyDescription', {
                    child: displayChild(denyTarget),
                    event: displayTitle(denyTarget),
                  })
                : null}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="deny-note">{t('parent.permissions.denyNoteLabel')}</Label>
            <Textarea
              id="deny-note"
              rows={3}
              maxLength={200}
              value={denyNote}
              onChange={(e) => setDenyNote(e.target.value.slice(0, 200))}
              placeholder={t('parent.permissions.denyNotePlaceholder')}
            />
          </div>
          <div className="mt-4 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button type="button" variant="outline" disabled={Boolean(busyId)} onClick={() => setDenyTarget(null)}>
              {t('common.cancel')}
            </Button>
            <Button
              type="button"
              className="gap-2 bg-error text-white hover:bg-error/90"
              disabled={Boolean(busyId)}
              aria-busy={Boolean(busyId)}
              onClick={() => void confirmDeny()}
            >
              {busyId ? (
                <>
                  <span className="material-symbols-outlined animate-spin text-lg" aria-hidden>
                    progress_activity
                  </span>
                  <span className="sr-only">{t('parent.permissions.card.ariaSpinner')}</span>
                  {t('parent.permissions.card.denying')}
                </>
              ) : (
                t('parent.permissions.denyConfirm')
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
