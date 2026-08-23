import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { EmptyState } from '@/components/ui/EmptyState';
import { LoadingSkeleton } from '@/components/ui/LoadingSkeleton';
import { useAuthSession } from '@/hooks/useAuthSession';
import { useUserProfile } from '@/hooks/useUserProfile';
import {
  useAdminTeacherReminders,
  useNurseryTeachers,
  type TeacherReminderInput,
  type TeacherReminderTemplate,
} from '@/hooks/useAdminTeacherReminders';

const EMPTY_FORM: TeacherReminderInput = {
  teacher_id: '',
  title_ar: '',
  title_en: '',
  body_ar: '',
  body_en: '',
  active: true,
};

export function AdminTeacherRemindersPage() {
  const { t } = useTranslation();
  const { user } = useAuthSession();
  const { data: profile } = useUserProfile(user?.id);
  const nurseryId = profile?.nursery_id ?? null;

  const { query, create, update, remove } = useAdminTeacherReminders(nurseryId);
  const { data: teachers = [] } = useNurseryTeachers(nurseryId);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<TeacherReminderInput>(EMPTY_FORM);

  const teacherName = useMemo(() => {
    const map = new Map(teachers.map((tc) => [tc.id, tc.name_en || tc.name_ar || tc.id]));
    return (id: string) => map.get(id) ?? id;
  }, [teachers]);

  const openCreate = () => {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setDialogOpen(true);
  };

  const openEdit = (tpl: TeacherReminderTemplate) => {
    setEditingId(tpl.id);
    setForm({
      teacher_id: tpl.teacher_id,
      title_ar: tpl.title_ar,
      title_en: tpl.title_en,
      body_ar: tpl.body_ar,
      body_en: tpl.body_en,
      active: tpl.active,
    });
    setDialogOpen(true);
  };

  const busy = create.isPending || update.isPending;

  const submit = async () => {
    if (!form.teacher_id) {
      toast.error(t('teacherReminders.errorNoTeacher'));
      return;
    }
    if (!form.body_ar.trim() && !form.body_en.trim()) {
      toast.error(t('teacherReminders.errorNoBody'));
      return;
    }
    try {
      if (editingId) {
        await update.mutateAsync({ id: editingId, input: form });
      } else {
        await create.mutateAsync(form);
      }
      toast.success(t('teacherReminders.saved'));
      setDialogOpen(false);
    } catch {
      toast.error(t('teacherReminders.saveFailed'));
    }
  };

  const onDelete = async (id: string) => {
    try {
      await remove.mutateAsync(id);
      toast.success(t('teacherReminders.deleted'));
    } catch {
      toast.error(t('teacherReminders.saveFailed'));
    }
  };

  const rows = query.data ?? [];

  return (
    <div className="space-y-6 p-4">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-on-surface">{t('teacherReminders.title')}</h1>
          <p className="mt-1 max-w-2xl text-sm text-on-surface-variant">
            {t('teacherReminders.subtitle')}
          </p>
        </div>
        <Button type="button" onClick={openCreate}>
          <span className="material-symbols-outlined me-1 text-base" aria-hidden>
            add
          </span>
          {t('teacherReminders.addButton')}
        </Button>
      </header>

      {query.isPending ? (
        <LoadingSkeleton />
      ) : rows.length === 0 ? (
        <EmptyState
          icon="notifications_active"
          title={t('teacherReminders.emptyTitle')}
          description={t('teacherReminders.emptyDescription')}
        />
      ) : (
        <div className="space-y-3">
          {rows.map((tpl) => (
            <div
              key={tpl.id}
              className="flex flex-wrap items-start justify-between gap-3 rounded-2xl border border-outline-variant bg-surface-container-lowest p-4"
            >
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-semibold text-on-surface">
                    {teacherName(tpl.teacher_id)}
                  </p>
                  <span
                    className={
                      'rounded-full border px-2 py-0.5 text-xs font-medium ' +
                      (tpl.active
                        ? 'border-success/30 bg-success/10 text-success'
                        : 'border-outline-variant bg-surface-container text-on-surface-variant')
                    }
                  >
                    {tpl.active ? t('teacherReminders.active') : t('teacherReminders.inactive')}
                  </span>
                </div>
                <p className="mt-1 text-sm text-on-surface">
                  {tpl.title_en || tpl.title_ar || t('teacherReminders.untitled')}
                </p>
                <p className="mt-0.5 line-clamp-2 text-xs text-on-surface-variant">
                  {tpl.body_en || tpl.body_ar}
                </p>
              </div>
              <div className="flex shrink-0 gap-2">
                <Button type="button" variant="outline" size="sm" onClick={() => openEdit(tpl)}>
                  {t('common.edit')}
                </Button>
                <Button
                  type="button"
                  variant="destructive"
                  size="sm"
                  disabled={remove.isPending}
                  onClick={() => void onDelete(tpl.id)}
                >
                  {t('common.delete')}
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={(o) => !busy && setDialogOpen(o)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {editingId ? t('teacherReminders.editTitle') : t('teacherReminders.addTitle')}
            </DialogTitle>
            <DialogDescription>{t('teacherReminders.formHint')}</DialogDescription>
          </DialogHeader>

          <div className="mt-4 space-y-3">
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-on-surface-variant">
                {t('teacherReminders.fieldTeacher')}
              </span>
              <select
                value={form.teacher_id}
                onChange={(e) => setForm((f) => ({ ...f, teacher_id: e.target.value }))}
                className="h-10 w-full rounded-xl border border-outline-variant bg-surface px-3 text-sm outline-none focus:ring-1 focus:ring-primary"
              >
                <option value="">{t('teacherReminders.selectTeacher')}</option>
                {teachers.map((tc) => (
                  <option key={tc.id} value={tc.id}>
                    {tc.name_en || tc.name_ar || tc.id}
                  </option>
                ))}
              </select>
            </label>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <label className="block">
                <span className="mb-1 block text-xs font-medium text-on-surface-variant">
                  {t('teacherReminders.fieldTitleEn')}
                </span>
                <input
                  value={form.title_en}
                  onChange={(e) => setForm((f) => ({ ...f, title_en: e.target.value }))}
                  className="h-10 w-full rounded-xl border border-outline-variant bg-surface px-3 text-sm outline-none focus:ring-1 focus:ring-primary"
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-xs font-medium text-on-surface-variant">
                  {t('teacherReminders.fieldTitleAr')}
                </span>
                <input
                  dir="rtl"
                  value={form.title_ar}
                  onChange={(e) => setForm((f) => ({ ...f, title_ar: e.target.value }))}
                  className="h-10 w-full rounded-xl border border-outline-variant bg-surface px-3 text-sm outline-none focus:ring-1 focus:ring-primary"
                />
              </label>
            </div>

            <label className="block">
              <span className="mb-1 block text-xs font-medium text-on-surface-variant">
                {t('teacherReminders.fieldBodyEn')}
              </span>
              <textarea
                value={form.body_en}
                onChange={(e) => setForm((f) => ({ ...f, body_en: e.target.value }))}
                className="min-h-[70px] w-full rounded-xl border border-outline-variant bg-surface p-3 text-sm outline-none focus:ring-1 focus:ring-primary"
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-on-surface-variant">
                {t('teacherReminders.fieldBodyAr')}
              </span>
              <textarea
                dir="rtl"
                value={form.body_ar}
                onChange={(e) => setForm((f) => ({ ...f, body_ar: e.target.value }))}
                className="min-h-[70px] w-full rounded-xl border border-outline-variant bg-surface p-3 text-sm outline-none focus:ring-1 focus:ring-primary"
              />
            </label>

            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={form.active}
                onChange={(e) => setForm((f) => ({ ...f, active: e.target.checked }))}
              />
              {t('teacherReminders.fieldActive')}
            </label>
          </div>

          <DialogFooter className="mt-5">
            <Button
              type="button"
              variant="outline"
              onClick={() => setDialogOpen(false)}
              disabled={busy}
            >
              {t('common.cancel')}
            </Button>
            <Button type="button" onClick={() => void submit()} disabled={busy}>
              {t('common.save')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
