import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
import { resolve } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
config({ path: resolve(__dirname, '../.env') });

const supabaseUrl = process.env.VITE_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

const DEMO_PASSWORD = 'Demo2026!';

type DemoRole = 'xo_super_admin' | 'branch_admin' | 'manager' | 'teacher' | 'parent';
type DemoDepartment = 'finance' | 'hr' | 'operations';

type DemoAccountConfig = {
  email: string;
  role: DemoRole;
  name_ar: string;
  name_en: string;
  nursery_id: string | null;
  phone: string;
  department?: DemoDepartment;
};

async function createDemoAccounts() {
  const { data: nurseries, error: nurseryError } = await supabase
    .from('nurseries')
    .select('id')
    .limit(1);

  if (nurseryError) {
    console.error('❌ Failed to load nurseries:', nurseryError.message);
    return;
  }

  const nurseryId = nurseries?.[0]?.id ?? null;

  if (!nurseryId) {
    console.error('No nursery found in database!');
    return;
  }

  const demoAccounts: DemoAccountConfig[] = [
    {
      email: 'demo-xo-admin@xonursery.com',
      role: 'xo_super_admin',
      name_ar: 'مسؤول النظام التجريبي',
      name_en: 'Demo XO Admin',
      nursery_id: null,
      phone: '+201234567890',
    },
    {
      email: 'demo-branch-admin@xonursery.com',
      role: 'branch_admin',
      name_ar: 'مدير الفرع التجريبي',
      name_en: 'Demo Branch Admin',
      nursery_id: nurseryId,
      phone: '+201234567891',
    },
    {
      email: 'demo-manager@xonursery.com',
      role: 'manager',
      name_ar: 'مدير تجريبي - مالية',
      name_en: 'Demo Manager (Finance)',
      nursery_id: nurseryId,
      phone: '+201234567894',
      department: 'finance',
    },
    {
      email: 'demo-manager-hr@xonursery.com',
      role: 'manager',
      name_ar: 'مدير تجريبي - موارد بشرية',
      name_en: 'Demo Manager (HR)',
      nursery_id: nurseryId,
      phone: '+201234567895',
      department: 'hr',
    },
    {
      email: 'demo-teacher@xonursery.com',
      role: 'teacher',
      name_ar: 'معلمة تجريبية',
      name_en: 'Demo Teacher',
      nursery_id: nurseryId,
      phone: '+201234567892',
    },
    {
      email: 'demo-parent@xonursery.com',
      role: 'parent',
      name_ar: 'ولي أمر تجريبي',
      name_en: 'Demo Parent',
      nursery_id: nurseryId,
      phone: '+201234567893',
    },
  ];

  console.log('Creating demo accounts...\n');

  for (const account of demoAccounts) {
    try {
      const { data: existingUser, error: existingError } = await supabase.auth.admin.listUsers({
        page: 1,
        perPage: 1,
        email: account.email,
      } as any);

      if (existingError) {
        console.error(`❌ Failed to check existing user for ${account.email}:`, existingError.message);
      } else if (existingUser?.users?.length) {
        console.log(`ℹ️ Auth user already exists for ${account.email}, skipping auth creation.`);
      }

      const { data: authData, error: authError } = await supabase.auth.admin.createUser({
        email: account.email,
        password: DEMO_PASSWORD,
        email_confirm: true,
        user_metadata: {
          role: account.role,
          name_en: account.name_en,
        },
      });

      if (authError) {
        console.error(`❌ Failed to create auth user for ${account.email}:`, authError.message);
        continue;
      }

      const userId = authData.user!.id;

      const { error: userError } = await supabase.from('users').upsert(
        {
          id: userId,
          nursery_id: account.nursery_id,
          role: account.role,
          name_ar: account.name_ar,
          name_en: account.name_en,
          email: account.email,
          phone: account.phone,
          status: 'active',
          language_pref: 'en',
          department: account.department ?? null,
        },
        { onConflict: 'id' },
      );

      if (userError) {
        console.error(`❌ Failed to create user record for ${account.email}:`, userError.message);
        continue;
      }

      console.log(`✅ Created: ${account.email} (${account.role})`);
    } catch (error) {
      console.error(`❌ Error creating ${account.email}:`, error);
    }
  }

  console.log('\n✅ Demo accounts created successfully!');
  console.log('\nCredentials:');
  console.log('Email: demo-xo-admin@xonursery.com | Role: XO Super Admin');
  console.log('Email: demo-branch-admin@xonursery.com | Role: Branch Admin');
  console.log('Email: demo-manager@xonursery.com | Role: Manager (department: finance)');
  console.log('Email: demo-manager-hr@xonursery.com | Role: Manager (department: hr)');
  console.log('Email: demo-teacher@xonursery.com | Role: Teacher');
  console.log('Email: demo-parent@xonursery.com | Role: Parent');
  console.log(`Password (all): ${DEMO_PASSWORD}`);
}

void createDemoAccounts();

