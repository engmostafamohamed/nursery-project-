import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
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
import { cn } from '@/lib/utils';
import { useActiveNurseryId } from '@/hooks/useActiveNurseryId';
import { useAuthSession } from '@/hooks/useAuthSession';
import { useUserProfile } from '@/hooks/useUserProfile';
import {
  usePersonalReminders,
  type PersonalReminder,
  type PersonalReminderInput,
  type ReminderAudience,
} from '@/hooks/usePersonalReminders';

// 0 = Sunday .. 6 = Saturday (matches Postgres `extract(dow ...)` and JS getDay()).
const DAY_KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const;
const HOURS = Array.from({ length: 24 }, (_, h) => h);

const formatHour = (h: number) => `${String(h).padStart(2, '0')}:00`;

const makeEmptyForm = (audience: ReminderAudience): PersonalReminderInput => ({
  audience,
  name: '',
  description: '',
  days_of_week: [],
  hours_of_day: [],
  repeats: true,
  active: true,
});

/** Personal reminders shell shared by the admin and teacher routes. Each user
 *  manages their own recurring reminders (weekday + hour) which fire as in-app
 *  notifications via the `run_personal_reminders` cron job. */
export function RemindersPage() {
  const { t } = useTranslation();
  const { user } = useAuthSession();
  const { data: profile } = useUserProfile(user?.id);
  // Use the *active* nursery, not profile.nursery_id: chain/xo super admins have
  // a null profile nursery and target the nursery selected in the sidebar picker.
  const { activeNurseryId } = useActiveNurseryId();
  const nurseryId = activeNurseryId;
  const defaultAudience: ReminderAudience = profile?.role === 'teacher' ? 'teacher' : 'admin';

  const { query, create, update, remove } = usePersonalReminders(user?.id, nurseryId);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<PersonalReminderInput>(() => makeEmptyForm(defaultAudience));

  const busy = create.isPending || update.isPending;

  const openCreate = () => {
    setEditingId(null);
    setForm(makeEmptyForm(defaultAudience));
    setDialogOpen(true);
  };

  const openEdit = (r: PersonalReminder) => {
    setEditingId(r.id);
    setForm({
      audience: r.audience,
      name: r.name,
      description: r.description,
      days_of_week: [...r.days_of_week].sort((a, b) => a - b),
      hours_of_day: [...r.hours_of_day].sort((a, b) => a - b),
      repeats: r.repeats,
      active: r.active,
    });
    setDialogOpen(true);
  };

  const toggleDay = (day: number) =>
    setForm((f) => ({
      ...f,
      days_of_week: f.days_of_week.includes(day)
        ? f.days_of_week.filter((d) => d !== day)
        : [...f.days_of_week, day].sort((a, b) => a - b),
    }));

  const addHour = (hour: number) =>
    setForm((f) =>
      f.hours_of_day.includes(hour)
        ? f
        : { ...f, hours_of_day: [...f.hours_of_day, hour].sort((a, b) => a - b) },
    );

  const removeHour = (hour: number) =>
    setForm((f) => ({ ...f, hours_of_day: f.hours_of_day.filter((h) => h !== hour) }));

  const submit = async () => {
    if (!form.name.trim()) {
      toast.error(t('reminders.errorNoName'));
      return;
    }
    if (form.days_of_week.length === 0) {
      toast.error(t('reminders.errorNoDays'));
      return;
    }
    if (form.hours_of_day.length === 0) {
      toast.error(t('reminders.errorNoHours'));
      return;
    }
    try {
      const payload: PersonalReminderInput = { ...form, name: form.name.trim() };
      if (editingId) {
        await update.mutateAsync({ id: editingId, input: payload });
      } else {
        await create.mutateAsync(payload);
      }
      toast.success(t('reminders.saved'));
      setDialogOpen(false);
    } catch {
      toast.error(t('reminders.saveFailed'));
    }
  };

  const onDelete = async (id: string) => {
    try {
      await remove.mutateAsync(id);
      toast.success(t('reminders.deleted'));
    } catch {
      toast.error(t('reminders.saveFailed'));
    }
  };

  const rows = query.data ?? [];

  const summarizeDays = useMemo(
    () => (days: number[]) =>
      [...days]
        .sort((a, b) => a - b)
        .map((d) => t(`reminders.daysShort.${DAY_KEYS[d]}`))
        .join('، '),
    [t],
  );

  return (
    <div className="space-y-6 p-4">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-on-surface">{t('reminders.title')}</h1>
          <p className="mt-1 max-w-2xl text-sm text-on-surface-variant">{t('reminders.subtitle')}</p>
        </div>
        <Button type="button" onClick={openCreate}>
          <span className="material-symbols-outlined me-1 text-base" aria-hidden>
            add
          </span>
          {t('reminders.addButton')}
        </Button>
      </header>

      {query.isPending ? (
        <LoadingSkeleton />
      ) : rows.length === 0 ? (
        <EmptyState
          icon="alarm"
          title={t('reminders.emptyTitle')}
          description={t('reminders.emptyDescription')}
        />
      ) : (
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          {rows.map((r) => (
            <div
              key={r.id}
              className={cn(
                'group relative overflow-hidden rounded-2xl border border-outline-variant bg-surface-container-lowest transition-all hover:border-primary/50 hover:shadow-[0_6px_24px_-12px] hover:shadow-primary/30',
                !r.active && 'opacity-75',
              )}
            >
              {/* Status accent rail */}
              <span
                className={cn(
                  'absolute inset-y-0 start-0 w-1.5',
                  r.active ? 'bg-primary' : 'bg-outline-variant',
                )}
                aria-hidden
              />

              <div className="p-4 ps-5">
                {/* Header: icon + title/meta + actions */}
                <div className="flex items-start justify-between gap-3">
                  <div className="flex min-w-0 items-start gap-3">
                    <span
                      className={cn(
                        'flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl',
                        r.active
                          ? 'bg-primary/10 text-primary'
                          : 'bg-surface-container text-on-surface-variant',
                      )}
                    >
                      <span className="material-symbols-outlined" aria-hidden>
                        alarm
                      </span>
                    </span>
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="truncate text-sm font-semibold text-on-surface">{r.name}</p>
                        <span
                          className={cn(
                            'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium',
                            r.active
                              ? 'bg-success/10 text-success'
                              : 'bg-surface-container text-on-surface-variant',
                          )}
                        >
                          <span
                            className={cn(
                              'h-1.5 w-1.5 rounded-full',
                              r.active ? 'bg-success' : 'bg-on-surface-variant',
                            )}
                            aria-hidden
                          />
                          {r.active ? t('reminders.active') : t('reminders.inactive')}
                        </span>
                      </div>
                      <div className="mt-1 flex flex-wrap items-center gap-1.5">
                        <span className="rounded-md bg-surface-container px-1.5 py-0.5 text-[11px] font-medium text-on-surface-variant">
                          {t(`reminders.audience.${r.audience}`)}
                        </span>
                        <span className="inline-flex items-center gap-1 rounded-md bg-surface-container px-1.5 py-0.5 text-[11px] font-medium text-on-surface-variant">
                          <span className="material-symbols-outlined text-[13px]" aria-hidden>
                            {r.repeats ? 'event_repeat' : 'looks_one'}
                          </span>
                          {r.repeats ? t('reminders.repeatsBadge') : t('reminders.oneTimeBadge')}
                        </span>
                      </div>
                      {r.description ? (
                        <p className="mt-1.5 line-clamp-2 text-xs text-on-surface-variant">
                          {r.description}
                        </p>
                      ) : null}
                    </div>
                  </div>

                  <div className="flex shrink-0 items-center gap-1 opacity-80 transition-opacity group-hover:opacity-100">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-9 w-9 text-on-surface-variant hover:text-on-surface"
                      onClick={() => openEdit(r)}
                      aria-label={t('common.edit')}
                      title={t('common.edit')}
                    >
                      <span className="material-symbols-outlined text-lg" aria-hidden>
                        edit
                      </span>
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-9 w-9 text-on-surface-variant hover:bg-error/10 hover:text-error"
                      disabled={remove.isPending}
                      onClick={() => void onDelete(r.id)}
                      aria-label={t('common.delete')}
                      title={t('common.delete')}
                    >
                      <span className="material-symbols-outlined text-lg" aria-hidden>
                        delete
                      </span>
                    </Button>
                  </div>
                </div>

                {/* Schedule: weekly day strip + time chips */}
                <div className="mt-3.5 flex flex-wrap items-center gap-x-5 gap-y-3 border-t border-outline-variant/50 pt-3.5">
                  <div className="flex items-center gap-1" role="img" aria-label={summarizeDays(r.days_of_week)}>
                    {DAY_KEYS.map((dayKey, day) => {
                      const on = r.days_of_week.includes(day);
                      return (
                        <span
                          key={dayKey}
                          title={t(`reminders.days.${dayKey}`)}
                          className={cn(
                            'flex h-7 w-7 items-center justify-center rounded-full text-[11px] font-bold',
                            on
                              ? 'bg-primary text-on-primary shadow-sm'
                              : 'bg-surface-container text-on-surface-variant/40',
                          )}
                        >
                          {t(`reminders.daysMin.${dayKey}`)}
                        </span>
                      );
                    })}
                  </div>

                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="material-symbols-outlined text-base text-primary/70" aria-hidden>
                      schedule
                    </span>
                    {[...r.hours_of_day]
                      .sort((a, b) => a - b)
                      .map((h) => (
                        <span
                          key={h}
                          className="rounded-lg bg-surface-container px-2 py-0.5 text-[11px] font-semibold tabular-nums text-on-surface"
                        >
                          {formatHour(h)}
                        </span>
                      ))}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={(o) => !busy && setDialogOpen(o)}>
        <DialogContent className="flex max-h-[90vh] max-w-lg flex-col">
          <DialogHeader className="shrink-0">
            <div className="flex items-center gap-3">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                <span className="material-symbols-outlined" aria-hidden>
                  alarm
                </span>
              </span>
              <div className="min-w-0">
                <DialogTitle>
                  {editingId ? t('reminders.editTitle') : t('reminders.addTitle')}
                </DialogTitle>
                <DialogDescription>{t('reminders.formHint')}</DialogDescription>
              </div>
            </div>
          </DialogHeader>

          <div className="-me-2 mt-2 min-h-0 flex-1 space-y-4 overflow-y-auto pe-2">
            <label className="block">
              <span className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-on-surface-variant">
                <span className="material-symbols-outlined text-sm" aria-hidden>label</span>
                {t('reminders.fieldName')}
              </span>
              <input
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                placeholder={t('reminders.namePlaceholder')}
                className="h-11 w-full rounded-xl border border-outline-variant bg-surface px-3.5 text-sm outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary/20"
              />
            </label>

            <label className="block">
              <span className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-on-surface-variant">
                <span className="material-symbols-outlined text-sm" aria-hidden>notes</span>
                {t('reminders.fieldDescription')}
              </span>
              <textarea
                value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                placeholder={t('reminders.descriptionPlaceholder')}
                className="min-h-[72px] w-full rounded-xl border border-outline-variant bg-surface p-3.5 text-sm outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary/20"
              />
            </label>

            <div className="rounded-2xl border border-outline-variant bg-surface-container-lowest p-3.5">
              <span className="mb-2 flex items-center gap-1.5 text-xs font-medium text-on-surface-variant">
                <span className="material-symbols-outlined text-sm" aria-hidden>calendar_month</span>
                {t('reminders.fieldDays')}
              </span>
              <div className="grid grid-cols-4 gap-2">
                {DAY_KEYS.map((dayKey, day) => {
                  const checked = form.days_of_week.includes(day);
                  return (
                    <button
                      key={dayKey}
                      type="button"
                      aria-pressed={checked}
                      onClick={() => toggleDay(day)}
                      className={
                        'rounded-xl border px-2 py-2 text-xs font-medium transition-colors ' +
                        (checked
                          ? 'border-primary bg-primary text-on-primary shadow-sm'
                          : 'border-outline-variant bg-surface text-on-surface-variant hover:border-primary/40 hover:bg-primary/5')
                      }
                    >
                      {t(`reminders.days.${dayKey}`)}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="rounded-2xl border border-outline-variant bg-surface-container-lowest p-3.5">
              <span className="mb-2 flex items-center gap-1.5 text-xs font-medium text-on-surface-variant">
                <span className="material-symbols-outlined text-sm" aria-hidden>schedule</span>
                {t('reminders.fieldHours')}
              </span>
              {/* Add-hour dropdown: each already-selected hour is rendered disabled. */}
              <select
                value=""
                onChange={(e) => {
                  if (e.target.value !== '') addHour(Number(e.target.value));
                }}
                className="h-11 w-full rounded-xl border border-outline-variant bg-surface px-3.5 text-sm outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary/20"
              >
                <option value="">{t('reminders.selectHour')}</option>
                {HOURS.map((h) => (
                  <option key={h} value={h} disabled={form.hours_of_day.includes(h)}>
                    {formatHour(h)}
                  </option>
                ))}
              </select>
              {form.hours_of_day.length > 0 ? (
                <div className="mt-2.5 flex flex-wrap gap-2">
                  {form.hours_of_day.map((h) => (
                    <span
                      key={h}
                      className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 py-1 pe-1.5 ps-2.5 text-xs font-semibold text-primary"
                    >
                      {formatHour(h)}
                      <button
                        type="button"
                        aria-label={t('reminders.removeHour')}
                        onClick={() => removeHour(h)}
                        className="inline-flex items-center justify-center rounded-full text-primary/70 transition-colors hover:bg-primary/20 hover:text-primary"
                      >
                        <span className="material-symbols-outlined text-sm" aria-hidden>
                          close
                        </span>
                      </button>
                    </span>
                  ))}
                </div>
              ) : (
                <p className="mt-2 text-xs text-on-surface-variant">{t('reminders.noHoursYet')}</p>
              )}
            </div>

            <label className="flex cursor-pointer items-start gap-3 rounded-2xl border border-outline-variant bg-surface px-3.5 py-3 transition-colors hover:border-primary/40">
              <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <span className="material-symbols-outlined text-base" aria-hidden>event_repeat</span>
              </span>
              <span className="min-w-0 flex-1">
                <span className="text-sm font-medium text-on-surface">{t('reminders.fieldRepeats')}</span>
                <span className="mt-0.5 block text-xs text-on-surface-variant">
                  {t('reminders.repeatsHint')}
                </span>
              </span>
              <Checkbox
                className="mt-0.5"
                checked={form.repeats}
                onCheckedChange={(v) => setForm((f) => ({ ...f, repeats: v === true }))}
              />
            </label>

            <label className="flex cursor-pointer items-center gap-3 rounded-2xl border border-outline-variant bg-surface px-3.5 py-3 transition-colors hover:border-primary/40">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <span className="material-symbols-outlined text-base" aria-hidden>toggle_on</span>
              </span>
              <span className="min-w-0 flex-1">
                <span className="text-sm font-medium text-on-surface">{t('reminders.fieldActive')}</span>
                <span className="mt-0.5 block text-xs text-on-surface-variant">
                  {t('reminders.activeHint')}
                </span>
              </span>
              <Checkbox
                checked={form.active}
                onCheckedChange={(v) => setForm((f) => ({ ...f, active: v === true }))}
              />
            </label>
          </div>

          <DialogFooter className="mt-4 shrink-0 border-t border-outline-variant pt-4">
            <Button type="button" variant="outline" onClick={() => setDialogOpen(false)} disabled={busy}>
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
