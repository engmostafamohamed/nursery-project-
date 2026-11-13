import { errorTextKey } from '@/lib/errorCode';
import { count, obj, text, textOrNull } from '@/lib/jsonRead';
import { supabase } from '@/lib/supabase';

/*
 * An event's steps through the server (event_publish, event_sync_children, event_respond,
 * event_bill_approved, event_cancel, event_delete, and a family's create_parent_urgent_event): the
 * database asks the children, keeps the deadline, bills a paid event once per child, cancels the
 * unpaid invoices of a cancelled event, tells the families and the staff, and deletes by marking
 * rows (nothing is removed). The screens only call these.
 */

export type PublishResult = { children: number; notified: number };
export type RespondResult = { status: 'granted' | 'denied'; invoice: { id: string; amount: string; status: string } | null };
export type CancelResult = { notified: number; invoicesCancelled: number; paidInvoices: number; refundPolicy: 'full' | 'partial' | 'none' };
export type SyncResult = { asked: number; withdrawn: number; notified: number };

async function call(name: string, args: Record<string, unknown>) {
  const { data, error } = await supabase.rpc(name as never, args as never);
  if (error) throw error;
  return obj(data);
}

/**
 * A family tells the nursery about something for its children (create_parent_urgent_event): the
 * children's requests are given at once, and the admins and the teachers are told. Returns its id.
 */
export async function createFamilyEvent(args: Record<string, unknown>): Promise<string> {
  const { data, error } = await supabase.rpc('create_parent_urgent_event' as never, args as never);
  if (error) throw error;
  return text(data);
}

/** Opens a draft: the children are asked and each family is told once. */
export async function publishEvent(eventId: string): Promise<PublishResult> {
  const r = await call('event_publish', { p_event_id: eventId });
  return { children: count(r.children), notified: count(r.notified) };
}

/** A parent's yes or no for one child; a yes to a paid event comes back with its invoice. */
export async function respondToEvent(input: { permissionId: string; granted: boolean; note?: string }): Promise<RespondResult> {
  const r = await call('event_respond', { p_permission_id: input.permissionId, p_granted: input.granted, p_note: input.note?.trim() || null });
  const invoice = r.invoice && typeof r.invoice === 'object' ? obj(r.invoice) : null;
  return {
    status: r.status === 'granted' ? 'granted' : 'denied',
    invoice: invoice ? { id: text(invoice.id), amount: String(invoice.amount ?? ''), status: text(invoice.status) } : null,
  };
}

/** Cancels an event with the reason the families read. */
export async function cancelEvent(eventId: string, reason: string): Promise<CancelResult> {
  const r = await call('event_cancel', { p_event_id: eventId, p_reason: reason.trim() });
  const policy = textOrNull(r.refund_policy);
  return {
    notified: count(r.notified),
    invoicesCancelled: count(r.invoices_cancelled),
    paidInvoices: count(r.paid_invoices),
    refundPolicy: policy === 'full' || policy === 'partial' ? policy : 'none',
  };
}

/**
 * Sets who is asked: the event's scope (the whole nursery or a class), or the children picked when
 * it is for chosen children (null keeps them). A request no longer needed is withdrawn (marked, not
 * removed); on an open event the families are told.
 */
export async function syncEventChildren(eventId: string, childIds: string[] | null): Promise<SyncResult> {
  const r = await call('event_sync_children', { p_event_id: eventId, p_child_ids: childIds });
  return { asked: count(r.asked), withdrawn: count(r.withdrawn), notified: count(r.notified) };
}

/** Bills each approved child of a paid event who has no invoice yet; returns how many. */
export async function billApprovedChildren(eventId: string): Promise<number> {
  return count((await call('event_bill_approved', { p_event_id: eventId })).billed);
}

/** Deletes a draft or a cancelled event: a soft delete (the row and its records stay; no screen shows it). */
export async function deleteEvent(eventId: string): Promise<void> {
  await call('event_delete', { p_event_id: eventId });
}

export const EVENT_FLOW_ERROR_CODES = [
  'event_forbidden',
  'event_closed',
  'event_started',
  'event_deadline_passed',
  'event_withdraw_closed',
  'event_answer_required',
  'event_cancel_reason_required',
  'event_cancel_reason_too_long',
  'event_delete_not_allowed',
  'event_not_paid',
  // A family's urgent event (create_parent_urgent_event)
  'event_title_required',
  'event_title_too_long',
  'event_start_in_past',
  'event_category_invalid',
  'event_schedule_invalid',
  'event_schedule_days_required',
  'event_child_required',
  'event_children_invalid',
] as const;

/** The text key for a refused step (eventFlow.errors.<code>, network, failed). */
export const eventFlowErrorKey = (error: unknown): string => errorTextKey(error, EVENT_FLOW_ERROR_CODES, 'eventFlow.errors');

/** The longest cancellation reason (event_cancel's limit). */
export const CANCEL_REASON_MAX = 300;
