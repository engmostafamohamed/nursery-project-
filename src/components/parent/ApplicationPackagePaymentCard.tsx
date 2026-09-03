import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import type { ApplicationPaymentPackage, ApplicationPackageInvoice } from '@/hooks/useApplicationPackagePayment';

type Props = {
  packages: ApplicationPaymentPackage[];
  invoice: ApplicationPackageInvoice | null;
  isLoading?: boolean;
  isSelecting?: boolean;
  canChoose: boolean;
  onSelect: (packageId: string) => Promise<unknown>;
};

function packageName(pkg: ApplicationPaymentPackage, isAr: boolean): string {
  return isAr ? pkg.nameAr || pkg.nameEn : pkg.nameEn || pkg.nameAr;
}

function statusVariant(status: ApplicationPackageInvoice['status'] | 'not_selected') {
  if (status === 'paid') return 'success';
  if (status === 'partial' || status === 'in_review') return 'warning';
  if (status === 'overdue') return 'error';
  return 'secondary';
}

export function ApplicationPackagePaymentCard({
  packages,
  invoice,
  isLoading = false,
  isSelecting = false,
  canChoose,
  onSelect,
}: Props) {
  const { t, i18n } = useTranslation();
  const isAr = i18n.language.startsWith('ar');
  const selectedId = invoice?.packageId ?? '';

  const selectedPackage = useMemo(
    () => packages.find((pkg) => pkg.id === selectedId) ?? null,
    [packages, selectedId],
  );

  return (
    <section className="rounded-2xl border border-outline-variant bg-surface-container-lowest p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-on-surface">
            {t('applications.paymentPackage.title', { defaultValue: 'Payment package' })}
          </h2>
          <p className="mt-1 text-xs text-on-surface-variant">
            {t('applications.paymentPackage.subtitle', {
              defaultValue: 'Choose a package and pay all or part of it before final approval.',
            })}
          </p>
        </div>
        <Badge variant={statusVariant(invoice?.status ?? 'not_selected')}>
          {invoice
            ? t(
                invoice.status === 'partial'
                  ? 'financial.paymentHistory.partial'
                  : invoice.status === 'unpaid'
                    ? 'invoice.status.pending'
                    : invoice.status === 'in_review'
                      ? 'invoice.inReview'
                      : `invoice.status.${invoice.status}`,
                { defaultValue: invoice.status },
              )
            : t('applications.paymentPackage.notSelected', { defaultValue: 'Not selected' })}
        </Badge>
      </div>

      {isLoading ? (
        <p className="mt-3 text-sm text-on-surface-variant">{t('common.loading')}</p>
      ) : packages.length === 0 ? (
        <p className="mt-3 text-sm text-on-surface-variant">
          {t('applications.paymentPackage.noPackages', {
            defaultValue: 'No active payment packages are available yet.',
          })}
        </p>
      ) : (
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          {packages.map((pkg) => {
            const active = pkg.id === selectedId;
            return (
              <button
                key={pkg.id}
                type="button"
                disabled={!canChoose || isSelecting || (invoice?.paidAmount ?? 0) > 0}
                onClick={() => void onSelect(pkg.id)}
                className={
                  'rounded-xl border p-3 text-start text-sm transition-colors disabled:cursor-not-allowed disabled:opacity-70 ' +
                  (active
                    ? 'border-primary bg-primary/10 text-on-surface'
                    : 'border-outline-variant bg-surface text-on-surface hover:border-primary')
                }
              >
                <span className="block font-semibold">{packageName(pkg, isAr)}</span>
                <span className="mt-1 block text-xs text-on-surface-variant">
                  {pkg.coverageType === 'hours_quota'
                    ? t('packages.typeQuota', { hours: pkg.includedHours ?? 0 })
                    : t('packages.typeUnlimited')}
                </span>
                <span className="mt-2 block font-semibold">
                  {t('invoice.egpAmount', { amount: pkg.price.toFixed(2) })}
                </span>
              </button>
            );
          })}
        </div>
      )}

      {invoice ? (
        <div className="mt-4 rounded-xl border border-outline-variant bg-surface p-3 text-sm">
          <div className="grid gap-2 sm:grid-cols-2">
            <p>
              <span className="text-on-surface-variant">{t('invoice.table.invoiceNo')}: </span>
              <Link className="font-medium text-primary underline" to={`/parent/invoices/${invoice.id}`}>
                {invoice.invoiceNumber}
              </Link>
            </p>
            <p>
              <span className="text-on-surface-variant">{t('applications.paymentPackage.selected', { defaultValue: 'Selected' })}: </span>
              {selectedPackage ? packageName(selectedPackage, isAr) : invoice.packageName || '-'}
            </p>
            <p>
              <span className="text-on-surface-variant">{t('invoice.details.total')}: </span>
              {t('invoice.egpAmount', { amount: invoice.amount.toFixed(2) })}
            </p>
            <p>
              <span className="text-on-surface-variant">{t('financial.paymentHistory.paid', { defaultValue: 'Paid' })}: </span>
              {t('invoice.egpAmount', { amount: invoice.paidAmount.toFixed(2) })}
            </p>
            <p>
              <span className="text-on-surface-variant">{t('invoice.inReview')}: </span>
              {t('invoice.egpAmount', { amount: invoice.pendingAmount.toFixed(2) })}
            </p>
            <p>
              <span className="text-on-surface-variant">{t('financial.paymentHistory.balance', { defaultValue: 'Balance' })}: </span>
              {t('invoice.egpAmount', { amount: invoice.balanceDue.toFixed(2) })}
            </p>
          </div>
          {invoice.balanceDue > 0 ? (
            <Button asChild className="mt-3 w-full sm:w-auto">
              <Link to={`/parent/invoices/${invoice.id}/pay`}>
                {t('payment.payNowAmount', { amount: invoice.balanceDue.toFixed(2) })}
              </Link>
            </Button>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
