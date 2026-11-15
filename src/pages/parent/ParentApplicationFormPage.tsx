import { useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';

import { ApplicationDocumentPreview } from '@/components/applications/ApplicationDocumentPreview';
import { PaymentHistoryTable } from '@/components/financial/PaymentHistoryTable';
import { ApplicationExtraHoursPackageCard } from '@/components/parent/ApplicationExtraHoursPackageCard';
import { ApplicationPackagePaymentCard } from '@/components/parent/ApplicationPackagePaymentCard';
import { ApplicationPaymentStep } from '@/components/parent/ApplicationPaymentStep';
import { ApplicationReviewSummary } from '@/components/parent/ApplicationReviewSummary';
import { ApplicationSteps } from '@/components/parent/ApplicationSteps';
import { Button } from '@/components/ui/button';
import { useApplications } from '@/hooks/useApplications';
import { computeExtraHoursDisplayPrice, useApplicationExtraHoursPackage } from '@/hooks/useApplicationExtraHoursPackage';
import { useApplicationPackagePayment, type ApplicationPackageBillingPeriod } from '@/hooks/useApplicationPackagePayment';
import { useAuthSession } from '@/hooks/useAuthSession';
import { useParentAccountProfile } from '@/hooks/useParentAccountProfile';
import { usePaymentHistory } from '@/hooks/usePaymentHistory';
import { useUserProfile } from '@/hooks/useUserProfile';
import { localName } from '@/lib/bilingualName';
import { parentPackageTextsFromSettings } from '@/lib/parentPackageTexts';
import { useSettings } from '@/lib/useSettings';
import { FieldValidationContext, type FieldValidation } from '@/features/child-application/fieldValidation';
import { ApplicationInfoStep } from '@/features/child-application/ApplicationInfoStep';
import { PanelHeader } from '@/features/child-application/ApplicationPanelHeader';
import {
  applicationStepFieldErrors,
  arrayRecordAt,
  childFormFromApplication,
  DOCUMENTS_STEP,
  EMPTY_RECORD,
  hasCompleteApplicationStep,
  hasDocumentFile,
  hasText,
  latestDocumentsByType,
  mergeChildInfo,
  mergeParentInfo,
  parentFormFromApplication,
  parentRequiredValue,
  requiredChildFields,
  requiredDocs,
  requiredParentFields,
  REVIEW_STEP,
  applicationDocumentTypes,
  applicationStepIcons,
  type FieldErrors,
  type JsonRecord,
  type ParentApplicationChildForm,
  type ParentApplicationParentForm,
} from '@/features/child-application/applicationForm';
import { applicationReviewSections } from '@/features/child-application/applicationReview';
import { stepCardClassName } from '@/features/child-application/applicationStyles';
import { DocumentUploadTile } from '@/features/child-application/DocumentUploadTile';
import { nationalityOptions } from '@/lib/nationalities';
import { cn } from '@/lib/utils';

type ApplicationWorkspaceTab = 'information' | 'payments';
// The package and its payment come after the parent has reviewed every answer.
const PACKAGES_STEP = 12;
const PAYMENT_STEP = 13;
const APPLICATION_STEP_COUNT = PAYMENT_STEP;

/** The step a link opens: `?step=packages|payment` (older links use `?tab=packages|checkout`). */
function initialApplicationStep(searchParams: URLSearchParams): number {
  const target = searchParams.get('step') ?? searchParams.get('tab');
  if (target === 'packages') return PACKAGES_STEP;
  if (target === 'payment' || target === 'checkout') return PAYMENT_STEP;
  // A new child starts at the child step; the step gate sends the parent back to any earlier
  // step whose copied parent/family data is incomplete.
  return searchParams.get('newChild') === '1' ? 3 : 1;
}



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
    body: t('applications.statusDraftBody'),
  };
}


function InformationLockedNotice({
  title,
  message,
  onCompleteInformation,
}: {
  title: string;
  message: string;
  onCompleteInformation: () => void;
}) {
  const { t } = useTranslation();
  return (
    <section className="rounded-xl border border-outline-variant bg-surface px-4 py-8 shadow-sm sm:px-6">
      <div className="mx-auto flex max-w-md flex-col items-center text-center">
        <span className="flex h-12 w-12 items-center justify-center rounded-full bg-warning/15 text-warning">
          <span className="material-symbols-outlined text-2xl" aria-hidden>lock</span>
        </span>
        <h2 className="mt-3 text-base font-semibold text-on-surface">{title}</h2>
        <p className="mt-1 text-sm leading-6 text-on-surface-variant">{message}</p>
        <Button type="button" className="mt-4 gap-1" onClick={onCompleteInformation}>
          <span className="material-symbols-outlined text-base" aria-hidden>edit_document</span>
          {t('applications.paymentPackage.completeInformation', { defaultValue: 'Complete information' })}
        </Button>
      </div>
    </section>
  );
}




