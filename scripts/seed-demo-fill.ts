/**
 * Additive, idempotent demo seeder.
 *
 * Wires up the existing demo nursery so every feature/flow can be demoed:
 *   - renames the 4 placeholder classes into age-banded class identities
 *   - assigns all children to a class by age
 *   - puts teachers on classes via class_staff (lead)
 *   - fills daily_reports (last 5 days), milestones, invoices
 *   - adds more courses + course_enrollments, and child_packages
 *
 * Runs entirely under RLS as the demo branch admin (no service-role key needed).
 * Safe to re-run: class/child writes are upserts; report/enrollment/package
 * writes use natural unique keys; milestones/invoices are guarded by a
 * "skip if already seeded" count check.
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, '../.env') });

const URL = process.env.VITE_SUPABASE_URL!;
const KEY = process.env.VITE_SUPABASE_ANON_KEY!;
const PW = 'Demo2026!';

type Child = { id: string; full_name_ar: string; full_name_en: string; dob: string; class_id: string | null };

function ymd(d: Date) {
  return d.toISOString().slice(0, 10);
}
function ageYears(dob: string) {
  const d = new Date(dob);
  const n = new Date();
  let a = n.getFullYear() - d.getFullYear();
  if (n.getMonth() < d.getMonth() || (n.getMonth() === d.getMonth() && n.getDate() < d.getDate())) a -= 1;
  return Math.max(0, a);
}
function pick<T>(arr: readonly T[], i: number): T {
  return arr[i % arr.length];
}

const CLASS_IDENTITIES = [
  { name_en: 'Sunflowers', name_ar: 'عباد الشمس', grade_level: 'Infants (1-2y)', room_number: 'A1' },
  { name_en: 'Butterflies', name_ar: 'الفراشات', grade_level: 'Toddlers (2-3y)', room_number: 'A2' },
  { name_en: 'Rainbows', name_ar: 'قوس قزح', grade_level: 'Preschool (3-4y)', room_number: 'B1' },
  { name_en: 'Stars', name_ar: 'النجوم', grade_level: 'Pre-K (4-5y)', room_number: 'B2' },
];

function bandIndex(age: number) {
  if (age < 2) return 0;
  if (age < 3) return 1;
  if (age < 4) return 2;
  return 3;
}

const MEAL = ['all', 'some', 'all', 'some', 'none'] as const;
const NAP_Q = ['good', 'ok', 'good', 'restless'] as const;
const MOOD = ['happy', 'content', 'happy', 'fussy', 'content'] as const;
const ACT_TAGS = [
  ['art', 'outdoor'],
  ['reading', 'circle_time'],
  ['music', 'free_play'],
  ['sensory_play', 'story_time'],
  ['outdoor', 'music', 'free_play'],
];
const SPECIAL = [
  'Had a wonderful day and made a new friend.',
  'A little tired in the afternoon but cheered up after snack.',
  'Loved the outdoor activity today!',
  'Practised counting and did really well.',
  '',
];

// NOTE: the live `milestones` table carries TWO category CHECK constraints —
// the legacy `milestones_category_ck` (gross_motor/fine_motor/language/social)
// and `milestones_category_ck_v2` (motor_skills/social/cognitive/language/
// self_care/creative). Only the intersection {language, social} satisfies both,
// so the seed restricts categories to those two values.
const MILESTONES: { cat: string; text: string }[] = [
  { cat: 'language', text: 'Said first clear words' },
  { cat: 'language', text: 'Used a two-word phrase' },
  { cat: 'language', text: 'Followed a simple instruction' },
  { cat: 'language', text: 'Named familiar objects in a book' },
  { cat: 'language', text: 'Sang along to a nursery rhyme' },
  { cat: 'language', text: 'Answered a simple question' },
  { cat: 'social', text: 'Shared toys with a friend' },
  { cat: 'social', text: 'Waved goodbye at drop-off' },
  { cat: 'social', text: 'Played cooperatively in a group' },
  { cat: 'social', text: 'Took turns during an activity' },
  { cat: 'social', text: 'Greeted the teacher by name' },
  { cat: 'social', text: 'Comforted a friend who was upset' },
];

const MILESTONE_AR: Record<string, string> = {
  'Said first clear words': 'نطق أولى كلماته الواضحة',
  'Used a two-word phrase': 'استخدم جملة من كلمتين',
  'Followed a simple instruction': 'اتبع تعليمات بسيطة',
  'Named familiar objects in a book': 'سمّى أشياء مألوفة في كتاب',
  'Sang along to a nursery rhyme': 'غنّى مع أنشودة الأطفال',
  'Answered a simple question': 'أجاب عن سؤال بسيط',
  'Shared toys with a friend': 'شارك ألعابه مع صديق',
  'Waved goodbye at drop-off': 'لوّح للوداع عند التوصيل',
  'Played cooperatively in a group': 'لعب بشكل تعاوني ضمن مجموعة',
  'Took turns during an activity': 'تناوب الأدوار أثناء نشاط',
  'Greeted the teacher by name': 'حيّا المعلمة باسمها',
  'Comforted a friend who was upset': 'واسى صديقًا كان منزعجًا',
};

const NEW_COURSES = [
  {
    title_en: 'Art & Craft', title_ar: 'الفنون والأشغال', category: 'art',
    description_en: 'Creative painting, drawing and craft sessions.', description_ar: 'جلسات رسم وأشغال يدوية إبداعية.',
    price_per_month: 450, max_students: 15, schedule_days: ['mon', 'wed'], schedule_time_start: '11:00', schedule_time_end: '12:00',
  },
  {
    title_en: 'Music & Movement', title_ar: 'الموسيقى والحركة', category: 'music',
    description_en: 'Singing, rhythm and movement for little ones.', description_ar: 'غناء وإيقاع وحركة للصغار.',
    price_per_month: 400, max_students: 18, schedule_days: ['sun', 'thu'], schedule_time_start: '09:30', schedule_time_end: '10:15',
  },
  {
    title_en: 'Little Linguists (English)', title_ar: 'اللغويون الصغار (إنجليزي)', category: 'language',
    description_en: 'Early English language enrichment through play.', description_ar: 'إثراء مبكر للغة الإنجليزية عبر اللعب.',
    price_per_month: 550, max_students: 12, schedule_days: ['mon', 'wed'], schedule_time_start: '12:30', schedule_time_end: '13:15',
  },
  {
    title_en: 'Football Stars', title_ar: 'نجوم كرة القدم', category: 'sport',
    description_en: 'Fun, age-appropriate football skills and games.', description_ar: 'مهارات وألعاب كرة قدم ممتعة مناسبة للعمر.',
    price_per_month: 500, max_students: 16, schedule_days: ['tue', 'thu'], schedule_time_start: '15:00', schedule_time_end: '16:00',
  },
];

async function main() {
  const sb: SupabaseClient = createClient(URL, KEY, { auth: { autoRefreshToken: false, persistSession: false } });
  const { error: signErr } = await sb.auth.signInWithPassword({ email: 'demo-branch-admin@xonursery.com', password: PW });
  if (signErr) throw new Error('admin signin: ' + signErr.message);
  const { data: auth } = await sb.auth.getUser();
  const adminId = auth.user!.id;
  const { data: profile } = await sb.from('users').select('nursery_id').eq('id', adminId).single();
  const nurseryId = (profile as { nursery_id: string }).nursery_id;
  console.log('nursery', nurseryId, 'admin', adminId);

  // --- Teachers ---
  const { data: teachers } = await sb
    .from('users').select('id, email, name_en').eq('nursery_id', nurseryId).eq('role', 'teacher');
  const tlist = (teachers ?? []) as { id: string; email: string; name_en: string }[];
  const demoTeacher = tlist.find((t) => t.email === 'demo-teacher@xonursery.com') ?? tlist[0];
  console.log('teachers', tlist.map((t) => t.email).join(', '));

  // --- Classes: rename to age-banded identities ---
  const { data: classesRaw } = await sb
    .from('classes').select('id, name_en, created_at').eq('nursery_id', nurseryId).order('created_at');
  const classes = (classesRaw ?? []) as { id: string; name_en: string }[];
  console.log('classes found', classes.length);
  for (let i = 0; i < classes.length && i < CLASS_IDENTITIES.length; i++) {
    const id = CLASS_IDENTITIES[i];
    const { error } = await sb.from('classes').update({
      name_en: id.name_en, name_ar: id.name_ar, grade_level: id.grade_level,
      room_number: id.room_number, capacity: 25,
    } as never).eq('id', classes[i].id);
    if (error) console.log('  rename class err', classes[i].id, error.message);
  }
  // Re-read with stable order for banding
  const classIds = classes.slice(0, CLASS_IDENTITIES.length).map((c) => c.id);

  // --- class_staff: leads ---
  // demoTeacher leads classes 0 & 1; remaining teachers spread over 2 & 3.
  const otherTeachers = tlist.filter((t) => t.id !== demoTeacher.id);
  const leadFor: Record<string, string> = {};
  classIds.forEach((cid, i) => {
    if (i < 2) leadFor[cid] = demoTeacher.id;
    else leadFor[cid] = (otherTeachers[i - 2]?.id) ?? demoTeacher.id;
  });
  for (const [cid, uid] of Object.entries(leadFor)) {
    const { error } = await sb.from('class_staff')
      .upsert({ class_id: cid, user_id: uid, role: 'lead' } as never, { onConflict: 'class_id,user_id' });
    if (error) console.log('  class_staff err', cid, error.message);
  }
  console.log('leads', JSON.stringify(leadFor));

  // --- Assign children to classes by age band ---
  const { data: childrenRaw } = await sb
    .from('children').select('id, full_name_ar, full_name_en, dob, class_id').eq('nursery_id', nurseryId);
  const children = (childrenRaw ?? []) as Child[];
  console.log('children', children.length);
  let assigned = 0;
  for (const c of children) {
    const idx = Math.min(bandIndex(ageYears(c.dob || '2023-01-01')), classIds.length - 1);
    const target = classIds[idx];
    if (c.class_id === target) continue;
    const { error } = await sb.from('children').update({ class_id: target } as never).eq('id', c.id);
    if (error) { console.log('  child assign err', c.id, error.message); continue; }
    c.class_id = target;
    assigned++;
  }
  console.log('children assigned', assigned);

  const leadOf = (classId: string | null) => (classId && leadFor[classId]) || demoTeacher.id;

  // --- Daily reports: last 5 days for every child (upsert on child_id,report_date) ---
  const days: string[] = [];
  for (let i = 0; i < 5; i++) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    days.push(ymd(d));
  }
  let reportRows = 0;
  let seed = 0;
  for (const c of children) {
    for (const date of days) {
      const s = seed++;
      const napped = s % 4 !== 0;
      const payload = {
        nursery_id: nurseryId,
        child_id: c.id,
        teacher_id: leadOf(c.class_id),
        report_date: date,
        status: 'published',
        meals_json: {
          breakfast: { amount: pick(MEAL, s), notes: '' },
          lunch: { amount: pick(MEAL, s + 1), notes: '' },
          snacks: { amount: pick(MEAL, s + 2), notes: '' },
        },
        nap_json: { napped, duration_minutes: napped ? 60 + (s % 4) * 15 : 0, quality: napped ? pick(NAP_Q, s) : null, notes: null },
        mood_json: { mood: pick(MOOD, s), notes: null },
        toilet_json: { change_count: s % 4, diaper_changes: s % 4, notes: null },
        activities_json: { tags: pick(ACT_TAGS, s), free_text: null, participated_in: pick(ACT_TAGS, s), notes: null },
        feeding_json: { bottle_sessions: [], bottle_feeds_count: 0, bottle_amount_ml: 0, nursing_count: 0, nursing_duration_minutes: 0, solid_foods: true, notes: null },
        special_notes: pick(SPECIAL, s) || null,
        published_at: new Date().toISOString(),
      };
      const { error } = await sb.from('daily_reports').upsert(payload as never, { onConflict: 'child_id,report_date' });
      if (error) { console.log('  report err', c.id, date, error.message); }
      else reportRows++;
    }
  }
  console.log('daily_reports upserted', reportRows);

  // --- Milestones: clean re-seed (delete existing nursery rows, reinsert) ---
  {
    const { error: delErr } = await sb.from('milestones').delete().eq('nursery_id', nurseryId);
    if (delErr) console.log('  milestone delete err', delErr.message);
    let ms = 0;
    // 2 milestones for first 45 children
    for (let i = 0; i < Math.min(children.length, 45); i++) {
      const c = children[i];
      for (let k = 0; k < 2; k++) {
        const m = pick(MILESTONES, i * 2 + k);
        const d = new Date();
        d.setDate(d.getDate() - (7 + (i % 30)));
        const text = m.text;
        const { error } = await sb.from('milestones').insert({
          nursery_id: nurseryId,
          child_id: c.id,
          teacher_id: leadOf(c.class_id),
          category: m.cat,
          milestone_text: text,
          milestone_name_en: text,
          milestone_name_ar: MILESTONE_AR[text] ?? text,
          achieved_at: ymd(d),
          shared_with_parent: true,
          notes: null,
          photo_url: null,
        } as never);
        if (error) { console.log('  milestone err', c.id, error.message); }
        else ms++;
      }
    }
    console.log('milestones inserted', ms);
  }

  // --- Invoices: guard by existing count ---
  const { count: invCount } = await sb.from('invoices').select('*', { count: 'exact', head: true }).eq('nursery_id', nurseryId);
  if ((invCount ?? 0) === 0) {
    const { data: parentsRaw } = await sb
      .from('users').select('id, name_en').eq('nursery_id', nurseryId).eq('role', 'parent').limit(30);
    const parents = (parentsRaw ?? []) as { id: string; name_en: string }[];
    let inv = 0;
    const statuses = ['paid', 'pending', 'overdue', 'paid', 'pending'] as const;
    for (let i = 0; i < parents.length; i++) {
      const p = parents[i];
      // Last month (paid) + current month (pending/overdue)
      const rows = [
        { month: -1, status: 'paid' as const, due: '2026-05-05' },
        { month: 0, status: statuses[i % statuses.length], due: '2026-06-05' },
      ];
      for (const r of rows) {
        const tuition = 3500;
        const extras = (i % 3) * 250;
        const total = tuition + extras;
        const items = [{ label: 'Monthly tuition', amount: tuition }];
        if (extras) items.push({ label: 'Extra hours', amount: extras });
        const { error } = await sb.from('invoices').insert({
          nursery_id: nurseryId,
          parent_id: p.id,
          amount: total.toFixed(2),
          due_date: r.due,
          status: r.status,
          invoice_type: 'monthly',
          line_items_json: { items, notes: r.month === -1 ? 'May 2026 tuition' : 'June 2026 tuition' },
        } as never);
        if (error) { console.log('  invoice err', p.id, error.message); }
        else inv++;
      }
    }
    console.log('invoices inserted', inv);
  } else {
    console.log('invoices already present, skipping', invCount);
  }

  // --- Courses: insert missing ones by title_en ---
  const { data: existingCoursesRaw } = await sb.from('courses').select('id, title_en').eq('nursery_id', nurseryId);
  const existingCourses = (existingCoursesRaw ?? []) as { id: string; title_en: string }[];
  const haveTitles = new Set(existingCourses.map((c) => c.title_en));
  const allCourses = [...existingCourses];
  for (let i = 0; i < NEW_COURSES.length; i++) {
    const nc = NEW_COURSES[i];
    if (haveTitles.has(nc.title_en)) continue;
    const { data, error } = await sb.from('courses').insert({
      nursery_id: nurseryId,
      title_en: nc.title_en, title_ar: nc.title_ar,
      description_en: nc.description_en, description_ar: nc.description_ar,
      category: nc.category, price_per_month: nc.price_per_month, max_students: nc.max_students,
      schedule_days: nc.schedule_days, schedule_time_start: nc.schedule_time_start, schedule_time_end: nc.schedule_time_end,
      status: 'active', teacher_user_id: pick([demoTeacher, ...otherTeachers], i).id,
    } as never).select('id, title_en').maybeSingle();
    if (error) { console.log('  course err', nc.title_en, error.message); }
    else if (data) { allCourses.push(data as { id: string; title_en: string }); console.log('  course +', nc.title_en); }
  }

  // --- Course enrollments: ~8 children per course (upsert on course_id,child_id) ---
  let enr = 0;
  for (let ci = 0; ci < allCourses.length; ci++) {
    const course = allCourses[ci];
    for (let k = 0; k < 8; k++) {
      const child = children[(ci * 5 + k) % children.length];
      const { error } = await sb.from('course_enrollments').upsert({
        course_id: course.id, child_id: child.id, enrolled_by_user_id: adminId, status: 'active',
      } as never, { onConflict: 'course_id,child_id' });
      if (error) { console.log('  enroll err', course.title_en, error.message); break; }
      else enr++;
    }
  }
  console.log('course_enrollments upserted', enr);

  // --- Child packages: assign to children lacking an active package ---
  const { data: pkgsRaw } = await sb.from('packages').select('id').eq('nursery_id', nurseryId).eq('active', true);
  const pkgs = (pkgsRaw ?? []) as { id: string }[];
  const { data: activeCpRaw } = await sb.from('child_packages').select('child_id').eq('status', 'active');
  const haveActive = new Set(((activeCpRaw ?? []) as { child_id: string }[]).map((r) => r.child_id));
  let cp = 0;
  if (pkgs.length) {
    for (let i = 0; i < children.length && cp < 20; i++) {
      const c = children[i];
      if (haveActive.has(c.id)) continue;
      const { error } = await sb.from('child_packages').insert({
        package_id: pick(pkgs, i).id, child_id: c.id, nursery_id: nurseryId, status: 'active', hours_used: i % 5,
      } as never);
      if (error) { console.log('  child_package err', c.id, error.message); }
      else cp++;
    }
  }
  console.log('child_packages inserted', cp);

  // --- Final counts ---
  for (const t of ['classes', 'class_staff', 'daily_reports', 'milestones', 'invoices', 'courses', 'course_enrollments', 'child_packages']) {
    const { count } = await sb.from(t).select('*', { count: 'exact', head: true });
    console.log('FINAL', t, count);
  }
  console.log('DONE');
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
