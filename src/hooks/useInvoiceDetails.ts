import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';

import { invoiceItemDescription, invoiceNotes, invoiceRawItems } from '@/lib/invoiceItems';
import { supabase } from '@/lib/supabase';

export type InvoiceLineItem = {
  description: string;
  quantity: number;
  unitPrice: number;
  total: number;
};

export type InvoiceActivityItem = {
  key: string;
  type: 'created' | 'reminder' | 'paid' | 'cancelled';
  at: string;
  actor: string;
};

export type InvoiceDetailsData = {
  id: string;
  invoiceNumber: string;
  nurseryId: string;
  parentId: string;
  parentName: string;
  parentEmail: string | null;
  parentPhone: string | null;
  parentLanguage: 'ar' | 'en';
  childNames: string[];
  amount: number;
  paidAmount: number;
  pendingAmount: number;
  balanceDue: number;
  type: 'monthly' | 'event' | 'extra_hours' | 'other';
  status: 'pending' | 'paid' | 'overdue' | 'cancelled';
  /** True when a parent-submitted payment is awaiting finance confirmation. */
  inReview: boolean;
  dueDate: string;
  createdAt: string;
  updatedAt: string;
  paidAt: string | null;
  paymentMethod: string | null;
  notes: string;
  lineItems: InvoiceLineItem[];
  /** Stored line items (same order as lineItems) and the stored line_items_json, for editing. */
  rawLineItems: Record<string, unknown>[];
  rawLineItemsJson: unknown;
  /** The note as stored (lineItems/notes above are resolved for display). */
  rawNotes: string;
  subtotal: number;
  tax: number;
  total: number;
  overdueDays: number;
  eventLink: { id: string; title: string } | null;
  activity: InvoiceActivityItem[];
};

function parseLineItems(raw: unknown, language: string): { items: InvoiceLineItem[]; notes: string; tax: number } {
  if (Array.isArray(raw)) {
    const items = invoiceRawItems(raw)
      .map((row) => {
        const quantity = Number(row.quantity ?? 1);
        const unitPrice = Number(row.unit_price ?? row.amount ?? 0);
        return {
          description: invoiceItemDescription(row, language),
          quantity: Number.isFinite(quantity) && quantity > 0 ? quantity : 1,
          unitPrice: Number.isFinite(unitPrice) ? unitPrice : 0,
          total: (Number.isFinite(quantity) && quantity > 0 ? quantity : 1) * (Number.isFinite(unitPrice) ? unitPrice : 0),
        };
      });
    return { items, notes: '', tax: 0 };
  }

  const obj = (raw ?? {}) as { tax?: number | string };
  const items = invoiceRawItems(raw)
    .map((row) => {
      const quantity = Number(row.quantity ?? 1);
      const unitPrice = Number(row.unitPrice ?? row.unit_price ?? 0);
      const total = Number(row.total ?? quantity * unitPrice);
      return {
        description: invoiceItemDescription(row, language),
        quantity: Number.isFinite(quantity) && quantity > 0 ? quantity : 1,
        unitPrice: Number.isFinite(unitPrice) ? unitPrice : 0,
        total: Number.isFinite(total) ? total : 0,
      };
    });
  return {
    items,
    notes: invoiceNotes(raw, language),
    tax: Number(obj.tax ?? 0) || 0,
  };
}

