import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { useAuthSession } from '@/hooks/useAuthSession';
import { attendanceErrorKey } from '@/lib/attendanceApi';
import { supabase } from '@/lib/supabase';

const REASONS = ['sick', 'travel', 'family', 'other'] as const;

export type ExcuseTarget = {
  childId: string;
  childName: string;
  /** The day being excused, as YYYY-MM-DD. */
  date: string;
};

/**
 * The nursery records why an absent child is away (the family did not send a notice themselves):
 * a reason and an optional note, saved as the day's absence report. The day then counts as excused.
 */
export function ExcuseAbsenceDialog({
  target,
  nurseryId,
  onClose,
  onDone,
}: {
  target: ExcuseTarget | null;
  nurseryId: string | null;
  onClose: () => void;
  onDone: () => void;
}) {
  const { t } = useTranslation();
  const { user } = useAuthSession();
  const [reason, setReason] = useState<(typeof REASONS)[number]>('sick');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  if (!target) return null;

  const save = async () => {
    if (!nurseryId || !user?.id) return;
    setBusy(true);
    try {
      const { error } = await supabase.from('attendance_absence_reports').insert({
        nursery_id: nurseryId,
        child_id: target.childId,
        absence_date: target.date,
        reason,
        note: note.trim() || null,
        reported_by: user.id,
      } as never);
      if (error) throw error;
      toast.success(t('admin.attendance.excuse.saved'));
      onDone();
    } catch (error) {
      toast.error(t(attendanceErrorKey(error)));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open onOpenChange={(open) => !open && !busy && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>{t('admin.attendance.excuse.title', { name: target.childName })}</DialogTitle>
          <DialogDescription>{t('admin.attendance.excuse.hint')}</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="excuse-reason">{t('admin.attendance.excuse.reason')}</Label>
            <Select id="excuse-reason" value={reason} onChange={(e) => setReason(e.target.value as (typeof REASONS)[number])}>
              {REASONS.map((r) => (
                <option key={r} value={r}>{t(`attendance.absence.reasons.${r}`)}</option>
              ))}
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="excuse-note">{t('admin.attendance.excuse.note')}</Label>
            <Input
              id="excuse-note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder={t('admin.attendance.excuse.notePlaceholder')}
              maxLength={200}
            />
          </div>
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose} disabled={busy}>
            {t('common.cancel')}
          </Button>
          <Button type="button" onClick={() => void save()} disabled={busy} data-testid="excuse-save">
            {busy ? t('common.saving') : t('admin.attendance.excuse.save')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
