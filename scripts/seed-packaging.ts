import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

dotenv.config();

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || '';
const SUPABASE_SERVICE_ROLE_KEY = process.env.VITE_SUPABASE_ANON_KEY || '';

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Missing Supabase credentials in .env');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

function getTodayStr() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

async function main() {
  try {
    console.log('Seeding data for attendance packaging test...');

    // 1. Get an active nursery
    const { data: nurseries, error: nurseryErr } = await supabase
      .from('nurseries')
      .select('id')
      .limit(1);

    if (nurseryErr || !nurseries || nurseries.length === 0) {
      console.error('No nurseries found');
      return;
    }
    const nurseryId = nurseries[0].id;
    console.log(`Using nursery_id: ${nurseryId}`);

    // 2. Create a test class with capacity
    const classId = crypto.randomUUID();
    const { error: classErr } = await supabase
      .from('classes')
      .insert({
        id: classId,
        nursery_id: nurseryId,
        name_ar: 'فصل الاختبار',
        name_en: 'Test Class (Packaging)',
        capacity: 2,
      });
    
    if (classErr) {
      console.error('Error creating class:', classErr);
    } else {
      console.log('Created class:', classId);
    }

    // 3. Create two children (one with packaging, one without)
    const child1Id = crypto.randomUUID();
    const child2Id = crypto.randomUUID();
    const child3Id = crypto.randomUUID();

    const childrenData = [
      {
        id: child1Id,
        nursery_id: nurseryId,
        full_name_ar: 'طفل مسبق الدفع',
        full_name_en: 'Prepaid Child',
        class_id: classId,
        status: 'active',
        enrollment_extended_json: { has_prepaid_extra_hours: true },
        dob: '2020-01-01',
        photo_privacy_restricted: false
      },
      {
        id: child2Id,
        nursery_id: nurseryId,
        full_name_ar: 'طفل عادي',
        full_name_en: 'Standard Child',
        class_id: classId,
        status: 'active',
        enrollment_extended_json: { has_prepaid_extra_hours: false },
        dob: '2020-01-01',
        photo_privacy_restricted: false
      },
      {
        id: child3Id,
        nursery_id: nurseryId,
        full_name_ar: 'طفل غائب',
        full_name_en: 'Absent Child',
        class_id: classId,
        status: 'active',
        enrollment_extended_json: {},
        dob: '2020-01-01',
        photo_privacy_restricted: false
      }
    ];

    const { error: childrenErr } = await supabase
      .from('children')
      .insert(childrenData);

    if (childrenErr) {
      console.error('Error creating children:', childrenErr);
    } else {
      console.log('Created test children');
    }

    // 4. Create attendance records for today (still in nursery, early check-in)
    const todayStr = getTodayStr();
    
    // Check in a long time ago so they are definitely past the standard end time
    const checkInTime = new Date();
    checkInTime.setHours(7, 0, 0, 0);

    const attData = [
      {
        child_id: child1Id,
        attendance_date: todayStr,
        check_in: checkInTime.toISOString(),
      },
      {
        child_id: child2Id,
        attendance_date: todayStr,
        check_in: checkInTime.toISOString(),
      }
    ];

    const { error: attErr } = await supabase
      .from('attendance_records')
      .upsert(attData, { onConflict: 'child_id,attendance_date' });

    if (attErr) {
      console.error('Error creating attendance records:', attErr);
    } else {
      console.log('Created attendance records for today');
    }

    // Ensure nursery settings has a standard end time in the past (e.g. 14:00) so they are currently "late"
    // (Assuming current time is after 14:00)
    const { error: settingsErr } = await supabase
      .from('nursery_settings')
      .upsert({
        nursery_id: nurseryId,
        standard_end_time: '14:00',
        late_pickup_grace_minutes: 15,
        late_pickup_fee_per_hour: 50
      }, { onConflict: 'nursery_id' });

    if (settingsErr) {
       console.error('Error updating nursery settings:', settingsErr);
    } else {
       console.log('Updated nursery settings standard_end_time to 14:00');
    }

    console.log('Successfully seeded data for packaging and attendance test!');

  } catch (err) {
    console.error(err);
  }
}

main();
