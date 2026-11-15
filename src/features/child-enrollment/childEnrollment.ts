import {
  applicationStepFieldErrors,
  applicationStepIcons,
  childFormFromApplication,
  mergeChildInfo,
  mergeParentInfo,
  parentFormFromApplication,
  requiredDocs,
  type FieldErrors,
  type JsonRecord,
  type ParentApplicationChildForm,
  type ParentApplicationParentForm,
} from '@/features/child-application/applicationForm';

/*
 * The admin adding a child: the family is picked first (an existing parent account), then the
 * application's own steps are answered for them (the same fields and checks as the family's
 * application), then its documents, a review, and the class. These are the plain rules of that flow.
 */

/** A parent account found by the family search, with what the form copies from it. */
export type EnrollmentFamily = {
  id: string;
  name_ar: string | null;
  name_en: string | null;
  username: string | null;
  phone: string | null;
  email: string | null;
  children: { id: string; name_ar: string | null; name_en: string | null; status: string | null }[];
  /** The family's details as an application holds them (their last one, else their accounts). */
  parent_info: JsonRecord;
  /** The emergency contacts given for their last child, copied as a start. */
  emergency_contacts: JsonRecord[];
};

/** The admin's steps, 1-based: the family, the application's nine, its documents, the review, the class. */
export const FAMILY_STEP = 1;
export const FIRST_INFO_STEP = 2;
export const LAST_INFO_STEP = 10;
export const DOCUMENTS_STEP = 11;
export const REVIEW_STEP = 12;
export const CLASS_STEP = 13;
export const STEP_COUNT = CLASS_STEP;

/** The application's own step (1–10) an admin step shows; null for the family and the class. */
export const applicationStepOf = (step: number) => (step >= FIRST_INFO_STEP && step <= REVIEW_STEP ? step - 1 : null);
/** And back: where a review section's "Edit" goes. */
export const enrollmentStepOf = (applicationStep: number) => applicationStep + 1;

export const ENROLLMENT_STEP_ICONS = ['family_restroom', ...applicationStepIcons.slice(0, 11), 'how_to_reg'];

/** The document types, and the child's photo, as the admin attaches them before saving. */
export type EnrollmentFiles = Partial<Record<(typeof requiredDocs)[number] | 'medical_report' | 'other' | 'child_photo', File | null>>;

/** The forms filled from the picked family: their parents and family from it, the child's emergency contacts copied. */
export function formsForFamily(family: EnrollmentFamily): { parentForm: ParentApplicationParentForm; childForm: ParentApplicationChildForm } {
  const fallback = { emergency_contacts: family.emergency_contacts };
  const account = { name_ar: family.name_ar, name_en: family.name_en, email: family.email, phone: family.phone };
  return {
    parentForm: parentFormFromApplication(family.parent_info ?? {}, {}, account, null, fallback),
    childForm: childFormFromApplication({}, fallback),
  };
}

/** The required documents not attached yet. */
export const missingDocuments = (files: EnrollmentFiles) => requiredDocs.filter((type) => !files[type]);

/**
 * What is wrong on a step (field name → text key), the same checks the family's application makes.
 * The family step needs a family; the documents step needs the required documents.
 */
export function enrollmentStepProblems(
  step: number,
  family: EnrollmentFamily | null,
  parentForm: ParentApplicationParentForm,
  childForm: ParentApplicationChildForm,
  files: EnrollmentFiles,
): FieldErrors {
  if (step === FAMILY_STEP) return family ? {} : { family: 'childEnrollment.family.required' };
  if (step === DOCUMENTS_STEP) {
    return Object.fromEntries(missingDocuments(files).map((type) => [`document_${type}`, 'childEnrollment.documents.required']));
  }
  const applicationStep = applicationStepOf(step);
  return applicationStep && applicationStep <= 9 ? applicationStepFieldErrors(applicationStep, parentForm, childForm) : {};
}

/** The first step with something missing (the admin can open every step up to it), or null. */
export function firstIncompleteStep(
  family: EnrollmentFamily | null,
  parentForm: ParentApplicationParentForm,
  childForm: ParentApplicationChildForm,
  files: EnrollmentFiles,
): number | null {
  for (let step = FAMILY_STEP; step <= DOCUMENTS_STEP; step += 1) {
    if (Object.keys(enrollmentStepProblems(step, family, parentForm, childForm, files)).length) return step;
  }
  return null;
}

/** The family and child details as staff_enroll_child takes them (the application's own format). */
export function enrollmentPayload(family: EnrollmentFamily, parentForm: ParentApplicationParentForm, childForm: ParentApplicationChildForm) {
  return {
    parentInfo: mergeParentInfo(family.parent_info ?? {}, parentForm),
    childInfo: mergeChildInfo({}, childForm),
  };
}

/** The family's name to show: the account's, in the reader's language when it has both. */
export const familyName = (family: Pick<EnrollmentFamily, 'name_ar' | 'name_en' | 'username'>, isArabic: boolean) =>
  (isArabic ? family.name_ar || family.name_en : family.name_en || family.name_ar) || family.username || '';
