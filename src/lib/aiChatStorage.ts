import type { AiChatMessage } from '@/lib/aiAgent';

const CHAT_PREFIX = 'xo-ai-chat-v1-';

export function loadAiChatMessages(userId: string): AiChatMessage[] {
  try {
    const raw = localStorage.getItem(CHAT_PREFIX + userId);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return (parsed as AiChatMessage[]).slice(-50);
  } catch {
    return [];
  }
}

export function saveAiChatMessages(userId: string, messages: AiChatMessage[]): void {
  try {
    localStorage.setItem(CHAT_PREFIX + userId, JSON.stringify(messages.slice(-50)));
  } catch {
    /* ignore */
  }
}
