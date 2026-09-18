import { useEffect, useMemo, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';

import { DocumentVerificationModal } from '@/components/admin/DocumentVerificationModal';
import { PendingPaymentAttempts } from '@/components/admin/PendingPaymentAttempts';
import { ApplicationReviewTabs } from '@/components/admin/applications/ApplicationReviewTabs';
import { ApplicationDocumentPreview } from '@/components/applications/ApplicationDocumentPreview';
import { ChatPanel } from '@/components/chat/ChatPanel';
import { PaymentHistoryTable } from '@/components/financial/PaymentHistoryTable';
import { Button } from '@/components/ui/button';
import { MaterialSymbol } from '@/components/ui/MaterialSymbol';
import { useActiveNurseryId } from '@/hooks/useActiveNurseryId';
import { useApplications } from '@/hooks/useApplications';
import { useAuthSession } from '@/hooks/useAuthSession';
import { usePaymentAttempts } from '@/hooks/usePaymentAttempts';
import { usePaymentHistory } from '@/hooks/usePaymentHistory';
import { useUserProfile } from '@/hooks/useUserProfile';

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

function SummaryItem({ icon, label, value, mono }: { icon: string; label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex min-w-0 items-start gap-3 rounded-lg border border-outline-variant bg-surface-container-lowest p-3">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
        <MaterialSymbol name={icon} size="text-lg" />
      </span>
      <div className="min-w-0">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-on-surface-variant">{label}</p>
        <p className={`mt-0.5 truncate text-sm font-semibold text-on-surface ${mono ? 'font-mono text-xs' : ''}`} title={value}>{value}</p>
      </div>
    </div>
  );
}

function statusTone(status: string) {
  if (status === 'approved') return 'border-success/30 bg-success/10 text-success';
  if (status === 'rejected') return 'border-error/30 bg-error/10 text-error';
  if (status === 'submitted' || status === 'under_review' || status === 'documents_pending') {
    return 'border-warning/30 bg-warning/10 text-warning';
  }
  return 'border-outline-variant bg-surface-container-lowest text-on-surface-variant';
}

function statusIcon(status: string) {
  if (status === 'approved') return 'verified';
  if (status === 'rejected') return 'cancel';
  if (status === 'documents_pending') return 'upload_file';
  if (status === 'submitted' || status === 'under_review') return 'manage_search';
  return 'edit_document';
}

export function AdminApplicationDetailPage() {
  const { t } = useTranslation();
  const { id } = useParams();
  const { user } = useAuthSession();
  const { data: reviewerProfile } = useUserProfile(user?.id);
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
  // The application's package invoice (newest first); its pending attempts are confirmed from this page.
  const applicationInvoiceId = paymentHistory.data[0]?.invoiceId;
  const paymentAttempts = usePaymentAttempts(applicationInvoiceId);

  // Opening a submitted application starts its review: the parent sees "Under review"
  // as soon as someone at the nursery looks at it, without a separate button click.
  const autoReviewStartedFor = useRef<string | null>(null);
  const applicationStatus = typeof data?.application.status === 'string' ? data.application.status : null;
  const canStartReview = reviewerProfile?.role === 'branch_admin' || reviewerProfile?.role === 'chain_super_admin';
  const startReview = apps.updateApplicationStatus;
  useEffect(() => {
    if (!id || !canStartReview || applicationStatus !== 'submitted') return;
    if (autoReviewStartedFor.current === id) return;
    autoReviewStartedFor.current = id;
    void startReview({
      id,
      status: 'under_review',
      reviewedBy: user?.id,
      nurseryId: applicationNurseryId,
    }).catch(() => {
      // Leave it as submitted; the manual "Start review" button is still available.
      autoReviewStartedFor.current = null;
    });
  }, [applicationNurseryId, applicationStatus, canStartReview, id, startReview, user?.id]);

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
    <div className="w-full max-w-none space-y-5 pb-6">
      <header className="overflow-hidden rounded-xl border border-outline-variant bg-surface shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-outline-variant bg-surface-container-lowest px-4 py-5 sm:px-5">
          <div className="flex min-w-0 items-center gap-4">
            <span className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-xl border ${statusTone(status)}`}>
              <MaterialSymbol name={statusIcon(status)} size="text-2xl" />
            </span>
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase text-primary">{t('applications.detailTitle')}</p>
              <h1 className="mt-1 truncate text-2xl font-semibold text-on-surface">{applicantChildName(child)}</h1>
              <p className="mt-1 text-xs text-on-surface-variant">
                {t('applications.submittedAt')}: {app.submitted_at ? new Date(String(app.submitted_at)).toLocaleString() : '-'}
              </p>
            </div>
          </div>
          <span className={`inline-flex items-center gap-2 rounded-md border px-3 py-2 text-xs font-semibold ${statusTone(status)}`}>
            <MaterialSymbol name={statusIcon(status)} size="text-base" />
            {statusLabel}
          </span>
        </div>
        <div className="grid gap-3 p-4 sm:grid-cols-3 sm:p-5">
          <SummaryItem
            icon="account_circle"
            label={t('applications.parentAccount')}
            value={accountName || t('applications.noParentAccount')}
          />
          <SummaryItem
            icon="alternate_email"
            label={t('applications.parentUsername')}
            value={accountUsername || '-'}
          />
          <SummaryItem
            icon="badge"
            label={t('applications.applicationId')}
            value={id}
            mono
          />
        </div>
      </header>

      {/* Data review tabs */}
      <ApplicationReviewTabs parentInfo={parent} childInfo={child} />

      <PendingPaymentAttempts
        attempts={paymentAttempts.data ?? []}
        onUpdated={async () => {
          await Promise.all([paymentAttempts.refetch(), paymentHistory.refetch()]);
        }}
      />

      <PaymentHistoryTable
        title={t('financial.paymentHistory.applicationTitle', { defaultValue: 'Application payment history' })}
        rows={paymentHistory.data}
        isLoading={paymentHistory.isLoading}
        showParent={false}
        linkBase="/admin/invoices"
      />

      <section className="space-y-4 rounded-xl border border-outline-variant bg-surface p-4 shadow-sm sm:p-5">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-md bg-primary/10 text-primary">
            <MaterialSymbol name="folder_open" size="text-xl" />
          </span>
          <div>
            <h2 className="text-base font-semibold text-on-surface">{t('applications.documents')}</h2>
            <p className="text-xs text-on-surface-variant">
              {t('applications.uploadedCount', { count: data.documents.length })}
            </p>
          </div>
        </div>
        {data.documents.length === 0 && (
          <p className="text-sm text-on-surface-variant">{t('applications.noDocuments')}</p>
        )}
        <div className="space-y-2">
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
        </div>
      </section>

      <section className="rounded-xl border border-outline-variant bg-surface p-4 shadow-sm sm:p-5">
        <div className="mb-4 flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-md bg-primary/10 text-primary">
            <MaterialSymbol name="gavel" size="text-xl" />
          </span>
          <div>
            <h2 className="text-base font-semibold text-on-surface">{t('applications.reviewDecisionTitle', { defaultValue: 'Review decision' })}</h2>
            <p className="text-xs text-on-surface-variant">
              {t('applications.reviewDecisionBody', { defaultValue: 'Approve to create the child profile, request documents, or reject with a message to the parent.' })}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2 border-b border-outline-variant pb-4">
          <Button className="gap-2" variant="outline" onClick={() => void apps.updateApplicationStatus({ id, status: 'under_review', reviewedBy: user?.id, parentEmail: String(parentEmail), nurseryId: activeNurseryId ?? undefined })}>
            <MaterialSymbol name="rate_review" size="text-base" />
            {t('applications.startReview')}
          </Button>
          <Button className="gap-2" variant="outline" onClick={() => void handleRequestDocuments()}>
            <MaterialSymbol name="upload_file" size="text-base" />
            {t('applications.requestMoreDocs')}
          </Button>
          <Button className="gap-2" onClick={() => void handleApprove()} disabled={!canApprove}>
            <MaterialSymbol name="check_circle" size="text-base" />
            {t('applications.approve')}
          </Button>
        </div>
        <div className="flex flex-col gap-2 py-4 text-xs text-on-surface-variant">
          {status === 'draft' ? (
            <p className="flex items-start gap-2 rounded-lg border border-warning/30 bg-warning/10 px-3 py-2 font-medium text-warning">
              <MaterialSymbol name="pending_actions" size="text-base" />
              <span>
                {t('applications.approveDraftHint', {
                  defaultValue: 'The parent has not submitted this application yet. Approve becomes available once they press "Submit application" on their review step — payment confirmation alone is not enough.',
                })}
              </span>
            </p>
          ) : !canReviewApprove ? (
            <p>
              {t('applications.approvePendingOnlyHint', {
                defaultValue: 'Approve is enabled only for applications that are pending review.',
              })}
            </p>
          ) : null}
          {canReviewApprove && !hasConfirmedApplicationPayment ? (
            <p>
              {t('applications.approveNeedsPaymentHint', {
                defaultValue: 'Approve is enabled after finance confirms at least one package payment.',
              })}
            </p>
          ) : null}
          {!allRequiredVerified ? (
            <p>{t('applications.approveWithoutDocsHint')}</p>
          ) : null}
        </div>
        <div className="flex flex-wrap gap-2">
          <input
            className="h-11 min-w-[240px] flex-1 rounded-md border border-outline-variant bg-surface-container-lowest px-3 text-sm text-on-surface transition focus:border-primary focus:bg-surface focus:outline-none focus:ring-2 focus:ring-primary/20"
            placeholder={t('applications.parentMessage')}
            value={reviewMessage}
            onChange={(e) => setReviewMessage(e.target.value)}
          />
          <Button
            variant="outline"
            className="gap-2 border-error/40 text-error hover:bg-error/10"
            onClick={() => void handleReject()}
          >
            <MaterialSymbol name="cancel" size="text-base" />
            {t('applications.reject')}
          </Button>
        </div>
      </section>

      {admissionsChatOpen && parentId && user?.id ? (
        <section className="space-y-3 rounded-xl border border-outline-variant bg-surface p-4 shadow-sm">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-base font-semibold text-on-surface">{t('applications.parentChat')}</h2>
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
