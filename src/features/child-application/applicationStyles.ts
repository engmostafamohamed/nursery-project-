/** The application form's shared class names. */
export const textareaClassName = 'min-h-[112px] w-full rounded-lg border px-3 py-2 text-sm transition focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20';
export const sectionBaseClassName = 'space-y-5 rounded-2xl border border-outline-variant bg-surface p-5 shadow-sm';
export const nestedCardClassName = 'rounded-xl border border-outline-variant bg-surface p-4 shadow-sm';

export function stepCardClassName(_stepNumber?: number) {
  return sectionBaseClassName;
}
