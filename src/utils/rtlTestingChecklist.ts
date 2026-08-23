/**
 * Manual RTL (Arabic) QA checklist for Wave 6 — run after layout or i18n changes.
 * Not imported at runtime; reference when testing.
 */
export const rtlTestingChecklist = [
  'Root: html dir=rtl, lang=ar; no horizontal overflow at 375px',
  'Admin: sidebar nav icons + labels; search field padding; active border on correct edge',
  'Parent/Teacher: bottom nav tap targets; badge positions',
  'Dialogs: close control reachable; footer button order in RTL',
  'Forms: labels align start; inputs text-align start',
  'Tables: first column on correct side; numeric columns still readable',
] as const;
