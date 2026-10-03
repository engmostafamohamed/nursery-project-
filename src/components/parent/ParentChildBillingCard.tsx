import { Link } from 'react-router-dom';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { MaterialSymbol } from '@/components/ui/MaterialSymbol';
import { useParentInvoices } from '@/hooks/useParentInvoices';
import type { ParentChildBilling } from '@/hooks/useParentChildBilling';
import type { BillingPeriodKind } from '@/hooks/useAdminTuitionBillingPeriods';

const PERIOD_LABELS: Record<BillingPeriodKind, string> = {
  monthly: 'Monthly',
  quarterly: 'Quarterly',
  half_annual: 'Half-annual',
  annual: 'Annual',
};

function fmtDate(value: string | null | undefined) {
  if (!value) return '—';
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString();
}

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
  const invoicesQuery = useParentInvoices({ parentId, childId, status: 'pending', sort: 'due_soon' });
  const outstanding = invoicesQuery.data.reduce((sum, invoice) => sum + invoice.amount, 0);
  const subscription = billing?.subscription ?? null;
  const extraHours = billing?.extraHours ?? null;

  return (
    <div className="rounded-2xl border border-outline-variant bg-surface p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-semibold text-on-surface">{childName}</p>
        {outstanding > 0 ? (
          <Badge variant="warning">EGP {outstanding.toFixed(2)} due</Badge>
        ) : (
          <Badge variant="success">Up to date</Badge>
        )}
      </div>

      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <div className="rounded-xl bg-surface-container-lowest p-3">
          <p className="flex items-center gap-1.5 text-xs font-medium text-on-surface-variant">
            <MaterialSymbol name="school" size="text-sm" />
            Tuition
          </p>
          {subscription ? (
            <>
              <p className="mt-1 text-sm font-semibold text-on-surface">
                {subscription.packageNameEn || subscription.packageNameAr}
              </p>
              <p className="mt-0.5 text-xs text-on-surface-variant">
                {PERIOD_LABELS[subscription.billingPeriod]} · EGP {subscription.lockedPrice.toFixed(2)}
              </p>
              <p className="mt-0.5 text-xs text-on-surface-variant">
                Next invoice: {fmtDate(subscription.nextInvoiceDate)}
              </p>
            </>
          ) : (
            <p className="mt-1 text-sm text-on-surface-variant">No tuition plan set up yet.</p>
          )}
        </div>

        <div className="rounded-xl bg-surface-container-lowest p-3">
          <p className="flex items-center gap-1.5 text-xs font-medium text-on-surface-variant">
            <MaterialSymbol name="schedule" size="text-sm" />
            Extra hours
          </p>
          {extraHours ? (
            <>
              <p className="mt-1 text-sm font-semibold text-on-surface">
                {extraHours.packageNameEn || extraHours.packageNameAr}
              </p>
              <p className="mt-0.5 text-xs text-on-surface-variant">
                {extraHours.coverageType === 'unlimited'
                  ? 'Unlimited'
                  : `${extraHours.hoursUsed} / ${extraHours.includedHours ?? 0} hours used`}
              </p>
              {extraHours.expiresAt ? (
                <p className="mt-0.5 text-xs text-on-surface-variant">Expires: {fmtDate(extraHours.expiresAt)}</p>
              ) : null}
            </>
          ) : (
            <p className="mt-1 text-sm text-on-surface-variant">No extra-hours package.</p>
          )}
        </div>
      </div>

      <div className="mt-3 flex justify-end">
        <Button type="button" variant="outline" size="sm" asChild>
          <Link to={`/parent/invoices?child=${childId}`}>
            <MaterialSymbol name="receipt_long" size="text-base" />
            {outstanding > 0 ? 'Pay now' : 'View invoices'}
          </Link>
        </Button>
      </div>
    </div>
  );
}
