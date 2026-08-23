import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import type { ScheduleRowInput } from '@/hooks/useStaffSchedules';

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialRows: ScheduleRowInput[];
  onSave: (rows: ScheduleRowInput[]) => Promise<void>;
};

const week = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const;

export function StaffScheduleEditor({ open, onOpenChange, initialRows, onSave }: Props) {
  const { t } = useTranslation();
  const [rows, setRows] = useState<ScheduleRowInput[]>(
    initialRows.length
      ? initialRows
      : week.map((_, day) => ({ day_of_week: day, start_time: '08:00', end_time: '16:00', is_working_day: day < 5 })),
  );

  const totalHours = useMemo(
    () =>
      rows.reduce((sum, row) => {
        if (!row.is_working_day || !row.start_time || !row.end_time) return sum;
        const [sh, sm] = row.start_time.split(':').map(Number);
        const [eh, em] = row.end_time.split(':').map(Number);
        return sum + Math.max(0, (eh * 60 + em - (sh * 60 + sm)) / 60);
      }, 0),
    [rows],
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{t('staff.scheduleEditorTitle')}</DialogTitle>
        </DialogHeader>
        <div className="space-y-2">
          {rows.map((row, idx) => (
            <div key={row.day_of_week} className="grid grid-cols-4 gap-2 rounded-lg border border-outline-variant p-2">
              <p className="text-sm">{t(`onboarding.weekDays.${week[row.day_of_week]}`)}</p>
              <label className="flex items-center gap-2 text-xs">
                <input
                  type="checkbox"
                  checked={row.is_working_day}
                  onChange={(e) => {
                    const next = [...rows];
                    next[idx] = { ...row, is_working_day: e.target.checked };
                    setRows(next);
                  }}
                />
                {t('staff.workingDay')}
              </label>
              <input
                type="time"
                disabled={!row.is_working_day}
                value={row.start_time ?? ''}
                onChange={(e) => {
                  const next = [...rows];
                  next[idx] = { ...row, start_time: e.target.value };
                  setRows(next);
                }}
              />
              <input
                type="time"
                disabled={!row.is_working_day}
                value={row.end_time ?? ''}
                onChange={(e) => {
                  const next = [...rows];
                  next[idx] = { ...row, end_time: e.target.value };
                  setRows(next);
                }}
              />
            </div>
          ))}
          <p className="text-sm text-on-surface-variant">{t('staff.totalHoursPerWeek', { hours: totalHours.toFixed(1) })}</p>
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>{t('common.cancel')}</Button>
          <Button
            onClick={async () => {
              await onSave(rows);
              toast.success(t('staff.scheduleUpdated'));
              onOpenChange(false);
            }}
          >
            {t('settings.actions.save')}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