function ApplicationWorkspaceTabs({
  activeTab,
  setActiveTab,
}: {
  activeTab: ApplicationWorkspaceTab;
  setActiveTab: (tab: ApplicationWorkspaceTab) => void;
}) {
  const { t } = useTranslation();
  const tabs: Array<{ id: ApplicationWorkspaceTab; icon: string; label: string }> = [
    { id: 'information', icon: 'assignment', label: t('applications.tabs.information', { defaultValue: 'Application information' }) },
    { id: 'payments', icon: 'receipt_long', label: t('applications.tabs.paymentHistory', { defaultValue: 'Payment history' }) },
  ];

  return (
    <section className="rounded-xl border border-outline-variant bg-surface p-2 shadow-sm">
      <div className="flex gap-2 overflow-x-auto">
        {tabs.map((tab) => {
          const active = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              aria-pressed={active}
              className={cn(
                'flex h-11 shrink-0 items-center gap-2 rounded-md border px-3 text-sm font-semibold transition',
                active
                  ? 'border-primary bg-primary text-on-primary shadow-sm'
                  : 'border-transparent bg-transparent text-on-surface-variant hover:bg-surface',
              )}
            >
              <span className="material-symbols-outlined text-base" aria-hidden>{tab.icon}</span>
              {tab.label}
            </button>
          );
        })}
      </div>
    </section>
  );
}



// Supabase/PostgREST errors are plain objects, not Error instances.
function errorMessageOf(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (error && typeof error === 'object') {
    const { message, details, hint } = error as { message?: unknown; details?: unknown; hint?: unknown };
    return [message, details, hint].filter((part): part is string => typeof part === 'string' && part.trim().length > 0).join(' — ');
  }
  return typeof error === 'string' ? error : '';
}




