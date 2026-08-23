import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  inquiry: Record<string, unknown> | null;
  onUpdate: (payload: { id: string; updates: Record<string, unknown> }) => Promise<void>;
  classes: Array<Record<string, unknown>>;
  onMoveToWaitlist: (inquiryId: string, classId: string) => void;
  onScheduleInterview: (inquiryId: string) => void;
  onCreateApplication: (inquiryId: string) => void;
};

export function InquiryDetailModal({ open, onOpenChange, inquiry, classes, onUpdate, onMoveToWaitlist, onScheduleInterview, onCreateApplication }: Props) {
  const { t } = useTranslation();
  const [note, setNote] = useState(String(inquiry?.admin_notes ?? ''));
  const [waitlistClassId, setWaitlistClassId] = useState('');

  const nowMs = useMemo(() => Date.now(), []);
  const age = useMemo(() => {
    if (!inquiry?.child_dob) return '-';
    const years = Math.floor((nowMs - +new Date(String(inquiry.child_dob))) / (365.25 * 24 * 3600 * 1000));
    return `${years}`;
  }, [inquiry, nowMs]);

  if (!inquiry) return null;
  const id = String(inquiry.id);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader><DialogTitle>{t('admissions.detailTitle')}</DialogTitle></DialogHeader>
        <div className="grid gap-2 text-sm md:grid-cols-2">
          <p><strong>{t('admissions.parentName')}:</strong> {String(inquiry.parent_name ?? '-')}</p>
          <p><strong>{t('admissions.parentEmail')}:</strong> {String(inquiry.parent_email ?? '-')}</p>
          <p><strong>{t('admissions.parentPhone')}:</strong> {String(inquiry.parent_phone ?? '-')}</p>
          <p><strong>{t('admissions.childName')}:</strong> {String(inquiry.child_name ?? '-')}</p>
          <p><strong>{t('admissions.childDob')}:</strong> {String(inquiry.child_dob ?? '-')}</p>
          <p><strong>{t('admissions.childAge')}:</strong> {age}</p>
          <p><strong>{t('admissions.preferredClass')}:</strong> {String(inquiry.preferred_class ?? '-')}</p>
          <p><strong>{t('admissions.preferredStartDate')}:</strong> {String(inquiry.preferred_start_date ?? '-')}</p>
          <p><strong>{t('admissions.source')}:</strong> {t(`admissions.sources.${String(inquiry.source ?? 'website')}`)}</p>
          <p><strong>{t('admissions.status')}:</strong> {t(`admissions.statuses.${String(inquiry.status ?? 'new')}`)}</p>
        </div>
        <div className="space-y-1">
          <p className="text-sm font-medium">{t('admissions.message')}</p>
          <p className="rounded-lg border border-outline-variant p-2 text-sm text-on-surface-variant">{String(inquiry.message ?? '-')}</p>
        </div>
        <div className="space-y-1">
          <p className="text-sm font-medium">{t('admissions.internalNotes')}</p>
          <textarea className="min-h-[90px] w-full rounded-lg border border-outline-variant p-2 text-sm" value={note} onChange={(e) => setNote(e.target.value)} />
        </div>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="outline" onClick={() => void onUpdate({ id, updates: { admin_notes: note } }).then(() => toast.success(t('admissions.noteSaved')))}>{t('admissions.addNote')}</Button>
          <Button size="sm" variant="outline" onClick={() => onScheduleInterview(id)}>{t('admissions.scheduleInterview')}</Button>
          <select className="h-9 rounded-lg border border-outline-variant bg-surface text-foreground px-2 text-xs" value={waitlistClassId} onChange={(e) => setWaitlistClassId(e.target.value)}>
            <option value="">{t('admissions.selectClass')}</option>
            {classes.map((c) => <option key={String(c.id)} value={String(c.id)}>{String(c.name_ar ?? c.name_en ?? '-')}</option>)}
          </select>
          <Button size="sm" variant="outline" onClick={() => waitlistClassId ? onMoveToWaitlist(id, waitlistClassId) : toast.error(t('admissions.selectClass'))}>{t('admissions.moveToWaitlist')}</Button>
          <Button size="sm" variant="outline" onClick={() => toast.message(t('common.comingSoon'))}>{t('admissions.sendEmail')}</Button>
          <Button size="sm" onClick={() => onCreateApplication(id)}>{t('admissions.convertToApplication')}</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
