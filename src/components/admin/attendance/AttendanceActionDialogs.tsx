import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { attendanceErrorKey, correctAttendance, waiveLateCharge } from '@/lib/attendanceApi';
import { cn } from '@/lib/utils';

const fieldErrorClass = 'border-error ring-1 ring-error/30';

function timeOf(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/** Local date + HH:MM on that date as an ISO timestamp (admin's browser is in the nursery's timezone). */
function isoAt(date: string, time: string): string {
  return new Date(`${date}T${time}:00`).toISOString();
}

export type CorrectionTarget = {
  attendanceId: string;
  date: string;
  childName: string;
  checkIn: string | null;
  checkOut: string | null;
};

/** Admin fixes a day's check-in/out times; the server re-bills extra hours up or down. */
export function CorrectAttendanceDialog({
  target,
  onClose,
  onDone,
}: {
  target: CorrectionTarget | null;
  onClose: () => void;
  onDone: () => void;
}) {
  const { t } = useTranslation();
  const [checkIn, setCheckIn] = useState(() => timeOf(target?.checkIn ?? null));
  const [checkOut, setCheckOut] = useState(() => timeOf(target?.checkOut ?? null));
  const [reason, setReason] = useState('');
  const [tried, setTried] = useState(false);
  const [busy, setBusy] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  if (!target) return null;

  const now = Date.now();
  const inMs = checkIn ? new Date(`${target.date}T${checkIn}:00`).getTime() : NaN;
  const outMs = checkOut ? new Date(`${target.date}T${checkOut}:00`).getTime() : NaN;
  const errors = {
    checkIn: !checkIn
      ? t('attendance.correct.errors.checkInRequired')
      : inMs > now
        ? t('attendance.correct.errors.future')
        : undefined,
    checkOut: checkOut && (outMs <= inMs)
      ? t('attendance.correct.errors.outBeforeIn')
      : checkOut && outMs > now
        ? t('attendance.correct.errors.future')
        : undefined,
    reason: reason.trim().length < 3 ? t('attendance.correct.errors.reasonRequired') : undefined,
  };
  // Times are judged as soon as they change; the reason once the admin tries to save.
  const shown = { checkIn: errors.checkIn, checkOut: errors.checkOut, reason: tried ? errors.reason : undefined };

  const save = async () => {
    setTried(true);
    setServerError(null);
    if (errors.checkIn || errors.checkOut || errors.reason) return;
    setBusy(true);
    try {
      await correctAttendance({
        attendanceId: target.attendanceId,
        checkIn: isoAt(target.date, checkIn),
        checkOut: checkOut ? isoAt(target.date, checkOut) : null,
        reason: reason.trim(),
      });
      onDone();
    } catch (error) {
      setServerError(t(attendanceErrorKey(error)));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('attendance.correct.title')}</DialogTitle>
          <DialogDescription>{t('attendance.correct.description', { name: target.childName, date: target.date })}</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-2">
            <Label>{t('attendance.correct.checkIn')}</Label>
            <Input type="time" value={checkIn} onChange={(e) => setCheckIn(e.target.value)} className={cn(shown.checkIn && fieldErrorClass)} aria-invalid={Boolean(shown.checkIn)} />
            {shown.checkIn ? <p className="text-xs font-medium text-error">{shown.checkIn}</p> : null}
          </div>
          <div className="space-y-2">
            <Label>{t('attendance.correct.checkOut')}</Label>
            <Input type="time" value={checkOut} onChange={(e) => setCheckOut(e.target.value)} className={cn(shown.checkOut && fieldErrorClass)} aria-invalid={Boolean(shown.checkOut)} />
            {shown.checkOut
              ? <p className="text-xs font-medium text-error">{shown.checkOut}</p>
              : <p className="text-xs text-on-surface-variant">{t('attendance.correct.checkOutHint')}</p>}
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label>{t('attendance.correct.reason')}</Label>
            <Input value={reason} onChange={(e) => setReason(e.target.value)} maxLength={300} className={cn(shown.reason && fieldErrorClass)} aria-invalid={Boolean(shown.reason)} />
            {shown.reason ? <p className="text-xs font-medium text-error">{shown.reason}</p> : null}
          </div>
        </div>
        {serverError ? <p className="text-sm font-medium text-error">{serverError}</p> : null}
        <DialogFooter className="mt-4 gap-2">
          <Button variant="outline" onClick={onClose} disabled={busy}>{t('common.cancel')}</Button>
          <Button onClick={() => void save()} disabled={busy}>{busy ? t('common.loading') : t('attendance.correct.save')}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Admin waives a day's extra-hours charge (the invoice is reduced and package hours returned). */
export function WaiveChargeDialog({
  target,
  onClose,
  onDone,
}: {
  target: { attendanceId: string; childName: string; date: string; fee: number } | null;
  onClose: () => void;
  onDone: (manualRefund: boolean) => void;
}) {
  const { t } = useTranslation();
  const [reason, setReason] = useState('');
  const [tried, setTried] = useState(false);
  const [busy, setBusy] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  if (!target) return null;
  const reasonError = tried && reason.trim().length < 3 ? t('attendance.correct.errors.reasonRequired') : undefined;

  const save = async () => {
    setTried(true);
    setServerError(null);
    if (reason.trim().length < 3) return;
    setBusy(true);
    try {
      const result = await waiveLateCharge(target.attendanceId, reason.trim());
      onDone(Boolean(result?.manual_refund));
    } catch (error) {
      setServerError(t(attendanceErrorKey(error)));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('attendance.waive.title')}</DialogTitle>
          <DialogDescription>
            {t('attendance.waive.description', { name: target.childName, date: target.date, fee: target.fee.toFixed(2) })}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <Label>{t('attendance.correct.reason')}</Label>
          <Input value={reason} onChange={(e) => setReason(e.target.value)} maxLength={300} className={cn(reasonError && fieldErrorClass)} aria-invalid={Boolean(reasonError)} />
          {reasonError ? <p className="text-xs font-medium text-error">{reasonError}</p> : null}
        </div>
        {serverError ? <p className="text-sm font-medium text-error">{serverError}</p> : null}
        <DialogFooter className="mt-4 gap-2">
          <Button variant="outline" onClick={onClose} disabled={busy}>{t('common.cancel')}</Button>
          <Button variant="destructive" onClick={() => void save()} disabled={busy}>{busy ? t('common.loading') : t('attendance.waive.confirm')}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
