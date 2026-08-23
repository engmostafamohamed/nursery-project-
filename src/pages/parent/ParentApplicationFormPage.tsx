import { useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';

import { ApplicationSteps } from '@/components/parent/ApplicationSteps';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useApplications } from '@/hooks/useApplications';
import { useAuthSession } from '@/hooks/useAuthSession';
import { useUserProfile } from '@/hooks/useUserProfile';

const requiredDocs = ['birth_certificate', 'vaccination_card', 'parent_id', 'proof_of_address'] as const;

export function ParentApplicationFormPage() {
  const { t } = useTranslation();
  const { id } = useParams();
  const { user } = useAuthSession();
  const { data: profile } = useUserProfile(user?.id);
  const apps = useApplications({ applicationId: id, parentId: user?.id });
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);
  const [terms, setTerms] = useState(false);

  const app = apps.applicationDetail?.application;
  const docs = apps.applicationDetail?.documents ?? [];
  const parentInfo = (app?.parent_info_json as Record<string, unknown> | undefined) ?? {};
  const childInfo = (app?.child_info_json as Record<string, unknown> | undefined) ?? {};

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

  const missingRequired = useMemo(
    () => requiredDocs.filter((d) => !docs.some((doc) => String(doc.document_type) === d)),
    [docs],
  );

  if (!id) return null;
  if (!app) return <p className="text-sm text-on-surface-variant">{t('applications.notFound')}</p>;

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <h1 className="text-lg font-semibold text-on-surface">{t('applications.parentFormTitle')}</h1>
      <ApplicationSteps
        step={step}
        labels={[t('applications.steps.parentInfo'), t('applications.steps.childInfo'), t('applications.steps.documents'), t('applications.steps.review')]}
      />

      {step === 1 ? (
        <div className="grid gap-3 rounded-2xl border border-outline-variant bg-surface-container-lowest p-4 md:grid-cols-2">
          <div className="space-y-2"><Label>{t('applications.parentName')}</Label><Input value={parentForm.full_name} onChange={(e) => setParentForm((p) => ({ ...p, full_name: e.target.value }))} /></div>
          <div className="space-y-2"><Label>{t('applications.parentEmail')}</Label><Input value={parentForm.email} onChange={(e) => setParentForm((p) => ({ ...p, email: e.target.value }))} /></div>
          <div className="space-y-2"><Label>{t('applications.parentPhone')}</Label><Input value={parentForm.phone} onChange={(e) => setParentForm((p) => ({ ...p, phone: e.target.value }))} /></div>
          <div className="space-y-2"><Label>{t('applications.nationalId')}</Label><Input value={parentForm.national_id} onChange={(e) => setParentForm((p) => ({ ...p, national_id: e.target.value }))} /></div>
          <div className="space-y-2 md:col-span-2"><Label>{t('applications.address')}</Label><Input value={parentForm.address} onChange={(e) => setParentForm((p) => ({ ...p, address: e.target.value }))} /></div>
          <div className="space-y-2 md:col-span-2"><Label>{t('applications.emergencyContact')}</Label><Input value={parentForm.emergency_contact} onChange={(e) => setParentForm((p) => ({ ...p, emergency_contact: e.target.value }))} /></div>
        </div>
      ) : null}

      {step === 2 ? (
        <div className="grid gap-3 rounded-2xl border border-outline-variant bg-surface-container-lowest p-4 md:grid-cols-2">
          <div className="space-y-2"><Label>{t('applications.childName')}</Label><Input value={childForm.full_name} onChange={(e) => setChildForm((p) => ({ ...p, full_name: e.target.value }))} /></div>
          <div className="space-y-2"><Label>{t('applications.childDob')}</Label><Input type="date" value={childForm.dob} onChange={(e) => setChildForm((p) => ({ ...p, dob: e.target.value }))} /></div>
          <div className="space-y-2"><Label>{t('applications.gender')}</Label><Input value={childForm.gender} onChange={(e) => setChildForm((p) => ({ ...p, gender: e.target.value }))} /></div>
          <div className="space-y-2 md:col-span-2"><Label>{t('applications.medicalConditions')}</Label><textarea className="min-h-[80px] w-full rounded-lg border border-outline-variant p-2 text-sm" value={childForm.medical_conditions} onChange={(e) => setChildForm((p) => ({ ...p, medical_conditions: e.target.value }))} /></div>
          <div className="space-y-2"><Label>{t('applications.allergies')}</Label><textarea className="min-h-[80px] w-full rounded-lg border border-outline-variant p-2 text-sm" value={childForm.allergies} onChange={(e) => setChildForm((p) => ({ ...p, allergies: e.target.value }))} /></div>
          <div className="space-y-2"><Label>{t('applications.specialNeeds')}</Label><textarea className="min-h-[80px] w-full rounded-lg border border-outline-variant p-2 text-sm" value={childForm.special_needs} onChange={(e) => setChildForm((p) => ({ ...p, special_needs: e.target.value }))} /></div>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={childForm.photo_privacy} onChange={(e) => setChildForm((p) => ({ ...p, photo_privacy: e.target.checked }))} />{t('applications.photoPrivacyConsent')}</label>
        </div>
      ) : null}

      {step === 3 ? (
        <div className="space-y-3 rounded-2xl border border-outline-variant bg-surface-container-lowest p-4">
          {[...requiredDocs, 'medical_report', 'other'].map((docType) => (
            <div key={docType} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-outline-variant bg-surface text-foreground p-2">
              <p className="text-sm">{t(`applications.documentTypes.${docType}`)}</p>
              <input
                type="file"
                accept=".pdf,image/*"
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
            </div>
          ))}
          <div className="text-xs text-on-surface-variant">{t('applications.uploadedCount', { count: docs.length })}</div>
        </div>
      ) : null}

      {step === 4 ? (
        <div className="space-y-3 rounded-2xl border border-outline-variant bg-surface-container-lowest p-4">
          <p className="text-sm">{t('applications.reviewText')}</p>
          <p className="text-xs text-on-surface-variant">{t('applications.missingRequired', { count: missingRequired.length })}</p>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={terms} onChange={(e) => setTerms(e.target.checked)} />{t('applications.termsAccept')}</label>
        </div>
      ) : null}

      <div className="flex justify-between">
        <Button variant="outline" disabled={step === 1} onClick={() => setStep((s) => Math.max(1, s - 1) as 1 | 2 | 3 | 4)}>{t('common.previous')}</Button>
        <div className="flex gap-2">
          <Button
            variant="outline"
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
