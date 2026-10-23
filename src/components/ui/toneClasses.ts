import type { PillTone } from '@/lib/tones';

/**
 * Tinted background + matching text for icon tiles, date blocks and avatars, per tone.
 * One map for the whole UI, so a tone looks the same on every screen and theme.
 */
export const TONE_TINT: Record<PillTone, string> = {
  primary: 'bg-primary/10 text-primary',
  success: 'bg-success/10 text-success',
  warning: 'bg-warning/10 text-warning',
  error: 'bg-error/10 text-error',
  neutral: 'bg-surface-high text-on-surface-variant',
};