export function ParentApplicationFormPage() {
  const { t, i18n } = useTranslation();
  const { id } = useParams();
  const [searchParams] = useSearchParams();
  const { user } = useAuthSession();
  const { data: profile } = useUserProfile(user?.id);
  const apps = useApplications({ applicationId: id, parentId: user?.id });
  const [step, setStep] = useState(() => initialApplicationStep(searchParams));
  const [activeTab, setActiveTab] = useState<ApplicationWorkspaceTab>(
    () => (searchParams.get('tab') === 'payments' ? 'payments' : 'information'),
  );
  // Set by Paymob's redirect back to this page (invoice-checkout return path).
  const returnedFromCheckout = searchParams.get('payment') === 'processing';
  const [terms, setTerms] = useState(false);
  const [submittingApplication, setSubmittingApplication] = useState(false);
  const [selectingPackage, setSelectingPackage] = useState(false);

  const app = apps.applicationDetail?.application;
  const docs = useMemo(() => apps.applicationDetail?.documents ?? [], [apps.applicationDetail?.documents]);
  const parentInfo = (app?.parent_info_json as Record<string, unknown> | undefined) ?? {};
  const childInfo = (app?.child_info_json as Record<string, unknown> | undefined) ?? {};
  const status = String(app?.status ?? 'draft');
  const parentAccount = useParentAccountProfile(
    user?.id,
    typeof app?.nursery_id === 'string' ? app.nursery_id : undefined,
  );
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
  const extraHoursPackage = useApplicationExtraHoursPackage({
    applicationId: id,
    nurseryId: typeof app?.nursery_id === 'string' ? app.nursery_id : undefined,
  });
  const selectedExtraHoursPackageId =
    typeof app?.extra_hours_package_id === 'string' ? app.extra_hours_package_id : null;
  // Without an extra-hours package, extra time is billed per hour at the nursery's late-pickup rate.
  const { settings: nurserySettings } = useSettings();
  const hourlyRate = Number(nurserySettings.late_pickup_fee_per_hour);
  const extraHoursHourlyPlan = Number.isFinite(hourlyRate) && hourlyRate >= 0
    ? {
        rate: hourlyRate,
        graceMinutes: Number(nurserySettings.late_pickup_grace_minutes ?? 0) || 0,
        closingTime: nurserySettings.standard_end_time ? String(nurserySettings.standard_end_time).slice(0, 5) : null,
      }
    : null;
  const previousChildInfo = useMemo(() => {
    const previousApplication = apps.parentApplications.find((row) => {
      if (String(row.id ?? '') === id) return false;
      const previousInfo = (row.child_info_json as JsonRecord | undefined) ?? {};
      return arrayRecordAt(previousInfo, 'emergency_contacts').length > 0;
    });

    // A shared empty record keeps this stable across refetches, so the form below isn't re-seeded (wiping unsaved typing).
    return (previousApplication?.child_info_json as JsonRecord | undefined) ?? EMPTY_RECORD;
  }, [apps.parentApplications, id]);

  const [parentForm, setParentForm] = useState({
    ...parentFormFromApplication(parentInfo, childInfo, profile, parentAccount.data, previousChildInfo),
  });
  const [childForm, setChildForm] = useState({
    ...childFormFromApplication(childInfo, previousChildInfo),
  });
  const [localUploadedDocs, setLocalUploadedDocs] = useState<{
    applicationId: string;
    byType: Record<string, Record<string, unknown>>;
  } | null>(null);

  // Which data the forms were last filled from, so the step gate never judges half-loaded forms.
  const [seededFrom, setSeededFrom] = useState<string | null>(null);
  const stepContentRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!app) return;
    setParentForm(parentFormFromApplication(parentInfo, childInfo, profile, parentAccount.data, previousChildInfo));
    setChildForm(childFormFromApplication(childInfo, previousChildInfo));
    setTerms(Boolean(app.terms_accepted));
    setSeededFrom(`${String(app.id)}|${parentAccount.data ? 'account' : 'no-account'}`);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [app?.id, parentAccount.data?.sourceApplicationId, previousChildInfo]);
  const formsReady =
    !parentAccount.isLoading && seededFrom === `${id}|${parentAccount.data ? 'account' : 'no-account'}`;

  const localDocsForApplication = useMemo(
    () => {
      const uploadedDocs = localUploadedDocs;
      if (!uploadedDocs || uploadedDocs.applicationId !== id) return [];
      return Object.values(uploadedDocs.byType);
    },
    [id, localUploadedDocs],
  );
  const effectiveDocs = useMemo(() => {
    if (!localDocsForApplication.length) return docs;
    const remoteIds = new Set(docs.map((doc) => String(doc.id ?? '')).filter(Boolean));
    const localOnlyDocs = localDocsForApplication.filter((doc) => {
      const docId = String(doc.id ?? '');
      return !docId || !remoteIds.has(docId);
    });
    return localOnlyDocs.length ? [...localOnlyDocs, ...docs] : docs;
  }, [docs, localDocsForApplication]);

  const missingRequired = useMemo(
    () => {
      const latestDocs = latestDocumentsByType(effectiveDocs);
      return requiredDocs.filter((d) => !hasDocumentFile(latestDocs[d]));
    },
    [effectiveDocs],
  );
  const latestDocs = useMemo(() => latestDocumentsByType(effectiveDocs), [effectiveDocs]);
  const visibleDocs = useMemo(
    () => Object.values(latestDocs)
      .filter(hasDocumentFile)
      .sort((a, b) => {
        const aTime = new Date(String(a.uploaded_at ?? '')).getTime();
        const bTime = new Date(String(b.uploaded_at ?? '')).getTime();
        return (Number.isFinite(bTime) ? bTime : -Infinity) - (Number.isFinite(aTime) ? aTime : -Infinity);
      }),
    [latestDocs],
  );
  const missingParentFields = useMemo(
    () => requiredParentFields.filter((field) => !String(parentRequiredValue(parentForm, field) ?? '').trim()),
    [parentForm],
  );
  const missingChildFields = useMemo(
    () => requiredChildFields.filter((field) => !String(childForm[field] ?? '').trim()),
    [childForm],
  );
  const firstInvalidInformationStep = useMemo(() => {
    for (let candidate = 1; candidate <= 8; candidate += 1) {
      if (!hasCompleteApplicationStep(candidate, parentForm, childForm)) return candidate;
    }
    return null;
  }, [childForm, parentForm]);
  const fieldErrors = useMemo(() => {
    const errors: FieldErrors = {};
    for (let candidate = 1; candidate <= 8; candidate += 1) {
      Object.assign(errors, applicationStepFieldErrors(candidate, parentForm, childForm));
    }
    return errors;
  }, [childForm, parentForm]);
  // Fields the parent has left (blur) or that Next/submit flagged; their errors show even when empty.
  const [revealedFields, setRevealedFields] = useState<ReadonlySet<string>>(() => new Set());
  const [focusedField, setFocusedField] = useState<string | null>(null);
  // First step the parent still has to finish (form data, then required documents) before a package can be chosen.
  const firstIncompleteInformationStep = firstInvalidInformationStep ?? (missingRequired.length > 0 ? DOCUMENTS_STEP : null);
  const isInformationComplete = firstIncompleteInformationStep === null;
  const childNationalityOptions = useMemo(() => {
    const options = nationalityOptions(i18n.language.startsWith('ar'));
    // Older applications stored nationality as free text; keep that value selectable so it still shows.
    const current = childForm.nationality.trim();
    return current && !options.some((option) => option.value === current)
      ? [{ value: current, label: current }, ...options]
      : options;
  }, [childForm.nationality, i18n.language]);

  if (!id) return null;
  if (apps.isLoading) return <p className="text-sm text-on-surface-variant">{t('common.loading')}</p>;
  if (!app) return <p className="text-sm text-on-surface-variant">{t('applications.notFound')}</p>;
  const canEditApplication = status === 'draft';
  const canUploadDocuments = status === 'draft' || status === 'documents_pending';
  const canRemoveDocuments = status === 'draft';
  const canSubmitApplication = status === 'draft' || status === 'documents_pending';
  const reviewedAt = typeof app.reviewed_at === 'string' ? app.reviewed_at : null;
  const hasRequestedUpload = status !== 'documents_pending' || !reviewedAt || effectiveDocs.some((doc) => {
    const uploadedAt = new Date(String(doc.uploaded_at ?? '')).getTime();
    return Number.isFinite(uploadedAt) && uploadedAt > new Date(reviewedAt).getTime();
  });
  const isApplicationComplete =
    terms &&
    missingRequired.length === 0 &&
    missingParentFields.length === 0 &&
    missingChildFields.length === 0 &&
    firstInvalidInformationStep === null &&
    hasRequestedUpload;
  const statusUi = statusPresentation(status, t);
  const packageInvoice = applicationPackagePayment.invoice;
  const hasSubmittedPackagePayment = Boolean(packageInvoice && (packageInvoice.pendingAmount > 0 || packageInvoice.paidAmount > 0));
  // Submit stays locked until a package is chosen and paid and the terms are accepted.
  const isSubmitReady = terms && hasSubmittedPackagePayment;
  // A payment submits a draft by itself; the button is only for sending it again (requested
  // documents uploaded) or when the automatic submit did not happen.
  const needsManualSubmit = canSubmitApplication && hasSubmittedPackagePayment;
  const nextPaymentDate = packageInvoice?.dueDate ? new Date(packageInvoice.dueDate).toLocaleDateString() : '-';
  const balanceLabel = packageInvoice
    ? t('invoice.egpAmount', { amount: packageInvoice.balanceDue.toFixed(2) })
    : '-';
  const applicationStepLabels = [
    t('applications.steps.parentInfo', { defaultValue: 'Parent Info' }),
    t('signup.steps.family', { defaultValue: 'Family Details' }),
    t('applications.steps.childInfo', { defaultValue: 'Child Info' }),
    t('signup.steps.enrollment', { defaultValue: 'Future School Plan' }),
    t('signup.steps.health', { defaultValue: 'Health Information' }),
    t('signup.steps.emergency', { defaultValue: 'Emergency Contacts' }),
    t('signup.steps.dailyCare', { defaultValue: 'Daily Routine' }),
    t('signup.steps.pickups', { defaultValue: 'Authorized Pickups' }),
    t('signup.steps.medicationConsents', { defaultValue: 'Medication Consents' }),
    t('applications.steps.documents', { defaultValue: 'Documents' }),
    t('applications.steps.review', { defaultValue: 'Review' }),
    t('applications.steps.packages'),
    t('applications.steps.payment'),
  ];
  const setParentField = <K extends keyof ParentApplicationParentForm>(field: K, value: ParentApplicationParentForm[K]) => {
    setParentForm((prev) => ({ ...prev, [field]: value }));
  };
  const setChildField = <K extends keyof ParentApplicationChildForm>(field: K, value: ParentApplicationChildForm[K]) => {
    setChildForm((prev) => ({ ...prev, [field]: value }));
  };
  const isFieldFilled = (name: string) => {
    const value: unknown = name in parentForm
      ? parentForm[name as keyof ParentApplicationParentForm]
      : childForm[name as keyof ParentApplicationChildForm];
    if (typeof value === 'string') return hasText(value);
    if (Array.isArray(value)) return value.length > 0;
    return Boolean(value);
  };
  const revealField = (name: string) => {
    setRevealedFields((prev) => (prev.has(name) ? prev : new Set(prev).add(name)));
  };
  const fieldValidation: FieldValidation = {
    errorFor: (name) => {
      const messageKey = fieldErrors[name];
      if (!messageKey || !canEditApplication) return undefined;
      // Wait until the parent leaves a field before judging it, but show saved bad values right away.
      const visible = revealedFields.has(name) || (isFieldFilled(name) && focusedField !== name);
      return visible ? t(messageKey) : undefined;
    },
    onFieldFocus: (name) => {
      setFocusedField(name);
      // Editing a value that was already there (e.g. a saved bad phone): keep its error visible while fixing it.
      if (isFieldFilled(name)) revealField(name);
    },
    onFieldBlur: (name) => {
      setFocusedField((current) => (current === name ? null : current));
      revealField(name);
    },
  };
  /** Shows every error of `target` under its field and scrolls to the first one. Returns false when the step is valid. */
  const revealStepErrors = (target: number) => {
    const names = Object.keys(applicationStepFieldErrors(target, parentForm, childForm));
    if (names.length === 0) return false;
    setRevealedFields((prev) => new Set([...prev, ...names]));
    requestAnimationFrame(() => {
      const firstError = document.querySelector('[data-field-invalid="true"]');
      const field = firstError?.parentElement;
      field?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      field?.querySelector<HTMLElement>('input, textarea, button')?.focus({ preventScroll: true });
    });
    return true;
  };
  // Step gate: the parent cannot move past a step until it is complete: its required fields,
  // the required documents, the accepted terms (review), then a chosen package. Steps the parent
  // can no longer change are only browsed.
  const firstBlockingStep =
    canEditApplication && firstInvalidInformationStep !== null
      ? firstInvalidInformationStep
      : canUploadDocuments && missingRequired.length > 0
        ? DOCUMENTS_STEP
        : canEditApplication && !terms
          ? REVIEW_STEP
          : !packageInvoice
            ? PACKAGES_STEP
            : null;
  // Judge only fully loaded data, so a slow query never sends the parent back a step.
  const gateReady = formsReady && !applicationPackagePayment.isLoading;
  const lastReachableStep = firstBlockingStep ?? APPLICATION_STEP_COUNT;
  const activeStep = gateReady ? Math.min(step, lastReachableStep) : step;
  const activeStepBlocked = gateReady && activeStep === firstBlockingStep;
  const activeStepGateMessage = !activeStepBlocked
    ? null
    : activeStep === DOCUMENTS_STEP
      ? t('applications.stepGate.documentsMissing', { count: missingRequired.length })
      : activeStep === REVIEW_STEP
        ? t('applications.stepGate.termsRequired')
        : activeStep === PACKAGES_STEP
          ? t('applications.stepGate.packageRequired')
          : t('applications.stepGate.fieldsMissing', {
              count: Object.keys(applicationStepFieldErrors(activeStep, parentForm, childForm)).length,
            });
  /** Opens a step and, when its top is scrolled out of view (e.g. Next at the bottom), brings it back. */
  const openStep = (target: number) => {
    setStep(target);
    requestAnimationFrame(() => {
      const content = stepContentRef.current;
      if (content && content.getBoundingClientRect().top < 0) content.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  };
  const goToNextStep = () => {
    if (activeStepBlocked || (canEditApplication && revealStepErrors(activeStep))) return;
    openStep(Math.min(APPLICATION_STEP_COUNT, activeStep + 1));
  };
  const goToStep = (target: number) => openStep(Math.min(target, lastReachableStep));
  const draftUpdates = () => ({
    parent_info_json: mergeParentInfo(parentInfo, parentForm),
    child_info_json: mergeChildInfo(childInfo, childForm),
    terms_accepted: terms,
    parent_id: user?.id,
  });
  const informationIncompleteMessage = firstIncompleteInformationStep === null
    ? ''
    : firstIncompleteInformationStep === DOCUMENTS_STEP
      ? t('applications.paymentPackage.uploadDocumentsFirst', {
          defaultValue: 'Upload all required documents before choosing a package.',
        })
      : t('applications.paymentPackage.completeStepFirst', {
          step: firstIncompleteInformationStep,
          label: applicationStepLabels[firstIncompleteInformationStep - 1],
          defaultValue: 'Complete step #{{step}} ({{label}}) before choosing a package.',
        });
  const goToFirstIncompleteStep = () => {
    setStep(firstIncompleteInformationStep ?? 1);
    setActiveTab('information');
    if (firstInvalidInformationStep !== null) revealStepErrors(firstInvalidInformationStep);
  };
  // A payment submits the application (DB trigger), so it must carry the terms and the latest edits.
  const prepareApplicationForPayment = async () => {
    if (!terms) {
      toast.error(t('applications.submitTermsValidation', { defaultValue: 'Please accept the terms before submitting.' }));
      setStep(REVIEW_STEP);
      return false;
    }
    if (canEditApplication) await apps.saveApplicationDraft({ id, updates: draftUpdates() });
    return true;
  };
  const canChoosePackage =
    isInformationComplete &&
    status !== 'rejected' &&
    !packageInvoice?.paidAmount &&
    !packageInvoice?.pendingAmount;
  // The extra-hours package is billed on the application invoice, so like the tuition package
  // it is final once a payment is made or submitted.
  const canChooseExtraHours =
    isInformationComplete && status !== 'approved' && status !== 'rejected' && !hasSubmittedPackagePayment;
  const selectedExtraHoursPackage = extraHoursPackage.packages.find((pkg) => pkg.id === selectedExtraHoursPackageId) ?? null;
  const extraHoursChoice = selectedExtraHoursPackage
    ? {
        name: localName(selectedExtraHoursPackage.nameAr, selectedExtraHoursPackage.nameEn, i18n.language.startsWith('ar')),
        subtotal: selectedExtraHoursPackage.price,
        discountAmount: computeExtraHoursDisplayPrice(selectedExtraHoursPackage).discountAmount,
      }
    : null;

  const selectExtraHoursPackage = async (packageId: string | null) => {
    try {
      await extraHoursPackage.selectPackage(packageId);
      toast.success(
        packageId
          ? t('applications.extraHoursPackage.selected', { defaultValue: 'Extra hours package selected.' })
          : t('applications.extraHoursPackage.cleared', { defaultValue: 'Extra hours package removed.' }),
      );
    } catch (error) {
      const message = errorMessageOf(error);
      toast.error(
        message.includes('extra_hours_locked_after_payment')
          ? t('applications.extraHoursPackage.lockedAfterPayment')
          : `${t('applications.paymentPackage.selectFailed', { defaultValue: 'Could not update the selection.' })}${message ? ` (${message})` : ''}`,
      );
    }
  };

  const selectPackage = async (packageId: string, billingPeriod: ApplicationPackageBillingPeriod) => {
    if (!isInformationComplete) {
      toast.error(informationIncompleteMessage);
      goToFirstIncompleteStep();
      return;
    }
    if (!terms) {
      toast.error(t('applications.submitTermsValidation', { defaultValue: 'Please accept the terms before submitting.' }));
      return;
    }
    setSelectingPackage(true);
    try {
      // Persist the information that unlocked the package so the server holds the same data the parent saw.
      if (canEditApplication) {
        await apps.saveApplicationDraft({ id, updates: draftUpdates() });
      }
      await applicationPackagePayment.selectPackage(packageId, billingPeriod);
      toast.success(t('applications.paymentPackage.selectedToast'));
      setStep(PAYMENT_STEP);
    } catch (error) {
      const message = errorMessageOf(error);
      toast.error(
        `${t('applications.paymentPackage.selectFailed', {
          defaultValue: 'Could not select the package. Please try again.',
        })}${message ? ` (${message})` : ''}`,
      );
    } finally {
      setSelectingPackage(false);
    }
  };

  const submitApplication = async () => {
    if (!isApplicationComplete) {
      if (firstInvalidInformationStep !== null) {
        setStep(firstInvalidInformationStep);
        revealStepErrors(firstInvalidInformationStep);
        return;
      }
      if (missingParentFields.length || missingChildFields.length) {
        toast.error(t('applications.submitFieldsValidation', {
          defaultValue: 'Please complete all required parent and child information before submitting.',
        }));
        return;
      }
      if (missingRequired.length) {
        toast.error(t('applications.submitValidation'));
        setStep(DOCUMENTS_STEP);
        return;
      }
      if (!hasRequestedUpload) {
        toast.error(t('applications.requestedDocumentsValidation', {
          defaultValue: 'Please upload or replace at least one requested document before submitting again.',
        }));
        setStep(DOCUMENTS_STEP);
        return;
      }
      toast.error(t('applications.submitTermsValidation', { defaultValue: 'Please accept the terms before submitting.' }));
      return;
    }
    if (!packageInvoice) {
      toast.error(t('applications.paymentPackage.selectBeforeSubmit', {
        defaultValue: 'Please choose a package before submitting the application.',
      }));
      setStep(PACKAGES_STEP);
      return;
    }
    if (!hasSubmittedPackagePayment) {
      toast.error(t('applications.paymentPackage.payBeforeSubmit'));
      setStep(PAYMENT_STEP);
      return;
    }
    setSubmittingApplication(true);
    try {
      if (canEditApplication) {
        await apps.saveApplicationDraft({ id, updates: draftUpdates() });
      }
      await apps.submitApplication({ id, nurseryId: String(app.nursery_id) });
      toast.success(t('applications.submittedSuccess'));
    } catch (error) {
      // From this page's own checks, or the same rules on the server (a Supabase error object).
      const message = error && typeof error === 'object' && 'message' in error ? String((error as { message: unknown }).message) : '';
      if (message === 'missing_required_documents') {
        toast.error(t('applications.submitValidation'));
        setStep(DOCUMENTS_STEP);
      } else if (message === 'requested_documents_not_updated') {
        toast.error(t('applications.requestedDocumentsValidation', {
          defaultValue: 'Please upload or replace at least one requested document before submitting again.',
        }));
        setStep(DOCUMENTS_STEP);
      } else if (message === 'application_payment_required') {
        toast.error(t('applications.paymentPackage.payBeforeSubmit'));
        setStep(PAYMENT_STEP);
      } else if (message === 'application_terms_required') {
        toast.error(t('applications.submitTermsValidation', { defaultValue: 'Please accept the terms before submitting.' }));
      } else {
        toast.error(t('payment.errors.actionFailed'));
      }
    } finally {
      setSubmittingApplication(false);
    }
  };

  return (
    <div className="w-full max-w-none space-y-5 pb-6">
      <section className="rounded-xl border border-outline-variant bg-surface px-4 py-4 shadow-sm sm:px-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
              <span className="material-symbols-outlined text-xl" aria-hidden>{statusUi.icon}</span>
            </span>
            <div className="min-w-0">
              <p className="text-[11px] font-semibold uppercase text-primary">{t('applications.parentFormTitle')}</p>
              <h1 className="mt-1 truncate text-xl font-semibold text-on-surface">
                {readApplicationName(childInfo) === '-'
                  ? t('applications.newChildRegistration', { defaultValue: 'New child registration' })
                  : readApplicationName(childInfo)}
              </h1>
              <p className="mt-1 max-w-2xl text-xs leading-5 text-on-surface-variant">{statusUi.body}</p>
            </div>
          </div>
          <span className={cn('inline-flex items-center gap-2 rounded-md border px-3 py-2 text-xs font-semibold', statusUi.tone)}>
            <span className="material-symbols-outlined text-base" aria-hidden>{statusUi.icon}</span>
            {t(`applications.statuses.${status}`, { defaultValue: status })}
          </span>
        </div>
        <div className="mt-4 grid gap-3 border-t border-outline-variant pt-3 text-xs sm:grid-cols-3">
          <div>
            <p className="font-semibold uppercase text-on-surface-variant">{t('applications.applicationId')}</p>
            <p className="mt-1 break-all font-mono text-on-surface">{id}</p>
          </div>
          <div>
            <p className="font-semibold uppercase text-on-surface-variant">{t('parent.financial.nextDueLabel', { defaultValue: 'Next payment' })}</p>
            <p className="mt-1 font-semibold text-on-surface">{nextPaymentDate}</p>
          </div>
          <div>
            <p className="font-semibold uppercase text-on-surface-variant">{t('financial.paymentHistory.balanceLabel', { defaultValue: 'Balance' })}</p>
            <p className="mt-1 font-semibold text-on-surface">{balanceLabel}</p>
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

      <ApplicationWorkspaceTabs
        activeTab={activeTab}
        setActiveTab={setActiveTab}
      />

      {activeTab === 'information' ? (
        <FieldValidationContext.Provider value={fieldValidation}>
          <div className="grid grid-cols-1 gap-5 xl:grid-cols-[260px_minmax(0,1fr)]">
            <ApplicationSteps
              step={activeStep}
              lastReachableStep={gateReady ? lastReachableStep : activeStep}
              labels={applicationStepLabels}
              icons={applicationStepIcons}
              onStepClick={goToStep}
              groups={[
                { label: t('applications.stepper.detailsGroup'), from: 1, to: DOCUMENTS_STEP },
                { label: t('applications.stepper.reviewGroup'), from: REVIEW_STEP, to: PAYMENT_STEP },
              ]}
            />

            <div ref={stepContentRef} className="min-w-0 scroll-mt-24">
              <ApplicationInfoStep
                step={activeStep}
                parentForm={parentForm}
                childForm={childForm}
                setParentField={setParentField}
                setChildField={setChildField}
                labels={applicationStepLabels}
                disabled={!canEditApplication}
              />

              {activeStep === DOCUMENTS_STEP ? (
                <div className={stepCardClassName(DOCUMENTS_STEP)}>
                  <PanelHeader
                    icon="upload_file"
                    title={applicationStepLabels[9]}
                    body={t('applications.documentsHelp', { defaultValue: 'Upload required files as PDF or image files.' })}
                  />
                  <div className="grid gap-3 md:grid-cols-2 2xl:grid-cols-3">
                    {applicationDocumentTypes.map((docType) => (
                      <DocumentUploadTile
                        key={docType}
                        docType={docType}
                        required={requiredDocs.includes(docType as (typeof requiredDocs)[number])}
                        uploaded={hasDocumentFile(latestDocs[docType])}
                        disabled={!canUploadDocuments}
                        canUploadDocuments={canUploadDocuments}
                        canRemoveDocuments={canRemoveDocuments}
                        onFile={(file) => {
                          if (!app.nursery_id) return;
                          const applicationId = String(id);
                          void apps.uploadDocument({
                            nurseryId: String(app.nursery_id),
                            applicationId,
                            documentType: docType,
                            file,
                          }).then((document) => {
                            setLocalUploadedDocs((current) => ({
                              applicationId,
                              byType: {
                                ...(current?.applicationId === applicationId ? current.byType : {}),
                                [docType]: document,
                              },
                            }));
                            toast.success(t('applications.documentUploaded'));
                          });
                        }}
                        onRemove={() => {
                          const applicationId = String(id);
                          void apps.deleteDocumentType({
                            applicationId,
                            documentType: docType,
                          }).then(() => {
                            setLocalUploadedDocs((current) => {
                              if (current?.applicationId !== applicationId) return current;
                              const { [docType]: _removed, ...byType } = current.byType;
                              return { applicationId, byType };
                            });
                            toast.success(t('applications.documentRemoved', { defaultValue: 'Document removed.' }));
                          }).catch((error) => {
                            toast.error(error instanceof Error ? error.message : t('payment.errors.actionFailed'));
                          });
                        }}
                      />
                    ))}
                  </div>
                  {status === 'documents_pending' && !hasRequestedUpload ? (
                    <div className="rounded-lg border border-warning/30 bg-warning/10 px-3 py-2 text-sm font-medium text-warning">
                      {t('applications.requestedDocumentsPendingHint', {
                        defaultValue: 'The nursery requested documents. Upload or replace at least one file before submitting again.',
                      })}
                    </div>
                  ) : null}
                  {docs.length > 0 ? (
                    <div className="space-y-2">
                      {visibleDocs.map((doc) => (
                        <ApplicationDocumentPreview key={String(doc.id)} document={doc} />
                      ))}
                    </div>
                  ) : null}
                  <div className="text-xs text-on-surface-variant">{t('applications.uploadedCount', { count: docs.length })}</div>
                </div>
              ) : null}

              {activeStep === REVIEW_STEP ? (
                <div className={stepCardClassName(REVIEW_STEP)}>
                  <PanelHeader icon="task_alt" title={applicationStepLabels[REVIEW_STEP - 1]} body={t('applications.reviewText')} />
                  <div className="grid gap-2">
                    <p className={`rounded-lg border px-3 py-2 text-xs ${
                      missingRequired.length ? 'border-error/30 bg-error/10 text-error' : 'border-success/30 bg-success/10 text-success'
                    }`}>
                      {t('applications.missingRequired', { count: missingRequired.length })}
                    </p>
                    {missingParentFields.length || missingChildFields.length ? (
                      <p className="rounded-lg border border-warning/30 bg-warning/10 px-3 py-2 text-xs text-warning">
                        {t('applications.missingFields', {
                          count: missingParentFields.length + missingChildFields.length,
                          defaultValue: '{{count}} required information field(s) missing.',
                        })}
                      </p>
                    ) : null}
                    {!hasRequestedUpload ? (
                      <p className="rounded-lg border border-warning/30 bg-warning/10 px-3 py-2 text-xs text-warning">
                        {t('applications.requestedDocumentsPendingHint', {
                          defaultValue: 'The nursery requested documents. Upload or replace at least one file before submitting again.',
                        })}
                      </p>
                    ) : null}
                  </div>
                  <div className="space-y-2">
                    <h3 className="text-sm font-semibold text-on-surface">{t('applications.review.answersTitle')}</h3>
                    <ApplicationReviewSummary
                      sections={applicationReviewSections({
                        parentForm,
                        childForm,
                        latestDocs,
                        stepLabels: applicationStepLabels,
                        nationalities: childNationalityOptions,
                        isArabic: i18n.language.startsWith('ar'),
                        t,
                      })}
                      editable={canEditApplication}
                      onOpenStep={goToStep}
                    />
                  </div>
                  <fieldset disabled={!canEditApplication} className="space-y-1 rounded-xl border border-outline-variant bg-surface-container-lowest p-4">
                    <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={terms} onChange={(e) => setTerms(e.target.checked)} />{t('applications.termsAccept')}</label>
                    {!terms ? (
                      <p className="text-xs font-medium text-warning">
                        {t('applications.submitTermsValidation', { defaultValue: 'Please accept the terms before submitting.' })}
                      </p>
                    ) : (
                      <p className="text-xs text-on-surface-variant">{t('applications.review.nextStepsHint')}</p>
                    )}
                  </fieldset>
                </div>
              ) : null}

              {activeStep === PACKAGES_STEP ? (
                isInformationComplete || packageInvoice ? (
                  <div className="space-y-4">
                    <ApplicationPackagePaymentCard
                      packages={applicationPackagePayment.packages}
                      invoice={applicationPackagePayment.invoice}
                      isLoading={applicationPackagePayment.isLoading}
                      isError={applicationPackagePayment.isError}
                      isSelecting={applicationPackagePayment.isSelecting || selectingPackage}
                      canChoose={canChoosePackage}
                      onRetry={() => void applicationPackagePayment.refetch()}
                      onPayNow={() => setStep(PAYMENT_STEP)}
                      termsAccepted={terms}
                      onTermsChange={setTerms}
                      onSelect={selectPackage}
                      extraHoursChoice={extraHoursChoice}
                      texts={parentPackageTextsFromSettings(nurserySettings)}
                      extraHoursSection={
                        <ApplicationExtraHoursPackageCard
                          embedded
                          packages={extraHoursPackage.packages}
                          selectedPackageId={selectedExtraHoursPackageId}
                          hourlyPlan={extraHoursHourlyPlan}
                          isLoading={extraHoursPackage.isLoading}
                          isSelecting={extraHoursPackage.isSelecting}
                          canChoose={canChooseExtraHours}
                          onSelect={selectExtraHoursPackage}
                        />
                      }
                    />
                  </div>
                ) : (
                  <InformationLockedNotice
                    title={t('applications.paymentPackage.lockedTitle', { defaultValue: 'Package selection is locked' })}
                    message={informationIncompleteMessage}
                    onCompleteInformation={goToFirstIncompleteStep}
                  />
                )
              ) : null}

              {activeStep === PAYMENT_STEP ? (
                canEditApplication && !isInformationComplete ? (
                  <InformationLockedNotice
                    title={t('applications.paymentTab.lockedTitle')}
                    message={informationIncompleteMessage}
                    onCompleteInformation={goToFirstIncompleteStep}
                  />
                ) : (
                  <ApplicationPaymentStep
                    applicationId={id}
                    invoice={packageInvoice}
                    isLoading={applicationPackagePayment.isLoading}
                    rejected={status === 'rejected'}
                    returnedFromCheckout={returnedFromCheckout}
                    onGoToPackages={() => setStep(PACKAGES_STEP)}
                    beforePay={prepareApplicationForPayment}
                  />
                )
              ) : null}
            </div>
          </div>

          <div className="sticky bottom-4 z-10 flex flex-col gap-2 rounded-xl border border-outline-variant bg-surface/95 p-3 shadow-lg backdrop-blur sm:flex-row sm:items-center sm:justify-between">
            <Button variant="outline" disabled={activeStep === 1} onClick={() => openStep(Math.max(1, activeStep - 1))}>{t('common.previous')}</Button>
            {activeStepGateMessage ? (
              <p className="flex flex-1 flex-wrap items-center justify-center gap-x-2 gap-y-1 text-center text-xs font-medium text-warning" aria-live="polite">
                <span className="material-symbols-outlined text-base" aria-hidden>lock</span>
                {activeStepGateMessage}
                {activeStep < DOCUMENTS_STEP ? (
                  <button type="button" className="font-semibold text-primary underline" onClick={() => revealStepErrors(activeStep)}>
                    {t('applications.stepGate.showMissing')}
                  </button>
                ) : null}
              </p>
            ) : null}
            <div className="flex flex-col gap-2 sm:flex-row">
              <Button
                variant="outline"
                disabled={!canEditApplication}
                onClick={() => void apps.saveApplicationDraft({ id, updates: draftUpdates() })
                  .then(() => toast.success(t('applications.draftSaved')))}
              >
                {t('applications.saveDraft')}
              </Button>
              {needsManualSubmit && activeStep >= REVIEW_STEP ? (
                <Button
                  variant={activeStep < APPLICATION_STEP_COUNT ? 'outline' : 'default'}
                  disabled={!isSubmitReady || submittingApplication}
                  onClick={() => void submitApplication()}
                >
                  {submittingApplication ? t('common.saving') : t('applications.submit')}
                </Button>
              ) : null}
              {activeStep < APPLICATION_STEP_COUNT ? (
                <Button
                  disabled={activeStepBlocked}
                  title={activeStepBlocked ? t('applications.stepGate.nextDisabledHint') : undefined}
                  onClick={goToNextStep}
                >
                  {t('common.next')}
                </Button>
              ) : null}
            </div>
          </div>
        </FieldValidationContext.Provider>
      ) : null}

      {activeTab === 'payments' ? (
        <div className="space-y-4">
          <section className="grid gap-3 rounded-xl border border-outline-variant bg-surface p-4 shadow-sm sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <p className="text-[11px] font-semibold uppercase text-on-surface-variant">
                {t('parent.financial.nextDueLabel', { defaultValue: 'Next payment' })}
              </p>
              <p className="mt-1 text-sm font-semibold text-on-surface">{nextPaymentDate}</p>
            </div>
            <div>
              <p className="text-[11px] font-semibold uppercase text-on-surface-variant">
                {t('financial.paymentHistory.paidLabel', { defaultValue: 'Paid' })}
              </p>
              <p className="mt-1 text-sm font-semibold text-success">
                {packageInvoice ? t('invoice.egpAmount', { amount: packageInvoice.paidAmount.toFixed(2) }) : '-'}
              </p>
            </div>
            <div>
              <p className="text-[11px] font-semibold uppercase text-on-surface-variant">{t('invoice.inReview')}</p>
              <p className="mt-1 text-sm font-semibold text-warning">
                {packageInvoice ? t('invoice.egpAmount', { amount: packageInvoice.pendingAmount.toFixed(2) }) : '-'}
              </p>
            </div>
            <div>
              <p className="text-[11px] font-semibold uppercase text-on-surface-variant">
                {t('financial.paymentHistory.balanceLabel', { defaultValue: 'Balance' })}
              </p>
              <p className="mt-1 text-sm font-semibold text-on-surface">{balanceLabel}</p>
            </div>
          </section>

          <PaymentHistoryTable
            title={t('financial.paymentHistory.registrationTitle', { defaultValue: 'Registration payment history' })}
            rows={paymentHistory.data}
            isLoading={paymentHistory.isLoading}
            showParent={false}
            linkBase="/parent/invoices"
          />
        </div>
      ) : null}
    </div>
  );
}
