import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { MaterialSymbol } from '@/components/ui/MaterialSymbol';
import { useAuthSession } from '@/hooks/useAuthSession';
import { addCalendarDaysYmd, getNurseryCalendarDateString } from '@/lib/nurseryDay';
import { supabase } from '@/lib/supabase';
import { cn } from '@/lib/utils';

type ChildOption = { id: string; nameAr?: string | null; nameEn?: string | null };

type AbsenceReason = 'sick' | 'travel' | 'family' | 'other';
const REASONS: AbsenceReason[] = ['sick', 'travel', 'family', 'other'];
const MAX_DAYS_AHEAD = 60;

type AbsenceReportRow = {
  id: string;
  child_id: string;
  absence_date: string;
  reason: AbsenceReason;
  note: string | null;
  reported_by: string | null;
};

const fieldErrorClass = 'border-error ring-1 ring-error/30';

/** Lets a parent tell the nursery in advance that a child will be absent (counted as excused). */
export function ReportAbsencePanel({ children, defaultChildId }: { children: ChildOption[]; defaultChildId?: string }) {
  const { t, i18n } = useTranslation();
  const queryClient = useQueryClient();
  const { user } = useAuthSession();
  const today = getNurseryCalendarDateString();
  const maxDate = addCalendarDaysYmd(today, MAX_DAYS_AHEAD);
  const [childId, setChildId] = useState(defaultChildId ?? (children.length === 1 ? children[0].id : ''));
  const [date, setDate] = useState(today);
  const [reason, setReason] = useState<AbsenceReason>('sick');
  const [note, setNote] = useState('');
  const [triedSubmit, setTriedSubmit] = useState(false);
  const [duplicateDate, setDuplicateDate] = useState<string | null>(null);

  const childIds = useMemo(() => children.map((c) => c.id).sort(), [children]);
  const childName = (id: string) => {
    const c = children.find((x) => x.id === id);
    if (!c) return '';
    return i18n.language === 'ar' ? c.nameAr?.trim() || c.nameEn || '' : c.nameEn?.trim() || c.nameAr || '';
  };

  const reportsQuery = useQuery({
    queryKey: ['absence-reports', childIds.join(','), today],
    queryFn: async (): Promise<AbsenceReportRow[]> => {
      const { data, error } = await supabase
        .from('attendance_absence_reports')
        .select('id, child_id, absence_date, reason, note, reported_by')
        .in('child_id', childIds)
        .gte('absence_date', today)
        .order('absence_date');
      if (error) throw error;
      return (data ?? []) as AbsenceReportRow[];
    },
    enabled: childIds.length > 0,
  });

  const errors = {
    child: !childId ? t('attendance.absence.errors.childRequired') : undefined,
    date: !date
      ? t('attendance.absence.errors.dateRequired')
      : date < today || date > maxDate
        ? t('attendance.absence.errors.dateRange', { days: MAX_DAYS_AHEAD })
        : duplicateDate === `${childId}|${date}`
          ? t('attendance.absence.errors.alreadyReported')
          : undefined,
    note: note.length > 500 ? t('attendance.absence.errors.noteTooLong') : undefined,
  };
  const shown = {
    child: triedSubmit ? errors.child : undefined,
    date: triedSubmit || duplicateDate ? errors.date : undefined,
    note: errors.note,
  };

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ['absence-reports'] });
    void queryClient.invalidateQueries({ queryKey: ['attendance-days'] });
  };

  const submit = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from('attendance_absence_reports').insert({
        child_id: childId,
        absence_date: date,
        reason,
        note: note.trim() || null,
      } as never);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(t('attendance.absence.reported'));
      setNote('');
      setTriedSubmit(false);
      setDuplicateDate(null);
      invalidate();
    },
    onError: (error) => {
      const code = (error as { code?: string }).code;
      if (code === '23505') {
        setDuplicateDate(`${childId}|${date}`);
        return;
      }
      toast.error(t('attendance.absence.failed'));
    },
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('attendance_absence_reports').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(t('attendance.absence.cancelled'));
      invalidate();
    },
    onError: () => toast.error(t('attendance.absence.failed')),
  });

  const onSubmit = () => {
    setTriedSubmit(true);
    if (errors.child || errors.date || errors.note) return;
    submit.mutate();
  };

  return (
    <section className="overflow-hidden rounded-xl border border-outline-variant bg-surface shadow-sm">
      <div className="border-b border-outline-variant bg-surface-container-lowest p-4">
        <h2 className="flex items-center gap-2 text-base font-semibold text-on-surface">
          <MaterialSymbol name="event_busy" className="text-primary" size="text-xl" />
          {t('attendance.absence.title')}
        </h2>
        <p className="mt-1 text-xs text-on-surface-variant">{t('attendance.absence.subtitle')}</p>
      </div>

      <div className="grid gap-4 p-4 md:grid-cols-2 xl:grid-cols-4">
        {children.length > 1 ? (
          <div className="space-y-2">
            <Label>{t('attendance.absence.child')}</Label>
            <select
              className={cn('h-11 w-full rounded-lg border border-outline-variant bg-surface-container-lowest px-3 text-sm', shown.child && fieldErrorClass)}
              value={childId}
              onChange={(e) => setChildId(e.target.value)}
              aria-invalid={Boolean(shown.child)}
            >
              <option value="">{t('common.select')}</option>
              {children.map((c) => (
                <option key={c.id} value={c.id}>{childName(c.id)}</option>
              ))}
            </select>
            {shown.child ? <p className="text-xs font-medium text-error">{shown.child}</p> : null}
          </div>
        ) : null}
        <div className="space-y-2">
          <Label>{t('attendance.absence.date')}</Label>
          <Input
            type="date"
            value={date}
            min={today}
            max={maxDate}
            onChange={(e) => setDate(e.target.value)}
            className={cn(shown.date && fieldErrorClass)}
            aria-invalid={Boolean(shown.date)}
          />
          {shown.date ? <p className="text-xs font-medium text-error">{shown.date}</p> : null}
        </div>
        <div className="space-y-2">
          <Label>{t('attendance.absence.reason')}</Label>
          <select
            className="h-11 w-full rounded-lg border border-outline-variant bg-surface-container-lowest px-3 text-sm"
            value={reason}
            onChange={(e) => setReason(e.target.value as AbsenceReason)}
          >
            {REASONS.map((r) => (
              <option key={r} value={r}>{t(`attendance.absence.reasons.${r}`)}</option>
            ))}
          </select>
        </div>
        <div className="space-y-2">
          <Label>{t('attendance.absence.note')}</Label>
          <Input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            maxLength={520}
            className={cn(shown.note && fieldErrorClass)}
            aria-invalid={Boolean(shown.note)}
          />
          {shown.note ? <p className="text-xs font-medium text-error">{shown.note}</p> : null}
        </div>
      </div>
      <div className="flex justify-end px-4 pb-4">
        <Button type="button" onClick={onSubmit} disabled={submit.isPending}>
          <MaterialSymbol name="send" size="text-base" className="me-1" />
          {submit.isPending ? t('common.loading') : t('attendance.absence.submit')}
        </Button>
      </div>

      {(reportsQuery.data ?? []).length > 0 ? (
        <div className="border-t border-outline-variant p-4">
          <p className="mb-2 text-xs font-semibold uppercase text-on-surface-variant">{t('attendance.absence.upcoming')}</p>
          <ul className="space-y-2">
            {(reportsQuery.data ?? []).map((report) => (
              <li key={report.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-surface-container-lowest px-3 py-2 text-sm">
                <span className="text-on-surface">
                  {children.length > 1 ? `${childName(report.child_id)} · ` : ''}
                  {new Date(`${report.absence_date}T12:00:00`).toLocaleDateString(i18n.language === 'ar' ? 'ar-EG' : 'en-GB', { weekday: 'short', day: '2-digit', month: 'short' })}
                  {' · '}
                  {t(`attendance.absence.reasons.${report.reason}`)}
                  {report.note ? ` · ${report.note}` : ''}
                </span>
                {report.reported_by === user?.id ? (
                  <Button type="button" size="sm" variant="outline" onClick={() => remove.mutate(report.id)} disabled={remove.isPending}>
                    {t('common.cancel')}
                  </Button>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}
