import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { StatusPill, TableCard, TableEmpty, TableLoading } from '@/components/ui/DataTable';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { LoadError } from '@/components/ui/LoadError';
import { MaterialSymbol } from '@/components/ui/MaterialSymbol';
import { Textarea } from '@/components/ui/textarea';
import { localName } from '@/lib/bilingualName';
import { formatDate } from '@/lib/datetime';
import type { PillTone } from '@/lib/tones';

import { courseRequestErrorKey, decideRequest, type CourseRequest } from './courseRequestsApi';
import { refreshCourseRequests, useCourseRequests } from './useCourseRequests';

const STATUS_TONE: Record<CourseRequest['status'], PillTone> = { pending: 'warning', approved: 'success', declined: 'error', cancelled: 'neutral' };

/** A course's enrolment requests for the admin: approve (the child is enrolled) or decline with a reason; the family hears the answer. */
export function CourseRequestsPanel({ courseId }: { courseId: string }) {
  const { t, i18n } = useTranslation();
  const isAr = i18n.language.startsWith('ar');
  const queryClient = useQueryClient();
  const query = useCourseRequests(courseId);
  const requests = query.data ?? [];
  const [busy, setBusy] = useState<string | null>(null);
  const [declining, setDeclining] = useState<CourseRequest | null>(null);
  const [reason, setReason] = useState('');

  const decide = async (request: CourseRequest, approve: boolean, note = '') => {
    setBusy(request.id);
    try {
      await decideRequest(request.id, approve, note);
      toast.success(t(approve ? 'courseRequests.approved' : 'courseRequests.declined'), { description: t('courseRequests.familyTold') });
      refreshCourseRequests(queryClient, courseId);
      setDeclining(null);
      setReason('');
    } catch (error) {
      toast.error(t(courseRequestErrorKey(error)));
    } finally {
      setBusy(null);
    }
  };

  const pending = requests.filter((r) => r.status === 'pending').length;

  return (
    <TableCard
      title={t('courseRequests.title')}
      count={pending ? t('courseRequests.waiting', { count: pending }) : undefined}
      description={t('courseRequests.hint')}
    >
      {query.isError ? (
        <LoadError inset message={t('courseRequests.loadError')} onRetry={() => void query.refetch()} />
      ) : query.isPending ? (
        <TableLoading rows={3} />
      ) : !requests.length ? (
        <TableEmpty icon="how_to_reg" title={t('courseRequests.emptyTitle')} description={t('courseRequests.emptyHint')} />
      ) : (
        <ul className="divide-y divide-outline-variant">
          {requests.map((r) => (
            <li key={r.id} className="flex flex-wrap items-start gap-3 px-4 py-3 sm:px-5" data-testid="course-request">
              <div className="min-w-0 flex-1 space-y-0.5">
                <p className="font-semibold text-on-surface">{localName(r.child?.full_name_ar, r.child?.full_name_en, isAr)}</p>
                <p className="text-xs text-on-surface-variant">
                  {t('courseRequests.askedBy', { name: localName(r.parent?.name_ar, r.parent?.name_en, isAr), date: formatDate(r.created_at, { day: 'numeric', month: 'short' }) })}
                  {r.parent?.phone ? (
                    <a href={`tel:${r.parent.phone}`} className="ms-2 text-primary hover:underline" dir="ltr">{r.parent.phone}</a>
                  ) : null}
                </p>
                {r.note ? <p className="text-sm text-on-surface">“{r.note}”</p> : null}
                {r.decision_note ? <p className="text-xs text-on-surface-variant">{t('courseRequests.answerNote', { note: r.decision_note })}</p> : null}
              </div>
              {r.status === 'pending' ? (
                <div className="flex shrink-0 gap-2">
                  <Button type="button" size="sm" disabled={busy === r.id} onClick={() => void decide(r, true)} data-testid="course-request-approve">
                    <MaterialSymbol name="check" size="text-base" className="me-1" />
                    {t('courseRequests.approve')}
                  </Button>
                  <Button type="button" size="sm" variant="outline" disabled={busy === r.id} onClick={() => setDeclining(r)}>
                    {t('courseRequests.decline')}
                  </Button>
                </div>
              ) : (
                <StatusPill tone={STATUS_TONE[r.status]}>{t(`courseRequests.status.${r.status}`)}</StatusPill>
              )}
            </li>
          ))}
        </ul>
      )}
      {declining ? (
        <Dialog open onOpenChange={(open) => !open && busy === null && setDeclining(null)}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>{t('courseRequests.declineTitle', { name: localName(declining.child?.full_name_ar, declining.child?.full_name_en, isAr) })}</DialogTitle>
              <DialogDescription>{t('courseRequests.declineHint')}</DialogDescription>
            </DialogHeader>
            <div className="space-y-2">
              <Label htmlFor="course-request-reason">{t('courseRequests.reason')}</Label>
              <Textarea id="course-request-reason" rows={3} maxLength={300} value={reason} onChange={(e) => setReason(e.target.value)} />
            </div>
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => setDeclining(null)}>{t('common.cancel')}</Button>
              <Button type="button" variant="destructive" disabled={busy !== null} onClick={() => void decide(declining, false, reason)}>
                {t('courseRequests.decline')}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      ) : null}
    </TableCard>
  );
}
