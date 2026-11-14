import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';

import { courseRequestErrorKey, requestEnrollment } from './courseRequestsApi';
import { refreshCourseRequests } from './useCourseRequests';

/** Asking to enrol a child in a course: which child (when more than one may ask), and a note for the nursery. */
export function CourseRequestDialog({
  courseId,
  courseTitle,
  kids,
  onClose,
}: {
  courseId: string;
  courseTitle: string;
  /** The family's children who may still ask for this course. */
  kids: { id: string; name: string }[];
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [childId, setChildId] = useState(kids[0]?.id ?? '');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  const send = async () => {
    setBusy(true);
    try {
      await requestEnrollment(courseId, childId, note);
      toast.success(t('parent.courses.catalog.sent'), { description: t('parent.courses.catalog.sentHint') });
      refreshCourseRequests(queryClient);
      onClose();
    } catch (error) {
      toast.error(t(courseRequestErrorKey(error)));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open onOpenChange={(open) => !open && !busy && onClose()}>
      <DialogContent className="max-w-md" data-testid="course-request-dialog">
        <DialogHeader>
          <DialogTitle>{t('parent.courses.catalog.askTitle', { course: courseTitle })}</DialogTitle>
          <DialogDescription>{t('parent.courses.catalog.askHint')}</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          {kids.length > 1 ? (
            <div className="space-y-2">
              <Label htmlFor="course-request-child">{t('parent.courses.catalog.child')}</Label>
              <Select id="course-request-child" value={childId} onChange={(e) => setChildId(e.target.value)}>
                {kids.map((k) => <option key={k.id} value={k.id}>{k.name}</option>)}
              </Select>
            </div>
          ) : (
            <p className="text-sm text-on-surface">{t('parent.courses.catalog.forChild', { name: kids[0]?.name ?? '' })}</p>
          )}
          <div className="space-y-2">
            <Label htmlFor="course-request-note">{t('parent.courses.catalog.note')}</Label>
            <Textarea id="course-request-note" rows={3} maxLength={300} value={note} placeholder={t('parent.courses.catalog.notePlaceholder')} onChange={(e) => setNote(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button type="button" variant="ghost" disabled={busy} onClick={onClose}>{t('common.cancel')}</Button>
          <Button type="button" disabled={busy || !childId} onClick={() => void send()} data-testid="course-request-send">
            {t('parent.courses.catalog.send')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
