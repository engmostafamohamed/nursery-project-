import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.8';
import { corsHeaders, jsonResponse } from '../_shared/http.ts';

interface ColumnMapping {
  excelColumn: string;
  dbTable: string;
  dbColumn: string;
  confidence: number;
  transformLogic?: string;
}

interface MappingResponse {
  mappings: ColumnMapping[];
  warnings: string[];
  suggestions: string[];
}


const XO_DATABASE_SCHEMA = `
You are mapping Excel columns from a standard Egyptian nursery enrollment form to the XO Platform database.

**CRITICAL: MULTI-TENANT ARCHITECTURE**
- Every child MUST have nursery_id (provided by the admin)
- Every parent user MUST have nursery_id (same as admin's nursery)
- All related records inherit isolation via foreign keys

**DATABASE TABLES:**

**children** (core table):
- full_name_ar, full_name_en (TEXT) - Arabic and English full names
- nickname (TEXT) - Daily use name
- dob (DATE) - Date of birth
- nationality (TEXT)
- home_address (TEXT) - Family home address (single source of truth)
- nursery_id (UUID) - REQUIRED for multi-tenant isolation
- class_id (UUID) - Which class/room
- enrollment_department (TEXT) - English | French | Arabic dept
- school_preference (TEXT) - international | national | bilingual
- school_admission_plan (TEXT) - Target grade (KG1, KG2, Preschool)
- nap_preference (TEXT) - same_as_nursery | custom | no_nap
- max_nap_duration_minutes (INTEGER)
- siblings_info_json (JSONB) - Array: [{"name": "Ahmed", "age": 4, "relationship": "brother"}]
- referral_source (TEXT) - website | friend_family | social_media | sibling_at_nursery | other
- toilet_training_status (TEXT) - not_started | in_progress | completed

**users** (parent accounts):
- name_ar, name_en (TEXT)
- email (TEXT)
- phone (TEXT)
- role (ENUM) - Will be 'parent'
- nursery_id (UUID) - REQUIRED for multi-tenant isolation

**parent_children** (junction table):
- parent_id (UUID) - References users
- child_id (UUID) - References children
- parent_type (TEXT) - father | mother | guardian
- occupation (TEXT)
- workplace (TEXT)
- work_address (TEXT)
- national_id (TEXT)
- parent_id_photo_url (TEXT) - URL to national ID photo
- marital_status (TEXT) - married | divorced | separated | widowed | single
- is_primary (BOOLEAN)
- is_emergency_contact (BOOLEAN)

**child_dietary_preferences**:
- child_id (UUID)
- usual_arrival_time (TIME)
- eats_breakfast_at_home (BOOLEAN)
- eats_nursery_meals (BOOLEAN)
- food_allergies_details (TEXT)
- sends_extra_snacks (BOOLEAN)
- extra_snack_type (TEXT) - optional | required | none
- leftover_snack_action (TEXT) - return_with_child | discard | donate
- meal_appetite_preference (TEXT) - all_required | some_allowed | child_choice
- sends_vitamins_daily (BOOLEAN)
- vitamin_details (TEXT)
- preferred_meal_times_json (JSONB)
- water_preference (TEXT) - mineral_with_approval | mineral_without_approval | home_sent_only
- extra_meal_policy (TEXT) - ask_parent_first | give_snack_without_approval | give_meal_without_approval | never_give_extra

**child_diaper_care**:
- child_id (UUID)
- diaper_supply_method (TEXT) - stock | daily_sent | not_applicable
- diapers_per_day (INTEGER)
- rash_cream_usage (TEXT) - every_change | if_rash | never
- change_schedule (TEXT) - regular_times | as_needed
- change_frequency_hours (INTEGER)
- notes (TEXT)

**authorized_pickups** (emergency contacts):
- child_id (UUID)
- name (TEXT)
- phone (TEXT)
- relation (TEXT) - father | mother | uncle | aunt | grandparent | other
- photo_url (TEXT) - URL to ID photo
- can_pickup (BOOLEAN)
- notes (TEXT)

**child_documents**:
- child_id (UUID)
- document_type (TEXT) - birth_certificate | vaccination_card | medical_report | other
- file_url (TEXT)
- uploaded_at (TIMESTAMPTZ)

**applications**:
- child_id (UUID)
- health_medication_policy_accepted (BOOLEAN)
- financial_agreement_accepted (BOOLEAN)
- policies_procedures_accepted (BOOLEAN)
- information_accuracy_confirmed (BOOLEAN)
- emergency_medications_approved_json (JSONB) - Array of medication names ["Cetal", "Brufen"]
- consent_accepted_at (TIMESTAMPTZ)

**CONFIDENCE SCORING:**
- 100%: Exact match (e.g., "Child's First Name" → children.full_name_en with transform)
- 90-99%: Very likely match, minor ambiguity
- 80-89%: Probable match, needs user review
- 70-79%: Uncertain, user must verify
- <70%: Cannot map confidently, mark as unmapped

**TRANSFORM LOGIC EXAMPLES:**
- "combine_first_middle_last" - Combine 3 name columns into full_name_en
- "parse_name_and_relation" - Extract name + relationship from "Ahmed (Father)"
- "parse_time" - Convert "09:00:00" string to TIME
- "parse_boolean" - Convert "Yes/No" to true/false
- "parse_enum" - Map "Married" → married, "Stock" → stock
- "comma_separated_array" - Split "Cetal, Brufen, Mebo" → ["Cetal", "Brufen", "Mebo"]
- "google_drive_url" - Extract Google Drive file URL as-is

**SPECIAL CASES:**
- Emergency contacts ARE authorized pickups (same people, different context)
- Home address is at CHILD level (children.home_address) NOT parent level
- Siblings info goes in siblings_info_json as array of objects
- Parent ID photos go in parent_children.parent_id_photo_url
- Pickup person photos go in authorized_pickups.photo_url
`;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }
  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, 405);
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  const anthropicKey = Deno.env.get('ANTHROPIC_API_KEY');

  if (!supabaseUrl || !anonKey) {
    return jsonResponse({ error: 'Server misconfiguration' }, 500);
  }
  if (!anthropicKey) {
    return jsonResponse({ error: 'AI is not configured (missing ANTHROPIC_API_KEY)' }, 503);
  }

  const authHeader = req.headers.get('Authorization');
  const bearer = authHeader?.match(/^Bearer\s+(.+)$/i);
  const accessToken = bearer?.[1]?.trim();
  if (!accessToken) {
    return jsonResponse({ error: 'Unauthorized' }, 401);
  }

  const userClient = createClient(supabaseUrl, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: authData, error: authErr } = await userClient.auth.getUser(accessToken);
  if (authErr || !authData.user) {
    return jsonResponse({ error: 'Unauthorized' }, 401);
  }

  const serviceClient = createClient(
    supabaseUrl,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
  );

  const { data: userData, error: userErr } = await serviceClient
    .from('users')
    .select('nursery_id, role')
    .eq('id', authData.user.id)
    .single();

  if (userErr || !userData) {
    return jsonResponse({ error: 'User not found' }, 404);
  }

  if (userData.role !== 'branch_admin') {
    return jsonResponse({ error: 'Only Branch Admins can import children' }, 403);
  }

  if (!userData.nursery_id) {
    return jsonResponse({ error: 'Admin has no nursery assigned' }, 400);
  }


  let body: {
    fileData: Record<string, unknown>[];
    fileName: string;
  };
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: 'Invalid JSON' }, 400);
  }

  const { fileData, fileName } = body;

  if (!Array.isArray(fileData) || fileData.length === 0) {
    return jsonResponse({ error: 'fileData must be non-empty array' }, 400);
  }


  const columns = Object.keys(fileData[0] || {});
  const sampleRows = fileData.slice(0, 3);

  const systemPrompt = XO_DATABASE_SCHEMA + `

**TASK:**
Analyze the Excel columns and sample data below. Return a JSON object with this structure:

{
  "mappings": [
    {
      "excelColumn": "Child's First Name",
      "dbTable": "children",
      "dbColumn": "full_name_en",
      "confidence": 100,
      "transformLogic": "combine_first_middle_last"
    }
  ],
  "warnings": ["Column 'XYZ' could not be mapped confidently"],
  "suggestions": ["Consider mapping 'ABC' to 'DEF'"]
}

Return ONLY valid JSON, no markdown, no explanation.
`;

  const userPrompt = `Excel file: "${fileName}"

Columns (${columns.length}):
${columns.map((c, i) => `${i + 1}. ${c}`).join('\n')}

Sample data (first 3 rows):
${JSON.stringify(sampleRows, null, 2)}

Map these columns to XO database schema.`;

  try {
    const anthropicRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': anthropicKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 4000,
        system: systemPrompt,
        messages: [{ role: 'user', content: userPrompt }],
      }),
    });

    const anthropicText = await anthropicRes.text();

    if (!anthropicRes.ok) {
      console.error('Anthropic API error:', anthropicText);
      return jsonResponse({ error: 'AI mapping failed' }, 502);
    }

    let responseText = '';
    try {
      const anthropicJson = JSON.parse(anthropicText);
      responseText = anthropicJson.content?.[0]?.text || '';
    } catch {
      responseText = '';
    }

    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    let aiMapping: MappingResponse = { mappings: [], warnings: ['Failed to parse AI response'], suggestions: [] };
    if (jsonMatch) {
      try {
        aiMapping = JSON.parse(jsonMatch[0]) as MappingResponse;
      } catch {
        aiMapping = { mappings: [], warnings: ['Invalid AI JSON response format'], suggestions: [] };
      }
    }


    const avgConfidence = aiMapping.mappings.length > 0
      ? Math.round(
          aiMapping.mappings.reduce((sum, m) => sum + m.confidence, 0) / aiMapping.mappings.length
        )
      : 0;
    const normalizedConfidenceScore = Math.min(
      0.99,
      Math.max(0, Number((avgConfidence / 100).toFixed(2))),
    );



    const { data: importJob, error: jobErr } = await serviceClient
      .from('import_jobs')
      .insert({
        nursery_id: userData.nursery_id,
        initiated_by: authData.user.id,
        import_type: 'children',
        file_name: fileName,
        // Keep compatibility with legacy NOT NULL schema where file_url is required.
        file_url: `inline://excel/${encodeURIComponent(fileName)}`,
        file_data: fileData,
        ai_detected_format: aiMapping,
        ai_confidence_score: normalizedConfidenceScore,
        status: 'mapping_review',
        total_rows: fileData.length,
        created_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (jobErr) {
      console.error('Failed to create import job:', jobErr);
      return jsonResponse(
        {
          error: `Failed to create import job: ${jobErr.message}`,
          debug: {
            code: jobErr.code ?? null,
            details: jobErr.details ?? null,
            hint: jobErr.hint ?? null,
          },
        },
        500,
      );
    }

    return jsonResponse({
      success: true,
      importJobId: importJob.id,
      mapping: aiMapping,
      totalRows: fileData.length,
      avgConfidence,
    });

  } catch (error) {
    console.error('AI Mapping Error:', error);
    return jsonResponse(
      {
        error: `Internal server error: ${error instanceof Error ? error.message : String(error)}`,
      },
      500,
    );
  }
});
