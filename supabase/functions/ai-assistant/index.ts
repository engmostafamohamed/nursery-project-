import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.8';

import { corsHeaders, jsonResponse } from '../_shared/http.ts';

type ContextPayload = {
  role: string;
  nurseryId: string | null;
  currentPage: string;
  language: string;
  recentActivity: string[];
  unreadNotifications: number;
  pendingApprovals: number | null;
};

type ToolDef = {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
};

const XO_SCOPE = `You are the XO Nursery platform assistant. Help ONLY with this app: children, attendance, events, permissions, media, broadcasts, daily reports, staff, invoices, settings, and in-app navigation.

REFUSE and briefly decline: politics, news, homework/school tutoring, general coding, entertainment, personal advice, medical diagnosis, or any topic outside nursery operations.

Match the user's language (ar vs en) from context when possible. Be concise. Use tools when the user wants navigation or an allowed action.`;

function buildSystemPrompt(context: ContextPayload): string {
  const ctx = JSON.stringify({
    role: context.role,
    nurseryId: context.nurseryId,
    currentPage: context.currentPage,
    language: context.language,
    recentActivity: context.recentActivity.slice(0, 8),
    unreadNotifications: context.unreadNotifications,
    pendingApprovals: context.pendingApprovals,
  });
  return `${XO_SCOPE}\n\nContext (JSON): ${ctx}`;
}

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

  let body: {
    messages?: unknown;
    context?: ContextPayload;
    tools?: ToolDef[];
  };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return jsonResponse({ error: 'Invalid JSON' }, 400);
  }

  const messages = body.messages;
  if (!Array.isArray(messages) || messages.length === 0) {
    return jsonResponse({ error: 'messages array required' }, 400);
  }

  const context: ContextPayload = body.context ?? {
    role: 'unknown',
    nurseryId: null,
    currentPage: '',
    language: 'en',
    recentActivity: [],
    unreadNotifications: 0,
    pendingApprovals: null,
  };

  const tools = Array.isArray(body.tools) ? body.tools : [];
  const model = Deno.env.get('ANTHROPIC_MODEL') ?? 'claude-3-5-haiku-20241022';

  const anthropicBody: Record<string, unknown> = {
    model,
    max_tokens: 2048,
    system: buildSystemPrompt(context),
    messages,
  };
  if (tools.length > 0) {
    anthropicBody.tools = tools.map((t) => ({
      name: t.name,
      description: t.description,
      input_schema: t.input_schema,
    }));
  }

  const acRes = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': anthropicKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify(anthropicBody),
  });

  const acText = await acRes.text();
  if (!acRes.ok) {
    let errMsg = `anthropic_http_${acRes.status}`;
    try {
      const errJson = JSON.parse(acText) as { error?: { message?: string } };
      if (errJson?.error?.message) errMsg = errJson.error.message.slice(0, 200);
    } catch {
      /* ignore */
    }
    return jsonResponse({ error: errMsg }, 502);
  }

  let acJson: {
    content?: unknown;
    stop_reason?: string;
    role?: string;
  };
  try {
    acJson = JSON.parse(acText) as typeof acJson;
  } catch {
    return jsonResponse({ error: 'Invalid Anthropic response' }, 502);
  }

  return jsonResponse({
    message: {
      role: 'assistant',
      content: acJson.content ?? '',
    },
    stop_reason: acJson.stop_reason,
  });
});
