import { useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { supabase } from '@/lib/supabase';

export type ApplicationPaymentPackage = {
  id: string;
  nameAr: string;
  nameEn: string;
  descriptionAr: string | null;
  descriptionEn: string | null;
  price: number;
  coverageType: 'unlimited' | 'hours_quota';
  includedHours: number | null;
};

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

export function useApplicationPackagePayment({ applicationId, parentId, nurseryId }: Params) {
  const queryClient = useQueryClient();

  const packagesQuery = useQuery({
    queryKey: ['application-payment-packages', nurseryId],
    queryFn: async (): Promise<ApplicationPaymentPackage[]> => {
      if (!nurseryId) return [];
      const { data, error } = await supabase
        .from('packages')
        .select('id, name_ar, name_en, description_ar, description_en, coverage_type, included_hours, price')
        .eq('nursery_id', nurseryId)
        .eq('active', true)
        .order('price', { ascending: true });
      if (error) throw error;
      return ((data ?? []) as Array<{
        id: string;
        name_ar: string;
        name_en: string;
        description_ar: string | null;
        description_en: string | null;
        coverage_type: 'unlimited' | 'hours_quota';
        included_hours: number | null;
        price: string | number;
      }>).map((row) => ({
        id: row.id,
        nameAr: row.name_ar,
        nameEn: row.name_en,
        descriptionAr: row.description_ar,
        descriptionEn: row.description_en,
        coverageType: row.coverage_type,
        includedHours: row.included_hours,
        price: money(row.price),
      }));
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
      };
    },
    enabled: Boolean(applicationId && parentId && nurseryId),
  });

  const selectPackage = useMutation({
    mutationFn: async (packageId: string) => {
      if (!applicationId) throw new Error('Missing application');
      const { data, error } = await supabase.rpc('select_application_payment_package' as never, {
        p_application_id: applicationId,
        p_package_id: packageId,
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
    selectPackage: selectPackage.mutateAsync,
    isSelecting: selectPackage.isPending,
    refetch: invoiceQuery.refetch,
  };
}