export function useInvoiceDetails(invoiceId: string | undefined) {
  const { i18n } = useTranslation();
  const language = i18n.language;
  return useQuery({
    // Line descriptions are resolved in the reader's language.
    queryKey: ['invoice-details', invoiceId, language],
    queryFn: async (): Promise<InvoiceDetailsData | null> => {
      if (!invoiceId) return null;
      const invoiceRes = await supabase
        .from('invoices')
        .select(
          'id, generated_invoice_number, nursery_id, parent_id, amount, invoice_type, status, due_date, created_at, updated_at, paid_at, payment_method, line_items_json',
        )
        .eq('id', invoiceId)
        .maybeSingle();
      if (invoiceRes.error) throw invoiceRes.error;
      const invoice = invoiceRes.data as {
        id: string;
        generated_invoice_number: string | null;
        nursery_id: string;
        parent_id: string;
        amount: string;
        invoice_type: 'monthly' | 'event' | 'extra_hours' | 'other';
        status: 'pending' | 'paid' | 'cancelled';
        due_date: string;
        created_at: string;
        updated_at: string;
        paid_at: string | null;
        payment_method: string | null;
        line_items_json: unknown;
      } | null;
      if (!invoice) return null;

      const parentRes = await supabase
        .from('users')
        .select('id, name_ar, name_en, email, phone, language_pref')
        .eq('id', invoice.parent_id)
        .maybeSingle();
      if (parentRes.error) throw parentRes.error;
      const parent = parentRes.data as {
        id: string;
        name_ar: string | null;
        name_en: string | null;
        email: string | null;
        phone: string | null;
        language_pref: string | null;
      } | null;

      const eventInvRes = await supabase
        .from('event_invoices')
        .select('event_id, child_id')
        .eq('invoice_id', invoice.id);
      if (eventInvRes.error) throw eventInvRes.error;
      const eventInvRows = (eventInvRes.data ?? []) as { event_id: string; child_id: string }[];

      const childIds = eventInvRows.length
        ? [...new Set(eventInvRows.map((row) => row.child_id))]
        : (
            (await supabase
              .from('parent_children')
              .select('child_id')
              .eq('parent_id', invoice.parent_id)).data ?? []
          ).map((row) => (row as { child_id: string }).child_id);
      const childrenRes = childIds.length
        ? await supabase.from('children').select('id, full_name_ar, full_name_en').in('id', childIds)
        : { data: [], error: null };
      if (childrenRes.error) throw childrenRes.error;
      const childNames = ((childrenRes.data ?? []) as { full_name_ar: string; full_name_en: string }[]).map(
        (c) => c.full_name_ar || c.full_name_en,
      );

      let eventLink: { id: string; title: string } | null = null;
      if (eventInvRows.length) {
        const eventId = eventInvRows[0].event_id;
        const eventRes = await supabase.from('events').select('id, title_ar, title_en').eq('id', eventId).maybeSingle();
        if (eventRes.error) throw eventRes.error;
        const event = eventRes.data as { id: string; title_ar: string; title_en: string } | null;
        if (event) eventLink = { id: event.id, title: event.title_ar || event.title_en };
      }

      const notificationRes = await supabase
        .from('notifications')
        .select('id, type, sent_at')
        .eq('user_id', invoice.parent_id)
        .in('type', ['invoice_paid', 'invoice_reminder'])
        .eq('action_link', `/parent/invoices/${invoice.id}`)
        .order('sent_at', { ascending: true });
      if (notificationRes.error) throw notificationRes.error;
      const notificationRows = (notificationRes.data ?? []) as { id: string; type: string; sent_at: string }[];

      const [paymentRes, attemptRes] = await Promise.all([
        supabase
          .from('payments')
          .select('amount, status')
          .eq('invoice_id', invoice.id),
        supabase
          .from('payment_attempts')
          .select('id, status, amount')
          .eq('invoice_id', invoice.id)
          .eq('status', 'pending_confirmation'),
      ]);
      if (paymentRes.error) throw paymentRes.error;
      if (attemptRes.error) throw attemptRes.error;
      const paidAmount = ((paymentRes.data ?? []) as Array<{ amount: string | number; status: string }>)
        .filter((row) => row.status === 'completed')
        .reduce((sum, row) => sum + Number(row.amount ?? 0), 0);
      const pendingAmount = ((attemptRes.data ?? []) as Array<{ amount: string | number; status: string }>)
        .filter((row) => row.status === 'pending_confirmation')
        .reduce((sum, row) => sum + Number(row.amount ?? 0), 0);
      const inReview =
        (attemptRes.data ?? []).length > 0 && invoice.status !== 'paid' && invoice.status !== 'cancelled';

      const { items, notes, tax } = parseLineItems(invoice.line_items_json, language);
      const subtotal = items.reduce((sum, row) => sum + row.total, 0);
      const total = Number(invoice.amount || 0);
      const balanceDue = Math.max(0, total - paidAmount);
      const dueDate = new Date(invoice.due_date);
      const overdue = invoice.status === 'pending' && dueDate.getTime() < Date.now();
      const status = overdue ? 'overdue' : invoice.status;

      const activity: InvoiceActivityItem[] = [
        { key: `created-${invoice.id}`, type: 'created', at: invoice.created_at, actor: 'System' },
        ...notificationRows.map((row) => ({
          key: row.id,
          type: (row.type === 'invoice_paid' ? 'paid' : 'reminder') as InvoiceActivityItem['type'],
          at: row.sent_at,
          actor: 'Admin',
        })),
      ];
      if (invoice.status === 'cancelled') {
        activity.push({ key: `cancelled-${invoice.id}`, type: 'cancelled', at: invoice.updated_at, actor: 'Admin' });
      }
      if (invoice.paid_at) {
        activity.push({ key: `paid-${invoice.id}`, type: 'paid', at: invoice.paid_at, actor: 'Admin' });
      }
      activity.sort((a, b) => +new Date(a.at) - +new Date(b.at));

      return {
        id: invoice.id,
        invoiceNumber: invoice.generated_invoice_number ?? invoice.id.slice(0, 8),
        nurseryId: invoice.nursery_id,
        parentId: invoice.parent_id,
        parentName: parent?.name_ar || parent?.name_en || 'Parent',
        parentEmail: parent?.email ?? null,
        parentPhone: parent?.phone ?? null,
        parentLanguage: parent?.language_pref === 'en' ? 'en' : 'ar',
        childNames,
        amount: total,
        paidAmount,
        pendingAmount,
        balanceDue,
        type: invoice.invoice_type,
        status,
        inReview,
        dueDate: invoice.due_date,
        createdAt: invoice.created_at,
        updatedAt: invoice.updated_at,
        paidAt: invoice.paid_at,
        paymentMethod: invoice.payment_method,
        notes,
        lineItems: items,
        rawLineItems: invoiceRawItems(invoice.line_items_json),
        rawLineItemsJson: invoice.line_items_json,
        rawNotes:
          invoice.line_items_json && typeof invoice.line_items_json === 'object' && !Array.isArray(invoice.line_items_json)
            ? String((invoice.line_items_json as { notes?: unknown }).notes ?? '')
            : '',
        subtotal,
        tax,
        total,
        overdueDays: overdue ? Math.ceil((Date.now() - dueDate.getTime()) / 86400000) : 0,
        eventLink,
        activity,
      };
    },
    enabled: Boolean(invoiceId),
  });
}
