import { teacherAttendanceToggle } from '@/lib/teacherAttendanceToggle';
import { generateEventInvoice, getInvoiceForPermission } from '@/lib/eventInvoices';
import { supabase } from '@/lib/supabase';
import type { AiSurfaceRole } from '@/lib/aiContext';

const PREFILL_KEY = 'xo_ai_prefill';

export interface AiActionNavigate {
  (path: string): void;
}

export interface AiExecutionContext {
  navigate: AiActionNavigate;
  userId: string;
  surfaceRole: AiSurfaceRole;
  nurseryId: string | null;
}

function setPrefill(payload: Record<string, unknown>): void {
  if (typeof sessionStorage === 'undefined') return;
  try {
    sessionStorage.setItem(PREFILL_KEY, JSON.stringify(payload));
  } catch {
    /* ignore */
  }
}

async function fetchParentChildIds(parentId: string): Promise<string[]> {
  const res = await supabase.from('parent_children').select('child_id').eq('parent_id', parentId);
  if (res.error) throw res.error;
  return ((res.data ?? []) as { child_id: string }[]).map((r) => r.child_id);
}

export async function executeAiTool(
  name: string,
  input: Record<string, unknown>,
  ctx: AiExecutionContext,
): Promise<string> {
  const n = name.trim();

  if (n === 'navigate_to_page') {
    const path = String(input.path ?? '');
    if (!path.startsWith('/')) return 'error:invalid_path';
    ctx.navigate(path);
    return `navigated:${path}`;
  }

  if (n === 'view_upcoming_events') {
    if (ctx.surfaceRole === 'parent') {
      ctx.navigate('/parent/events');
      return 'opened_parent_events';
    }
    if (ctx.surfaceRole === 'admin') {
      ctx.navigate('/admin/events');
      return 'opened_admin_events';
    }
    return 'error:role_not_supported';
  }

  if (ctx.surfaceRole === 'admin') {
    if (n === 'create_child_draft') {
      setPrefill({ type: 'enrollment', ...input });
      ctx.navigate('/admin/children/enroll');
      return 'opened_child_enrollment';
    }
    if (n === 'create_event_draft') {
      setPrefill({ type: 'event', ...input });
      ctx.navigate('/admin/events/create');
      return 'opened_event_create';
    }
    if (n === 'send_broadcast_draft') {
      setPrefill({ type: 'broadcast', message: input.message, audience: input.audience });
      ctx.navigate('/admin/messages/broadcast');
      return 'opened_broadcast';
    }
    if (n === 'approve_media') {
      const ids = (input.media_ids as string[]) ?? (input.mediaIds as string[]) ?? [];
      if (!ids.length) return 'error:no_media_ids';
      const now = new Date().toISOString();
      let mediaQuery = supabase
        .from('media')
        .update({
          status: 'approved',
          approved_at: now,
          approved_by: ctx.userId,
        } as never)
        .in('id', ids);
      if (ctx.nurseryId) {
        mediaQuery = mediaQuery.eq('nursery_id', ctx.nurseryId);
      }
      const { error, data } = await mediaQuery.select('id');
      if (error) throw error;
      const count = (data as { id: string }[] | null)?.length ?? 0;
      return `approved_media_count:${count}`;
    }
  }

  if (ctx.surfaceRole === 'teacher') {
    const today = new Date().toISOString().slice(0, 10);
    if (n === 'mark_present') {
      const childIds = (input.child_ids as string[]) ?? (input.childIds as string[]) ?? [];
      if (!childIds.length) return 'error:no_child_ids';
      const { data: children, error: cErr } = await supabase
        .from('children')
        .select('id, nursery_id, full_name_ar, full_name_en')
        .in('id', childIds)
        .eq('nursery_id', ctx.nurseryId ?? '');
      if (cErr) throw cErr;
      const list = (children ?? []) as {
        id: string;
        nursery_id: string;
        full_name_ar: string;
        full_name_en: string;
      }[];
      const { data: attRows, error: aErr } = await supabase
        .from('attendance_records')
        .select('id, child_id, attendance_date, check_in, check_out')
        .eq('attendance_date', today)
        .in('child_id', childIds);
      if (aErr) throw aErr;
      type AttRow = {
        id: string;
        child_id: string;
        attendance_date: string;
        check_in: string | null;
        check_out: string | null;
      };
      const byChild: Record<string, AttRow> = {};
      for (const r of (attRows ?? []) as AttRow[]) {
        byChild[r.child_id] = r;
      }
      let nDone = 0;
      for (const ch of list) {
        const existing = byChild[ch.id] ?? null;
        if (existing?.check_in && !existing.check_out) continue;
        if (existing?.check_out) continue;
        await teacherAttendanceToggle(ch, existing, today);
        nDone += 1;
      }
      return `marked_present:${nDone}`;
    }
    if (n === 'open_daily_report') {
      const childId = String(input.child_id ?? input.childId ?? '');
      if (!childId) return 'error:no_child';
      const date = String(input.report_date ?? today);
      ctx.navigate(`/teacher/daily-reports/${childId}/${date}`);
      return 'opened_report_editor';
    }
    if (n === 'open_media_upload') {
      ctx.navigate('/teacher/media/upload');
      return 'opened_media_upload';
    }
  }

  if (ctx.surfaceRole === 'parent') {
    if (n === 'view_reports') {
      const childId = input.child_id ? String(input.child_id) : '';
      ctx.navigate(childId ? `/parent/daily-reports?child=${encodeURIComponent(childId)}` : '/parent/daily-reports');
      return 'opened_reports';
    }
    if (n === 'view_qr_code') {
      const childId = input.child_id ? String(input.child_id) : '';
      ctx.navigate(childId ? `/parent/child/${encodeURIComponent(childId)}/qr` : '/parent/qr-code');
      return 'opened_qr';
    }
    if (n === 'approve_event_permission') {
      const eventId = String(input.event_id ?? input.eventId ?? '');
      if (!eventId) return 'error:no_event';
      const childIds = await fetchParentChildIds(ctx.userId);
      if (!childIds.length) return 'error:no_children';
      const { data: pending, error } = await supabase
        .from('permissions')
        .select('id, child_id')
        .eq('event_id', eventId)
        .in('child_id', childIds)
        .eq('status', 'pending');
      if (error) throw error;
      const rows = (pending ?? []) as { id: string; child_id: string }[];
      if (!rows.length) return 'no_pending_permissions';
      const now = new Date().toISOString();
      let approved = 0;
      for (const row of rows) {
        const { error: uErr } = await supabase
          .from('permissions')
          .update({ status: 'granted', responded_at: now } as never)
          .eq('id', row.id);
        if (uErr) throw uErr;
        approved += 1;
        const invoice = await getInvoiceForPermission(row.id);
        if (!invoice) {
          await generateEventInvoice({
            permissionId: row.id,
            eventId,
            childId: row.child_id,
            invoiceDueDays: 7,
          });
        }
      }
      return `approved_permissions:${approved}`;
    }
  }

  return `error:unsupported_tool:${n}`;
}

export function toolAllowedForRole(name: string, role: AiSurfaceRole): boolean {
  const n = name.trim();
  if (n === 'navigate_to_page') return true;
  if (n === 'view_upcoming_events') return role === 'parent' || role === 'admin';
  if (role === 'admin') {
    return ['create_child_draft', 'create_event_draft', 'send_broadcast_draft', 'approve_media'].includes(n);
  }
  if (role === 'teacher') {
    return ['mark_present', 'open_daily_report', 'open_media_upload'].includes(n);
  }
  if (role === 'parent') {
    return ['view_reports', 'view_qr_code', 'approve_event_permission'].includes(n);
  }
  return false;
}
