import { useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';

import { DocumentVerificationModal } from '@/components/admin/DocumentVerificationModal';
import { ApplicationReviewTabs } from '@/components/admin/applications/ApplicationReviewTabs';
import { Button } from '@/components/ui/button';
import { MaterialSymbol } from '@/components/ui/MaterialSymbol';
import { useApplications } from '@/hooks/useApplications';
import { useAuthSession } from '@/hooks/useAuthSession';
import { useUserProfile } from '@/hooks/useUserProfile';

const requiredDocs = ['birth_certificate', 'vaccination_card', 'parent_id', 'proof_of_address'] as const;

export function AdminApplicationDetailPage() {
  const { t } = useTranslation();
  const { id } = useParams();
  const { user } = useAuthSession();
  const { data: profile } = useUserProfile(user?.id);
  const apps = useApplications({ nurseryId: profile?.nursery_id ?? undefined, applicationId: id });
  const [selectedDoc, setSelectedDoc] = useState<Record<string, unknown> | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const data = apps.applicationDetail;

  const allRequiredVerified = useMemo(() => {
    const docs = data?.documents ?? [];
    return requiredDocs.every((d) => docs.some((doc) => String(doc.document_type) === d && Boolean(doc.verified)));
  }, [data?.documents]);

  if (!id || !data) return null;
  const app = data.application;
  const parent = (app.parent_info_json as Record<string, unknown> | undefined) ?? {};
  const child = (app.child_info_json as Record<string, unknown> | undefined) ?? {};
  const status = String(app.status);
  const parentEmail =
    (typeof parent.email === 'string' && parent.email) ||
    (typeof (parent.mother as Record<string, unknown> | undefined)?.email === 'string'
      ? (parent.mother as Record<string, unknown>).email
      : typeof (parent.father as Record<string, unknown> | undefined)?.email === 'string'
        ? (parent.father as Record<string, unknown>).email
        : '') ||
    '';

  const statusLabel = t(`applications.statuses.${status}`, { defaultValue: status });

  return (
    <div className="space-y-4">
      {/* Header */}
      <header className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-outline-variant bg-surface-container-lowest p-4">
        <div className="min-w-0">
          <h1 className="text-lg font-semibold text-on-surface">{t('applications.detailTitle')}</h1>
          <p className="mt-1 text-xs text-on-surface-variant">
            {typeof child.full_name_en === 'string' ? child.full_name_en : String(child.full_name ?? '-')}
          </p>
        </div>
        <div className="flex items-center gap-2 rounded-full bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
          <MaterialSymbol name="fact_check" size="text-base" />
          <span>{statusLabel}</span>
        </div>
      </header>

      {/* Data review tabs */}
      <ApplicationReviewTabs parentInfo={parent} childInfo={child} />

      {/* Documents section (retained) */}
      <section className="space-y-2 rounded-xl border border-outline-variant bg-surface-container-lowest p-3">
        <h2 className="text-sm font-semibold text-on-surface">{t('applications.documents')}</h2>
        {data.documents.length === 0 && (
          <p className="text-sm italic text-on-surface-variant/60">{t('applications.noDocuments')}</p>
        )}
        {data.documents.map((doc) => (
          <article key={String(doc.id)} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-outline-variant bg-surface text-foreground p-2 text-sm">
            <div>
              <p>{t(`applications.documentTypes.${String(doc.document_type)}`)}</p>
              <p className="text-xs text-on-surface-variant">{Boolean(doc.verified) ? t('applications.verified') : t('applications.notVerified')}</p>
            </div>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={() => setSelectedDoc(doc)}>{t('applications.reviewDoc')}</Button>
              <Button
                size="sm"
                onClick={() => void apps.verifyDocument({
                  documentId: String(doc.id),
                  verified: !Boolean(doc.verified),
                  notes: String(doc.notes ?? ''),
                  reviewerId: user?.id,
                }).then(() => toast.success(t('applications.updated')))}
              >
                {Boolean(doc.verified) ? t('applications.markUnverified') : t('applications.markVerified')}
              </Button>
            </div>
          </article>
        ))}
      </section>

      {/* Actions */}
      <section className="space-y-3 rounded-xl border border-outline-variant bg-surface-container-lowest p-3">
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => void apps.updateApplicationStatus({ id, status: 'under_review', reviewedBy: user?.id, parentEmail: String(parentEmail), nurseryId: profile?.nursery_id ?? undefined })}>
            {t('applications.startReview')}
          </Button>
          <Button variant="outline" onClick={() => void apps.updateApplicationStatus({ id, status: 'documents_pending', reviewedBy: user?.id, parentEmail: String(parentEmail), nurseryId: profile?.nursery_id ?? undefined })}>
            {t('applications.requestMoreDocs')}
          </Button>
          <Button disabled={!allRequiredVerified} onClick={() => void apps.updateApplicationStatus({ id, status: 'approved', reviewedBy: user?.id, parentEmail: String(parentEmail), nurseryId: profile?.nursery_id ?? undefined }).then(() => toast.success(t('applications.approvedToast')))}>
            {t('applications.approve')}
          </Button>
          {status === 'approved' ? (
            <Button
              onClick={() => void apps.activateEnrollment({
                applicationId: id,
                nurseryId: String(app.nursery_id),
                reviewerId: user?.id,
                autoGenerateFirstInvoice: true,
              }).then(() => toast.success(t('applications.enrollmentActivated', { name: String(child.full_name ?? 'Child') })))}
            >
              {t('applications.activateEnrollment')}
            </Button>
          ) : null}
        </div>
        <div className="flex flex-wrap gap-2">
          <input
            className="h-10 flex-1 rounded-lg border border-outline-variant px-3 text-sm"
            placeholder={t('applications.rejectionReason')}
            value={rejectReason}
            onChange={(e) => setRejectReason(e.target.value)}
          />
          <Button
            variant="outline"
            onClick={() => void apps.updateApplicationStatus({
              id,
              status: 'rejected',
              reviewedBy: user?.id,
              reason: rejectReason,
              parentEmail: String(parentEmail),
              nurseryId: profile?.nursery_id ?? undefined,
            }).then(() => toast.success(t('applications.rejectedToast')))}
          >
            {t('applications.reject')}
          </Button>
        </div>
      </section>

      <DocumentVerificationModal
        open={Boolean(selectedDoc)}
        onOpenChange={(o) => !o && setSelectedDoc(null)}
        document={selectedDoc}
        onVerify={async (payload) => {
          await apps.verifyDocument({ documentId: payload.id, verified: payload.verified, notes: payload.notes, reviewerId: user?.id });
          toast.success(t('applications.updated'));
          setSelectedDoc(null);
        }}
      />
    </div>
  );
}
