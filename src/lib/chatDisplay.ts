import type { PillTone } from '@/lib/tones';

const AVATAR_TONES: PillTone[] = ['primary', 'success', 'warning', 'error'];

/** The same person always gets the same avatar colour, from their id. */
export function avatarTone(id: string): PillTone {
  let hash = 0;
  for (const char of id) hash = (hash * 31 + char.charCodeAt(0)) | 0;
  return AVATAR_TONES[Math.abs(hash) % AVATAR_TONES.length];
}

const DAY_MS = 86_400_000;

/**
 * When a conversation last moved, the way chat apps list it: the time for today, "Yesterday",
 * the weekday within the last week, and the short date before that.
 */
export function chatListTime(iso: string, options: { locale: string; yesterday: string; now?: Date }): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  const now = options.now ?? new Date();
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (date.toDateString() === now.toDateString()) {
    return new Intl.DateTimeFormat(options.locale, { hour: 'numeric', minute: '2-digit', hour12: true }).format(date);
  }
  if (date.toDateString() === yesterday.toDateString()) return options.yesterday;
  if (now.getTime() - date.getTime() < 6 * DAY_MS) {
    return new Intl.DateTimeFormat(options.locale, { weekday: 'long' }).format(date);
  }
  return new Intl.DateTimeFormat(options.locale, { day: 'numeric', month: 'numeric', year: '2-digit' }).format(date);
}
