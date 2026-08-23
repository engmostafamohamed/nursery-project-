import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';

import { supabase } from '@/lib/supabase';

type InvoiceRow = {
  id: string;
  child_name_ar: string;
  child_name_en: string;
  amount: string;
  status: string;
  parent_name_ar: string;
  parent_name_en: string;
  created_at: string;
};

interface Props {
  eventId: string | undefined;
}

export function AdminEventInvoicesSection({ eventId }: Props) {
  const { t, i18n } = useTranslation();
  const invoicesQuery = useQuery({
    queryKey: ['admin-event-invoices', eventId],
    queryFn: async (): Promise<InvoiceRow[]> => {
      if (!eventId) return [];
      const linksRes = await supabase
        .from('event_invoices')
        .select('invoice_id, parent_id, child_id, created_at')
        .eq('event_id', eventId);
      if (linksRes.error) throw linksRes.error;
      const links = (linksRes.data ?? []) as {
        invoice_id: string;
        parent_id: string;
        child_id: string;
        created_at: string;
      }[];
      const invoiceIds = [...new Set(links.map((link) => link.invoice_id))];
      if (!invoiceIds.length) return [];

      const invoicesRes = await supabase
        .from('invoices')
        .select('id, amount, status')
        .in('id', invoiceIds);
      if (invoicesRes.error) throw invoicesRes.error;
      const invoiceMap = new Map(
        ((invoicesRes.data ?? []) as { id: string; amount: string; status: string }[]).map((row) => [row.id, row]),
      );

      const parentIds = [...new Set(links.map((link) => link.parent_id))];
      const usersRes = await supabase
        .from('users')
        .select('id, name_ar, name_en')
        .in('id', parentIds);
      if (usersRes.error) throw usersRes.error;
      const userMap = new Map(
        ((usersRes.data ?? []) as { id: string; name_ar: string; name_en: string }[]).map((u) => [u.id, u]),
      );
      const childIds = [...new Set(links.map((link) => link.child_id))];
      const childrenRes = await supabase
        .from('children')
        .select('id, full_name_ar, full_name_en')
        .in('id', childIds);
      if (childrenRes.error) throw childrenRes.error;
      const childMap = new Map(
        ((childrenRes.data ?? []) as { id: string; full_name_ar: string; full_name_en: string }[]).map((c) => [c.id, c]),
      );

      return links
        .map((link) => {
          const invoice = invoiceMap.get(link.invoice_id);
          if (!invoice) return null;
          const parent = userMap.get(link.parent_id);
          const child = childMap.get(link.child_id);
          return {
            id: invoice.id,
            child_name_ar: child?.full_name_ar ?? '-',
            child_name_en: child?.full_name_en ?? '-',
            amount: invoice.amount,
            status: invoice.status,
            parent_name_ar: parent?.name_ar ?? '-',
            parent_name_en: parent?.name_en ?? '-',
            created_at: link.created_at,
          } as InvoiceRow;
        })
        .filter(Boolean) as InvoiceRow[];
    },
    enabled: Boolean(eventId),
  });
  const invoiceSummary = useMemo(() => {
    const invoices = invoicesQuery.data ?? [];
    return {
      generated: invoices.length,
      paid: invoices.filter((row) => row.status === 'paid').length,
      pending: invoices.filter((row) => row.status === 'pending').length,
    };
  }, [invoicesQuery.data]);

  return (
    <div className="space-y-2 rounded-xl border border-outline-variant bg-surface-container-lowest p-4">
      <h2 className="text-sm font-semibold text-on-surface">{t('admin.events.invoices.title')}</h2>
      <p className="text-xs text-on-surface-variant">
        {t('admin.events.invoices.summary', {
          generated: invoiceSummary.generated,
          paid: invoiceSummary.paid,
          pending: invoiceSummary.pending,
        })}
      </p>
      {!invoicesQuery.data?.length ? (
        <p className="text-xs text-on-surface-variant">{t('admin.events.invoices.empty')}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full text-xs">
            <thead>
              <tr className="text-on-surface-variant">
                <th className="px-2 py-2 text-start">{t('admin.events.invoices.child')}</th>
                <th className="px-2 py-2 text-start">{t('admin.events.invoices.parent')}</th>
                <th className="px-2 py-2 text-start">{t('admin.events.invoices.amount')}</th>
                <th className="px-2 py-2 text-start">{t('admin.events.invoices.status')}</th>
                <th className="px-2 py-2 text-start">{t('admin.events.invoices.createdAt')}</th>
                <th className="px-2 py-2 text-start">{t('admin.events.invoices.view')}</th>
              </tr>
            </thead>
            <tbody>
              {invoicesQuery.data.map((invoice) => {
                const parentName = i18n.language === 'ar' ? invoice.parent_name_ar : invoice.parent_name_en;
                const childName = i18n.language === 'ar' ? invoice.child_name_ar : invoice.child_name_en;
                return (
                  <tr key={invoice.id} className="border-t border-outline-variant">
                    <td className="px-2 py-2">{childName}</td>
                    <td className="px-2 py-2">{parentName}</td>
                    <td className="px-2 py-2">EGP {invoice.amount}</td>
                    <td className="px-2 py-2">{invoice.status}</td>
                    <td className="px-2 py-2">{new Date(invoice.created_at).toLocaleString()}</td>
                    <td className="px-2 py-2">
                      <a className="text-secondary underline" href={`/admin/invoices/${invoice.id}`}>
                        {t('admin.events.invoices.view')}
                      </a>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
