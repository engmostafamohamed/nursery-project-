import { useQueryClient } from '@tanstack/react-query';
import { useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';

import { ApplicationReviewSummary } from '@/components/parent/ApplicationReviewSummary';
import { ApplicationSteps } from '@/components/parent/ApplicationSteps';
import { Button } from '@/components/ui/button';
import { MaterialSymbol } from '@/components/ui/MaterialSymbol';
import { ApplicationInfoStep } from '@/features/child-application/ApplicationInfoStep';
import { PanelHeader } from '@/features/child-application/ApplicationPanelHeader';
import { childFormFromApplication, parentFormFromApplication } from '@/features/child-application/applicationForm';
import { applicationReviewSections } from '@/features/child-application/applicationReview';
import { stepCardClassName } from '@/features/child-application/applicationStyles';
import { FieldValidationContext, type FieldValidation } from '@/features/child-application/fieldValidation';
import { nationalityOptions } from '@/lib/nationalities';

import {
  CLASS_STEP,
  DOCUMENTS_STEP,
  ENROLLMENT_STEP_ICONS,
  enrollmentPayload,
  enrollmentStepOf,
  enrollmentStepProblems,
  FAMILY_STEP,
  familyName,
  firstIncompleteStep,
  formsForFamily,
  REVIEW_STEP,
  STEP_COUNT,
  type EnrollmentFamily,
  type EnrollmentFiles,
} from './childEnrollment';
import { enrollChild, enrollmentErrorKey, uploadEnrollmentFiles } from './childEnrollmentApi';
import { EnrollmentClassStep } from './EnrollmentClassStep';
import { EnrollmentDocumentsStep } from './EnrollmentDocumentsStep';
import { FamilyPicker } from './FamilyPicker';

const newId = () => globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(16)}-0000-4000-8000-${Math.random().toString(16).slice(2, 14).padEnd(12, '0')}`;

/**
 * The admin adds a child the way a family applies: the family is picked first (an existing parent
 * account), then the application's own steps are answered for them — the same fields and checks —
 * then the documents, a review of every answer, and the class. Saving adds the child to the family
 * in one go; the family and the class's teachers are told.
 */
export function ChildEnrollmentWizard({ nurseryId }: { nurseryId: string }) {
  const { t, i18n } = useTranslation();
  const isAr = i18n.language.startsWith('ar');
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const contentRef = useRef<HTMLDivElement>(null);
  // The child's id is chosen now, so its files go to its own folder and a retry reuses them.
  const [childId] = useState(newId);
  const [step, setStep] = useState(FAMILY_STEP);
  const [family, setFamily] = useState<EnrollmentFamily | null>(null);
  const [parentForm, setParentForm] = useState(() => parentFormFromApplication({}, {}, null));
  const [childForm, setChildForm] = useState(() => childFormFromApplication({}));
  const [files, setFiles] = useState<EnrollmentFiles>({});
  const [classId, setClassId] = useState('');
  // Steps the admin tried to leave: their problems show under the fields.
  const [shownSteps, setShownSteps] = useState<ReadonlySet<number>>(() => new Set());
  const [saving, setSaving] = useState(false);

  const labels = useMemo(() => [
    t('childEnrollment.steps.family'),
    t('applications.steps.parentInfo'),
    t('signup.steps.family'),
    t('applications.steps.childInfo'),
    t('signup.steps.enrollment'),
    t('signup.steps.health'),
    t('signup.steps.emergency'),
    t('signup.steps.dailyCare'),
    t('signup.steps.pickups'),
    t('signup.steps.medicationConsents'),
    t('applications.steps.documents'),
    t('applications.steps.review'),
    t('childEnrollment.steps.class'),
  ], [t]);
  // The application's own step names (step n is applicationLabels[n - 1]), for its steps and review.
  const applicationLabels = labels.slice(1);

  const problems = enrollmentStepProblems(step, family, parentForm, childForm, files);
  const firstOpen = firstIncompleteStep(family, parentForm, childForm, files);
  const lastReachable = firstOpen ?? STEP_COUNT;
  const childName = [childForm.first_name, childForm.middle_name, childForm.last_name].map((p) => p.trim()).filter(Boolean).join(' ');

  const validation: FieldValidation = {
    errorFor: (name) => {
      const key = problems[name];
      return key && shownSteps.has(step) ? t(key) : undefined;
    },
    onFieldFocus: () => undefined,
    onFieldBlur: () => undefined,
  };

  const openStep = (next: number) => {
    setStep(Math.min(Math.max(next, FAMILY_STEP), STEP_COUNT));
    contentRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const goNext = () => {
    if (Object.keys(problems).length) {
      setShownSteps((prev) => new Set(prev).add(step));
      toast.error(t('childEnrollment.fixStep'));
      window.setTimeout(() => contentRef.current?.querySelector<HTMLElement>('[data-field-invalid], [aria-invalid="true"]')?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 50);
      return;
    }
    openStep(step + 1);
  };

  const pickFamily = (next: EnrollmentFamily | null) => {
    setFamily(next);
    if (next) {
      const forms = formsForFamily(next);
      setParentForm(forms.parentForm);
      setChildForm(forms.childForm);
    }
  };

  const save = async () => {
    if (!family) return;
    if (firstOpen !== null) {
      setShownSteps((prev) => new Set(prev).add(firstOpen));
      openStep(firstOpen);
      toast.error(t('childEnrollment.fixStep'));
      return;
    }
    setSaving(true);
    try {
      const { documents, avatarUrl } = await uploadEnrollmentFiles(nurseryId, childId, files);
      const payload = enrollmentPayload(family, parentForm, childForm);
      const id = await enrollChild({
        nurseryId,
        parentId: family.id,
        childId,
        parentInfo: payload.parentInfo,
        childInfo: { ...payload.childInfo, avatar_url: avatarUrl },
        documents,
        classId: classId || null,
      });
      toast.success(t('childEnrollment.saved', { name: childName }), { description: t('childEnrollment.savedHint') });
      void queryClient.invalidateQueries({ predicate: (q) => typeof q.queryKey[0] === 'string' && /child|class|dashboard|attendance/.test(q.queryKey[0]) });
      navigate(`/admin/children/${id}`);
    } catch (error) {
      toast.error(t(enrollmentErrorKey(error)));
    } finally {
      setSaving(false);
    }
  };

  const nationalities = nationalityOptions(isAr);
  const latestDocs = Object.fromEntries(Object.entries(files).filter(([, f]) => f).map(([type, f]) => [type, { file_url: f!.name }]));

  return (
    <FieldValidationContext.Provider value={validation}>
      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[260px_minmax(0,1fr)]">
        <ApplicationSteps
          step={step}
          lastReachableStep={Math.max(lastReachable, step)}
          labels={labels}
          icons={ENROLLMENT_STEP_ICONS}
          onStepClick={(n) => (n <= Math.max(lastReachable, step) ? openStep(n) : undefined)}
          groups={[
            { label: t('childEnrollment.stepper.family'), from: FAMILY_STEP, to: FAMILY_STEP },
            { label: t('applications.stepper.detailsGroup'), from: FAMILY_STEP + 1, to: DOCUMENTS_STEP },
            { label: t('childEnrollment.stepper.review'), from: REVIEW_STEP, to: CLASS_STEP },
          ]}
        />

        <div ref={contentRef} className="min-w-0 scroll-mt-24 space-y-4" data-testid="enrollment-step" data-step={step}>
          {step === FAMILY_STEP ? (
            <div className={stepCardClassName()}>
              <PanelHeader icon="family_restroom" title={labels[0]} body={t('childEnrollment.family.hint')} />
              <FamilyPicker nurseryId={nurseryId} value={family} onChange={pickFamily} invalid={Boolean(validation.errorFor('family'))} />
              {validation.errorFor('family') ? <p className="text-xs font-medium text-error" data-field-invalid="true">{validation.errorFor('family')}</p> : null}
            </div>
          ) : null}

          {step > FAMILY_STEP && step < DOCUMENTS_STEP ? (
            <ApplicationInfoStep
              step={step - 1}
              parentForm={parentForm}
              childForm={childForm}
              setParentField={(field, value) => setParentForm((prev) => ({ ...prev, [field]: value }))}
              setChildField={(field, value) => setChildForm((prev) => ({ ...prev, [field]: value }))}
              labels={applicationLabels}
            />
          ) : null}

          {step === DOCUMENTS_STEP ? (
            <>
              <EnrollmentDocumentsStep title={labels[DOCUMENTS_STEP - 1]} files={files} onChange={setFiles} />
              {validation.errorFor(Object.keys(problems)[0] ?? '') ? (
                <p className="rounded-lg border border-warning/30 bg-warning/10 px-3 py-2 text-sm text-warning" data-field-invalid="true">
                  {t('childEnrollment.documents.missing', { count: Object.keys(problems).length })}
                </p>
              ) : null}
            </>
          ) : null}

          {step === REVIEW_STEP ? (
            <div className={stepCardClassName()}>
              <PanelHeader icon="task_alt" title={labels[REVIEW_STEP - 1]} body={t('childEnrollment.reviewHint')} />
              <ApplicationReviewSummary
                sections={applicationReviewSections({
                  parentForm,
                  childForm,
                  latestDocs,
                  stepLabels: applicationLabels,
                  nationalities,
                  isArabic: isAr,
                  t,
                })}
                editable
                onOpenStep={(applicationStep) => openStep(enrollmentStepOf(applicationStep))}
              />
            </div>
          ) : null}

          {step === CLASS_STEP ? (
            <EnrollmentClassStep
              title={labels[CLASS_STEP - 1]}
              nurseryId={nurseryId}
              childName={childName}
              familyLabel={family ? familyName(family, isAr) : ''}
              classId={classId}
              onClassChange={setClassId}
            />
          ) : null}

          <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-outline-variant bg-surface px-4 py-3 shadow-sm">
            <Button type="button" variant="outline" disabled={step === FAMILY_STEP || saving} onClick={() => openStep(step - 1)}>
              <MaterialSymbol name="arrow_back" size="text-base" className="me-1 rtl:rotate-180" />
              {t('common.previous')}
            </Button>
            <span className="text-xs text-on-surface-variant">{t('childEnrollment.stepOf', { step, total: STEP_COUNT })}</span>
            {step < CLASS_STEP ? (
              <Button type="button" onClick={goNext} disabled={saving} data-testid="enrollment-next">
                {t('common.next')}
                <MaterialSymbol name="arrow_forward" size="text-base" className="ms-1 rtl:rotate-180" />
              </Button>
            ) : (
              <Button type="button" onClick={() => void save()} disabled={saving} data-testid="enrollment-save">
                <MaterialSymbol name={saving ? 'progress_activity' : 'how_to_reg'} size="text-base" className={saving ? 'me-1 animate-spin' : 'me-1'} />
                {saving ? t('common.saving') : t('childEnrollment.save')}
              </Button>
            )}
          </div>
        </div>
      </div>
    </FieldValidationContext.Provider>
  );
}
