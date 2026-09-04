import { useEffect, useMemo, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';

import { ApplicationDocumentPreview } from '@/components/applications/ApplicationDocumentPreview';
import { PaymentHistoryTable } from '@/components/financial/PaymentHistoryTable';
import { ApplicationPackagePaymentCard } from '@/components/parent/ApplicationPackagePaymentCard';
import { ApplicationSteps } from '@/components/parent/ApplicationSteps';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useApplications } from '@/hooks/useApplications';
import { useApplicationPackagePayment } from '@/hooks/useApplicationPackagePayment';
import { useAuthSession } from '@/hooks/useAuthSession';
import { usePaymentHistory } from '@/hooks/usePaymentHistory';
import { useUserProfile } from '@/hooks/useUserProfile';

const requiredDocs = ['birth_certificate', 'vaccination_card', 'parent_id', 'proof_of_address'] as const;

function readApplicationName(childInfo: Record<string, unknown>) {
  const keys = ['full_name_en', 'full_name', 'full_name_ar'];
  for (const key of keys) {
    const value = childInfo[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return '-';
}

function statusPresentation(
  status: string,
  t: (key: string, options?: Record<string, unknown>) => string,
) {
  if (status === 'approved') {
    return {
      icon: 'verified',
      tone: 'border-success/30 bg-success/10 text-success',
      title: t('applications.statusAcceptedTitle', { defaultValue: 'Application accepted' }),
      body: t('applications.statusAcceptedBody', {
        defaultValue: 'Your child is accepted. Complete or review payment from the package section below.',
      }),
    };
  }
  if (status === 'rejected') {
    return {
      icon: 'cancel',
      tone: 'border-error/30 bg-error/10 text-error',
      title: t('applications.statusRejectedTitle', { defaultValue: 'Application not accepted' }),
      body: t('applications.statusRejectedBody', {
        defaultValue: 'The nursery did not accept this application. Check nursery messages for details.',
      }),
    };
  }
  if (status === 'documents_pending') {
    return {
      icon: 'upload_file',
      tone: 'border-warning/30 bg-warning/10 text-warning',
      title: t('applications.statusDocumentsTitle', { defaultValue: 'Documents needed' }),
      body: t('applications.statusDocumentsBody', {
        defaultValue: 'Upload the requested files, then submit again for review.',
      }),
    };
  }
  if (status === 'under_review' || status === 'submitted') {
    return {
      icon: 'manage_search',
      tone: 'border-primary/30 bg-primary/10 text-primary',
      title: t('applications.statusReviewTitle', { defaultValue: 'Under nursery review' }),
      body: t('applications.statusReviewBody', {
        defaultValue: 'Your application is with admissions. You can choose a package and pay while review continues.',
      }),
    };
  }
  return {
    icon: 'edit_document',
    tone: 'border-outline-variant bg-surface text-on-surface',
    title: t('applications.statusDraftTitle', { defaultValue: 'Draft application' }),
    body: t('applications.statusDraftBody', {
      defaultValue: 'Complete the information, upload required documents, choose a package, and submit.',
    }),
  };
}

function PanelHeader({ icon, title, body }: { icon: string; title: string; body?: string }) {
  return (
    <div className="flex items-start gap-3">
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
        <span className="material-symbols-outlined text-xl" aria-hidden>{icon}</span>
      </span>
      <div className="min-w-0">
        <h2 className="text-base font-semibold text-on-surface">{title}</h2>
        {body ? <p className="mt-1 text-xs leading-5 text-on-surface-variant">{body}</p> : null}
      </div>
    </div>
  );
}

const fieldClassName = 'grid gap-3 rounded-xl border border-outline-variant bg-surface p-4 shadow-sm md:grid-cols-2 disabled:opacity-80';
const textareaClassName = 'min-h-[96px] w-full rounded-md border border-outline-variant bg-surface px-3 py-2 text-sm text-on-surface transition focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20';

export function ParentApplicationFormPage() {
  const { t } = useTranslation();
  const { id } = useParams();
  const [searchParams] = useSearchParams();
  const { user } = useAuthSession();
  const { data: profile } = useUserProfile(user?.id);
  const apps = useApplications({ applicationId: id, parentId: user?.id });
  const [step, setStep] = useState<1 | 2 | 3 | 4>(searchParams.get('newChild') === '1' ? 2 : 1);
  const [terms, setTerms] = useState(false);

  const app = apps.applicationDetail?.application;
  const docs = useMemo(() => apps.applicationDetail?.documents ?? [], [apps.applicationDetail?.documents]);
  const parentInfo = (app?.parent_info_json as Record<string, unknown> | undefined) ?? {};
  const childInfo = (app?.child_info_json as Record<string, unknown> | undefined) ?? {};
  const status = String(app?.status ?? 'draft');
  const paymentHistory = usePaymentHistory({
    applicationId: id,
    parentId: user?.id,
    nurseryId: typeof app?.nursery_id === 'string' ? app.nursery_id : undefined,
    limit: 6,
  });
  const applicationPackagePayment = useApplicationPackagePayment({
    applicationId: id,
    parentId: user?.id,
    nurseryId: typeof app?.nursery_id === 'string' ? app.nursery_id : undefined,
  });

  const [parentForm, setParentForm] = useState({
    full_name: String(parentInfo.full_name ?? profile?.name_ar ?? ''),
    email: String(parentInfo.email ?? profile?.email ?? ''),
    phone: String(parentInfo.phone ?? profile?.phone ?? ''),
    national_id: String(parentInfo.national_id ?? ''),
    address: String(parentInfo.address ?? ''),
    emergency_contact: String(parentInfo.emergency_contact ?? ''),
  });
  const [childForm, setChildForm] = useState({
    full_name: String(childInfo.full_name ?? ''),
    dob: String(childInfo.dob ?? ''),
    gender: String(childInfo.gender ?? ''),
    medical_conditions: String(childInfo.medical_conditions ?? ''),
    allergies: String(childInfo.allergies ?? ''),
    special_needs: String(childInfo.special_needs ?? ''),
    photo_privacy: Boolean(childInfo.photo_privacy ?? false),
  });

  useEffect(() => {
    if (!app) return;
    setParentForm({
      full_name: String(parentInfo.full_name ?? profile?.name_ar ?? ''),
      email: String(parentInfo.email ?? profile?.email ?? ''),
      phone: String(parentInfo.phone ?? profile?.phone ?? ''),
      national_id: String(parentInfo.national_id ?? ''),
      address: String(parentInfo.address ?? ''),
      emergency_contact: String(parentInfo.emergency_contact ?? ''),
    });
    setChildForm({
      full_name: String(childInfo.full_name ?? ''),
      dob: String(childInfo.dob ?? ''),
      gender: String(childInfo.gender ?? ''),
      medical_conditions: String(childInfo.medical_conditions ?? ''),
      allergies: String(childInfo.allergies ?? ''),
      special_needs: String(childInfo.special_needs ?? ''),
      photo_privacy: Boolean(childInfo.photo_privacy ?? false),
    });
    setTerms(Boolean(app.terms_accepted));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [app?.id]);

  const missingRequired = useMemo(
    () => requiredDocs.filter((d) => !docs.some((doc) => String(doc.document_type) === d)),
    [docs],
  );

  if (!id) return null;
  if (apps.isLoading) return <p className="text-sm text-on-surface-variant">{t('common.loading')}</p>;
  if (!app) return <p className="text-sm text-on-surface-variant">{t('applications.notFound')}</p>;
  const canEditApplication = status === 'draft';
  const canUploadDocuments = status === 'draft' || status === 'documents_pending';
  const canSubmitApplication = status === 'draft' || status === 'documents_pending';
  const statusUi = statusPresentation(status, t);

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <section className="overflow-hidden rounded-xl border border-outline-variant bg-surface shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4 border-b border-outline-variant bg-surface-container-lowest px-4 py-5 sm:px-5">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase text-primary">{t('applications.parentFormTitle')}</p>
            <h1 className="mt-1 text-2xl font-semibold text-on-surface">{readApplicationName(childInfo)}</h1>
          </div>
          <span className={`inline-flex items-center gap-2 rounded-md border px-3 py-2 text-xs font-semibold ${statusUi.tone}`}>
            <span className="material-symbols-outlined text-base" aria-hidden>{statusUi.icon}</span>
            {t(`applications.statuses.${status}`, { defaultValue: status })}
          </span>
        </div>
        <div className="grid gap-0 lg:grid-cols-[minmax(0,1fr)_minmax(260px,360px)]">
          <div className="px-4 py-5 sm:px-5">
            <PanelHeader icon={statusUi.icon} title={statusUi.title} body={statusUi.body} />
          </div>
          <div className="border-t border-outline-variant bg-surface-container-lowest px-4 py-4 sm:px-5 lg:border-l lg:border-t-0">
            <p className="text-xs font-semibold uppercase text-on-surface-variant">{t('applications.applicationId')}</p>
            <p className="mt-1 break-all font-mono text-xs text-on-surface">{id}</p>
          </div>
        </div>
      </section>

      {!canEditApplication ? (
        <div className="rounded-xl border border-outline-variant bg-surface-container-lowest p-4 text-sm leading-6 text-on-surface-variant shadow-sm">
          {status === 'documents_pending'
            ? t('applications.lockedDocumentsPending')
            : t('applications.lockedAfterReview')}
        </div>
      ) : null}

      <ApplicationPackagePaymentCard
        packages={applicationPackagePayment.packages}
        invoice={applicationPackagePayment.invoice}
        isLoading={applicationPackagePayment.isLoading}
        isSelecting={applicationPackagePayment.isSelecting}
        canChoose={status !== 'rejected'}
        onSelect={applicationPackagePayment.selectPackage}
      />

      <PaymentHistoryTable
        title={t('financial.paymentHistory.registrationTitle', { defaultValue: 'Registration payment history' })}
        rows={paymentHistory.data}
        isLoading={paymentHistory.isLoading}
        showParent={false}
        linkBase="/parent/invoices"
      />

      <ApplicationSteps
        step={step}
        labels={[t('applications.steps.parentInfo'), t('applications.steps.childInfo'), t('applications.steps.documents'), t('applications.steps.review')]}
      />

      {step === 1 ? (
        <fieldset disabled={!canEditApplication} className={fieldClassName}>
          <div className="space-y-2"><Label>{t('applications.parentName')}</Label><Input value={parentForm.full_name} onChange={(e) => setParentForm((p) => ({ ...p, full_name: e.target.value }))} /></div>
          <div className="space-y-2"><Label>{t('applications.parentEmail')}</Label><Input value={parentForm.email} onChange={(e) => setParentForm((p) => ({ ...p, email: e.target.value }))} /></div>
          <div className="space-y-2"><Label>{t('applications.parentPhone')}</Label><Input value={parentForm.phone} onChange={(e) => setParentForm((p) => ({ ...p, phone: e.target.value }))} /></div>
          <div className="space-y-2"><Label>{t('applications.nationalId')}</Label><Input value={parentForm.national_id} onChange={(e) => setParentForm((p) => ({ ...p, national_id: e.target.value }))} /></div>
          <div className="space-y-2 md:col-span-2"><Label>{t('applications.address')}</Label><Input value={parentForm.address} onChange={(e) => setParentForm((p) => ({ ...p, address: e.target.value }))} /></div>
          <div className="space-y-2 md:col-span-2"><Label>{t('applications.emergencyContact')}</Label><Input value={parentForm.emergency_contact} onChange={(e) => setParentForm((p) => ({ ...p, emergency_contact: e.target.value }))} /></div>
        </fieldset>
      ) : null}

      {step === 2 ? (
        <fieldset disabled={!canEditApplication} className={fieldClassName}>
          <div className="space-y-2"><Label>{t('applications.childName')}</Label><Input value={childForm.full_name} onChange={(e) => setChildForm((p) => ({ ...p, full_name: e.target.value }))} /></div>
          <div className="space-y-2"><Label>{t('applications.childDob')}</Label><Input type="date" value={childForm.dob} onChange={(e) => setChildForm((p) => ({ ...p, dob: e.target.value }))} /></div>
          <div className="space-y-2"><Label>{t('applications.gender')}</Label><Input value={childForm.gender} onChange={(e) => setChildForm((p) => ({ ...p, gender: e.target.value }))} /></div>
          <div className="space-y-2 md:col-span-2"><Label>{t('applications.medicalConditions')}</Label><textarea className={textareaClassName} value={childForm.medical_conditions} onChange={(e) => setChildForm((p) => ({ ...p, medical_conditions: e.target.value }))} /></div>
          <div className="space-y-2"><Label>{t('applications.allergies')}</Label><textarea className={textareaClassName} value={childForm.allergies} onChange={(e) => setChildForm((p) => ({ ...p, allergies: e.target.value }))} /></div>
          <div className="space-y-2"><Label>{t('applications.specialNeeds')}</Label><textarea className={textareaClassName} value={childForm.special_needs} onChange={(e) => setChildForm((p) => ({ ...p, special_needs: e.target.value }))} /></div>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={childForm.photo_privacy} onChange={(e) => setChildForm((p) => ({ ...p, photo_privacy: e.target.checked }))} />{t('applications.photoPrivacyConsent')}</label>
        </fieldset>
      ) : null}

      {step === 3 ? (
        <div className="space-y-4 rounded-xl border border-outline-variant bg-surface p-4 shadow-sm">
          <PanelHeader
            icon="upload_file"
            title={t('applications.documents')}
            body={t('applications.documentsHelp', { defaultValue: 'Upload required files as PDF or image files.' })}
          />
          <div className="grid gap-3 md:grid-cols-2">
          {[...requiredDocs, 'medical_report', 'other'].map((docType) => (
            <label key={docType} className="flex min-h-24 flex-col justify-between gap-3 rounded-lg border border-outline-variant bg-surface-container-lowest p-3 text-foreground">
              <span className="text-sm font-semibold">{t(`applications.documentTypes.${docType}`)}</span>
              <input
                type="file"
                accept=".pdf,.jpg,.jpeg,.png,.webp,application/pdf,image/jpeg,image/png,image/webp"
                disabled={!canUploadDocuments}
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (!file || !app.nursery_id) return;
                  void apps.uploadDocument({
                    nurseryId: String(app.nursery_id),
                    applicationId: String(id),
                    documentType: docType as 'birth_certificate' | 'vaccination_card' | 'parent_id' | 'proof_of_address' | 'medical_report' | 'other',
                    file,
                  }).then(() => toast.success(t('applications.documentUploaded')));
                }}
              />
            </label>
          ))}
          </div>
          {docs.length > 0 ? (
            <div className="space-y-2">
              {docs.map((doc) => (
                <ApplicationDocumentPreview key={String(doc.id)} document={doc} />
              ))}
            </div>
          ) : null}
          <div className="text-xs text-on-surface-variant">{t('applications.uploadedCount', { count: docs.length })}</div>
        </div>
      ) : null}

      {step === 4 ? (
        <fieldset disabled={!canEditApplication} className="space-y-4 rounded-xl border border-outline-variant bg-surface p-4 shadow-sm disabled:opacity-80">
          <PanelHeader icon="task_alt" title={t('applications.steps.review')} body={t('applications.reviewText')} />
          <p className="rounded-lg border border-outline-variant bg-surface-container-lowest px-3 py-2 text-xs text-on-surface-variant">{t('applications.missingRequired', { count: missingRequired.length })}</p>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={terms} onChange={(e) => setTerms(e.target.checked)} />{t('applications.termsAccept')}</label>
        </fieldset>
      ) : null}

      <div className="sticky bottom-4 z-10 flex flex-col gap-2 rounded-xl border border-outline-variant bg-surface/95 p-3 shadow-lg backdrop-blur sm:flex-row sm:justify-between">
        <Button variant="outline" disabled={step === 1} onClick={() => setStep((s) => Math.max(1, s - 1) as 1 | 2 | 3 | 4)}>{t('common.previous')}</Button>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Button
            variant="outline"
            disabled={!canEditApplication}
            onClick={() => void apps.saveApplicationDraft({
              id,
              updates: {
                parent_info_json: parentForm,
                child_info_json: childForm,
                terms_accepted: terms,
                parent_id: user?.id,
              },
            }).then(() => toast.success(t('applications.draftSaved')))}
          >
            {t('applications.saveDraft')}
          </Button>
          {step < 4 ? (
            <Button onClick={() => setStep((s) => Math.min(4, s + 1) as 1 | 2 | 3 | 4)}>{t('common.next')}</Button>
          ) : (
            <Button
              disabled={!canSubmitApplication}
              onClick={() => {
                if (!terms || missingRequired.length) {
                  toast.error(t('applications.submitValidation'));
                  return;
                }
                void apps.submitApplication({
                  id,
                  nurseryId: String(app.nursery_id),
                  parentName: parentForm.full_name || t('common.parent'),
                }).then(() => toast.success(t('applications.submittedSuccess')));
              }}
            >
              {t('applications.submit')}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
