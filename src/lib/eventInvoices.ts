import { supabase } from '@/lib/supabase';

export type PermissionInvoiceInfo = {
  id: string;
  amount: string;
  status: string;
  parent_id: string;
};

interface GenerateEventInvoiceInput {
  permissionId: string;
  eventId: string;
  childId: string;
  invoiceDueDays?: number | null;
}

export async function getInvoiceForPermission(permissionId: string) {
  const eventInvRes = await supabase
    .from('event_invoices')
    .select('invoice_id, parent_id')
    .eq('permission_id', permissionId)
    .maybeSingle();
  if (eventInvRes.error) throw eventInvRes.error;
  const eventInv = eventInvRes.data as { invoice_id?: string; parent_id?: string } | null;
  if (!eventInv?.invoice_id || !eventInv?.parent_id) return null;

  const invoiceRes = await supabase
    .from('invoices')
    .select('id, amount, status')
    .eq('id', eventInv.invoice_id)
    .maybeSingle();
  if (invoiceRes.error) throw invoiceRes.error;
  const invoice = invoiceRes.data as { id: string; amount: string; status: string } | null;
  if (!invoice) return null;

  return {
    id: invoice.id,
    amount: invoice.amount,
    status: invoice.status,
    parent_id: eventInv.parent_id,
  } as PermissionInvoiceInfo;
}

export async function generateEventInvoice({
  permissionId,
  eventId,
  childId,
  invoiceDueDays,
}: GenerateEventInvoiceInput): Promise<PermissionInvoiceInfo | null> {
  const eventRes = await supabase
    .from('events')
    .select('id, nursery_id, starts_at, is_paid, price, title_ar, title_en')
    .eq('id', eventId)
    .maybeSingle();
  if (eventRes.error) throw eventRes.error;
  const event = eventRes.data as {
    id: string;
    nursery_id: string;
    starts_at: string;
    is_paid: boolean;
    price: string | null;
    title_ar: string;
    title_en: string;
  } | null;
  if (!event || !event.is_paid || !event.price) return null;

  const parentLinkRes = await supabase
    .from('parent_children')
    .select('parent_id')
    .eq('child_id', childId)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();
  if (parentLinkRes.error) throw parentLinkRes.error;
  const parentLink = parentLinkRes.data as { parent_id?: string } | null;
  if (!parentLink?.parent_id) return null;

  const existingRes = await supabase
    .from('event_invoices')
    .select('invoice_id, parent_id')
    .eq('event_id', eventId)
    .eq('child_id', childId)
    .maybeSingle();
  if (existingRes.error) throw existingRes.error;
  const existing = existingRes.data as { invoice_id?: string; parent_id?: string } | null;
  if (existing?.invoice_id && existing?.parent_id) {
    const existingInvoiceRes = await supabase
      .from('invoices')
      .select('id, amount, status')
      .eq('id', existing.invoice_id)
      .maybeSingle();
    if (existingInvoiceRes.error) throw existingInvoiceRes.error;
    const invoice = existingInvoiceRes.data as { id: string; amount: string; status: string } | null;
    if (!invoice) return null;
    return { id: invoice.id, amount: invoice.amount, status: invoice.status, parent_id: existing.parent_id };
  }

  const eventDueDate = new Date(event.starts_at);
  const configuredDueDate = typeof invoiceDueDays === 'number'
    ? new Date(Date.now() + invoiceDueDays * 24 * 60 * 60 * 1000)
    : eventDueDate;
  const dueDate = (configuredDueDate.getTime() < eventDueDate.getTime() ? configuredDueDate : eventDueDate)
    .toISOString()
    .slice(0, 10);
  // The app labels the line in the reader's language from the event names.
  const lineItems = [
    {
      kind: 'event',
      name_ar: event.title_ar?.trim() || null,
      name_en: event.title_en?.trim() || null,
      description: event.title_en?.trim() || event.title_ar?.trim() || '',
      amount: event.price,
    },
  ];
  const invoiceInsertRes = await supabase
    .from('invoices')
    .insert({
      parent_id: parentLink.parent_id,
      nursery_id: event.nursery_id,
      amount: event.price,
      due_date: dueDate,
      status: 'pending',
      invoice_type: 'event',
      line_items_json: lineItems,
    } as never)
    .select('id, amount, status')
    .single();
  if (invoiceInsertRes.error) throw invoiceInsertRes.error;
  const invoice = invoiceInsertRes.data as { id: string; amount: string; status: string };

  const eventInvoiceInsertRes = await supabase.from('event_invoices').insert({
    event_id: eventId,
    permission_id: permissionId,
    invoice_id: invoice.id,
    parent_id: parentLink.parent_id,
    child_id: childId,
    nursery_id: event.nursery_id,
  } as never);
  if (eventInvoiceInsertRes.error) throw eventInvoiceInsertRes.error;

  return {
    id: invoice.id,
    amount: invoice.amount,
    status: invoice.status,
    parent_id: parentLink.parent_id,
  };
}
