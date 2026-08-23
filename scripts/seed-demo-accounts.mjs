const TOKEN = process.env.SUPABASE_ACCESS_TOKEN;
const REF = 'qepxjcyntvyvudacsgag';
const PASSWORD = 'Demo2026!';

async function q(sql) {
  const r = await fetch(`https://api.supabase.com/v1/projects/${REF}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: sql }),
  });
  const t = await r.text();
  if (!r.ok) throw new Error(`${r.status}: ${t.slice(0, 400)}`);
  return JSON.parse(t);
}
const E = (s) => (s == null ? 'NULL' : `'${String(s).replace(/'/g, "''")}'`);

const ACCOUNTS = [
  { email: 'demo-xo-admin@xonursery.com',    role: 'xo_super_admin', name_en: 'Demo XO Admin',    name_ar: 'مدير النظام التجريبي' },
  { email: 'demo-branch-admin@xonursery.com',role: 'branch_admin',   name_en: 'Demo Branch Admin',name_ar: 'مدير الفرع التجريبي' },
  { email: 'demo-manager@xonursery.com',     role: 'manager',        name_en: 'Demo Manager (Finance)', name_ar: 'مدير تجريبي - مالية', department: 'finance' },
  { email: 'demo-manager-hr@xonursery.com',  role: 'manager',        name_en: 'Demo Manager (HR)',      name_ar: 'مدير تجريبي - موارد بشرية', department: 'hr' },
  { email: 'demo-teacher@xonursery.com',     role: 'teacher',        name_en: 'Demo Teacher',     name_ar: 'معلم تجريبي' },
  { email: 'demo-parent@xonursery.com',      role: 'parent',         name_en: 'Demo Parent',      name_ar: 'ولي أمر تجريبي' },
];

let nursery = await q(`SELECT id FROM nurseries WHERE name_en='Cherries' LIMIT 1`);
if (!nursery.length) {
  nursery = await q(`SELECT id FROM nurseries ORDER BY created_at ASC LIMIT 1`);
}
if (!nursery.length) throw new Error('No nursery found in DB; create one first.');
const nurseryId = nursery[0].id;
console.log('Nursery:', nurseryId);

// Pick the most-linked parent (the one with the most children) so demo-parent
// shows multi-child UI nicely. Fallback to first parent.
const richestParent = await q(`
  SELECT parent_id, COUNT(child_id) AS n
  FROM parent_children GROUP BY parent_id ORDER BY n DESC LIMIT 1`);
const childrenForDemoParent = richestParent.length
  ? (await q(`SELECT child_id FROM parent_children WHERE parent_id='${richestParent[0].parent_id}'`)).map(r => r.child_id)
  : (await q(`SELECT id AS child_id FROM children LIMIT 3`)).map(r => r.child_id);
console.log(`Demo parent will be linked to ${childrenForDemoParent.length} children`);

for (const a of ACCOUNTS) {
  // Reset (delete) existing demo user so role/links are clean
  await q(`DELETE FROM auth.users WHERE email=${E(a.email)}`);

  const meta = JSON.stringify({ name_en: a.name_en, name_ar: a.name_ar, language_pref: 'ar' }).replace(/'/g, "''");
  // Token columns must be '' (not NULL) — GoTrue's Go scanner cannot deserialize
  // NULL into its string fields and returns "Database error querying schema".
  const ins = await q(`
    INSERT INTO auth.users (id, instance_id, email, encrypted_password, email_confirmed_at,
      created_at, updated_at, aud, role, raw_app_meta_data, raw_user_meta_data,
      confirmation_token, recovery_token, email_change_token_new, email_change)
    VALUES (gen_random_uuid(), '00000000-0000-0000-0000-000000000000', ${E(a.email)},
      crypt(${E(PASSWORD)}, gen_salt('bf')), now(), now(), now(),
      'authenticated', 'authenticated', '{"provider":"email"}'::jsonb, '${meta}'::jsonb,
      '', '', '', '')
    RETURNING id`);
  const id = ins[0].id;

  // GoTrue requires an auth.identities row per provider; without it, password
  // sign-in fails with "Database error querying schema".
  await q(`
    INSERT INTO auth.identities (id, user_id, identity_data, provider, provider_id,
      last_sign_in_at, created_at, updated_at)
    VALUES (gen_random_uuid(), '${id}',
      jsonb_build_object('sub', '${id}'::text, 'email', ${E(a.email)}, 'email_verified', true, 'provider', 'email'),
      'email', '${id}', now(), now(), now())`);

  // Trigger creates public.users row with role='parent' & default name. Update to correct values.
  // For xo_super_admin we leave nursery_id NULL (platform-wide).
  const nurseryAssignment = a.role === 'xo_super_admin' ? 'NULL' : `'${nurseryId}'::uuid`;
  const departmentAssignment = a.department ? `${E(a.department)}::user_department` : 'NULL';
  await q(`
    ALTER TABLE public.users DISABLE TRIGGER trg_log_user_role_change;
    UPDATE public.users
      SET role=${E(a.role)}::user_role,
          name_en=${E(a.name_en)},
          name_ar=${E(a.name_ar)},
          nursery_id=${nurseryAssignment},
          department=${departmentAssignment},
          status='active'
      WHERE id='${id}';
    ALTER TABLE public.users ENABLE TRIGGER trg_log_user_role_change;`);

  // Demo parent: link to the chosen children
  if (a.role === 'parent' && childrenForDemoParent.length) {
    const values = childrenForDemoParent.map((cid, i) =>
      `('${id}'::uuid, '${cid}'::uuid, 'mother', 'mother', ${i === 0 ? 'true' : 'false'}, true, 'married')`).join(',');
    await q(`INSERT INTO parent_children (parent_id, child_id, parent_type, relationship, is_primary, is_emergency_contact, marital_status)
      VALUES ${values} ON CONFLICT DO NOTHING`);
  }

  console.log(`✓ ${a.email}  →  role=${a.role}  id=${id}`);
}

console.log('\nDone. All demo accounts ready with password:', PASSWORD);
