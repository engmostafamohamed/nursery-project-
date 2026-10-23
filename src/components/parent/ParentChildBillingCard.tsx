import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';

import { Button } from '@/components/ui/button';
import { StatusPill } from '@/components/ui/DataTable';
import { MaterialSymbol } from '@/components/ui/MaterialSymbol';
import { useParentInvoices } from '@/hooks/useParentInvoices';
import type { ParentChildBilling } from '@/hooks/useParentChildBilling';
import { formatDate } from '@/lib/datetime';
import { formatMoneyAmount } from '@/lib/money';
import { cn } from '@/lib/utils';

export function ParentChildBillingCard({
  childId,
  childName,
  parentId,
  billing,
}: {
  childId: string;
  childName: string;
  parentId: string | undefined;
  billing: ParentChildBilling | undefined;
}) {
  const { t, i18n } = useTranslation();
  const isAr = i18n.language.startsWith('ar');
  const invoicesQuery = useParentInvoices({ parentId, childId, status: 'pending', sort: 'due_soon' });
  // What is still owed on this child's open invoices (a partly paid invoice counts its balance).
  const outstanding = invoicesQuery.data.reduce((sum, invoice) => sum + invoice.balance, 0);
  const subscription = billing?.subscription ?? null;
  const extraHours = billing?.extraHours ?? null;
  const money = (amount: number) => t('invoice.egpAmount', { amount: formatMoneyAmount(amount) });
  const usedPct =
    extraHours && extraHours.coverageType !== 'unlimited' && (extraHours.includedHours ?? 0) > 0
      ? Math.min(100, Math.round((extraHours.hoursUsed / (extraHours.includedHours ?? 1)) * 100))
      : null;

  return (
    <article className="flex flex-col rounded-xl border border-outline-variant bg-surface p-4 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="min-w-0 truncate text-sm font-semibold text-on-surface" title={childName}>{childName}</p>
        {outstanding > 0 ? (
          <StatusPill tone="warning" icon="schedule">{t('parent.dashboard.billing.due', { amount: money(outstanding) })}</StatusPill>
        ) : (
          <StatusPill tone="success" icon="task_alt">{t('parent.dashboard.billing.upToDate')}</StatusPill>
        )}
      </div>

      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <div className="rounded-lg bg-surface-container-lowest p-3">
          <p className="flex items-center gap-1.5 text-xs font-medium text-on-surface-variant">
            <MaterialSymbol name="school" size="text-sm" />
            {t('parent.dashboard.billing.tuition')}
          </p>
          {subscription ? (
            <>
              <p className="mt-1 text-sm font-semibold text-on-surface">
                {(isAr ? subscription.packageNameAr || subscription.packageNameEn : subscription.packageNameEn || subscription.packageNameAr) || '—'}
              </p>
              <p className="mt-0.5 text-xs text-on-surface-variant">
                {t(`tuitionPackages.periods.${subscription.billingPeriod}`)} · {money(subscription.lockedPrice)}
              </p>
              <p className="mt-0.5 text-xs text-on-surface-variant">
                {t('parent.dashboard.billing.nextInvoice', { date: subscription.nextInvoiceDate ? formatDate(subscription.nextInvoiceDate) : '—' })}
              </p>
            </>
          ) : (
            <p className="mt-1 text-sm text-on-surface-variant">{t('parent.dashboard.billing.noTuition')}</p>
          )}
        </div>

        <div className="rounded-lg bg-surface-container-lowest p-3">
          <p className="flex items-center gap-1.5 text-xs font-medium text-on-surface-variant">
            <MaterialSymbol name="more_time" size="text-sm" />
            {t('parent.dashboard.billing.extraHours')}
          </p>
          {extraHours ? (
            <>
              <p className="mt-1 text-sm font-semibold text-on-surface">
                {(isAr ? extraHours.packageNameAr || extraHours.packageNameEn : extraHours.packageNameEn || extraHours.packageNameAr) || '—'}
              </p>
              {usedPct != null ? (
                <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-surface-high">
                  <div
                    className={cn('h-full rounded-full', usedPct >= 90 ? 'bg-error' : usedPct >= 60 ? 'bg-warning' : 'bg-success')}
                    style={{ width: `${usedPct}%` }}
                  />
                </div>
              ) : null}
              <p className="mt-1 text-xs text-on-surface-variant">
                {extraHours.coverageType === 'unlimited'
                  ? t('parent.dashboard.billing.unlimited')
                  : t('parent.dashboard.billing.hoursUsed', { used: extraHours.hoursUsed, total: extraHours.includedHours ?? 0 })}
              </p>
              {extraHours.expiresAt ? (
                <p className="mt-0.5 text-xs text-on-surface-variant">{t('parent.dashboard.billing.expires', { date: formatDate(extraHours.expiresAt) })}</p>
              ) : null}
            </>
          ) : (
            <p className="mt-1 text-sm text-on-surface-variant">{t('parent.dashboard.billing.noExtraHours')}</p>
          )}
        </div>
      </div>

      <div className="mt-auto flex justify-end pt-3">
        <Button type="button" variant={outstanding > 0 ? 'default' : 'outline'} size="sm" asChild>
          <Link to={`/parent/invoices?child=${childId}`}>
            <MaterialSymbol name={outstanding > 0 ? 'payments' : 'receipt_long'} size="text-base" />
            {outstanding > 0 ? t('invoice.actions.payNow') : t('parent.dashboard.billing.viewInvoices')}
          </Link>
        </Button>
      </div>
    </article>
  );
}
