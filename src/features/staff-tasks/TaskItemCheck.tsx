import { useQueryClient } from '@tanstack/react-query';
import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { StatusPill } from '@/components/ui/DataTable';
import { Input } from '@/components/ui/input';
import { MaterialSymbol } from '@/components/ui/MaterialSymbol';
import { TONE_TINT } from '@/components/ui/toneClasses';
import { localName } from '@/lib/bilingualName';
import { cn } from '@/lib/utils';

import { CATEGORY_ICON, itemState } from './staffTasks';
import { completeItem, reopenItem, staffTaskErrorKey, uploadProof, type BoardItem } from './staffTasksApi';
import { refreshStaffTasks } from './useStaffTasks';

/**
 * One item of a person's checklist: what to do and by when, and the check. A task that asks for a
 * photo opens the camera first; a note can go with it. A check made by mistake can be undone the
 * same day; with "one is enough", an item someone else did shows who.
 */
export function TaskItemCheck({ item, userId, today, compact = false }: {
  item: BoardItem;
  userId: string;
  today: string;
  compact?: boolean;
}) {
  const { t, i18n } = useTranslation();
  const queryClient = useQueryClient();
  const isAr = i18n.language.startsWith('ar');
  const locale = isAr ? 'ar-EG' : 'en-GB';
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState('');
  const photoInput = useRef<HTMLInputElement>(null);

  const state = itemState(item);
  const title = localName(item.task.title_ar, item.task.title_en, isAr);
  const time = new Date(item.due_at).toLocaleTimeString(locale, { hour: 'numeric', minute: '2-digit', hour12: true });
  const earlierDay = item.due_on !== today;
  const doneByOther = item.status === 'done' && item.done_by && item.done_by !== userId;

  const finish = async (photo: File | null) => {
    setBusy(true);
    try {
      const path = photo ? await uploadProof(item.nursery_id, item.id, photo) : null;
      const { covered } = await completeItem(item.id, note.trim() || null, path);
      toast.success(t('staffTasks.check.done', { task: title }), covered ? { description: t('staffTasks.check.covered', { count: covered }) } : undefined);
      setOpen(false);
      setNote('');
      await refreshStaffTasks(queryClient);
    } catch (error) {
      toast.error(t(staffTaskErrorKey(error)));
    } finally {
      setBusy(false);
    }
  };

  const undo = async () => {
    setBusy(true);
    try {
      await reopenItem(item.id);
      toast.success(t('staffTasks.check.undone'));
      await refreshStaffTasks(queryClient);
    } catch (error) {
      toast.error(t(staffTaskErrorKey(error)));
    } finally {
      setBusy(false);
    }
  };

  const check = () => (item.task.photo_required ? photoInput.current?.click() : void finish(null));

  return (
    <li
      className={cn('rounded-xl border bg-surface p-3 transition', state === 'late' ? 'border-error/40' : 'border-outline-variant', state === 'done' && 'bg-surface-container-lowest')}
      data-testid="task-item"
    >
      <div className="flex items-start gap-3">
        <span className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-lg', state === 'done' ? TONE_TINT.success : TONE_TINT.primary)}>
          <MaterialSymbol name={state === 'done' ? 'task_alt' : CATEGORY_ICON[item.task.category]} size="text-xl" />
        </span>
        <button type="button" className="min-w-0 flex-1 text-start" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
          <span className={cn('block break-words text-sm font-semibold', state === 'done' ? 'text-on-surface-variant line-through' : 'text-on-surface')}>{title}</span>
          <span className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-on-surface-variant">
            {state === 'late' ? (
              <StatusPill tone="error" icon="schedule">{t('staffTasks.state.lateBy', { time })}</StatusPill>
            ) : state === 'done' ? (
              <StatusPill tone="success" icon="check">
                {doneByOther
                  ? t('staffTasks.state.doneBy', { name: localName(item.doer?.name_ar, item.doer?.name_en, isAr) })
                  : t('staffTasks.state.doneAt', { time: new Date(item.done_at ?? item.due_at).toLocaleTimeString(locale, { hour: 'numeric', minute: '2-digit', hour12: true }) })}
              </StatusPill>
            ) : (
              <span className="inline-flex items-center gap-1">
                <MaterialSymbol name="schedule" size="text-sm" />
                {t('staffTasks.state.by', { time })}
              </span>
            )}
            {earlierDay ? <StatusPill tone="warning" icon="history">{new Date(`${item.due_on}T00:00:00`).toLocaleDateString(locale, { weekday: 'short', day: 'numeric', month: 'short' })}</StatusPill> : null}
            {item.task.photo_required ? <StatusPill icon="photo_camera">{t('staffTasks.photoNeeded')}</StatusPill> : null}
            {item.task.completion === 'any' ? <StatusPill icon="group">{t('staffTasks.oneIsEnough')}</StatusPill> : null}
          </span>
        </button>
        {state === 'done' ? (
          !doneByOther && item.due_on === today ? (
            <Button type="button" variant="ghost" size="sm" disabled={busy} onClick={() => void undo()} className="shrink-0 text-on-surface-variant">
              <MaterialSymbol name="undo" size="text-base" className="me-1" />
              {t('staffTasks.check.undo')}
            </Button>
          ) : null
        ) : (
          <Button type="button" size={compact ? 'sm' : 'default'} disabled={busy} onClick={check} className="shrink-0" data-testid="task-item-check">
            <MaterialSymbol name={busy ? 'progress_activity' : item.task.photo_required ? 'photo_camera' : 'check'} size="text-base" className={cn('me-1', busy && 'animate-spin')} />
            {item.task.photo_required ? t('staffTasks.check.photoAndDone') : t('staffTasks.check.markDone')}
          </Button>
        )}
      </div>
      {open ? (
        <div className="mt-3 space-y-2 border-t border-outline-variant pt-3">
          {item.task.instructions ? <p className="whitespace-pre-line text-sm text-on-surface-variant">{item.task.instructions}</p> : null}
          {item.status === 'done' && item.note ? <p className="text-sm text-on-surface">{t('staffTasks.check.yourNote', { note: item.note })}</p> : null}
          {item.status !== 'done' ? (
            <Input value={note} maxLength={500} placeholder={t('staffTasks.check.notePlaceholder')} onChange={(e) => setNote(e.target.value)} aria-label={t('staffTasks.check.noteLabel')} />
          ) : null}
        </div>
      ) : null}
      <input
        ref={photoInput}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        capture="environment"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = '';
          if (file) void finish(file);
        }}
      />
    </li>
  );
}
