// Reads the menu file of a period (the photo or PDF attached to the menu) with Claude and returns its
// dishes by day and meal, with suggested allergens, for the admin to check in the menu editor. Saves
// nothing: the editor saves through save_menu_period like any typed menu.
//
// Body: { nurseryId, day }  (any day of the period, as get_menu_period takes it)
// 200: { dishes: [{ day, meal, name, allergens }], dropped, unclear }
// Errors: { error: <code> } with menu_forbidden, menu_file_missing, menu_extract_* (see the app's
// fnb.extract.errors texts).
import Anthropic from 'npm:@anthropic-ai/sdk@1.8.0';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.8';

import { corsHeaders, jsonResponse } from '../_shared/http.ts';
import { menuExtractInstructions, MENU_OUTPUT_SCHEMA, MENU_SYSTEM_PROMPT, normalizeExtraction, type ExtractContext } from '../_shared/menuExtraction.ts';
import { maxDishes, MENU_FILE_TYPES, openDaysBetween, type MenuPeriod } from '../_shared/menuRules.ts';

const MODEL = Deno.env.get('ANTHROPIC_MENU_MODEL') || 'claude-opus-5-5';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DAY = /^\d{4}-\d{2}-\d{2}$/;

/** What get_menu_period returns that this function needs. */
type PeriodRow = {
  period: MenuPeriod;
  starts_on: string;
  ends_on: string;
  working_days: string[];
  can_edit: boolean;
  menu: { file_path: string | null; file_type: string | null } | null;
};

const fail = (code: string, status: number) => jsonResponse({ error: code }, status);

/** Bytes as base64, in slices so a large file does not overflow the call stack. */
function toBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
}

/** The file as the content block Claude reads: a document for a PDF, an image otherwise. */
function fileBlock(type: string, data: string): Anthropic.Beta.BetaContentBlockParam {
  if (type === 'application/pdf') return { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data } };
  const image = MENU_FILE_TYPES.find((known) => known === type && known !== 'application/pdf');
  const media = (image ?? 'image/jpeg') as Exclude<(typeof MENU_FILE_TYPES)[number], 'application/pdf'>;
  return { type: 'image', source: { type: 'base64', media_type: media, data } };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return fail('method_not_allowed', 405);

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  const apiKey = Deno.env.get('ANTHROPIC_API_KEY');
  if (!supabaseUrl || !anonKey) return fail('menu_extract_failed', 500);
  if (!apiKey) return fail('menu_extract_unavailable', 503);

  const token = req.headers.get('Authorization')?.match(/^Bearer\s+(.+)$/i)?.[1]?.trim();
  if (!token) return fail('menu_forbidden', 401);

  let body: { nurseryId?: unknown; day?: unknown };
  try {
    body = await req.json();
  } catch {
    return fail('menu_extract_bad_request', 400);
  }
  const nurseryId = typeof body.nurseryId === 'string' && UUID.test(body.nurseryId) ? body.nurseryId : null;
  const day = typeof body.day === 'string' && DAY.test(body.day) ? body.day : null;
  if (!nurseryId || !day) return fail('menu_extract_bad_request', 400);

  // Everything below runs as the signed-in user, so the menu's own rules decide who may read it.
  const db = createClient(supabaseUrl, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });

  const { data: menuData, error: menuError } = await db.rpc('get_menu_period', { p_nursery_id: nurseryId, p_day: day });
  if (menuError) return fail(menuError.message?.includes('menu_forbidden') ? 'menu_forbidden' : 'menu_extract_failed', menuError.message?.includes('menu_forbidden') ? 403 : 500);
  const period = menuData as PeriodRow;
  if (!period?.can_edit) return fail('menu_forbidden', 403);
  const filePath = period.menu?.file_path;
  const fileType = period.menu?.file_type ?? '';
  if (!filePath) return fail('menu_file_missing', 400);

  const { data: blob, error: fileError } = await db.storage.from('menu-files').download(filePath);
  if (fileError || !blob) return fail('menu_file_missing', 400);
  const data = toBase64(new Uint8Array(await blob.arrayBuffer()));

  const ctx: ExtractContext = {
    period: period.period,
    startsOn: period.starts_on,
    endsOn: period.ends_on,
    days: openDaysBetween(period.starts_on, period.ends_on, period.working_days ?? []),
    maxDishes: maxDishes(period.period),
  };
  if (!ctx.days.length) return fail('menu_extract_no_days', 400);

  const client = new Anthropic({ apiKey });
  try {
    // Streaming: a month's menu can be a long answer. `fallbacks: "default"` re-runs a declined
    // request on Anthropic's recommended fallback model instead of returning the refusal.
    const message = await client.beta.messages
      .stream({
        model: MODEL,
        max_tokens: 32000,
        betas: ['server-side-fallback-2026-07-01'],
        fallbacks: 'default',
        output_config: { effort: 'medium', format: { type: 'json_schema', schema: MENU_OUTPUT_SCHEMA } },
        system: MENU_SYSTEM_PROMPT,
        messages: [{ role: 'user', content: [fileBlock(fileType, data), { type: 'text', text: menuExtractInstructions(ctx) }] }],
      })
      .finalMessage();

    if (message.stop_reason === 'refusal') return fail('menu_extract_refused', 422);
    if (message.stop_reason === 'max_tokens') return fail('menu_extract_too_long', 422);
    const text = message.content.flatMap((block) => (block.type === 'text' ? [block.text] : [])).join('');
    let answer: unknown;
    try {
      answer = JSON.parse(text);
    } catch {
      return fail('menu_extract_unreadable', 502);
    }
    return jsonResponse(normalizeExtraction(answer, ctx));
  } catch (error) {
    if (error instanceof Anthropic.RateLimitError) return fail('menu_extract_busy', 429);
    if (error instanceof Anthropic.APIConnectionError) return fail('menu_extract_network', 502);
    if (error instanceof Anthropic.APIError) {
      console.error('menu-extract: Claude API error', error.status, error.message);
      return fail('menu_extract_failed', 502);
    }
    console.error('menu-extract: unexpected error', error);
    return fail('menu_extract_failed', 500);
  }
});
