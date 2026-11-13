import { useQueryClient } from '@tanstack/react-query';
import { useMemo, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { ChoiceCards } from '@/components/ui/ChoiceCards';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { SearchInput } from '@/components/ui/FilterBar';
import { FieldError, invalidFieldClass } from '@/components/ui/FieldError';
import { FormField, FormProblem } from '@/components/ui/FormField';
import { Input } from '@/components/ui/input';
import { MaterialSymbol } from '@/components/ui/MaterialSymbol';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { localName } from '@/lib/bilingualName';
import { URGENT_EVENT_DAY_KEYS } from '@/lib/eventUrgentSchedule';
import { toggled } from '@/lib/listToggle';
import { cn } from '@/lib/utils';

import { CATEGORY_ICON, dayKey, draftOf, newTaskDraft, TASK_CATEGORIES, taskArgs, taskProblems, type StaffTask, type TaskDraft } from './staffTasks';
import { saveTask, staffTaskErrorKey } from './staffTasksApi';
import { refreshStaffTasks, useTaskClasses, useTaskPeople } from './useStaffTasks';

function Chip({ selected, onClick, children, icon }: { selected: boolean; onClick: () => void; children: ReactNode; icon?: string }) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onClick}
      className={cn(
        'inline-flex min-h-9 items-center gap-1.5 rounded-full border px-3 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30',
        selected ? 'border-primary bg-primary text-primary-foreground' : 'border-outline-variant bg-surface text-on-surface hover:border-primary/50',
      )}
    >
      {selected ? <MaterialSymbol name="check" size="text-base" /> : icon ? <MaterialSymbol name={icon} size="text-base" /> : null}
      {children}
    </button>
  );
}

function Part({ title, children }: { title: string; children: ReactNode }) {
  return (
    <fieldset className="space-y-3 rounded-xl border border-outline-variant p-4">
      <legend className="px-1 text-sm font-semibold text-on-surface">{title}</legend>
      {children}
    </fieldset>
  );
}

/**
 * A task, new or changed: what, for whom (chosen people, every teacher or a class's team), whether
 * each person does it or one is enough, whether a photo proves it, and when it comes back.
 */
