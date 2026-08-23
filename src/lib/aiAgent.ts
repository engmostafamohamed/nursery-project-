import type { AIContextPayload } from '@/lib/aiContext';
import { resolveAccessTokenForAiEdgeFetch } from '@/lib/aiAgentSession';
import { AI_TOOLS } from '@/lib/aiTools';

const QUEUE_KEY = 'xo-ai-offline-queue-v1';
const MAX_QUEUE = 5;

export type AiChatRole = 'user' | 'assistant';

export interface AiChatMessage {
  role: AiChatRole;
  content: string;
}

interface ToolUseBlock {
  type: 'tool_use';
  id: string;
  name: string;
  input: Record<string, unknown>;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

type InvokeRoundResult =
  | { kind: 'ok'; data: unknown }
  | { kind: 'http'; status: number; errText: string }
  | { kind: 'transport' }
  | { kind: 'aborted' };

/** Retries only on transport failure. HTTP 4xx/5xx returns immediately. Uses explicit fetch + anon apikey + JWT (Edge getUser). */
async function fetchAiAssistantWithRetry(
  body: unknown,
  signal?: AbortSignal,
): Promise<InvokeRoundResult> {
  let token: string;
  try {
    token = (await resolveAccessTokenForAiEdgeFetch()).trim();
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'session_refresh_failed';
    console.error('❌ AI Assistant auth resolve failed:', msg);
    return { kind: 'http', status: 401, errText: msg };
  }
  if (!token) {
    return { kind: 'http', status: 401, errText: 'missing_access_token' };
  }
  const base = import.meta.env.VITE_SUPABASE_URL.replace(/\/$/, '');
  const edgeFunctionUrl = `${base}/functions/v1/ai-assistant`;
  const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;
  const anon = typeof SUPABASE_ANON_KEY === 'string' ? SUPABASE_ANON_KEY.trim() : '';
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
    apikey: anon,
  };
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const res = await fetch(edgeFunctionUrl, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
        signal,
      });
      if (!res.ok) {
        const errText = await res.text().catch(() => '');
        return { kind: 'http', status: res.status, errText };
      }
      const data: unknown = await res.json().catch(() => ({}));
      return { kind: 'ok', data };
    } catch (e) {
      if (signal?.aborted || (e instanceof Error && e.name === 'AbortError')) {
        return { kind: 'aborted' };
      }
    }
    await sleep(300 * 2 ** attempt);
  }
  return { kind: 'transport' };
}

function extractToolUses(content: unknown): { text: string; tools: ToolUseBlock[] } {
  const tools: ToolUseBlock[] = [];
  let text = '';
  if (typeof content === 'string') {
    return { text: content, tools: [] };
  }
  if (!Array.isArray(content)) {
    return { text: '', tools: [] };
  }
  for (const block of content as Record<string, unknown>[]) {
    if (block?.type === 'text' && typeof block.text === 'string') {
      text += block.text;
    }
    if (block?.type === 'tool_use' && typeof block.name === 'string' && typeof block.id === 'string') {
      const input = (block.input as Record<string, unknown>) ?? {};
      tools.push({ type: 'tool_use', id: block.id, name: block.name, input });
    }
  }
  return { text, tools };
}

function parseAssistantPayload(data: unknown): { content: unknown; stopReason?: string } {
  if (!data || typeof data !== 'object') return { content: '' };
  const d = data as Record<string, unknown>;
  if (d.message && typeof d.message === 'object') {
    const m = d.message as Record<string, unknown>;
    return { content: m.content ?? '', stopReason: typeof d.stop_reason === 'string' ? d.stop_reason : undefined };
  }
  if ('content' in d) return { content: d.content, stopReason: typeof d.stop_reason === 'string' ? d.stop_reason : undefined };
  if (typeof d.reply === 'string') return { content: d.reply };
  if (typeof d.text === 'string') return { content: d.text };
  return { content: '' };
}

export function enqueueOfflineAiRequest(payload: unknown): void {
  if (typeof globalThis === 'undefined' || !('localStorage' in globalThis)) return;
  try {
    const raw = globalThis.localStorage.getItem(QUEUE_KEY);
    const q: unknown[] = raw ? (JSON.parse(raw) as unknown[]) : [];
    q.push(payload);
    while (q.length > MAX_QUEUE) q.shift();
    globalThis.localStorage.setItem(QUEUE_KEY, JSON.stringify(q));
  } catch {
    /* ignore */
  }
}

export function drainOfflineAiQueue(): unknown[] {
  if (typeof globalThis === 'undefined' || !('localStorage' in globalThis)) return [];
  try {
    const raw = globalThis.localStorage.getItem(QUEUE_KEY);
    globalThis.localStorage.removeItem(QUEUE_KEY);
    if (!raw) return [];
    const q = JSON.parse(raw) as unknown[];
    return Array.isArray(q) ? q : [];
  } catch {
    return [];
  }
}

/**
 * Sends messages + context to the Edge Function, executes tool rounds client-side via onToolUse.
 */
export async function runAiAssistantSession(input: {
  messages: AiChatMessage[];
  context: AIContextPayload;
  /** Required: must match the JWT used for Edge auth. Omitting it lets Supabase send anon as Bearer when session is briefly unset (401). */
  accessToken: string;
  onToolUse: (name: string, toolInput: Record<string, unknown>) => Promise<string>;
  signal?: AbortSignal;
}): Promise<{ assistantText: string; rawError?: string; errorHttpStatus?: number }> {
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
  if (typeof supabaseUrl !== 'string' || !supabaseUrl.trim()) {
    return { assistantText: '', rawError: 'missing_vite_supabase_url' };
  }
  if (typeof anonKey !== 'string' || !anonKey.trim()) {
    return { assistantText: '', rawError: 'missing_vite_anon_key' };
  }
  if (!input.accessToken.trim()) {
    return { assistantText: '', rawError: 'missing_access_token' };
  }

  const working: Record<string, unknown>[] = input.messages.map((m) => ({
    role: m.role,
    content: m.content,
  }));

  let lastText = '';

  for (let round = 0; round < 8; round += 1) {
    const roundResult = await fetchAiAssistantWithRetry(
      { messages: working, context: input.context, tools: AI_TOOLS },
      input.signal,
    );
    if (roundResult.kind === 'aborted') {
      return { assistantText: lastText, rawError: 'ai_aborted' };
    }
    if (roundResult.kind === 'transport') {
      return { assistantText: lastText, rawError: 'fetch_failed' };
    }
    if (roundResult.kind === 'http') {
      return {
        assistantText: lastText,
        rawError: roundResult.errText || `http_${roundResult.status}`,
        errorHttpStatus: roundResult.status,
      };
    }
    const data: unknown = roundResult.data;
    const { content } = parseAssistantPayload(data);
    const { text, tools } = extractToolUses(content);
    lastText = text || lastText;

    if (!tools.length) {
      return { assistantText: lastText || text };
    }

    working.push({ role: 'assistant', content });

    const results = await Promise.all(
      tools.map(async (tu) => {
        const result = await input.onToolUse(tu.name, tu.input);
        return { type: 'tool_result', tool_use_id: tu.id, content: result };
      }),
    );

    working.push({
      role: 'user',
      content: results,
    });
  }

  return { assistantText: lastText || '', rawError: 'max_tool_rounds' };
}
