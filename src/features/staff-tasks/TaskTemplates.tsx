import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { TableCard } from '@/components/ui/DataTable';
import { MaterialSymbol } from '@/components/ui/MaterialSymbol';
import { TONE_TINT } from '@/components/ui/toneClasses';
import { getNurseryCalendarDateString } from '@/lib/nurseryDay';
import { cn } from '@/lib/utils';

import { saveTask, staffTaskErrorKey } from './staffTasksApi';
import { hasTemplate, TASK_TEMPLATES, templateArgs, type TaskTemplate } from './staffTaskTemplates';
import { refreshStaffTasks, useTaskList } from './useStaffTasks';

/** The ready-made tasks: each added with one click (for every teacher), then changed like any task. */
export function TaskTemplates({ nurseryId }: { nurseryId: string }) {
  const { t, i18n } = useTranslation();
  const queryClient = useQueryClient();
  const tasks = useTaskList(nurseryId).data ?? [];
  const [adding, setAdding] = useState<string | null>(null);
  const ar = i18n.getFixedT('ar');
  const en = i18n.getFixedT('en');

  const add = async (template: TaskTemplate) => {
    const key = `staffTasks.templates.${template.id}`;
    setAdding(template.id);
    try {
      await saveTask(
        null,
        templateArgs(template, { titleAr: ar(`${key}.title`), titleEn: en(`${key}.title`), instructions: t(`${key}.instructions`) }, nurseryId, getNurseryCalendarDateString()),
      );
      toast.success(t('staffTasks.templates.added', { task: t(`${key}.title`) }), { description: t('staffTasks.templates.addedHint') });
      await refreshStaffTasks(queryClient);
    } catch (error) {
      toast.error(t(staffTaskErrorKey(error)));
    } finally {
      setAdding(null);
    }
  };

  return (
    <TableCard title={t('staffTasks.templates.title')} description={t('staffTasks.templates.hint')}>
      <ul className="grid gap-3 p-4 sm:grid-cols-2 sm:p-5 xl:grid-cols-4">
        {TASK_TEMPLATES.map((template) => {
          const key = `staffTasks.templates.${template.id}`;
          const added = hasTemplate(tasks, { ar: ar(`${key}.title`), en: en(`${key}.title`) });
          return (
            <li key={template.id} className="flex flex-col gap-2 rounded-xl border border-outline-variant bg-surface-container-lowest p-3" data-testid="task-template">
              <div className="flex items-center gap-2">
                <span className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-lg', TONE_TINT[template.category === 'safety' ? 'error' : 'primary'])}>
                  <MaterialSymbol name={template.icon} size="text-lg" />
                </span>
                <h3 className="text-sm font-semibold text-on-surface">{t(`${key}.title`)}</h3>
              </div>
              <p className="text-xs text-on-surface-variant">{t(`${key}.when`)}</p>
              <Button
                type="button"
                size="sm"
                variant={added ? 'ghost' : 'outline'}
                className="mt-auto self-start"
                disabled={added || adding !== null}
                onClick={() => void add(template)}
              >
                <MaterialSymbol name={added ? 'check' : adding === template.id ? 'progress_activity' : 'add'} size="text-base" className={cn('me-1', adding === template.id && 'animate-spin')} />
                {added ? t('staffTasks.templates.already') : t('staffTasks.templates.add')}
              </Button>
            </li>
          );
        })}
      </ul>
    </TableCard>
  );
}
