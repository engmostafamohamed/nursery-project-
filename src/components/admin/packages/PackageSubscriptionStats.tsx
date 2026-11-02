import { useTranslation } from 'react-i18next';

import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { MaterialSymbol } from '@/components/ui/MaterialSymbol';
import { Skeleton } from '@/components/ui/skeleton';
import { useMoney } from '@/hooks/useMoney';
import type { PackageSubscriptionsView } from '@/hooks/usePackageSubscriptionsView';
import { rowsForTile } from '@/lib/packageSubscriptions';
import { cn } from '@/lib/utils';

import { SubscriptionsTable } from './SubscriptionsTable';

/**
 * A package card's subscriptions for the page's period: how many, the children and parents, and how
 * much of the money is paid. Opens the package's subscriptions.
 */
export function PackageSubscriptionStats({ view, packageId }: { view: PackageSubscriptionsView; packageId: string }) {
  const { t } = useTranslation();
  const money = useMoney();
  if (!view.period.valid || view.query.isError) return null;
  if (view.query.isPending) return <Skeleton className="mb-3 h-[7.5rem] w-full rounded-lg" />;

  const summary = view.summaries.get(packageId);
  if (!summary) return null;
  const share = summary.billed > 0 ? Math.min(100, Math.round((summary.paid / summary.billed) * 100)) : 0;
  const empty = summary.subscriptions === 0;

  return (
    <button
      type="button"
      aria-haspopup="dialog"
      disabled={empty}
      onClick={() => view.openPackage(packageId)}
      className={cn(
        'mb-3 flex w-full flex-col gap-2 rounded-lg border border-outline-variant bg-surface-container-lowest p-3 text-start outline-none transition',
        'enabled:hover:border-primary/50 focus-visible:ring-2 focus-visible:ring-primary/30 disabled:cursor-default',
        view.query.isPlaceholderData && 'opacity-60',
      )}
    >
      <span className="flex items-center justify-between gap-2 text-xs font-semibold text-on-surface-variant">
        <span className="flex items-center gap-1.5">
          <MaterialSymbol name="card_membership" size="text-base" className="text-primary" />
          {t('packageSubscriptions.tiles.subscriptions')}
        </span>
        <span className="font-medium">{view.periodLabel}</span>
      </span>
      <span className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
        <span className={cn('text-2xl font-bold tabular-nums', empty ? 'text-on-surface-variant' : 'text-on-surface')}>{summary.subscriptions}</span>
        <span className="text-xs text-on-surface-variant">{t('packageSubscriptions.tiles.people', { children: summary.children, parents: summary.parents })}</span>
      </span>
      <span className="block h-1.5 overflow-hidden rounded-full bg-surface-high" aria-hidden>
        <span className="block h-full rounded-full bg-success" style={{ width: `${share}%` }} />
      </span>
      <span className="text-xs text-on-surface-variant">
        {summary.billed > 0
          ? t('packageSubscriptions.packagePaid', { paid: money(summary.paid), billed: money(summary.billed) })
          : summary.notInvoiced > 0
            ? t('packageSubscriptions.tiles.notInvoiced', { count: summary.notInvoiced })
            : t('packageSubscriptions.noInvoices')}
        {summary.unpaid > 0 ? <span className="text-error"> · {t('packageSubscriptions.packageUnpaid', { amount: money(summary.unpaid) })}</span> : null}
      </span>
      {!empty ? (
        <span className="flex items-center gap-1 text-xs font-semibold text-primary">
          {t('packageSubscriptions.card.viewSubscriptions')}
          <MaterialSymbol name="chevron_right" size="text-base" className="rtl:rotate-180" />
        </span>
      ) : null}
    </button>
  );
}

/** The open package's subscriptions, for the page's period, in a dialog over the cards. */
export function PackageSubscriptionsDialog({ view, basePath }: { view: PackageSubscriptionsView; basePath: string }) {
  const { i18n } = useTranslation();
  const packageId = view.openPackageId;
  const summary = packageId ? view.summaries.get(packageId) : undefined;
  const name = summary ? (i18n.language.startsWith('ar') ? summary.nameAr || summary.nameEn : summary.nameEn || summary.nameAr) || '—' : '';

  return (
    <Dialog open={Boolean(packageId && summary)} onOpenChange={(open) => !open && view.closePackage()}>
      <DialogContent className="max-w-6xl p-0">
        <DialogHeader className="px-5 pb-3 pe-12 pt-5">
          <DialogTitle>{name}</DialogTitle>
          <DialogDescription>{view.periodLabel}</DialogDescription>
        </DialogHeader>
        <div className="max-h-[75vh] overflow-y-auto">
          {packageId ? (
            <SubscriptionsTable
              key={`${packageId}|${view.period.range?.from ?? ''}|${view.period.range?.to ?? ''}`}
              rows={rowsForTile(`package:${packageId}`, view.rows)}
              basePath={basePath}
            />
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}
