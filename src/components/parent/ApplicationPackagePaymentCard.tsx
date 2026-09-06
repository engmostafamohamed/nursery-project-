import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import type { ApplicationPaymentPackage, ApplicationPackageInvoice } from '@/hooks/useApplicationPackagePayment';
import { cn } from '@/lib/utils';

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

function packageDescription(pkg: ApplicationPaymentPackage, isAr: boolean): string | null {
  return isAr ? pkg.descriptionAr || pkg.descriptionEn : pkg.descriptionEn || pkg.descriptionAr;
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
    <section className="overflow-hidden rounded-xl border border-outline-variant bg-surface shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-outline-variant bg-surface-container-lowest px-4 py-4 sm:px-5">
        <div className="flex min-w-0 items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
            <span className="material-symbols-outlined text-xl" aria-hidden>payments</span>
          </span>
          <div className="min-w-0">
            <h2 className="text-base font-semibold text-on-surface">
              {t('applications.paymentPackage.title', { defaultValue: 'Payment package' })}
            </h2>
            <p className="mt-1 max-w-2xl text-xs leading-5 text-on-surface-variant">
              {t('applications.paymentPackage.subtitle', {
                defaultValue: 'Choose a package and pay all or part of it before final approval.',
              })}
            </p>
          </div>
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
        <p className="px-5 py-6 text-sm text-on-surface-variant">{t('common.loading')}</p>
      ) : packages.length === 0 ? (
        <p className="px-5 py-6 text-sm text-on-surface-variant">
          {t('applications.paymentPackage.noPackages', {
            defaultValue: 'No active payment packages are available yet.',
          })}
        </p>
      ) : (
        <div className="grid gap-0 lg:grid-cols-[minmax(0,1fr)_minmax(280px,360px)]">
          <div className="grid gap-3 p-4 sm:grid-cols-2 sm:p-5 xl:grid-cols-3">
            {packages.map((pkg) => {
              const active = pkg.id === selectedId;
              const description = packageDescription(pkg, isAr);
              return (
                <button
                  key={pkg.id}
                  type="button"
                  disabled={!canChoose || isSelecting || (invoice?.paidAmount ?? 0) > 0}
                  onClick={() => void onSelect(pkg.id)}
                  className={cn(
                    'group flex min-h-[168px] flex-col rounded-lg border p-4 text-start text-sm transition-all disabled:cursor-not-allowed disabled:opacity-70',
                    active
                      ? 'border-primary bg-primary/10 shadow-sm ring-2 ring-primary/10'
                      : 'border-outline-variant bg-surface-container-lowest hover:border-primary hover:bg-primary/5',
                  )}
                >
                  <span className="flex items-start justify-between gap-3">
                    <span className="min-w-0">
                      <span className="block text-sm font-semibold text-on-surface">{packageName(pkg, isAr)}</span>
                      <span className="mt-1 block text-xs text-on-surface-variant">
                        {pkg.coverageType === 'hours_quota'
                          ? t('packages.typeQuota', { hours: pkg.includedHours ?? 0 })
                          : t('packages.typeUnlimited')}
                      </span>
                    </span>
                    <span
                      className={cn(
                        'flex h-7 w-7 shrink-0 items-center justify-center rounded-full border',
                        active ? 'border-primary bg-primary text-primary-foreground' : 'border-outline-variant text-on-surface-variant',
                      )}
                    >
                      <span className="material-symbols-outlined text-base" aria-hidden>
                        {active ? 'check' : 'add'}
                      </span>
                    </span>
                  </span>
                  {description ? (
                    <span className="mt-3 line-clamp-2 text-xs leading-5 text-on-surface-variant">{description}</span>
                  ) : null}
                  <span className="mt-auto pt-4 text-lg font-semibold text-on-surface">
                    {t('invoice.egpAmount', { amount: pkg.price.toFixed(2) })}
                  </span>
                </button>
              );
            })}
          </div>

          <aside className="border-t border-outline-variant bg-surface-container-lowest p-4 sm:p-5 lg:border-l lg:border-t-0">
            {invoice ? (
              <div className="space-y-4 text-sm">
                <div>
                  <p className="text-xs font-semibold uppercase text-on-surface-variant">
                    {t('invoice.table.invoiceNo')}
                  </p>
                  <Link className="mt-1 inline-flex font-semibold text-primary underline" to={`/parent/invoices/${invoice.id}`}>
                    {invoice.invoiceNumber}
                  </Link>
                </div>
                <div className="rounded-lg border border-outline-variant bg-surface p-3">
                  <p className="text-xs font-semibold uppercase text-on-surface-variant">
                    {t('applications.paymentPackage.selected', { defaultValue: 'Selected' })}
                  </p>
                  <p className="mt-1 font-semibold text-on-surface">
                    {selectedPackage ? packageName(selectedPackage, isAr) : invoice.packageName || '-'}
                  </p>
                </div>
                <dl className="grid gap-2">
                  <div className="flex justify-between gap-3">
                    <dt className="text-on-surface-variant">{t('invoice.details.total')}</dt>
                    <dd className="font-medium text-on-surface">{t('invoice.egpAmount', { amount: invoice.amount.toFixed(2) })}</dd>
                  </div>
                  <div className="flex justify-between gap-3">
                    <dt className="text-on-surface-variant">{t('financial.paymentHistory.paidLabel', { defaultValue: 'Paid' })}</dt>
                    <dd className="font-medium text-success">{t('invoice.egpAmount', { amount: invoice.paidAmount.toFixed(2) })}</dd>
                  </div>
                  <div className="flex justify-between gap-3">
                    <dt className="text-on-surface-variant">{t('invoice.inReview')}</dt>
                    <dd className="font-medium text-warning">{t('invoice.egpAmount', { amount: invoice.pendingAmount.toFixed(2) })}</dd>
                  </div>
                  <div className="flex justify-between gap-3 border-t border-outline-variant pt-2">
                    <dt className="font-semibold text-on-surface">{t('financial.paymentHistory.balanceLabel', { defaultValue: 'Balance' })}</dt>
                    <dd className="font-semibold text-on-surface">{t('invoice.egpAmount', { amount: invoice.balanceDue.toFixed(2) })}</dd>
                  </div>
                </dl>
                {invoice.balanceDue > 0 ? (
                  <Button asChild className="h-11 w-full gap-2 rounded-md">
                    <Link to={`/parent/invoices/${invoice.id}/pay`}>
                      <span className="material-symbols-outlined text-base" aria-hidden>credit_card</span>
                      {t('payment.payNowAmount', { amount: invoice.balanceDue.toFixed(2) })}
                    </Link>
                  </Button>
                ) : null}
              </div>
            ) : (
              <div className="rounded-lg border border-dashed border-outline-variant bg-surface p-4 text-sm text-on-surface-variant">
                {t('applications.paymentPackage.chooseToCreateInvoice', {
                  defaultValue: 'Choose a package to create your registration invoice.',
                })}
              </div>
            )}
          </aside>
        </div>
      )}
    </section>
  );
}
