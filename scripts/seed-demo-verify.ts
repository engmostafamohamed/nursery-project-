import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, '../.env') });
const URL = process.env.VITE_SUPABASE_URL!;
const KEY = process.env.VITE_SUPABASE_ANON_KEY!;
const PW = 'Demo2026!';
const client = () => createClient(URL, KEY, { auth: { autoRefreshToken: false, persistSession: false } });

async function main() {
  // Admin: ensure demo-parent is linked to 2 children that have reports, + give an invoice
  const admin = client();
  await admin.auth.signInWithPassword({ email: 'demo-branch-admin@xonursery.com', password: PW });
  const { data: ap } = await admin.auth.getUser();
  const adminId = ap.user!.id;
  const { data: prof } = await admin.from('users').select('nursery_id').eq('id', adminId).single();
  const nurseryId = (prof as { nursery_id: string }).nursery_id;

  const { data: dpRow } = await admin.from('users').select('id').eq('email', 'demo-parent@xonursery.com').maybeSingle();
  const demoParentId = (dpRow as { id: string } | null)?.id;
  console.log('demo-parent id', demoParentId);

  if (demoParentId) {
    const { data: existing } = await admin.from('parent_children').select('child_id').eq('parent_id', demoParentId);
    console.log('demo-parent existing children', JSON.stringify(existing));
    if (!existing || existing.length === 0) {
      // pick 2 children assigned to demo-teacher's classes (they have reports)
      const { data: kids } = await admin.from('children').select('id, full_name_en, class_id').eq('nursery_id', nurseryId).not('class_id', 'is', null).limit(2);
      for (const k of (kids ?? []) as { id: string; full_name_en: string }[]) {
        const { error } = await admin.from('parent_children').insert({ parent_id: demoParentId, child_id: k.id } as never);
        console.log('  link', k.full_name_en, error ? `ERR ${error.message}` : 'OK');
      }
    }
    // ensure demo-parent has at least one invoice
    const { count: dpInv } = await admin.from('invoices').select('*', { count: 'exact', head: true }).eq('parent_id', demoParentId);
    if ((dpInv ?? 0) === 0) {
      const { error } = await admin.from('invoices').insert({
        nursery_id: nurseryId, parent_id: demoParentId, amount: '3750.00', due_date: '2026-06-05',
        status: 'pending', invoice_type: 'monthly',
        line_items_json: { items: [{ label: 'Monthly tuition', amount: 3500 }, { label: 'Art & Craft course', amount: 250 }], notes: 'June 2026' },
      } as never);
      console.log('  demo-parent invoice', error ? `ERR ${error.message}` : 'OK');
    }
  }

  // Teacher view
  const teacher = client();
  await teacher.auth.signInWithPassword({ email: 'demo-teacher@xonursery.com', password: PW });
  const { data: tu } = await teacher.auth.getUser();
  const tId = tu.user!.id;
  const { data: cs } = await teacher.from('class_staff').select('class_id').eq('user_id', tId);
  const classIds = ((cs ?? []) as { class_id: string }[]).map((r) => r.class_id);
  const { count: tKids } = await teacher.from('children').select('*', { count: 'exact', head: true }).in('class_id', classIds.length ? classIds : ['none']);
  const { count: tReports } = await teacher.from('daily_reports').select('*', { count: 'exact', head: true }).eq('teacher_id', tId);
  console.log('TEACHER classes', classIds.length, 'children', tKids, 'own reports', tReports);

  // Parent view
  const parent = client();
  await parent.auth.signInWithPassword({ email: 'demo-parent@xonursery.com', password: PW });
  const { data: pu } = await parent.auth.getUser();
  const pId = pu.user!.id;
  const { data: pc } = await parent.from('parent_children').select('child_id').eq('parent_id', pId);
  const childIds = ((pc ?? []) as { child_id: string }[]).map((r) => r.child_id);
  const { count: pReports } = childIds.length
    ? await parent.from('daily_reports').select('*', { count: 'exact', head: true }).in('child_id', childIds)
    : { count: 0 };
  const { count: pMs } = await parent.from('milestones').select('*', { count: 'exact', head: true });
  const { count: pInv } = await parent.from('invoices').select('*', { count: 'exact', head: true });
  console.log('PARENT children', childIds.length, 'reports', pReports, 'milestones(shared)', pMs, 'invoices', pInv);

  // enrollment dedup check
  const { data: enr } = await admin.from('course_enrollments').select('course_id, child_id');
  const seen = new Set<string>(); let dupes = 0;
  for (const e of (enr ?? []) as { course_id: string; child_id: string }[]) {
    const k = e.course_id + '|' + e.child_id;
    if (seen.has(k)) dupes++; else seen.add(k);
  }
  console.log('course_enrollments total', (enr ?? []).length, 'duplicate(course,child) pairs', dupes);
}
main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
