import XLSX from 'xlsx';
import fs from 'node:fs';
import crypto from 'node:crypto';

const TOKEN = process.env.SUPABASE_ACCESS_TOKEN;
const REF = 'qepxjcyntvyvudacsgag';
const FILE = 'attached_assets/Active_Kids_Data_(1)_1776429433848.xlsx';
const DEFAULT_PASSWORD = 'Cherries2026!';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function q(sql) {
  let attempt = 0;
  while (attempt < 5) {
    attempt++;
    const res = await fetch(`https://api.supabase.com/v1/projects/${REF}/database/query`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: sql }),
    });
    const text = await res.text();
    if (res.status === 429) { await sleep(1500 * attempt); continue; }
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${text.slice(0, 500)}`);
    return JSON.parse(text);
  }
  throw new Error('429 after retries');
}

const E = (s) => (s == null ? 'NULL' : `'${String(s).replace(/'/g, "''")}'`);
const J = (o) => (o == null ? 'NULL' : `'${JSON.stringify(o).replace(/'/g, "''")}'::jsonb`);
const U = (s) => (s == null ? 'NULL' : `'${s}'::uuid`);
const B = (b) => (b ? 'true' : 'false');
const D = (s) => (s == null ? 'NULL' : `'${s}'::date`);

function normalizePhone(v) {
  if (v == null || v === '') return null;
  let s = String(v).trim().replace(/[^\d+]/g, '');
  if (!s) return null;
  if (s.startsWith('+')) return s;
  if (s.startsWith('20')) return '+' + s;
  if (s.startsWith('0')) return '+2' + s;
  return '+20' + s;
}
function normalizeEmail(v) {
  if (!v) return null;
  const s = String(v).trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s) ? s : null;
}
function parseDate(v) {
  if (!v) return null;
  if (typeof v === 'number') {
    const d = new Date(Math.round((v - 25569) * 86400 * 1000));
    return d.toISOString().slice(0, 10);
  }
  const s = String(v).trim();
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m) { const [, mo, da, yr] = m; return `${yr}-${mo.padStart(2, '0')}-${da.padStart(2, '0')}`; }
  const d = new Date(s);
  return isNaN(d) ? null : d.toISOString().slice(0, 10);
}
function mapNap(v) {
  if (!v) return null;
  const s = String(v).toLowerCase();
  if (s.includes('no nap') || s.includes('no_nap')) return 'no_nap';
  if (s.includes('same') || s.includes('nursery')) return 'same_as_nursery';
  if (s.includes('custom') || s.includes('max')) return 'custom';
  return 'same_as_nursery';
}
function mapSchool(v) {
  if (!v) return null;
  const s = String(v).toLowerCase();
  if (s.includes('international')) return 'international';
  if (s.includes('bilingual') || s.includes('national & bilingual') || s.includes('language')) return 'bilingual';
  if (s.includes('national')) return 'national';
  return null;
}
function mapMarital(v) {
  if (!v) return null;
  const s = String(v).toLowerCase();
  if (s.includes('married')) return 'married';
  if (s.includes('divorced')) return 'divorced';
  if (s.includes('separated')) return 'separated';
  if (s.includes('widow')) return 'widowed';
  if (s.includes('single')) return 'single';
  return null;
}
function mapToilet(v) {
  if (!v) return null;
  const s = String(v).toLowerCase();
  if (s.includes('completed') || s.includes('done') || s.includes('trained')) return 'completed';
  if (s.includes('progress') || s.includes('training') || s.includes('partial')) return 'in_progress';
  if (s.includes('diaper') || s.includes('not')) return 'not_started';
  return 'not_started';
}
function parseExcelTime(v) {
  if (v == null || v === '') return null;
  if (typeof v === 'number') {
    const m = Math.round(v * 24 * 60);
    return `${String(Math.floor(m/60)).padStart(2,'0')}:${String(m%60).padStart(2,'0')}:00`;
  }
  return String(v);
}

async function getOrCreateNursery() {
  const e = await q(`SELECT id FROM nurseries WHERE name_en='Cherries' LIMIT 1`);
  if (e.length) return e[0].id;
  const r = await q(`INSERT INTO nurseries (name_en, name_ar, city, phone, language_pref, working_days, opens_at, closes_at)
    VALUES ('Cherries', 'تشيريز', 'Cairo', '+20100000000', 'both', '["sun","mon","tue","wed","thu"]'::jsonb, '08:00', '16:00') RETURNING id`);
  return r[0].id;
}

