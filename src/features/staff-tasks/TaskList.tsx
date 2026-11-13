import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { confirm } from '@/components/ui/confirm';
import { DataTable, IconAction, StatusPill, TableCard, TableEmpty, TBody, Td, Th, THead, Tr } from '@/components/ui/DataTable';
import { LoadError } from '@/components/ui/LoadError';
import { LoadingSkeleton } from '@/components/ui/LoadingSkeleton';
import { MaterialSymbol } from '@/components/ui/MaterialSymbol';
import { localName } from '@/lib/bilingualName';
import { URGENT_EVENT_DAY_KEYS } from '@/lib/eventUrgentSchedule';

import { CATEGORY_ICON, type StaffTask } from './staffTasks';
import { deleteTask, setTaskPaused, staffTaskErrorKey } from './staffTasksApi';
import { StaffTaskFormDialog } from './StaffTaskFormDialog';
import { refreshStaffTasks, useTaskClasses, useTaskList, useTaskPeople } from './useStaffTasks';

/** The tasks the admins set up: for whom, when, by what time and how they are proved; each can be changed, paused or deleted. */
export function TaskList({ nurseryId }: { nurseryId: string }) {
  const { t, i18n } = useTranslation();
  const isAr = i18n.language.startsWith('ar');
  const locale = isAr ? 'ar-EG' : 'en-GB';
  const queryClient = useQueryClient();
  const query = useTaskList(nurseryId);
  const people = useTaskPeople(nurseryId).data ?? [];
  const classes = useTaskClasses(nurseryId).data ?? [];
  const [editing, setEditing] = useState<StaffTask | 'new' | null>(null);
  const [busy, setBusy] = useState(false);

  const forWhom = (task: StaffTask) => {
    if (task.assign_to === 'teachers') return t('staffTasks.assignTo.teachers');
    if (task.assign_to === 'class_team') {
      const c = classes.find((x) => x.id === task.class_id);
      return t('staffTasks.list.classTeam', { name: c ? localName(c.name_ar, c.name_en, isAr) : '—' });
    }
    const names = task.assignee_ids.map((id) => people.find((p) => p.id === id)).filter(Boolean).map((p) => localName(p!.name_ar, p!.name_en, isAr));
    return names.length > 2 ? t('staffTasks.list.people', { names: names.slice(0, 2).join(isAr ? '، ' : ', '), count: names.length - 2 }) : names.join(isAr ? '، ' : ', ');
  };

  const when = (task: StaffTask) => {
    const time = new Date(`2000-01-01T${task.due_time}`).toLocaleTimeString(locale, { hour: 'numeric', minute: '2-digit', hour12: true });
    const repeat =
      task.repeats === 'weekly'
        ? task.days_of_week.map((d) => t(`reminders.daysShort.${URGENT_EVENT_DAY_KEYS[d]}`)).join(isAr ? '، ' : ', ')
        : task.repeats === 'monthly'
          ? t('staffTasks.list.monthly', { day: task.day_of_month })
          : task.repeats === 'once'
            ? new Date(`${task.on_date}T00:00:00`).toLocaleDateString(locale, { day: 'numeric', month: 'short', year: 'numeric' })
            : t('staffTasks.repeats.daily');
    return t('staffTasks.list.when', { repeat, time });
  };

  const act = async (work: () => Promise<unknown>, done: string) => {
    setBusy(true);
    try {
      await work();
      toast.success(done);
      await refreshStaffTasks(queryClient);
    } catch (error) {
      toast.error(t(staffTaskErrorKey(error)));
    } finally {
      setBusy(false);
    }
  };

  const remove = async (task: StaffTask) => {
    const ok = await confirm({
      title: t('staffTasks.list.deleteTitle', { task: localName(task.title_ar, task.title_en, isAr) }),
      description: t('staffTasks.list.deleteBody'),
      variant: 'danger',
    });
    if (ok) await act(() => deleteTask(task.id), t('staffTasks.list.deleted'));
  };

  const tasks = query.data ?? [];

  return (
    <>
      <TableCard
        title={t('staffTasks.list.title')}
        count={tasks.length ? String(tasks.length) : undefined}
        description={t('staffTasks.list.hint')}
        actions={
          <Button type="button" onClick={() => setEditing('new')} data-testid="staff-task-new">
            <MaterialSymbol name="add_task" size="text-base" className="me-1" />
            {t('staffTasks.list.new')}
          </Button>
        }
      >
        {query.isPending ? (
          <div className="p-4"><LoadingSkeleton /></div>
        ) : query.isError ? (
          <LoadError inset message={t('staffTasks.loadError')} onRetry={() => void query.refetch()} />
        ) : tasks.length === 0 ? (
          <TableEmpty
            icon="add_task"
            title={t('staffTasks.list.emptyTitle')}
            description={t('staffTasks.list.emptyHint')}
            action={<Button type="button" onClick={() => setEditing('new')}>{t('staffTasks.list.new')}</Button>}
          />
        ) : (
          <DataTable minWidth={820}>
            <THead>
              <Th>{t('staffTasks.list.task')}</Th>
              <Th>{t('staffTasks.list.forWhom')}</Th>
              <Th>{t('staffTasks.list.schedule')}</Th>
              <Th>{t('staffTasks.list.rules')}</Th>
              <Th align="end">{t('staffTasks.list.actions')}</Th>
            </THead>
            <TBody>
              {tasks.map((task) => (
                <Tr key={task.id} data-testid="staff-task-row">
                  <Td>
                    <div className="flex items-center gap-2">
                      <MaterialSymbol name={CATEGORY_ICON[task.category]} size="text-lg" className="shrink-0 text-primary" />
                      <span className="font-medium text-on-surface">{localName(task.title_ar, task.title_en, isAr)}</span>
                      {task.paused ? <StatusPill icon="pause_circle">{t('staffTasks.list.paused')}</StatusPill> : null}
                    </div>
                  </Td>
                  <Td>{forWhom(task)}</Td>
                  <Td className="text-on-surface-variant">{when(task)}</Td>
                  <Td>
                    <div className="flex flex-wrap gap-1.5">
                      <StatusPill icon={task.completion === 'any' ? 'group' : 'person'}>{t(`staffTasks.completion.${task.completion}`)}</StatusPill>
                      {task.photo_required ? <StatusPill icon="photo_camera">{t('staffTasks.photoNeeded')}</StatusPill> : null}
                    </div>
                  </Td>
                  <Td align="end">
                    <div className="flex justify-end gap-1">
                      <IconAction icon="edit" label={t('staffTasks.list.edit')} onClick={() => setEditing(task)} disabled={busy} />
                      <IconAction
                        icon={task.paused ? 'play_circle' : 'pause_circle'}
                        label={t(task.paused ? 'staffTasks.list.resume' : 'staffTasks.list.pause')}
                        onClick={() => void act(() => setTaskPaused(task.id, !task.paused), t(task.paused ? 'staffTasks.list.resumed' : 'staffTasks.list.pausedDone'))}
                        disabled={busy}
                      />
                      <IconAction icon="delete" label={t('staffTasks.list.delete')} onClick={() => void remove(task)} disabled={busy} danger />
                    </div>
                  </Td>
                </Tr>
              ))}
            </TBody>
          </DataTable>
        )}
      </TableCard>
      {editing ? <StaffTaskFormDialog nurseryId={nurseryId} task={editing === 'new' ? null : editing} onClose={() => setEditing(null)} /> : null}
    </>
  );
}
