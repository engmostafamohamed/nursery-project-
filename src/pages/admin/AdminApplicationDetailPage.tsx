import { useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';

import { DocumentVerificationModal } from '@/components/admin/DocumentVerificationModal';
import { ApplicationReviewTabs } from '@/components/admin/applications/ApplicationReviewTabs';
import { ApplicationDocumentPreview } from '@/components/applications/ApplicationDocumentPreview';
import { ChatPanel } from '@/components/chat/ChatPanel';
import { PaymentHistoryTable } from '@/components/financial/PaymentHistoryTable';
import { Button } from '@/components/ui/button';
import { MaterialSymbol } from '@/components/ui/MaterialSymbol';
import { useActiveNurseryId } from '@/hooks/useActiveNurseryId';
import { useApplications } from '@/hooks/useApplications';
import { useAuthSession } from '@/hooks/useAuthSession';
import { usePaymentHistory } from '@/hooks/usePaymentHistory';

const requiredDocs = ['birth_certificate', 'vaccination_card', 'parent_id', 'proof_of_address'] as const;

function readText(source: Record<string, unknown>, key: string): string {
  const value = source[key];
  return typeof value === 'string' ? value.trim() : '';
}

function applicantChildName(childInfo: Record<string, unknown>): string {
  return readText(childInfo, 'full_name_en') || readText(childInfo, 'full_name') || readText(childInfo, 'full_name_ar') || '-';
}

function parentAccountName(parentUser: Record<string, unknown> | null | undefined): string {
  if (!parentUser) return '';
  return readText(parentUser, 'name_en') || readText(parentUser, 'name_ar') || readText(parentUser, 'email');
}

export function AdminApplicationDetailPage() {
  const { t } = useTranslation();
  const { id } = useParams();
  const { user } = useAuthSession();
  const { activeNurseryId } = useActiveNurseryId();
  const apps = useApplications({ nurseryId: activeNurseryId ?? undefined, applicationId: id });
  const [selectedDoc, setSelectedDoc] = useState<Record<string, unknown> | null>(null);
  const [reviewMessage, setReviewMessage] = useState('');
  const [admissionsChatOpen, setAdmissionsChatOpen] = useState(false);
  const data = apps.applicationDetail;
  const applicationParentId = typeof data?.application.parent_id === 'string' ? data.application.parent_id : undefined;
  const applicationNurseryId =
    typeof data?.application.nursery_id === 'string' ? data.application.nursery_id : activeNurseryId ?? undefined;
  const paymentHistory = usePaymentHistory({
    applicationId: id,
    parentId: applicationParentId,
    nurseryId: applicationNurseryId,
    limit: 12,
  });

  const allRequiredVerified = useMemo(() => {
    const docs = data?.documents ?? [];
    return requiredDocs.every((d) => docs.some((doc) => String(doc.document_type) === d && Boolean(doc.verified)));
  }, [data?.documents]);

  if (!id) return null;
  if (apps.isLoading) return <p className="text-sm text-on-surface-variant">{t('common.loading')}</p>;
  if (!data) return <p className="text-sm text-on-surface-variant">{t('applications.notFound')}</p>;
  const app = data.application;
  const parent = (app.parent_info_json as Record<string, unknown> | undefined) ?? {};
  const child = (app.child_info_json as Record<string, unknown> | undefined) ?? {};
  const parentUser = data.parent_user;
  const accountName = parentAccountName(parentUser);
  const accountUsername = readText(parentUser ?? {}, 'username');
  const status = String(app.status);
  const canReviewApprove = ['submitted', 'under_review', 'documents_pending'].includes(status);
  const hasConfirmedApplicationPayment = paymentHistory.data.some((row) => row.paidAmount > 0);
  const canApprove = canReviewApprove && hasConfirmedApplicationPayment;
  const parentId = typeof app.parent_id === 'string' ? app.parent_id : '';
  const parentEmail =
    (typeof parent.email === 'string' && parent.email) ||
    (typeof (parent.mother as Record<string, unknown> | undefined)?.email === 'string'
      ? (parent.mother as Record<string, unknown>).email
      : typeof (parent.father as Record<string, unknown> | undefined)?.email === 'string'
        ? (parent.father as Record<string, unknown>).email
        : '') ||
    '';

  const statusLabel = t(`applications.statuses.${status}`, { defaultValue: status });

  const handleApprove = async () => {
    if (!canApprove) return;
    await apps.updateApplicationStatus({
      id,
      status: 'approved',
      reviewedBy: user?.id,
      parentEmail: String(parentEmail),
      nurseryId: String(app.nursery_id || activeNurseryId || ''),
      parentId,
    });
    toast.success(t('applications.approvedToast'));
  };

  const handleRequestDocuments = async () => {
    const parentMessage = reviewMessage.trim() || t('applications.defaultDocumentsPendingMessage');
    await apps.updateApplicationStatus({
      id,
      status: 'documents_pending',
      reviewedBy: user?.id,
      parentEmail: String(parentEmail),
      nurseryId: activeNurseryId ?? undefined,
      parentId,
      reason: parentMessage,
      chatMessage: parentMessage,
      openChat: Boolean(parentId),
    });
    setAdmissionsChatOpen(Boolean(parentId));
    toast.success(t('applications.updated'));
  };

  const handleReject = async () => {
    const parentMessage = reviewMessage.trim() || t('applications.defaultRejectedMessage');
    await apps.updateApplicationStatus({
      id,
      status: 'rejected',
      reviewedBy: user?.id,
      reason: parentMessage,
      parentEmail: String(parentEmail),
      nurseryId: activeNurseryId ?? undefined,
      parentId,
      chatMessage: parentMessage,
      openChat: Boolean(parentId),
    });
    setAdmissionsChatOpen(Boolean(parentId));
    toast.success(t('applications.rejectedToast'));
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <header className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-outline-variant bg-surface-container-lowest p-4">
        <div className="min-w-0">
          <h1 className="text-lg font-semibold text-on-surface">{t('applications.detailTitle')}</h1>
          <p className="mt-1 text-xs text-on-surface-variant">
            {applicantChildName(child)}
          </p>
          <p className="mt-1 text-xs text-on-surface-variant">
            {t('applications.parentAccount')}: {accountName || t('applications.noParentAccount')}
          </p>
          <p className="mt-1 text-xs text-on-surface-variant">
            {t('applications.parentUsername')}: {accountUsername || '-'}
          </p>
        </div>
        <div className="flex items-center gap-2 rounded-full bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
          <MaterialSymbol name="fact_check" size="text-base" />
          <span>{statusLabel}</span>
        </div>
      </header>

      {/* Data review tabs */}
      <ApplicationReviewTabs parentInfo={parent} childInfo={child} />

      <PaymentHistoryTable
        title={t('financial.paymentHistory.applicationTitle', { defaultValue: 'Application payment history' })}
        rows={paymentHistory.data}
        isLoading={paymentHistory.isLoading}
        showParent={false}
        linkBase="/admin/invoices"
      />

      {/* Documents section (retained) */}
      <section className="space-y-2 rounded-xl border border-outline-variant bg-surface-container-lowest p-3">
        <h2 className="text-sm font-semibold text-on-surface">{t('applications.documents')}</h2>
        {data.documents.length === 0 && (
          <p className="text-sm italic text-on-surface-variant/60">{t('applications.noDocuments')}</p>
        )}
        {data.documents.map((doc) => {
          const verified = Boolean(doc.verified);
          return (
            <ApplicationDocumentPreview
              key={String(doc.id)}
              document={doc}
              actions={(
                <>
                <Button size="sm" variant="outline" onClick={() => setSelectedDoc(doc)}>{t('applications.reviewDoc')}</Button>
                <Button
                  size="sm"
                  onClick={() => void apps.verifyDocument({
                    documentId: String(doc.id),
                    verified: !verified,
                    notes: String(doc.notes ?? ''),
                    reviewerId: user?.id,
                  }).then(() => toast.success(t('applications.updated')))}
                >
                  {verified ? t('applications.markUnverified') : t('applications.markVerified')}
                </Button>
                </>
              )}
            />
          );
        })}
      </section>

      {/* Actions */}
      <section className="space-y-3 rounded-xl border border-outline-variant bg-surface-container-lowest p-3">
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => void apps.updateApplicationStatus({ id, status: 'under_review', reviewedBy: user?.id, parentEmail: String(parentEmail), nurseryId: activeNurseryId ?? undefined })}>
            {t('applications.startReview')}
          </Button>
          <Button variant="outline" onClick={() => void handleRequestDocuments()}>
            {t('applications.requestMoreDocs')}
          </Button>
          <Button onClick={() => void handleApprove()} disabled={!canApprove}>
            {t('applications.approve')}
          </Button>
          {!canReviewApprove ? (
            <p className="self-center text-xs text-on-surface-variant">
              {t('applications.approvePendingOnlyHint', {
                defaultValue: 'Approve is enabled only for applications that are pending review.',
              })}
            </p>
          ) : null}
          {canReviewApprove && !hasConfirmedApplicationPayment ? (
            <p className="self-center text-xs text-on-surface-variant">
              {t('applications.approveNeedsPaymentHint', {
                defaultValue: 'Approve is enabled after finance confirms at least one package payment.',
              })}
            </p>
          ) : null}
          {!allRequiredVerified ? (
            <p className="self-center text-xs text-on-surface-variant">
              {t('applications.approveWithoutDocsHint')}
            </p>
          ) : null}
        </div>
        <div className="flex flex-wrap gap-2">
          <input
            className="h-10 flex-1 rounded-lg border border-outline-variant px-3 text-sm"
            placeholder={t('applications.parentMessage')}
            value={reviewMessage}
            onChange={(e) => setReviewMessage(e.target.value)}
          />
          <Button
            variant="outline"
            onClick={() => void handleReject()}
          >
            {t('applications.reject')}
          </Button>
        </div>
      </section>

      {admissionsChatOpen && parentId && user?.id ? (
        <section className="space-y-2 rounded-xl border border-outline-variant bg-surface-container-lowest p-3">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-sm font-semibold text-on-surface">{t('applications.parentChat')}</h2>
            <Button variant="outline" size="sm" onClick={() => setAdmissionsChatOpen(false)}>
              {t('common.close')}
            </Button>
          </div>
          <ChatPanel
            role="admin"
            currentUserId={user.id}
            nurseryId={activeNurseryId ?? null}
            languagePref="both"
            initialParticipantId={parentId}
            className="h-[520px]"
          />
        </section>
      ) : null}

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
