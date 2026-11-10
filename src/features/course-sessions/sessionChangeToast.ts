import type { TFunction } from 'i18next';
import { toast } from 'sonner';

import { changeNotes, type SessionChange } from './courseSessions';

/** The success message of a cancel or restore, with what it also did (families told, days billed again). */
export function toastSessionChange(t: TFunction, title: string, change: SessionChange): void {
  const description = changeNotes(change).map((note) => t(note.key, { count: note.count })).join(' ');
  toast.success(title, description ? { description } : undefined);
}
