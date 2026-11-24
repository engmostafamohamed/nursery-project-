/**
 * Columns for a set of choice cards (plans, packages) that follow the room the cards actually have,
 * not the screen's width. Each card keeps at least 13.5rem: a column squeezed beside a summary gets
 * two cards a row where a screen breakpoint would have put three side by side, and a phone gets one.
 * Use with `grid` and a gap.
 */
export const CHOICE_GRID_COLUMNS = '[grid-template-columns:repeat(auto-fill,minmax(min(100%,13.5rem),1fr))]';
