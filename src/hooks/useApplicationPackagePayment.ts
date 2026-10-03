import { useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { supabase } from '@/lib/supabase';

export type ApplicationPackageDeal = {
  id: string;
  nameAr: string;
  nameEn: string;
  discountType: 'percentage' | 'fixed_amount';
  discountValue: number;
  startsAt: string | null;
  endsAt: string | null;
  active: boolean;
};

export type ApplicationPackageBillingPeriod = 'monthly' | 'quarterly' | 'half_annual' | 'annual';

export type ApplicationPackageBillingPeriodOption = {
  billingPeriod: ApplicationPackageBillingPeriod;
  durationMonths: number;
  price: number;
};

export type ApplicationPaymentPackage = {
  id: string;
  nameAr: string;
  nameEn: string;
  descriptionAr: string | null;
  descriptionEn: string | null;
  price: number;
  dailyHours: number | null;
  featuresJson: Array<{ ar: string; en: string }>;
  deal: ApplicationPackageDeal | null;
  billingPeriods: ApplicationPackageBillingPeriodOption[];
};

const DEFAULT_BILLING_MONTHS: Record<ApplicationPackageBillingPeriod, number> = {
  monthly: 1,
  quarterly: 3,
  half_annual: 6,
  annual: 12,
};

/** Whether a deal is currently claimable: active and inside its optional start/end window. */
export function isApplicationDealActive(deal: Pick<ApplicationPackageDeal, 'active' | 'startsAt' | 'endsAt'>): boolean {
  if (!deal.active) return false;
  const now = Date.now();
  if (deal.startsAt && new Date(deal.startsAt).getTime() > now) return false;
  if (deal.endsAt && new Date(deal.endsAt).getTime() <= now) return false;
  return true;
}

export type PackageBillingQuote = {
  billingMonths: number;
  subtotal: number;
  discountAmount: number;
  total: number;
  dealApplied: boolean;
};

/**
 * Mirrors `select_application_payment_package`'s own pricing math exactly, so the preview a
 * parent sees before choosing a package matches the invoice it actually creates — including
 * reading the real per-period price instead of a stale price × months guess.
 */
export function computePackageBillingQuote(
  pkg: Pick<ApplicationPaymentPackage, 'price' | 'billingPeriods' | 'deal'>,
  billingPeriod: ApplicationPackageBillingPeriod,
): PackageBillingQuote {
  const period = pkg.billingPeriods.find((p) => p.billingPeriod === billingPeriod);
  const billingMonths = period?.durationMonths ?? DEFAULT_BILLING_MONTHS[billingPeriod];
  const subtotal = period ? period.price : pkg.price * billingMonths;
  const dealApplied = Boolean(pkg.deal && isApplicationDealActive(pkg.deal));
  let discountAmount = 0;
  if (dealApplied && pkg.deal) {
    discountAmount =
      pkg.deal.discountType === 'percentage'
        ? Math.round(subtotal * pkg.deal.discountValue) / 100
        : pkg.deal.discountValue;
    discountAmount = Math.min(discountAmount, subtotal);
  }
  const total = Math.max(subtotal - discountAmount, 0);
  return { billingMonths, subtotal, discountAmount, total, dealApplied };
}

export type ApplicationPackageInvoice = {
  id: string;
  invoiceNumber: string;
  packageId: string | null;
  packageName: string;
  amount: number;
  paidAmount: number;
  pendingAmount: number;
  balanceDue: number;
  status: 'unpaid' | 'partial' | 'paid' | 'in_review' | 'cancelled' | 'overdue';
  dueDate: string;
  billingPeriod: ApplicationPackageBillingPeriod;
  billingMonths: number;
  monthlyPrice: number;
  subtotal: number;
  discountAmount: number;
};

type Params = {
  applicationId?: string;
  parentId?: string;
  nurseryId?: string;
};

function money(value: string | number | null | undefined): number {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function lineApplicationId(raw: unknown): string {
  const obj = raw as { application_id?: unknown } | null;
  return typeof obj?.application_id === 'string' ? obj.application_id : '';
}

function linePackageId(raw: unknown): string | null {
  const obj = raw as { package_id?: unknown; package_name_en?: unknown; package_name_ar?: unknown } | null;
  return typeof obj?.package_id === 'string' ? obj.package_id : null;
}

function linePackageName(raw: unknown): string {
  const obj = raw as { package_name_en?: unknown; package_name_ar?: unknown; items?: unknown } | null;
  if (typeof obj?.package_name_en === 'string' && obj.package_name_en.trim()) return obj.package_name_en;
  if (typeof obj?.package_name_ar === 'string' && obj.package_name_ar.trim()) return obj.package_name_ar;
  const first = Array.isArray(obj?.items) ? (obj.items[0] as { description?: unknown } | undefined) : undefined;
  return typeof first?.description === 'string' ? first.description : '';
}

function lineBillingPeriod(raw: unknown): ApplicationPackageBillingPeriod {
  const value = (raw as { billing_period?: unknown } | null)?.billing_period;
  return value === 'quarterly' || value === 'half_annual' || value === 'annual' ? value : 'monthly';
}

function lineBillingMonths(raw: unknown): number {
  const months = Number((raw as { billing_months?: unknown } | null)?.billing_months ?? 1);
  return Number.isFinite(months) && months > 0 ? months : 1;
}

function lineMonthlyPrice(raw: unknown, amount: number, months: number): number {
  const value = Number((raw as { monthly_price?: unknown } | null)?.monthly_price ?? amount / Math.max(1, months));
  return Number.isFinite(value) ? value : amount;
}

function lineSubtotal(raw: unknown, amount: number): number {
  const value = Number((raw as { subtotal?: unknown } | null)?.subtotal ?? amount);
  return Number.isFinite(value) ? value : amount;
}

function lineDiscountAmount(raw: unknown): number {
  const value = Number((raw as { discount_amount?: unknown } | null)?.discount_amount ?? 0);
  return Number.isFinite(value) ? value : 0;
}

export function useApplicationPackagePayment({ applicationId, parentId, nurseryId }: Params) {
  const queryClient = useQueryClient();

  const packagesQuery = useQuery({
    queryKey: ['application-payment-packages', nurseryId],
    queryFn: async (): Promise<ApplicationPaymentPackage[]> => {
      if (!nurseryId) return [];
      const { data, error } = await supabase
        .from('tuition_packages')
        .select(
          `id, name_ar, name_en, description_ar, description_en, daily_hours, features_json, price,
          deals (id, name_ar, name_en, discount_type, discount_value, starts_at, ends_at, active),
          tuition_package_billing_periods (billing_period, duration_months, price, active)`,
        )
        .eq('nursery_id', nurseryId)
        .eq('active', true)
        .order('price', { ascending: true });
      if (error) throw error;
      type DealRow = {
        id: string;
        name_ar: string;
        name_en: string;
        discount_type: 'percentage' | 'fixed_amount';
        discount_value: string | number;
        starts_at: string | null;
        ends_at: string | null;
        active: boolean;
      };
      type PeriodRow = {
        billing_period: string;
        duration_months: number;
        price: string | number;
        active: boolean;
      };
      return ((data ?? []) as Array<{
        id: string;
        name_ar: string;
        name_en: string;
        description_ar: string | null;
        description_en: string | null;
        daily_hours: number | null;
        features_json: unknown;
        price: string | number;
        deals: DealRow | DealRow[] | null;
        tuition_package_billing_periods: PeriodRow[] | null;
      }>).map((row) => {
        const dealRow = Array.isArray(row.deals) ? row.deals[0] : row.deals;
        return {
          id: row.id,
          nameAr: row.name_ar,
          nameEn: row.name_en,
          descriptionAr: row.description_ar,
          descriptionEn: row.description_en,
          dailyHours: row.daily_hours,
          featuresJson: Array.isArray(row.features_json)
            ? (row.features_json as Array<{ ar?: unknown; en?: unknown }>)
                .filter((item) => item && typeof item === 'object')
                .map((item) => ({ ar: String(item.ar ?? ''), en: String(item.en ?? '') }))
            : [],
          price: money(row.price),
          deal: dealRow
            ? {
                id: dealRow.id,
                nameAr: dealRow.name_ar,
                nameEn: dealRow.name_en,
                discountType: dealRow.discount_type,
                discountValue: money(dealRow.discount_value),
                startsAt: dealRow.starts_at,
                endsAt: dealRow.ends_at,
                active: dealRow.active,
              }
            : null,
          billingPeriods: (row.tuition_package_billing_periods ?? [])
            .filter((p) => p.active && ['monthly', 'quarterly', 'half_annual', 'annual'].includes(p.billing_period))
            .map((p) => ({
              billingPeriod: p.billing_period as ApplicationPackageBillingPeriod,
              durationMonths: p.duration_months,
              price: money(p.price),
            })),
        };
      });
    },
    enabled: Boolean(nurseryId),
  });

  const invoiceQuery = useQuery({
    queryKey: ['application-package-invoice', applicationId, parentId, nurseryId],
    queryFn: async (): Promise<ApplicationPackageInvoice | null> => {
      if (!applicationId || !parentId || !nurseryId) return null;
      const { data, error } = await supabase
        .from('invoices')
        .select(
          `
          id,
          generated_invoice_number,
          amount,
          status,
          due_date,
          line_items_json,
          payments (amount, status),
          payment_attempts (amount, status)
        `,
        )
        .eq('parent_id', parentId)
        .eq('nursery_id', nurseryId)
        .order('created_at', { ascending: false });
      if (error) throw error;

      const invoice = ((data ?? []) as Array<{
        id: string;
        generated_invoice_number: string | null;
        amount: string | number;
        status: 'pending' | 'paid' | 'overdue' | 'cancelled';
        due_date: string;
        line_items_json: unknown;
        payments: Array<{ amount: string | number; status: string }> | null;
        payment_attempts: Array<{ amount: string | number; status: string }> | null;
      }>).find((row) => lineApplicationId(row.line_items_json) === applicationId);

      if (!invoice) return null;
      const amount = money(invoice.amount);
      const paidAmount = (invoice.payments ?? [])
        .filter((row) => row.status === 'completed')
        .reduce((sum, row) => sum + money(row.amount), 0);
      const pendingAmount = (invoice.payment_attempts ?? [])
        .filter((row) => row.status === 'pending_confirmation')
        .reduce((sum, row) => sum + money(row.amount), 0);
      const balanceDue = Math.max(0, amount - paidAmount);
      const due = new Date(invoice.due_date).getTime();
      const isOverdue = invoice.status === 'pending' && Number.isFinite(due) && due < Date.now();
      const status =
        invoice.status === 'cancelled'
          ? 'cancelled'
          : paidAmount >= amount
            ? 'paid'
            : pendingAmount > 0
              ? 'in_review'
              : paidAmount > 0
                ? 'partial'
                : isOverdue
                  ? 'overdue'
                  : 'unpaid';

      return {
        id: invoice.id,
        invoiceNumber: invoice.generated_invoice_number ?? invoice.id.slice(0, 8),
        packageId: linePackageId(invoice.line_items_json),
        packageName: linePackageName(invoice.line_items_json),
        amount,
        paidAmount,
        pendingAmount,
        balanceDue,
        status,
        dueDate: invoice.due_date,
        billingPeriod: lineBillingPeriod(invoice.line_items_json),
        billingMonths: lineBillingMonths(invoice.line_items_json),
        monthlyPrice: lineMonthlyPrice(invoice.line_items_json, amount, lineBillingMonths(invoice.line_items_json)),
        subtotal: lineSubtotal(invoice.line_items_json, amount),
        discountAmount: lineDiscountAmount(invoice.line_items_json),
      };
    },
    enabled: Boolean(applicationId && parentId && nurseryId),
  });

  const selectPackage = useMutation({
    mutationFn: async ({
      packageId,
      billingPeriod,
    }: {
      packageId: string;
      billingPeriod?: ApplicationPackageBillingPeriod;
    }) => {
      if (!applicationId) throw new Error('Missing application');
      const { data, error } = await supabase.rpc('select_application_payment_package' as never, {
        p_application_id: applicationId,
        p_package_id: packageId,
        p_billing_period: billingPeriod ?? 'monthly',
      } as never);
      if (error) throw error;
      return data as string;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['application-package-invoice'] });
      void queryClient.invalidateQueries({ queryKey: ['parent-invoices'] });
      void queryClient.invalidateQueries({ queryKey: ['payment-history'] });
      void queryClient.invalidateQueries({ queryKey: ['application-detail'] });
    },
  });

  const selectedPackage = useMemo(
    () => (packagesQuery.data ?? []).find((pkg) => pkg.id === invoiceQuery.data?.packageId) ?? null,
    [invoiceQuery.data?.packageId, packagesQuery.data],
  );

  return {
    packages: packagesQuery.data ?? [],
    selectedPackage,
    invoice: invoiceQuery.data ?? null,
    isLoading: packagesQuery.isLoading || invoiceQuery.isLoading,
    selectPackage: (packageId: string, billingPeriod?: ApplicationPackageBillingPeriod) =>
      selectPackage.mutateAsync({ packageId, billingPeriod }),
    isSelecting: selectPackage.isPending,
    refetch: invoiceQuery.refetch,
  };
}
