/**
 * The colour a status or a number is shown in. The UI kit maps each tone to theme tokens
 * (StatusPill, StatTile); lib code returns a tone and never a class name.
 */
export type PillTone = 'primary' | 'success' | 'warning' | 'error' | 'neutral';