async function main() {
  console.log('Loading spreadsheet...');
  const buf = fs.readFileSync(FILE);
  const wb = XLSX.read(buf, { type: 'buffer' });
  const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: null, raw: true });
  console.log(`Loaded ${rows.length} rows`);

  const nurseryId = await getOrCreateNursery();
  console.log(`Nursery: ${nurseryId}`);

  // Bulk-fetch existing children & users to skip duplicates without per-row queries.
  console.log('Fetching existing data...');
  const existingChildren = await q(`SELECT full_name_en, dob::text FROM children WHERE nursery_id='${nurseryId}'`);
  const childKey = (n, d) => `${n}|${d}`;
  const existingChildSet = new Set(existingChildren.map(c => childKey(c.full_name_en, c.dob)));
  const existingUsers = await q(`SELECT id, lower(email) AS email FROM auth.users WHERE email IS NOT NULL`);
  const emailToId = new Map(existingUsers.map(u => [u.email, u.id]));

  const childRows = [];   // SQL VALUES for children
  const userPlans = [];   // {email, password_plain, name_en, phone, occupation, idPhoto, id, isExisting}
  const linkRows = [];    // parent_children VALUES
  const pickupRows = [];  // authorized_pickups VALUES
  const userUpdates = []; // post-trigger updates

  let prepared = 0, skipped = 0;
  const errors = [];

  function planUser({ email, name_en, phone, occupation, idPhoto }) {
    if (!email) return null;
    const e = email.toLowerCase();
    if (emailToId.has(e)) {
      const id = emailToId.get(e);
      userUpdates.push({ id, phone, occupation, idPhoto, name_en });
      return id;
    }
    const id = crypto.randomUUID();
    emailToId.set(e, id);
    userPlans.push({ id, email: e, name_en });
    userUpdates.push({ id, phone, occupation, idPhoto, name_en });
    return id;
  }

  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    try {
      const cf = r["Child's First Name (will be used in all documents)"];
      const cm = r["Child's Middle Name"];
      const cl = r["Child's Last Name (will be used in all documents)"];
      if (!cf || !cl) { skipped++; continue; }
      const fullEn = [cf, cm, cl].filter(Boolean).join(' ').trim();
      const dob = parseDate(r["Date of Birth"]);
      if (!dob) { skipped++; errors.push(`Row ${i}: bad DOB`); continue; }
      if (existingChildSet.has(childKey(fullEn, dob))) { skipped++; continue; }
      existingChildSet.add(childKey(fullEn, dob));

      const childId = crypto.randomUUID();

      const dailyCare = {
        usual_dropoff_time: parseExcelTime(r["At what time do you usually send your child to the nursery?"]),
        breakfast_at_home: r["Does your child take breakfast at home before coming?"],
        eats_nursery_meals: r["Does your child eat nursery meals?"],
        food_allergies: r["Please state any food allergies!"],
        sends_extra_snacks: r["Do you send extra snacks/drinks daily?"],
        snack_drink_type: r["The snack/drink sent with your child is.."],
        unfinished_snack: r["In case your child doesn't finish this snack, we need to.."],
        cherries_meals_pref: r["Cherries' Meals.."],
        sends_vitamins: r["Do you send any vitamins to be give on daily basis?"],
        baby_meal_timing: r["For Baby Class, if you prefer a certain time between meals/snacks, please specify"],
        water_replacement: r["If the water sent with your child is finished, what should the nursery provide?"],
        extra_meal_pref: r["If your child asks for Extra Meal or Snack, what is your preference?"],
        diapers_supply: r["Diapers are sent as.."],
        daily_diaper_count: r["If you send on daily basis, please specify how many."],
        rash_cream: r["Rash Cream is to be used.."],
        change_diapers_regular: r["Should your child change diapers in regular times or when needed?"],
        diaper_change_frequency: r["If yes, please state how often should your child change?"],
        emergency_medications: r["Please check all medication that can be used in case of emergency at Cherries Preschool:"],
        agreed_health_policy: r["I hereby confirm I have read & agree to Healthy & Medication Policy"] === 'Agree',
        agreed_financial: r["I hereby confirm I have read & agree to Financial Agreement"] === 'Agree',
        agreed_handbook: r["I hereby agree to all of Cherries Policies & Procedures in Cherries’ Handbooks sent via e-mail or app. We are responsible to ask for it if we haven’t received it."] === 'Agree',
        agreed_accuracy: r["I hereby agree that all information in this form is accurate & can be used by the nursery as the main reference for child's info"] === 'Agree',
      };
      const emergencyContacts = [
        { name: r["Emergency Contact 1- Name & Relationship"], phone: normalizePhone(r["Emergency Contact 1- Phone Number"]) },
        { name: r["Emergency Contact 2- Name & Relationship"], phone: normalizePhone(r["Emergency Contact 2- Phone Number"]) },
      ].filter(c => c.name);
      const siblings = { has_siblings: r["Does child have siblings?"], ages: r["If child has siblings, please state ages."] };
      const ext = { department: r["Which department are you joining at Cherries?"], address: r["Address"], allergy: { has: r["Does your child suffer from any allergy?"], details: r["Please state allergy details, if any."] }, source: r["How did you know about Cherries?"] || r["How did you know about Cherries?_1"] };
      const napMin = (() => { const m = String(r["Please state max nap time, if you don't want your child to nap with nursery system"] || '').match(/(\d+)/); return m ? Number(m[1]) * 60 : null; })();

      childRows.push(`(${U(childId)}, ${U(nurseryId)}, ${E(fullEn)}, ${E(fullEn)}, ${D(dob)}, 'active',
        ${E(cf)}, ${E(cm)}, ${E(cl)}, ${E(r["Nickname"])}, ${E(r["Nationality"])},
        ${E(mapSchool(r["School Preference"]))}, ${E(r["School Admissions Plan"])}, ${E(r["Academic Year of School Entry"])},
        ${E(mapToilet(r["Toilet Training Status"]))}, ${E(mapNap(r["Nap Time Preference"]))}, ${napMin == null ? 'NULL' : napMin},
        ${E(r["Attach Photo of Child's Birth Certificate"])}, ${E(r["Attach Photo of Vaccination Card"])},
        ${B(r["Does child have siblings?"] === 'Yes')}, ${E(r["If child has siblings, please state ages."])}, ${J(siblings)},
        ${J(dailyCare)}, ${J(emergencyContacts)}, ${J(ext)})`);

      // Father
      const fF = r["Father's Full Name"];
      if (fF) {
        const fEmail = normalizeEmail(r["Father's E-mail"]) || `father_${childId.slice(0,8)}@cherries.local`;
        const fPhone = normalizePhone(r["Father's Mobile Number"]);
        const fId = planUser({ email: fEmail, name_en: fF, phone: fPhone, occupation: r["Father's Job"], idPhoto: r["Attach ID Photo of Father"] });
        if (fId) {
          linkRows.push(`(${U(fId)}, ${U(childId)}, 'father', 'father', ${E(r["Father's Job"])}, ${E(r["Attach ID Photo of Father"])}, ${E(mapMarital(r["Parents' Marital Status"]))}, ${E(r["Address"])}, false, true)`);
        }
      }
      // Mother
      const mF = r["Mother's Full Name"];
      if (mF) {
        const mEmail = normalizeEmail(r["Mother's E-mail (Main Communication)"]) || normalizeEmail(r["Email Address"]) || `mother_${childId.slice(0,8)}@cherries.local`;
        const mPhone = normalizePhone(r["Mother's Mobile Number"]);
        const mId = planUser({ email: mEmail, name_en: mF, phone: mPhone, occupation: r["Mother's Job"], idPhoto: r["Attach ID Photo of Mother"] });
        if (mId) {
          linkRows.push(`(${U(mId)}, ${U(childId)}, 'mother', 'mother', ${E(r["Mother's Job"])}, ${E(r["Attach ID Photo of Mother"])}, ${E(mapMarital(r["Parents' Marital Status"]))}, ${E(r["Address"])}, true, true)`);
        }
      }
      // Pickups
      const p1p = r["Attach photo of ID of Authorized Pick-up Person 1"];
      const p1a = r["Authorization of Pick-up Person 1"];
      if (p1p || p1a) pickupRows.push(`(${U(childId)}, 'Authorized Person 1', '', ${E(p1p)}, ${E(p1a)}, true, true, true)`);
      const p2p = r["Attach Photo ID of Authorized Pick-up Person 2"];
      const p2a = r["Authorization of Pick-up Person 2"];
      if (p2p || p2a) pickupRows.push(`(${U(childId)}, 'Authorized Person 2', '', ${E(p2p)}, ${E(p2a)}, true, true, true)`);

      prepared++;
    } catch (e) {
      errors.push(`Row ${i}: ${e.message.slice(0, 200)}`);
    }
  }

  console.log(`Prepared: ${prepared} children, ${userPlans.length} new auth users, ${linkRows.length} parent links, ${pickupRows.length} pickups; skipped ${skipped}`);

  // 1. Insert auth.users in chunks of 50
  if (userPlans.length) {
    console.log('Inserting auth.users...');
    for (let i = 0; i < userPlans.length; i += 50) {
      const chunk = userPlans.slice(i, i + 50);
      const values = chunk.map(u => {
        const meta = JSON.stringify({ name_en: u.name_en, name_ar: u.name_en, language_pref: 'ar' }).replace(/'/g, "''");
        return `(${U(u.id)}, '00000000-0000-0000-0000-000000000000', ${E(u.email)}, crypt(${E(DEFAULT_PASSWORD)}, gen_salt('bf')), now(), now(), now(), 'authenticated', 'authenticated', '{"provider":"email"}'::jsonb, '${meta}'::jsonb)`;
      }).join(',\n');
      await q(`INSERT INTO auth.users (id, instance_id, email, encrypted_password, email_confirmed_at, created_at, updated_at, aud, role, raw_app_meta_data, raw_user_meta_data, confirmation_token, recovery_token, email_change_token_new, email_change, email_change_token_current, reauthentication_token, phone_change, phone_change_token) VALUES ${values.replace(/\)$/gm, ", '', '', '', '', '', '', '', '')")} ON CONFLICT (id) DO NOTHING`);
      console.log(`  auth.users ${Math.min(i + 50, userPlans.length)}/${userPlans.length}`);
    }
  }

  // 2. Update public.users with extra fields (chunked)
  if (userUpdates.length) {
    console.log('Updating public.users...');
    for (let i = 0; i < userUpdates.length; i += 50) {
      const chunk = userUpdates.slice(i, i + 50);
      const cases = {
        phone: chunk.map(u => `WHEN ${U(u.id)} THEN ${E(u.phone)}`).join(' '),
        occupation: chunk.map(u => `WHEN ${U(u.id)} THEN ${E(u.occupation)}`).join(' '),
        id_photo_url: chunk.map(u => `WHEN ${U(u.id)} THEN ${E(u.idPhoto)}`).join(' '),
        name_en: chunk.map(u => `WHEN ${U(u.id)} THEN ${E(u.name_en)}`).join(' '),
      };
      const ids = chunk.map(u => U(u.id)).join(',');
      await q(`UPDATE public.users SET
        nursery_id = ${U(nurseryId)},
        phone = COALESCE(CASE id ${cases.phone} END, phone),
        occupation = COALESCE(CASE id ${cases.occupation} END, occupation),
        id_photo_url = COALESCE(CASE id ${cases.id_photo_url} END, id_photo_url),
        name_en = COALESCE(NULLIF(CASE id ${cases.name_en} END, ''), name_en),
        name_ar = COALESCE(NULLIF(CASE id ${cases.name_en} END, ''), name_ar)
        WHERE id IN (${ids})`);
      console.log(`  users ${Math.min(i + 50, userUpdates.length)}/${userUpdates.length}`);
    }
  }

  // 3. Insert children in chunks
  if (childRows.length) {
    console.log('Inserting children...');
    for (let i = 0; i < childRows.length; i += 25) {
      const chunk = childRows.slice(i, i + 25).join(',\n');
      await q(`INSERT INTO children (id, nursery_id, full_name_ar, full_name_en, dob, status,
        first_name, middle_name, last_name, nickname, nationality,
        school_preference, school_admissions_plan, academic_year,
        toilet_training_status, nap_preference, max_nap_duration_minutes,
        birth_certificate_url, vaccination_card_url,
        has_siblings, sibling_ages, siblings_info_json,
        daily_care_preferences, emergency_contacts, enrollment_extended_json) VALUES ${chunk}`);
      console.log(`  children ${Math.min(i + 25, childRows.length)}/${childRows.length}`);
    }
  }

  // 4. Insert parent_children
  if (linkRows.length) {
    console.log('Inserting parent_children...');
    for (let i = 0; i < linkRows.length; i += 50) {
      const chunk = linkRows.slice(i, i + 50).join(',\n');
      await q(`INSERT INTO parent_children (parent_id, child_id, parent_type, relationship, occupation, parent_id_photo_url, marital_status, home_address, is_primary, is_emergency_contact) VALUES ${chunk} ON CONFLICT DO NOTHING`);
      console.log(`  links ${Math.min(i + 50, linkRows.length)}/${linkRows.length}`);
    }
  }

  // 5. Insert authorized_pickups
  if (pickupRows.length) {
    console.log('Inserting authorized_pickups...');
    for (let i = 0; i < pickupRows.length; i += 50) {
      const chunk = pickupRows.slice(i, i + 50).join(',\n');
      await q(`INSERT INTO authorized_pickups (child_id, name, phone, photo_url, authorization_level, can_pickup, can_dropoff, active) VALUES ${chunk}`);
      console.log(`  pickups ${Math.min(i + 50, pickupRows.length)}/${pickupRows.length}`);
    }
  }

  console.log(`\nDone. prepared=${prepared}, skipped=${skipped}, errors=${errors.length}`);
  errors.slice(0, 20).forEach(e => console.log(e));
}

main().catch(e => { console.error(e); process.exit(1); });