export function StaffTaskFormDialog({ nurseryId, task, onClose }: { nurseryId: string; task: StaffTask | null; onClose: () => void }) {
  const { t, i18n } = useTranslation();
  const isAr = i18n.language.startsWith('ar');
  const queryClient = useQueryClient();
  const peopleQuery = useTaskPeople(nurseryId);
  const classesQuery = useTaskClasses(nurseryId);
  const [today] = useState(() => dayKey(new Date()));
  const [draft, setDraft] = useState<TaskDraft>(() => (task ? draftOf(task, isAr, today) : newTaskDraft(today)));
  const [search, setSearch] = useState('');
  const [tried, setTried] = useState(false);
  const [busy, setBusy] = useState(false);
  const [serverProblem, setServerProblem] = useState<string | null>(null);

  const problems = taskProblems(draft);
  const shown = tried ? problems : {};
  const err = (key?: string) => (key ? t(`staffTasks.form.errors.${key}`) : null);
  const set = (patch: Partial<TaskDraft>) => setDraft((d) => ({ ...d, ...patch }));
  const people = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (peopleQuery.data ?? []).filter((p) => !q || `${p.name_ar ?? ''} ${p.name_en ?? ''}`.toLowerCase().includes(q));
  }, [peopleQuery.data, search]);

  const save = async () => {
    setTried(true);
    setServerProblem(null);
    if (Object.keys(problems).length || busy) return;
    setBusy(true);
    try {
      await saveTask(task?.id ?? null, taskArgs(draft, nurseryId, isAr, task ? { ar: task.title_ar, en: task.title_en } : null));
      toast.success(t(task ? 'staffTasks.form.saved' : 'staffTasks.form.created'), { description: t('staffTasks.form.savedHint') });
      await refreshStaffTasks(queryClient);
      onClose();
    } catch (error) {
      setServerProblem(t(staffTaskErrorKey(error)));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open onOpenChange={(open) => !open && !busy && onClose()}>
      <DialogContent className="max-h-[92vh] max-w-2xl overflow-y-auto" data-testid="staff-task-form">
        <DialogHeader>
          <DialogTitle>{t(task ? 'staffTasks.form.editTitle' : 'staffTasks.form.newTitle')}</DialogTitle>
          <DialogDescription>{t('staffTasks.form.subtitle')}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <Part title={t('staffTasks.form.what')}>
            <FormField id="task-title" label={t('staffTasks.form.title')} error={err(shown.title)}>
              <Input
                id="task-title"
                value={draft.title}
                maxLength={120}
                placeholder={t('staffTasks.form.titlePlaceholder')}
                aria-invalid={Boolean(shown.title)}
                className={cn(shown.title && invalidFieldClass)}
                onChange={(e) => set({ title: e.target.value })}
              />
            </FormField>
            <div className="flex flex-wrap gap-2" role="group" aria-label={t('staffTasks.form.category')}>
              {TASK_CATEGORIES.map((c) => (
                <Chip key={c} selected={draft.category === c} icon={CATEGORY_ICON[c]} onClick={() => set({ category: c })}>
                  {t(`staffTasks.categories.${c}`)}
                </Chip>
              ))}
            </div>
            <FormField id="task-instructions" label={t('staffTasks.form.instructions')} optional>
              <Textarea id="task-instructions" rows={2} maxLength={1000} value={draft.instructions} onChange={(e) => set({ instructions: e.target.value })} />
            </FormField>
          </Part>

          <Part title={t('staffTasks.form.who')}>
            <ChoiceCards
              label={t('staffTasks.form.who')}
              value={draft.assignTo}
              onChange={(assignTo) => set({ assignTo })}
              className="sm:grid-cols-3"
              options={(['teachers', 'class_team', 'people'] as const).map((v) => ({
                value: v,
                label: t(`staffTasks.assignTo.${v}`),
                hint: t(`staffTasks.assignTo.${v}Hint`),
                icon: v === 'teachers' ? 'groups' : v === 'class_team' ? 'school' : 'person_check',
              }))}
            />
            {draft.assignTo === 'class_team' ? (
              <FormField id="task-class" label={t('staffTasks.form.class')} error={err(shown.class)}>
                <Select id="task-class" value={draft.classId} onChange={(e) => set({ classId: e.target.value })} className={cn(shown.class && invalidFieldClass)}>
                  <option value="">{t('staffTasks.form.chooseClass')}</option>
                  {(classesQuery.data ?? []).map((c) => (
                    <option key={c.id} value={c.id}>{localName(c.name_ar, c.name_en, isAr)}</option>
                  ))}
                </Select>
              </FormField>
            ) : null}
            {draft.assignTo === 'people' ? (
              <div className="space-y-2">
                <SearchInput value={search} onChange={setSearch} placeholder={t('staffTasks.form.searchPeople')} />
                <div className="flex max-h-48 flex-wrap gap-2 overflow-y-auto">
                  {people.map((p) => (
                    <Chip key={p.id} selected={draft.people.includes(p.id)} onClick={() => set({ people: toggled(draft.people, p.id) })}>
                      {localName(p.name_ar, p.name_en, isAr)}
                      <span className="text-xs font-normal opacity-80">· {t(`staffTasks.roles.${p.role}`, { defaultValue: p.role })}</span>
                    </Chip>
                  ))}
                </div>
                <FieldError message={err(shown.people)} />
              </div>
            ) : null}
            <ChoiceCards
              label={t('staffTasks.form.completion')}
              value={draft.completion}
              onChange={(completion) => set({ completion })}
              options={(['each', 'any'] as const).map((v) => ({ value: v, label: t(`staffTasks.completion.${v}`), hint: t(`staffTasks.completion.${v}Hint`), icon: v === 'each' ? 'person' : 'group' }))}
            />
            <label className="flex cursor-pointer items-center gap-3 rounded-lg border border-outline-variant p-3">
              <Checkbox checked={draft.photoRequired} onCheckedChange={(v) => set({ photoRequired: v === true })} />
              <span>
                <span className="block text-sm font-medium text-on-surface">{t('staffTasks.form.photoRequired')}</span>
                <span className="block text-xs text-on-surface-variant">{t('staffTasks.form.photoRequiredHint')}</span>
              </span>
            </label>
          </Part>

          <Part title={t('staffTasks.form.when')}>
            <ChoiceCards
              label={t('staffTasks.form.when')}
              value={draft.repeats}
              onChange={(repeats) => set({ repeats })}
              className="grid-cols-2 sm:grid-cols-4"
              options={(['daily', 'weekly', 'monthly', 'once'] as const).map((v) => ({ value: v, label: t(`staffTasks.repeats.${v}`) }))}
            />
            {draft.repeats === 'weekly' ? (
              <div>
                <div className="flex flex-wrap gap-2">
                  {URGENT_EVENT_DAY_KEYS.map((key, day) => (
                    <Chip key={key} selected={draft.days.includes(day)} onClick={() => set({ days: toggled(draft.days, day) })}>
                      {t(`reminders.daysShort.${key}`)}
                    </Chip>
                  ))}
                </div>
                <FieldError message={err(shown.days)} />
              </div>
            ) : null}
            <div className="grid gap-4 sm:grid-cols-3">
              {draft.repeats === 'once' ? (
                <FormField id="task-date" label={t('staffTasks.form.onDate')} error={err(shown.onDate)}>
                  <Input id="task-date" type="date" min={today} value={draft.onDate} onChange={(e) => set({ onDate: e.target.value })} />
                </FormField>
              ) : null}
              {draft.repeats === 'monthly' ? (
                <FormField id="task-day" label={t('staffTasks.form.dayOfMonth')} hint={t('staffTasks.form.dayOfMonthHint')}>
                  <Select id="task-day" value={String(draft.dayOfMonth)} onChange={(e) => set({ dayOfMonth: Number(e.target.value) })}>
                    {Array.from({ length: 31 }, (_, i) => i + 1).map((d) => (
                      <option key={d} value={d}>{d}</option>
                    ))}
                  </Select>
                </FormField>
              ) : null}
              <FormField id="task-due" label={t('staffTasks.form.dueTime')} error={err(shown.dueTime)}>
                <Input id="task-due" type="time" value={draft.dueTime} onChange={(e) => set({ dueTime: e.target.value })} />
              </FormField>
              {draft.repeats !== 'once' ? (
                <FormField id="task-ends" label={t('staffTasks.form.endsOn')} optional>
                  <Input id="task-ends" type="date" min={today} value={draft.endsOn} onChange={(e) => set({ endsOn: e.target.value })} />
                </FormField>
              ) : null}
            </div>
            <p className="text-xs text-on-surface-variant">{t('staffTasks.form.schoolDaysHint')}</p>
          </Part>
        </div>

        <FormProblem message={serverProblem ?? (tried && Object.keys(problems).length ? t('staffTasks.form.fixErrors') : null)} />
        <DialogFooter className="gap-2">
          <Button type="button" variant="outline" onClick={onClose} disabled={busy}>{t('common.cancel')}</Button>
          <Button type="button" onClick={() => void save()} disabled={busy} data-testid="staff-task-save">
            <MaterialSymbol name="save" size="text-base" className="me-1" />
            {busy ? t('common.saving') : t(task ? 'staffTasks.form.save' : 'staffTasks.form.create')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
