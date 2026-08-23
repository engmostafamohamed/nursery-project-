import { createClient } from '@supabase/supabase-js';
import { randomUUID } from 'node:crypto';
import { readFileSync, existsSync } from 'node:fs';
import * as path from 'node:path';

import { buildAuthEmailToIdMap } from './seed-demo-auth';

type Json = Record<string, unknown>;

const NURSERY_AR = 'حضانة النجوم الصغيرة';
const NURSERY_EN = 'Little Stars Nursery';
const now = new Date();

const loadEnvFromDotEnv = (): void => {
  const envPath = path.resolve(process.cwd(), '.env');
  if (!existsSync(envPath)) return;
  const lines = readFileSync(envPath, 'utf8').split('\n');
  for (const raw of lines) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const idx = line.indexOf('=');
    if (idx < 1) continue;
    const key = line.slice(0, idx).trim();
    const val = line.slice(idx + 1).trim().replace(/^['"]|['"]$/g, '');
    if (!process.env[key]) process.env[key] = val;
  }
};

const isoDaysAgo = (days: number, hour = 9): string => {
  const d = new Date(now);
  d.setDate(d.getDate() - days);
  d.setHours(hour, 0, 0, 0);
  return d.toISOString();
};
const dateDaysAgo = (days: number): string => isoDaysAgo(days).slice(0, 10);
const assertNoError = (err: { message: string } | null, label: string): void => {
  if (err) throw new Error(`${label}: ${err.message}`);
};

const main = async (): Promise<void> => {
  loadEnvFromDotEnv();
  const url = process.env.VITE_SUPABASE_URL;
  const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRole) throw new Error('Missing VITE_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  const supabase = createClient(url, serviceRole, { auth: { persistSession: false } });

  console.log('🧹 Checking existing demo nursery...');
  const { data: existing } = await supabase.from('nurseries').select('id').eq('name_en', NURSERY_EN).maybeSingle();
  if (existing?.id) {
    const nurseryId = existing.id as string;
    const { error: delSettingsErr } = await supabase.from('nursery_settings').delete().eq('nursery_id', nurseryId);
    assertNoError(delSettingsErr, 'Delete existing nursery settings');
    const { error: delNurseryErr } = await supabase.from('nurseries').delete().eq('id', nurseryId);
    assertNoError(delNurseryErr, 'Delete existing nursery');
    assertNoError((await supabase.from('users').delete().ilike('email', '%@littlestars.eg')).error, 'Delete existing littlestars users');
    assertNoError((await supabase.from('users').delete().ilike('email', '%@demo-ls.eg')).error, 'Delete existing demo parent users');
    console.log('✅ Existing demo data removed.');
  }

  console.log('🏫 Creating nursery + settings...');
  const { data: nursery, error: nurseryErr } = await supabase
    .from('nurseries')
    .insert({
      name_ar: NURSERY_AR,
      name_en: NURSERY_EN,
      language_pref: 'both',
      city: 'Maadi, Cairo',
      phone: '+201001234567',
      opens_at: '07:30:00',
      closes_at: '17:00:00',
      working_days: ['sun', 'mon', 'tue', 'wed', 'thu'],
      subscription_plan: 'pro',
      subscription_status: 'active',
      pricing_model: 'hybrid',
      branch_count: 1,
      bank_account_details: { bank_name: 'CIB', account_name: 'Little Stars Nursery', account_number: '1020304050', iban: 'EG380001000000001020304050' },
    })
    .select('id')
    .single();
  assertNoError(nurseryErr, 'Insert nursery');
  const nurseryId = nursery.id as string;
  const settings: Json = {
    nursery_id: nurseryId, standard_start_time: '07:30:00', standard_end_time: '16:30:00', late_pickup_grace_minutes: 15,
    late_pickup_fee_per_hour: '80', absence_alert_time: '10:00:00', end_of_day_checklist_time: '16:45:00',
    permission_deadline_default_hours: 24, event_cancellation_window_hours: 48, paid_event_refund_policy: 'partial',
    quiet_hours_start: '21:00:00', quiet_hours_end: '07:00:00', max_whatsapp_per_parent_per_day: 5, allow_parent_quiet_hours_override: true,
    pricing_model: 'hybrid', monthly_rate: '3500', per_child_rate: '500', hourly_rate: '60', invoice_due_days: 7, late_payment_fee_percentage: '5',
    sibling_discount_2nd_child_percentage: '10', sibling_discount_3rd_child_percentage: '15', payment_methods_enabled: ['cash', 'bank_transfer', 'card', 'instapay', 'vodafone_cash'],
    summer_pause_enabled: true, summer_pause_min_weeks: 2, summer_pause_max_weeks: 8, summer_pause_auto_start_date: '2026-07-01', summer_pause_auto_end_date: '2026-08-31',
    summer_pause_charges_percentage: '50', photo_approval_required: true, photo_auto_approve_after_hours: 24, video_enabled: true, max_photo_per_child_per_day: 6,
    cctv_enabled: true, cctv_stream_token_duration_minutes: 30, cctv_max_concurrent_viewers_per_camera: 2, cctv_recording_retention_days: 30,
    loyalty_enabled: true, points_per_egp: '1', points_redemption_rate: '0.1', loyalty_tier_thresholds: { silver: 0, gold: 1000, platinum: 5000 },
    default_language: 'ar', timezone: 'Africa/Cairo', currency: 'EGP', date_format: 'DD/MM/YYYY', primary_color: '#2563EB', secondary_color: '#14B8A6', accent_color: '#F59E0B',
  };
  assertNoError((await supabase.from('nursery_settings').upsert(settings, { onConflict: 'nursery_id' })).error, 'Insert nursery settings');

  const admin = { role: 'branch_admin', name_ar: 'فاطمة أحمد', name_en: 'Fatma Ahmed', email: 'fatma@littlestars.eg', phone: '+201011111111' };
  const teachers = [
    { role: 'teacher', name_ar: 'نور حسن', name_en: 'Nour Hassan', email: 'nour@littlestars.eg', phone: '+201022222221' },
    { role: 'teacher', name_ar: 'منى إبراهيم', name_en: 'Mona Ibrahim', email: 'mona@littlestars.eg', phone: '+201022222222' },
    { role: 'teacher', name_ar: 'سارة محمود', name_en: 'Sara Mahmoud', email: 'sara@littlestars.eg', phone: '+201022222223' },
  ];
  const staff = [
    { role: 'teacher', name_ar: 'أحمد الشيف', name_en: 'Ahmed Chef', email: 'kitchen@littlestars.eg', phone: '+201033333331', department: 'kitchen', position: 'Kitchen Staff', salary: '5200' },
    { role: 'teacher', name_ar: 'حسن السائق', name_en: 'Hassan Driver', email: 'driver@littlestars.eg', phone: '+201033333332', department: 'driver', position: 'Bus Driver', salary: '6000' },
    { role: 'teacher', name_ar: 'محمود صيانة', name_en: 'Mahmoud Maintenance', email: 'maintenance@littlestars.eg', phone: '+201033333333', department: 'maintenance', position: 'Maintenance', salary: '4800' },
  ];
  const parentNames = ['محمد علي','أحمد عمر','خالد يوسف','مصطفى هشام','طارق نادر','رامي عادل','أمجد صلاح','حسام نبيل','يوسف فؤاد','مروان سمير','محمود جابر','شريف مدحت','سعيد عبد الله','كريم رفعت','وائل أشرف','مها سامي','سارة أيمن','هبة خالد','نجلاء سامح','دينا نادر','منة الله عادل','ريم مصطفى','ياسمين طارق','نورهان أحمد','إيمان رفعت'];
  const parents = parentNames.map((name, i) => ({ role: 'parent', name_ar: name, name_en: `Parent ${i + 1}`, email: `parent${i + 1}@demo-ls.eg`, phone: `+20105555${String(100 + i)}` }));
  const userSeeds = [admin, ...teachers, ...staff, ...parents];
  let authByEmail = await buildAuthEmailToIdMap(supabase);
  const withIds = [] as Array<{ id: string; role: string; name_ar: string; name_en: string; email: string; phone: string }>;
  for (const u of userSeeds) {
    const key = u.email.toLowerCase();
    let id = authByEmail.get(key);
    if (!id) {
      const created = await supabase.auth.admin.createUser({
        email: u.email,
        password: 'DemoPass123!',
        email_confirm: true,
        user_metadata: { name_ar: u.name_ar, name_en: u.name_en },
      });
      if (created.error) throw new Error(`Create auth user (${u.email}): ${created.error.message}`);
      id = created.data.user.id;
      authByEmail.set(key, id);
    }
    withIds.push({ ...u, id });
  }
  const users = withIds.map((u) => ({
    id: u.id,
    role: u.role,
    name_ar: u.name_ar,
    name_en: u.name_en,
    email: u.email,
    phone: u.phone,
    nursery_id: nurseryId,
    chain_id: null,
    status: 'active',
    language_pref: 'ar',
    onboarding_completed: true,
  }));
  assertNoError((await supabase.from('users').upsert(users, { onConflict: 'id' })).error, 'Insert users');
  const adminUser = withIds[0];
  const teacherUsers = withIds.slice(1, 4);
  const staffUsers = withIds.slice(4, 7);
  const parentUsers = withIds.slice(7);

  // classes.teacher_id was dropped (migration 20260418130000); the lead teacher
  // now lives in class_staff (role='lead'). classSeeds[i] is led by teacherUsers[i].
  const classSeeds = [
    { id: randomUUID(), name_ar: 'الفراشات', name_en: 'Butterflies', grade_level: '1-2y', capacity: 8, room_number: 'A1' },
    { id: randomUUID(), name_ar: 'عباد الشمس', name_en: 'Sunflowers', grade_level: '2-3y', capacity: 10, room_number: 'B1' },
    { id: randomUUID(), name_ar: 'قوس قزح', name_en: 'Rainbows', grade_level: '3-4y', capacity: 12, room_number: 'C1' },
  ];
  assertNoError((await supabase.from('classes').insert(classSeeds.map((c) => ({ ...c, nursery_id: nurseryId })))).error, 'Insert classes');
  assertNoError((await supabase.from('class_staff').insert(
    classSeeds.map((c, i) => ({ class_id: c.id, user_id: teacherUsers[i].id, role: 'lead' })),
  )).error, 'Insert class_staff leads');

  const { count: classCount, error: classCountErr } = await supabase
    .from('classes')
    .select('id', { count: 'exact', head: true })
    .eq('nursery_id', nurseryId);
  assertNoError(classCountErr, 'Count classes');
  console.log(`📋 Pre-children check: nursery_id=${nurseryId}, classes in DB=${classCount ?? '?'}`);
  if ((classCount ?? 0) < 3) throw new Error(`Expected 3 classes for demo nursery, found ${classCount ?? 0}`);

  const childNames = ['آدم','ليان','يوسف','تالا','زين','ملك','عمر','هنا','سيف','جنى','حمزة','كارما','راكان','بيان','مروان','جود','ريان','فرح','مالك','لارا','سليم','أميرة','حازم','شهد','أنس','مريم','يحيى','بسملة','رامي','رنا'];
  const siblingsGroup = randomUUID();
  const childRows = childNames.map((name, i) => {
    const classIndex = i < 8 ? 0 : i < 18 ? 1 : 2;
    const dob = new Date(now); dob.setMonth(dob.getMonth() - (classIndex === 0 ? 18 : classIndex === 1 ? 32 : 44) - (i % 4));
    return {
      id: randomUUID(), nursery_id: nurseryId, full_name_ar: `${name} ${i < 3 ? 'علي' : 'المصري'}`, full_name_en: `Child ${i + 1}`,
      dob: dob.toISOString().slice(0, 10), class_id: classSeeds[classIndex].id, enrollment_date: dateDaysAgo(120 - i), status: 'active',
      sibling_group_id: i < 3 ? siblingsGroup : null, photo_privacy_restricted: Boolean(i < 3 || i === 9),
    };
  });

  let insertedChildRows: { id: string }[] = [];
  try {
    const classIds = Array.from(new Set(childRows.map((r) => r.class_id)));
    console.log(`👶 Inserting ${childRows.length} children (class_ids: ${classIds.join(', ')})...`);
    const ins = await supabase.from('children').insert(childRows).select('id');
    if (ins.error) {
      console.error('children insert error details:', ins.error);
      throw ins.error;
    }
    insertedChildRows = ins.data ?? [];
    if (insertedChildRows.length !== childRows.length) {
      throw new Error(`children insert returned ${insertedChildRows.length} rows, expected ${childRows.length}`);
    }
    console.log(`✅ Inserted ${insertedChildRows.length} children`);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('❌ children / parent_children block failed:', msg);
    throw e;
  }

  const pcRows = childRows.map((c, i) => ({ parent_id: parentUsers[Math.floor(i / 2)].id, child_id: c.id }));
  assertNoError((await supabase.from('parent_children').insert(pcRows)).error, 'Insert parent_children');
  console.log(`✅ Inserted ${pcRows.length} parent_children links`);

  const staffProfiles = staff.map((s, i) => ({ id: randomUUID(), user_id: staffUsers[i].id, nursery_id: nurseryId, employee_id: `LS-${200 + i}`, department: s.department, position: s.position, hire_date: dateDaysAgo(300), contract_type: 'full_time', salary_amount: s.salary, emergency_contact_name: 'Family Contact', emergency_contact_phone: `+20106666${i}11`, address: 'Maadi, Cairo', national_id: `2980101${i}123456`, qualifications_json: [], documents_json: [] }));
  assertNoError((await supabase.from('staff_profiles').insert(staffProfiles)).error, 'Insert staff profiles');
  assertNoError((await supabase.from('staff_schedules').insert(staffProfiles.flatMap((sp) => Array.from({ length: 7 }, (_, d) => ({ staff_id: sp.id, nursery_id: nurseryId, day_of_week: d, start_time: d < 5 ? '08:00:00' : null, end_time: d < 5 ? '16:00:00' : null, is_working_day: d < 5 }))))).error, 'Insert staff schedules');

  const events = [
    { title_ar: 'يوم الفنون', title_en: 'Arts Day', daysAgo: 18, is_paid: false, price: null, category: 'activity' },
    { title_ar: 'قهوة أولياء الأمور', title_en: 'Parent Coffee', daysAgo: 12, is_paid: false, price: null, category: 'service' },
    { title_ar: 'رحلة حديقة الحيوان', title_en: 'Zoo Trip', daysAgo: 5, is_paid: true, price: '250', category: 'trip' },
    { title_ar: 'اليوم الرياضي', title_en: 'Sports Day', daysAgo: -7, is_paid: true, price: '200', category: 'activity' },
    { title_ar: 'حكايات قبل النوم', title_en: 'Storytelling', daysAgo: -10, is_paid: false, price: null, category: 'activity' },
  ];
  const eventRows = events.map((e, i) => ({ id: randomUUID(), nursery_id: nurseryId, title_ar: e.title_ar, title_en: e.title_en, description_ar: null, description_en: null, starts_at: isoDaysAgo(e.daysAgo, 10), location: 'Maadi Campus', category: e.category, is_paid: e.is_paid, price: e.price, target_scope: i % 2 ? 'class' : 'all', target_class_id: i % 2 ? classSeeds[i % 3].id : null, status: 'active' }));
  assertNoError((await supabase.from('events').insert(eventRows)).error, 'Insert events');

  // Event permissions are auto-created (status 'pending') by trigger_create_event_permissions
  // when events are inserted, so inserting here would violate idx_permissions_child_event_unique.
  // Instead, vary the statuses of a subset of the auto-created rows for demo realism.
  const { data: permRows, error: permSelErr } = await supabase
    .from('permissions')
    .select('id')
    .in('child_id', childRows.map((c) => c.id))
    .not('event_id', 'is', null)
    .order('id')
    .limit(25);
  assertNoError(permSelErr, 'Select event permissions');
  const permIds = (permRows ?? []).map((r) => (r as { id: string }).id);
  if (permIds.length) {
    assertNoError((await supabase.from('permissions').update({ status: 'granted', responded_at: isoDaysAgo(1) }).in('id', permIds.slice(0, 20))).error, 'Grant permissions');
    assertNoError((await supabase.from('permissions').update({ status: 'denied', responded_at: isoDaysAgo(1) }).in('id', permIds.slice(20, 22))).error, 'Deny permissions');
  }

  const invoices = Array.from({ length: 25 }, (_, i) => ({ id: randomUUID(), nursery_id: nurseryId, parent_id: parentUsers[i % parentUsers.length].id, amount: String(3200 + (i % 4) * 250), due_date: dateDaysAgo(10 - i), status: i < 15 ? 'paid' : i < 22 ? 'pending' : 'overdue', invoice_type: i % 5 === 0 ? 'event' : 'monthly', line_items_json: [{ description: 'Tuition Fee', quantity: 1, unit_price: 3200 + (i % 4) * 250 }], payment_method: i < 15 ? (i % 2 ? 'cash' : 'bank_transfer') : null, paid_at: i < 15 ? isoDaysAgo(6) : null }));
  assertNoError((await supabase.from('invoices').insert(invoices)).error, 'Insert invoices');
  assertNoError((await supabase.from('payment_attempts').insert(Array.from({ length: 5 }, (_, i) => ({ invoice_id: invoices[16 + i].id, parent_id: invoices[16 + i].parent_id, nursery_id: nurseryId, amount: invoices[16 + i].amount, payment_method: 'bank_transfer', status: 'pending_confirmation', proof_url: `demo-receipts/receipt-${i + 1}.jpg`, notes: 'Awaiting admin confirmation' })))).error, 'Insert payment attempts');

  const mediaRows = Array.from({ length: 40 }, (_, i) => ({ id: randomUUID(), nursery_id: nurseryId, teacher_id: teacherUsers[i % 3].id, type: 'photo', url: `media/${nurseryId}/demo/photo-${i + 1}.jpg`, uploaded_by: teacherUsers[i % 3].id, file_url: `media/${nurseryId}/demo/photo-${i + 1}.jpg`, file_type: 'photo', thumbnail_url: null, captured_at: dateDaysAgo(i % 30), uploaded_at: isoDaysAgo(i % 30), status: i < 30 ? 'approved' : i < 38 ? 'pending_approval' : 'rejected', approved_by: i < 30 ? adminUser.id : null, approved_at: i < 30 ? isoDaysAgo(i % 30) : null, rejected_reason: i >= 38 ? 'Blurry face visibility' : null, class_id: classSeeds[i % 3].id, activity_type: ['art', 'music', 'outdoor'][i % 3], caption: `Demo media ${i + 1}`, visibility: i % 3 === 0 ? 'all_class' : i % 3 === 1 ? 'tagged_only' : 'specific_parents', view_count: i * 2, download_count: i % 5 }));
  assertNoError((await supabase.from('media').insert(mediaRows)).error, 'Insert media');
  assertNoError((await supabase.from('media_children').insert(mediaRows.map((m, i) => ({ media_id: m.id, child_id: childRows[i % childRows.length].id })))).error, 'Insert media children');
  assertNoError((await supabase.from('media_visibility').insert(mediaRows.filter((_, i) => i % 3 === 2).map((m, i) => ({ media_id: m.id, parent_id: parentUsers[i % parentUsers.length].id })))).error, 'Insert media visibility');

  const reports = Array.from({ length: 23 }, (_, i) => ({ id: randomUUID(), nursery_id: nurseryId, child_id: childRows[i % childRows.length].id, report_date: dateDaysAgo(i % 14), teacher_id: teacherUsers[i % 3].id, status: i < 20 ? 'published' : 'draft', meals_json: { breakfast: { appetite: 'ate_all' }, lunch: { appetite: 'ate_some' }, snacks: { appetite: 'ate_all' }, water: 'good' }, nap_json: { napped: true, duration_minutes: 90, quality: 'slept_well' }, mood_json: { mood: 'happy', energy_level: 'high' }, toilet_json: { diaper_changes: 2, potty_training: false }, activities_json: { participated_in: ['art', 'outdoor'], engagement_level: 'engaged' }, feeding_json: { bottles: 0, notes: null }, special_notes: null, published_at: i < 20 ? isoDaysAgo(i % 14) : null }));
  assertNoError((await supabase.from('daily_reports').insert(reports)).error, 'Insert daily reports');
  assertNoError((await supabase.from('report_reactions').insert(Array.from({ length: 15 }, (_, i) => ({ report_id: reports[i].id, parent_id: parentUsers[i % parentUsers.length].id, reaction: null, comment: i % 3 === 0 ? 'شكراً على التقرير الرائع' : 'متابعة ممتازة اليوم' })))).error, 'Insert report reactions');

  const categories = ['motor_skills', 'cognitive', 'language', 'social', 'self_care', 'creative'];
  assertNoError((await supabase.from('milestones').insert(Array.from({ length: 40 }, (_, i) => ({ nursery_id: nurseryId, child_id: childRows[i % childRows.length].id, teacher_id: teacherUsers[i % 3].id, category: categories[i % categories.length], milestone_name_en: `Milestone ${i + 1}`, milestone_name_ar: `إنجاز ${i + 1}`, milestone_text: `Milestone ${i + 1}`, achieved_at: dateDaysAgo(i % 30), notes: i % 4 === 0 ? 'Observed in class activity' : null, photo_url: null, shared_with_parent: i % 5 !== 0 })))).error, 'Insert milestones');

  assertNoError((await supabase.from('attendance_records').insert(Array.from({ length: 25 }, (_, d) => childRows.slice(0, 6).map((c, i) => ({ child_id: c.id, attendance_date: dateDaysAgo(d), check_in: isoDaysAgo(d, 8 + (i % 2)), check_out: i < 8 && d % 3 === 0 ? isoDaysAgo(d, 17) : isoDaysAgo(d, 16), extra_hours: i < 8 && d % 3 === 0 ? '1' : '0', pickup_person_id: null, qr_scan_log: { late_pickup: i < 8 && d % 3 === 0 } }))).flat())).error, 'Insert attendance');
  assertNoError((await supabase.from('staff_attendance').insert(Array.from({ length: 20 }, (_, d) => staffProfiles.map((s) => ({ user_id: s.user_id, staff_id: s.id, nursery_id: nurseryId, work_date: dateDaysAgo(d), check_in_at: isoDaysAgo(d, 8), check_out_at: isoDaysAgo(d, 16), work_hours: '8', status: 'present' }))).flat())).error, 'Insert staff attendance');

  assertNoError((await supabase.from('messages').insert(Array.from({ length: 15 }, (_, i) => ({ conversation_id: randomUUID(), sender_id: parentUsers[i % parentUsers.length].id, receiver_id: teacherUsers[i % 3].id, content: 'مرحبا، أريد متابعة طفلي اليوم.', type: 'text' })))).error, 'Insert messages');
  assertNoError((await supabase.from('broadcast_messages').insert(Array.from({ length: 5 }, (_, i) => ({ nursery_id: nurseryId, sender_id: adminUser.id, target_role: 'parent', content_ar: `إعلان إداري رقم ${i + 1}`, content_en: `Admin broadcast ${i + 1}`, sent_at: isoDaysAgo(i + 1) })))).error, 'Insert broadcasts');

  const inquiries = Array.from({ length: 10 }, (_, i) => ({ id: randomUUID(), nursery_id: nurseryId, parent_name: `Inquiry Parent ${i + 1}`, parent_email: `inquiry${i + 1}@mail.eg`, parent_phone: `+20107777${100 + i}`, child_name: `Inquiry Child ${i + 1}`, child_dob: dateDaysAgo(700 + i * 20), preferred_class: classSeeds[i % 3].name_en, preferred_start_date: dateDaysAgo(-10), source: ['website', 'referral', 'social_media'][i % 3], message: 'Looking for enrollment details', status: i < 5 ? 'new' : i < 8 ? 'waitlisted' : 'scheduled', assigned_to: adminUser.id }));
  assertNoError((await supabase.from('inquiries').insert(inquiries)).error, 'Insert inquiries');
  assertNoError((await supabase.from('waitlist').insert(inquiries.slice(5, 8).map((inq, i) => ({ inquiry_id: inq.id, nursery_id: nurseryId, class_id: classSeeds[i % 3].id, position: i + 1, added_at: isoDaysAgo(12 + i), notified_at: null, status: 'waiting' })))).error, 'Insert waitlist');
  const appRows = inquiries.slice(8, 10).map((inq, i) => ({ id: randomUUID(), inquiry_id: inq.id, nursery_id: nurseryId, parent_id: parentUsers[i].id, child_id: childRows[i].id, status: i === 0 ? 'submitted' : 'approved', submitted_at: isoDaysAgo(4 + i), reviewed_by: i === 1 ? adminUser.id : null, reviewed_at: i === 1 ? isoDaysAgo(2) : null, rejection_reason: null, parent_info_json: { from: 'inquiry' }, child_info_json: { from: 'inquiry' }, terms_accepted: true }));
  assertNoError((await supabase.from('applications').insert(appRows)).error, 'Insert applications');

  assertNoError((await supabase.from('staff_payroll').insert(staffProfiles.flatMap((sp) => Array.from({ length: 3 }, (_, m) => ({ staff_id: sp.id, nursery_id: nurseryId, pay_period_start: `2026-0${m + 1}-01`, pay_period_end: `2026-0${m + 1}-28`, base_salary: sp.salary_amount ?? '5000', bonuses: '300', deductions: '100', payment_method: 'bank_transfer', payment_date: `2026-0${m + 1}-28`, payment_status: 'paid', notes: 'Demo payroll', payslip_url: `payslips/${sp.id}-${m + 1}.pdf`, created_by: adminUser.id, paid_by: adminUser.id }))))).error, 'Insert payroll');
  assertNoError((await supabase.from('loyalty_transactions').insert(Array.from({ length: 50 }, (_, i) => ({ nursery_id: nurseryId, parent_id: parentUsers[i % 10].id, transaction_type: i % 5 === 0 ? 'redeemed' : 'earned', points: i % 5 === 0 ? -100 : 50 + (i % 4) * 10, source: ['payment', 'review', 'bonus'][i % 3], reference_id: null, description: 'Demo loyalty transaction', created_at: isoDaysAgo(i % 30) })))).error, 'Insert loyalty');

  const surveys = [
    { id: randomUUID(), nursery_id: nurseryId, title: 'Monthly Parent Feedback', title_ar: 'استبيان أولياء الأمور الشهري', title_en: 'Monthly Parent Survey', target_role: 'parent', questions_json: [{ q: 'How satisfied are you?' }], due_date: dateDaysAgo(-5), status: 'published' },
    { id: randomUUID(), nursery_id: nurseryId, title: 'Meal Satisfaction', title_ar: 'استبيان الوجبات', title_en: 'Meal Survey', target_role: 'parent', questions_json: [{ q: 'Rate meals' }], due_date: dateDaysAgo(-3), status: 'published' },
  ];
  assertNoError((await supabase.from('surveys').insert(surveys)).error, 'Insert surveys');
  assertNoError((await supabase.from('survey_responses').insert(Array.from({ length: 15 }, (_, i) => ({ survey_id: surveys[i % 2].id, user_id: parentUsers[i].id, answers_json: { rating: 4 + (i % 2), note: 'Great' }, submitted_at: isoDaysAgo(i % 10) })))).error, 'Insert survey responses');

  assertNoError((await supabase.from('inventory').insert(Array.from({ length: 20 }, (_, i) => ({ nursery_id: nurseryId, item_name: `Item ${i + 1}`, category: ['supplies', 'toys', 'food', 'furniture'][i % 4], quantity: String(i < 5 ? 2 : 20 + i), unit: 'pcs', reorder_level: '5', low_stock_threshold: '5', last_restocked: dateDaysAgo(14) })))).error, 'Insert inventory');
  assertNoError((await supabase.from('meal_plans').insert(Array.from({ length: 4 }, (_, i) => ({ nursery_id: nurseryId, week_start_date: dateDaysAgo(28 - i * 7), meals_json: { sun: 'Pasta', mon: 'Rice', tue: 'Chicken', wed: 'Lentils', thu: 'Fish' } })))).error, 'Insert meal plans');
  const posts = Array.from({ length: 10 }, (_, i) => ({ id: randomUUID(), nursery_id: nurseryId, author_id: i < 3 ? adminUser.id : parentUsers[i % parentUsers.length].id, post_type: i < 3 ? 'announcement' : i % 2 ? 'tip' : 'question', title: `Community Post ${i + 1}`, content: 'Demo community content', pinned: i < 2, created_at: isoDaysAgo(i) }));
  assertNoError((await supabase.from('posts').insert(posts)).error, 'Insert posts');
  assertNoError((await supabase.from('post_comments').insert(Array.from({ length: 25 }, (_, i) => ({ post_id: posts[i % posts.length].id, author_id: parentUsers[i % parentUsers.length].id, content: 'شكراً على المشاركة', created_at: isoDaysAgo(i % 10) })))).error, 'Insert post comments');
  assertNoError((await supabase.from('content_library').insert(Array.from({ length: 8 }, (_, i) => ({ nursery_id: nurseryId, title: `Content ${i + 1}`, category: ['parenting_tips', 'activities', 'recipes', 'health'][i % 4], content: 'Helpful article content', media_url: null, created_at: isoDaysAgo(i + 1) })))).error, 'Insert content library');

  const { count: dbChildren, error: cErr } = await supabase
    .from('children')
    .select('id', { count: 'exact', head: true })
    .eq('nursery_id', nurseryId);
  assertNoError(cErr, 'Count children after seed');
  const { count: dbParents, error: pErr } = await supabase
    .from('users')
    .select('id', { count: 'exact', head: true })
    .eq('nursery_id', nurseryId)
    .eq('role', 'parent');
  assertNoError(pErr, 'Count parents after seed');
  const { count: dbInvoices, error: invErr } = await supabase
    .from('invoices')
    .select('id', { count: 'exact', head: true })
    .eq('nursery_id', nurseryId);
  assertNoError(invErr, 'Count invoices after seed');

  console.log(
    `✅ Seed complete — verified: children=${dbChildren ?? 0}, parents=${dbParents ?? 0}, invoices=${dbInvoices ?? 0} | target: 30 / 25 / 25 (+ media, reports, milestones, inquiries, apps)`,
  );
};

main().catch((e) => {
  console.error('❌ Seed failed:', e.message);
  process.exit(1);
});
