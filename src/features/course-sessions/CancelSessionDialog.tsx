import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { invalidFieldClass } from '@/components/ui/FieldError';
import { FormField, FormProblem } from '@/components/ui/FormField';
import { MaterialSymbol } from '@/components/ui/MaterialSymbol';
import { Textarea } from '@/components/ui/textarea';
import { formatDay } from '@/lib/datetime';
import { cn } from '@/lib/utils';

import { REASON_MAX, reasonIssue } from './courseSessions';
import { courseSessionErrorKey } from './courseSessionsApi';
import type { useCourseSessionChanges } from './useCourseSessions';

/**
 * Cancelling one session, always with a reason: the children who stay at the nursery during it are
 * charged that time as extra time, and their parents read the reason in the end-of-day notice.
 */
export function CancelSessionDialog({ date, cancel, onClose }: {
  date: string;
  cancel: ReturnType<typeof useCourseSessionChanges>['cancel'];
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const [reason, setReason] = useState('');
  const [tried, setTried] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const issue = reasonIssue(reason);
  const shownIssue = tried && issue ? t(`courseSessions.reasonIssues.${issue}`, { max: REASON_MAX }) : null;

  const submit = async () => {
    setTried(true);
    if (issue || cancel.isPending) return;
    setProblem(null);
    try {
      const { rebilled } = await cancel.mutateAsync({ date, reason });
      toast.success(t('courseSessions.cancelDone'), rebilled ? { description: t('courseSessions.rebilled', { count: rebilled }) } : undefined);
      onClose();
    } catch (error) {
      setProblem(t(courseSessionErrorKey(error)));
    }
  };

  return (
    <Dialog open onOpenChange={(open) => !open && !cancel.isPending && onClose()}>
      <DialogContent className="max-w-md" data-testid="cancel-session-dialog">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <MaterialSymbol name="event_busy" size="text-xl" className="text-error" />
            {t('courseSessions.cancelTitle', { date: formatDay(date, { weekday: 'long', day: 'numeric', month: 'long' }) })}
          </DialogTitle>
          <DialogDescription>{t('courseSessions.cancelBody')}</DialogDescription>
        </DialogHeader>
        <FormField id="session-reason" label={t('courseSessions.reason')} hint={t('courseSessions.reasonHint')} error={shownIssue}>
          <Textarea
            id="session-reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder={t('courseSessions.reasonPlaceholder')}
            aria-invalid={Boolean(shownIssue)}
            aria-describedby={shownIssue ? 'session-reason-error' : 'session-reason-hint'}
            className={cn('min-h-24', shownIssue && invalidFieldClass)}
            autoFocus
          />
        </FormField>
        <p className={cn('-mt-2 text-end text-xs', reason.trim().length > REASON_MAX ? 'text-error' : 'text-on-surface-variant')}>
          {reason.trim().length}/{REASON_MAX}
        </p>
        <FormProblem message={problem} />
        <DialogFooter className="gap-2">
          <Button type="button" variant="outline" onClick={onClose} disabled={cancel.isPending}>{t('courseSessions.keep')}</Button>
          <Button type="button" variant="destructive" onClick={() => void submit()} disabled={cancel.isPending} data-testid="cancel-session-confirm">
            {cancel.isPending ? t('common.saving') : t('courseSessions.cancelConfirm')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
