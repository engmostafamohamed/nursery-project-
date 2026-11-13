import { useTranslation } from 'react-i18next';

import { PageHeader } from '@/components/ui/PageHeader';
import { SectionTabs } from '@/components/ui/SectionTabs';
import { TaskBoard } from '@/features/staff-tasks/TaskBoard';
import { TaskList } from '@/features/staff-tasks/TaskList';
import { useSettings } from '@/lib/useSettings';

/** Staff tasks for the admins: the day's board (done, to do, late) and the tasks they set up. */
export function AdminStaffTasksPage({ view }: { view: 'board' | 'list' }) {
  const { t } = useTranslation();
  const { nurseryId } = useSettings();

  return (
    <div className="mx-auto max-w-6xl space-y-5 pb-8">
      <PageHeader icon="task_alt" title={t('staffTasks.admin.title')} description={t('staffTasks.admin.subtitle')}>
        <SectionTabs
          label={t('staffTasks.admin.title')}
          tabs={[
            { to: '/admin/staff-tasks', label: t('staffTasks.admin.boardTab'), icon: 'today', end: true },
            { to: '/admin/staff-tasks/list', label: t('staffTasks.admin.listTab'), icon: 'checklist' },
          ]}
        />
      </PageHeader>
      {nurseryId ? view === 'board' ? <TaskBoard nurseryId={nurseryId} /> : <TaskList nurseryId={nurseryId} /> : null}
    </div>
  );
}
