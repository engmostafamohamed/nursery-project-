import { Children, cloneElement, createContext, isValidElement, useContext, useEffect, useMemo, useState, type FocusEventHandler, type ReactNode } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';

import { ApplicationDocumentPreview } from '@/components/applications/ApplicationDocumentPreview';
import { PaymentHistoryTable } from '@/components/financial/PaymentHistoryTable';
import { ApplicationExtraHoursPackageCard } from '@/components/parent/ApplicationExtraHoursPackageCard';
import { ApplicationPackagePaymentCard } from '@/components/parent/ApplicationPackagePaymentCard';
import { ApplicationSteps } from '@/components/parent/ApplicationSteps';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { SearchableSelect } from '@/components/ui/SearchableSelect';
import { useApplications } from '@/hooks/useApplications';
import { useApplicationExtraHoursPackage } from '@/hooks/useApplicationExtraHoursPackage';
import { useApplicationPackagePayment, type ApplicationPackageBillingPeriod } from '@/hooks/useApplicationPackagePayment';
import { useAuthSession } from '@/hooks/useAuthSession';
import { useParentAccountProfile, type ParentAccountProfile } from '@/hooks/useParentAccountProfile';
import { usePaymentHistory } from '@/hooks/usePaymentHistory';
import { useUserProfile } from '@/hooks/useUserProfile';
import { NAP_DURATION_VALUES } from '@/features/parent-signup/parentSignUpValidation';
import { MEDICATION_CONSENT_OPTIONS } from '@/lib/admissions/medicationConsentOptions';
import { ALLERGY_OPTIONS, OTHER_ALLERGY_VALUE, allergyLabel } from '@/lib/allergies';
import { nationalityOptions } from '@/lib/nationalities';
import { childDateOfBirthBounds, isChildAgeValid, isValidIsoDate } from '@/lib/onboardingDateBounds';
import { egyptianMobilePattern } from '@/lib/phoneValidation';
import { cn } from '@/lib/utils';

const requiredDocs = ['birth_certificate', 'vaccination_card', 'parent_id', 'proof_of_address'] as const;
const applicationDocumentTypes = [...requiredDocs, 'medical_report', 'other'] as const;
const requiredParentFields = ['full_name', 'email', 'phone', 'address', 'emergency_contact'] as const;
const requiredChildFields = ['first_name', 'middle_name', 'last_name', 'nickname', 'dob', 'nationality'] as const;
type ApplicationWorkspaceTab = 'information' | 'packages' | 'payments';
const APPLICATION_STEP_COUNT = 11;

const applicationStepIcons = [
  'account_circle',
  'home',
  'child_care',
  'school',
  'health_and_safety',
  'emergency',
  'restaurant',
  'directions_car',
  'medication',
  'upload_file',
  'task_alt',
];

function latestDocumentsByType(docs: Array<Record<string, unknown>>) {
  const uploadedAt = (doc: Record<string, unknown>) => {
    const time = new Date(String(doc.uploaded_at ?? '')).getTime();
    return Number.isFinite(time) ? time : -Infinity;
  };
  const hasFile = (doc: Record<string, unknown>) => typeof doc.file_url === 'string' && doc.file_url.trim().length > 0;

  return docs.reduce<Record<string, Record<string, unknown>>>((acc, doc) => {
    const type = String(doc.document_type ?? '');
    if (!type) return acc;
    const current = acc[type];
    if (!current) {
      acc[type] = doc;
      return acc;
    }

    const docHasFile = hasFile(doc);
    const currentHasFile = hasFile(current);
    if (docHasFile !== currentHasFile) {
      if (docHasFile) acc[type] = doc;
      return acc;
    }

    if (uploadedAt(doc) > uploadedAt(current)) acc[type] = doc;
    return acc;
  }, {});
}

function hasDocumentFile(doc: Record<string, unknown> | undefined) {
  return typeof doc?.file_url === 'string' && doc.file_url.trim().length > 0;
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
    body: t('applications.statusDraftBody', {
      defaultValue: 'Complete the information, upload required documents, choose a package, and pay all or part of it. It is sent for review as soon as a payment is submitted.',
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

type FieldValidation = {
  errorFor: (name: string) => string | undefined;
  onFieldFocus: (name: string) => void;
  onFieldBlur: (name: string) => void;
};

const FieldValidationContext = createContext<FieldValidation | null>(null);

function FieldErrorText({ error }: { error?: string }) {
  return error ? <p className="text-xs font-medium text-error" data-field-invalid="true">{error}</p> : null;
}

function FormField({
  label,
  children,
  className,
  hint,
  name,
}: {
  label: string;
  children: ReactNode;
  className?: string;
  hint?: string;
  /** Validated field name; its error (from FieldValidationContext) shows under the control. */
  name?: string;
}) {
  const validation = useContext(FieldValidationContext);
  const error = name ? validation?.errorFor(name) : undefined;
  const childList = Children.toArray(children);
  const filled = childList.some((child) => {
    if (!isValidElement<{ value?: unknown }>(child)) return false;
    const value = child.props.value;
    if (typeof value === 'string') return value.trim().length > 0;
    if (typeof value === 'number') return true;
    return Boolean(value);
  });
  const controlClassName = filled
    ? 'border-primary/40 bg-primary-container/35 text-on-surface shadow-sm ring-1 ring-primary/10'
    : 'border-outline-variant bg-surface/95 text-on-surface shadow-sm';
  const styledChildren = Children.map(children, (child) => {
    if (!isValidElement<{ className?: string; onFocus?: FocusEventHandler; onBlur?: FocusEventHandler; 'aria-invalid'?: boolean }>(child)) return child;
    return cloneElement(child, {
      className: cn(controlClassName, child.props.className, error && 'border-error ring-1 ring-error/30'),
      'aria-invalid': error ? true : undefined,
      ...(name && validation
        ? {
            onFocus: (event) => {
              child.props.onFocus?.(event);
              validation.onFieldFocus(name);
            },
            onBlur: (event) => {
              child.props.onBlur?.(event);
              validation.onFieldBlur(name);
            },
          }
        : {}),
    });
  });

  return (
    <div className={cn('space-y-2', className)}>
      <Label className="flex min-h-10 items-end text-sm font-semibold leading-5 text-on-surface">{label}</Label>
      {styledChildren}
      {error ? <FieldErrorText error={error} /> : hint ? <p className="text-xs text-on-surface-variant">{hint}</p> : null}
    </div>
  );
}

function StyledSelect({
  value,
  onChange,
  options,
  className,
}: {
  value: string;
  onChange: (value: string) => void;
  options: Array<{ value: string; label: string }>;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const selected = options.find((option) => option.value === value) ?? options[0];

  return (
    <div
      className="relative"
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false);
      }}
    >
      <button
        type="button"
        className={cn(
          'flex h-12 w-full items-center justify-between rounded-lg border px-3 py-2 text-start text-sm transition focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20',
          className,
        )}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
      >
        <span className={cn('truncate', !value && 'text-on-surface-variant')}>
          {selected?.label}
        </span>
        <span
          className={cn('material-symbols-outlined text-lg text-on-surface-variant transition-transform', open && 'rotate-180')}
          aria-hidden
        >
          expand_more
        </span>
      </button>
      {open ? (
        <div
          className="absolute z-30 mt-2 max-h-60 w-full overflow-auto rounded-lg border border-outline-variant bg-surface p-1 shadow-lg"
          role="listbox"
        >
          {options.map((option) => {
            const active = option.value === value;
            return (
              <button
                key={option.value}
                type="button"
                className={cn(
                  'flex min-h-10 w-full items-center justify-between rounded-md px-3 text-start text-sm text-on-surface transition hover:bg-primary/10',
                  active && 'bg-primary text-on-primary hover:bg-primary',
                )}
                role="option"
                aria-selected={active}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => {
                  onChange(option.value);
                  setOpen(false);
                }}
              >
                <span className="truncate">{option.label}</span>
                {active ? <span className="material-symbols-outlined text-base" aria-hidden>check</span> : null}
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

function DocumentUploadTile({
  docType,
  required,
  uploaded,
  disabled,
  canUploadDocuments,
  canRemoveDocuments,
  onFile,
  onRemove,
}: {
  docType: string;
  required: boolean;
  uploaded: boolean;
  disabled: boolean;
  canUploadDocuments: boolean;
  canRemoveDocuments: boolean;
  onFile: (file: File) => void;
  onRemove: () => void;
}) {
  const { t } = useTranslation();
  return (
    <div
      className={cn(
        'group flex min-h-36 flex-col justify-between rounded-lg border p-4 text-sm transition',
        uploaded
          ? 'border-success/40 bg-success/5'
          : required
            ? 'border-warning/40 bg-warning/5'
            : 'border-outline-variant bg-surface-container-lowest hover:border-primary hover:bg-primary/5',
        disabled && 'cursor-not-allowed opacity-70',
      )}
    >
      <span className="flex items-start justify-between gap-3">
        <span className="flex min-w-0 items-start gap-3">
          <span className={cn(
            'flex h-10 w-10 shrink-0 items-center justify-center rounded-md',
            uploaded ? 'bg-success text-on-primary' : 'bg-primary/10 text-primary',
          )}>
            <span className="material-symbols-outlined text-xl" aria-hidden>
              {uploaded ? 'check' : 'upload_file'}
            </span>
          </span>
          <span className="min-w-0">
            <span className="block font-semibold text-on-surface">{t(`applications.documentTypes.${docType}`)}</span>
            <span className="mt-1 block text-xs leading-5 text-on-surface-variant">
              {uploaded
                ? canUploadDocuments
                  ? t('applications.replaceDocumentHint', { defaultValue: 'Choose a new file to replace this document.' })
                  : t('applications.documentLockedHint', { defaultValue: 'This document is locked after submission.' })
                : t('applications.documentsHelp', { defaultValue: 'Upload a PDF or image file.' })}
            </span>
          </span>
        </span>
        <span className={cn(
          'shrink-0 rounded-full px-2 py-1 text-[10px] font-semibold',
          uploaded
            ? 'bg-success/10 text-success'
            : required
              ? 'bg-warning/10 text-warning'
              : 'bg-surface-container text-on-surface-variant',
        )}>
          {uploaded
            ? t('applications.documentUploadedBadge', { defaultValue: 'Uploaded' })
            : required
              ? t('applications.requiredBadge', { defaultValue: 'Required' })
              : t('applications.optionalBadge', { defaultValue: 'Optional' })}
        </span>
      </span>
      <div className={cn('mt-4 grid gap-2', uploaded && canRemoveDocuments && 'sm:grid-cols-[minmax(0,1fr)_auto]')}>
        <label
          className={cn(
            'inline-flex h-10 items-center justify-center gap-2 rounded-md border bg-surface px-3 text-sm font-semibold shadow-sm transition',
            disabled ? 'cursor-not-allowed opacity-70' : 'cursor-pointer',
            uploaded
              ? 'border-success/40 text-success hover:bg-success hover:text-white'
              : 'border-primary/30 text-primary hover:bg-primary hover:text-primary-foreground',
          )}
        >
          <span className="material-symbols-outlined text-base" aria-hidden>{uploaded ? 'check_circle' : 'add'}</span>
          {uploaded
            ? t('applications.uploadedReplaceDocument', { defaultValue: 'Uploaded - Replace file' })
            : t('applications.uploadDocument', { defaultValue: 'Upload file' })}
          <input
            className="sr-only"
            type="file"
            accept=".pdf,.jpg,.jpeg,.png,.webp,application/pdf,image/jpeg,image/png,image/webp"
            disabled={disabled}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) onFile(file);
              e.currentTarget.value = '';
            }}
          />
        </label>
        {uploaded && canRemoveDocuments ? (
          <button
            type="button"
            className="inline-flex h-10 items-center justify-center gap-2 rounded-md border border-error/30 bg-surface px-3 text-sm font-semibold text-error shadow-sm transition hover:bg-error hover:text-white"
            onClick={onRemove}
          >
            <span className="material-symbols-outlined text-base" aria-hidden>delete</span>
            {t('applications.removeDocument', { defaultValue: 'Remove' })}
          </button>
        ) : null}
      </div>
    </div>
  );
}

function ApplicationWorkspaceTabs({
  activeTab,
  setActiveTab,
  packagesLocked,
}: {
  activeTab: ApplicationWorkspaceTab;
  setActiveTab: (tab: ApplicationWorkspaceTab) => void;
  packagesLocked: boolean;
}) {
  const { t } = useTranslation();
  const tabs = [
    {
      id: 'information',
      icon: 'assignment',
      label: t('applications.tabs.information', { defaultValue: 'Application information' }),
      locked: false,
    },
    {
      id: 'packages',
      icon: 'inventory_2',
      label: t('applications.tabs.packages', { defaultValue: 'Packages' }),
      locked: packagesLocked,
    },
    {
      id: 'payments',
      icon: 'receipt_long',
      label: t('applications.tabs.paymentHistory', { defaultValue: 'Payment history' }),
      locked: false,
    },
  ] as const;

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
              title={tab.locked
                ? t('applications.paymentPackage.completeInformationFirst', {
                    defaultValue: 'Complete all application information and required documents before choosing a package.',
                  })
                : undefined}
              className={cn(
                'flex h-11 shrink-0 items-center gap-2 rounded-md border px-3 text-sm font-semibold transition',
                active
                  ? 'border-primary bg-primary text-on-primary shadow-sm'
                  : 'border-transparent bg-transparent text-on-surface-variant hover:bg-surface',
              )}
            >
              <span className="material-symbols-outlined text-base" aria-hidden>{tab.icon}</span>
              {tab.label}
              {tab.locked ? (
                <span
                  className={cn(
                    'material-symbols-outlined text-base',
                    active ? 'text-on-primary/80' : 'text-warning',
                  )}
                  aria-label={t('applications.paymentPackage.lockedBadge', { defaultValue: 'Locked' })}
                >
                  lock
                </span>
              ) : null}
            </button>
          );
        })}
      </div>
    </section>
  );
}

const textareaClassName = 'min-h-[112px] w-full rounded-lg border px-3 py-2 text-sm transition focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20';
const sectionBaseClassName = 'space-y-5 rounded-2xl border border-outline-variant bg-surface p-5 shadow-sm';
const nestedCardClassName = 'rounded-xl border border-outline-variant bg-surface p-4 shadow-sm';

function stepCardClassName(_stepNumber?: number) {
  return sectionBaseClassName;
}

type JsonRecord = Record<string, unknown>;
const EMPTY_RECORD: JsonRecord = {};
type UserProfileInfo = {
  name_ar?: string | null;
  name_en?: string | null;
  email?: string | null;
  phone?: string | null;
} | null | undefined;

type ParentApplicationParentForm = {
  full_name: string;
  email: string;
  phone: string;
  national_id: string;
  address: string;
  emergency_contact: string;
  father_full_name: string;
  father_job: string;
  father_mobile: string;
  father_email: string;
  father_national_id: string;
  mother_full_name: string;
  mother_job: string;
  mother_mobile: string;
  mother_email: string;
  mother_national_id: string;
  marital_status: string;
  referral_source: string;
  password_recovery_contact: string;
  pickup_1_name: string;
  pickup_1_phone: string;
  pickup_1_relation: string;
  pickup_1_authorization: string;
  pickup_2_name: string;
  pickup_2_phone: string;
  pickup_2_relation: string;
  pickup_2_authorization: string;
};

type ParentApplicationChildForm = {
  first_name: string;
  middle_name: string;
  last_name: string;
  full_name: string;
  nickname: string;
  dob: string;
  gender: string;
  nationality: string;
  department: string;
  school_preference: string;
  school_admissions_plan: string;
  academic_year: string;
  has_siblings: boolean;
  sibling_ages: string;
  has_allergy: boolean;
  allergy_types: string[];
  allergy_details: string;
  has_medical_condition: boolean;
  medical_conditions: string;
  allergies: string;
  special_needs: string;
  photo_privacy: boolean;
  emergency_1_name: string;
  emergency_1_phone: string;
  emergency_1_relationship: string;
  emergency_2_name: string;
  emergency_2_phone: string;
  emergency_2_relationship: string;
  arrival_time: string;
  takes_breakfast_at_home: string;
  eats_nursery_meals: string;
  extra_meal_preference: string;
  sends_extra_snacks: string;
  water_preference: string;
  sends_vitamins: string;
  vitamin_details: string;
  diaper_supply_method: string;
  daily_diaper_count: string;
  rash_cream_usage: string;
  diaper_change_frequency: string;
  toilet_training_status: string;
  nap_time_preference: string;
  max_nap_time: string;
  medication_consents: string[];
};

function isRecord(value: unknown): value is JsonRecord {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function recordAt(source: JsonRecord, key: string): JsonRecord {
  const value = source[key];
  return isRecord(value) ? value : {};
}

function arrayRecordAt(source: JsonRecord, key: string): JsonRecord[] {
  const value = source[key];
  return Array.isArray(value) ? value.filter(isRecord) : [];
}

function readText(source: JsonRecord, key: string) {
  const value = source[key];
  return typeof value === 'string' ? value : value == null ? '' : String(value);
}

function readFirstText(source: JsonRecord, keys: string[]) {
  for (const key of keys) {
    const value = readText(source, key).trim();
    if (value) return value;
  }
  return '';
}

function readBool(source: JsonRecord, key: string) {
  return source[key] === true || source[key] === 'true';
}

function boolToYesNo(value: unknown) {
  if (value === true) return 'Yes';
  if (value === false) return 'No';
  return typeof value === 'string' ? value : '';
}

function yesNoToBool(value: string) {
  if (value === 'Yes') return true;
  if (value === 'No') return false;
  return null;
}

function splitFullName(fullName: string) {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  return {
    firstName: parts[0] ?? '',
    middleName: parts.length > 2 ? parts.slice(1, -1).join(' ') : '',
    lastName: parts.length > 1 ? parts[parts.length - 1] : '',
  };
}

function primaryParentKey(parentInfo: JsonRecord): 'mother' | 'father' | null {
  if (isRecord(parentInfo.mother)) return 'mother';
  if (isRecord(parentInfo.father)) return 'father';
  return null;
}

function primaryParentInfo(parentInfo: JsonRecord) {
  const key = primaryParentKey(parentInfo);
  return key ? recordAt(parentInfo, key) : {};
}

function emergencyContactSummary(contact: JsonRecord) {
  return [
    readFirstText(contact, ['name', 'full_name']),
    readFirstText(contact, ['phone', 'mobile']),
    readFirstText(contact, ['relationship', 'relation']),
  ].filter(Boolean).join(' - ');
}

function parentFormFromApplication(
  parentInfo: JsonRecord,
  childInfo: JsonRecord,
  profile: UserProfileInfo,
  account?: ParentAccountProfile | null,
  fallbackChildInfo: JsonRecord = {},
): ParentApplicationParentForm {
  const father = recordAt(parentInfo, 'father');
  const mother = recordAt(parentInfo, 'mother');
  const family = recordAt(parentInfo, 'family');
  const primary = primaryParentInfo(parentInfo);
  const pickups = arrayRecordAt(parentInfo, 'pickups');
  const childEmergencyContacts = arrayRecordAt(childInfo, 'emergency_contacts');
  const fallbackEmergencyContacts = arrayRecordAt(fallbackChildInfo, 'emergency_contacts');
  const copiedEmergencyContact = emergencyContactSummary(childEmergencyContacts[0] ?? {});
  const fallbackCopiedEmergencyContact = emergencyContactSummary(fallbackEmergencyContacts[0] ?? {});
  const accountFather = account?.father;
  const accountMother = account?.mother;
  const accountFamily = account?.family;

  return {
    full_name: readFirstText(parentInfo, ['full_name', 'parent_name', 'name', 'name_ar', 'name_en']) || readFirstText(primary, ['full_name', 'name']) || accountFather?.fullName || profile?.name_ar || profile?.name_en || '',
    email: readFirstText(parentInfo, ['email', 'parent_email']) || readFirstText(primary, ['email']) || accountFather?.email || profile?.email || '',
    phone: readFirstText(parentInfo, ['phone', 'mobile', 'mobile_phone', 'parent_phone']) || readFirstText(primary, ['mobile', 'phone', 'mobile_phone']) || accountFather?.mobile || profile?.phone || '',
    national_id: readFirstText(parentInfo, ['national_id']) || readFirstText(father, ['national_id']) || readFirstText(mother, ['national_id']) || accountFather?.nationalId || accountMother?.nationalId || '',
    address: readFirstText(parentInfo, ['address', 'home_address']) || readFirstText(family, ['address', 'home_address']) || accountFamily?.address || '',
    emergency_contact: readFirstText(parentInfo, ['emergency_contact']) || readFirstText(family, ['emergency_contact']) || accountFamily?.emergencyContact || copiedEmergencyContact || fallbackCopiedEmergencyContact,
    father_full_name: readFirstText(father, ['full_name', 'name']) || readFirstText(parentInfo, ['father_full_name', 'fatherFullName']) || accountFather?.fullName || '',
    father_job: readFirstText(father, ['job', 'occupation']) || readFirstText(parentInfo, ['father_job', 'fatherJob']) || accountFather?.job || '',
    father_mobile: readFirstText(father, ['mobile', 'phone', 'mobile_phone']) || readFirstText(parentInfo, ['father_mobile', 'fatherMobile', 'father_phone']) || accountFather?.mobile || '',
    father_email: readFirstText(father, ['email']) || readFirstText(parentInfo, ['father_email', 'fatherEmail']) || accountFather?.email || '',
    father_national_id: readFirstText(father, ['national_id']) || readFirstText(parentInfo, ['father_national_id', 'fatherNationalId']) || accountFather?.nationalId || '',
    mother_full_name: readFirstText(mother, ['full_name', 'name']) || readFirstText(parentInfo, ['mother_full_name', 'motherFullName']) || accountMother?.fullName || '',
    mother_job: readFirstText(mother, ['job', 'occupation']) || readFirstText(parentInfo, ['mother_job', 'motherJob']) || accountMother?.job || '',
    mother_mobile: readFirstText(mother, ['mobile', 'phone', 'mobile_phone']) || readFirstText(parentInfo, ['mother_mobile', 'motherMobile', 'mother_phone']) || accountMother?.mobile || '',
    mother_email: readFirstText(mother, ['email']) || readFirstText(parentInfo, ['mother_email', 'motherEmail']) || accountMother?.email || '',
    mother_national_id: readFirstText(mother, ['national_id']) || readFirstText(parentInfo, ['mother_national_id', 'motherNationalId']) || accountMother?.nationalId || '',
    marital_status: readFirstText(family, ['marital_status']) || readFirstText(parentInfo, ['marital_status']) || accountFamily?.maritalStatus || '',
    referral_source: readFirstText(family, ['referral_source']) || readFirstText(parentInfo, ['referral_source']),
    password_recovery_contact: readFirstText(family, ['password_recovery_contact']) || readFirstText(parentInfo, ['password_recovery_contact']),
    pickup_1_name: readText(pickups[0] ?? {}, 'name'),
    pickup_1_phone: readText(pickups[0] ?? {}, 'phone'),
    pickup_1_relation: readText(pickups[0] ?? {}, 'relation'),
    pickup_1_authorization: readText(pickups[0] ?? {}, 'authorization') || 'anytime',
    pickup_2_name: readText(pickups[1] ?? {}, 'name'),
    pickup_2_phone: readText(pickups[1] ?? {}, 'phone'),
    pickup_2_relation: readText(pickups[1] ?? {}, 'relation'),
    pickup_2_authorization: readText(pickups[1] ?? {}, 'authorization') || 'anytime',
  };
}

function childFormFromApplication(childInfo: JsonRecord, fallbackChildInfo: JsonRecord = {}): ParentApplicationChildForm {
  const dailyCare = recordAt(childInfo, 'daily_care_preferences');
  const emergency = arrayRecordAt(childInfo, 'emergency_contacts');
  const fallbackEmergency = arrayRecordAt(fallbackChildInfo, 'emergency_contacts');
  const emergencySource = emergency.length > 0 ? emergency : fallbackEmergency;
  const fullName = readText(childInfo, 'full_name') || readText(childInfo, 'full_name_en') || readText(childInfo, 'full_name_ar');
  const splitName = splitFullName(fullName);
  const allergyTypes = dailyCare.allergy_types;
  const medicationConsents = dailyCare.emergency_medications;

  return {
    first_name: readText(childInfo, 'first_name') || splitName.firstName,
    middle_name: readText(childInfo, 'middle_name') || splitName.middleName,
    last_name: readText(childInfo, 'last_name') || splitName.lastName,
    full_name: fullName,
    nickname: readText(childInfo, 'nickname'),
    dob: readText(childInfo, 'dob'),
    gender: readText(childInfo, 'gender'),
    nationality: readText(childInfo, 'nationality'),
    department: readText(childInfo, 'department'),
    school_preference: readText(childInfo, 'school_preference'),
    school_admissions_plan: readText(childInfo, 'school_admissions_plan'),
    academic_year: readText(childInfo, 'academic_year'),
    has_siblings: readBool(childInfo, 'has_siblings'),
    sibling_ages: readText(childInfo, 'sibling_ages'),
    has_allergy: readBool(dailyCare, 'has_allergy') || (Array.isArray(allergyTypes) && allergyTypes.length > 0) || Boolean(readText(dailyCare, 'food_allergies') || readText(childInfo, 'allergies')),
    allergy_types: Array.isArray(allergyTypes) ? allergyTypes.filter((value): value is string => typeof value === 'string') : [],
    allergy_details: readText(dailyCare, 'allergy_other_details'),
    has_medical_condition: readBool(dailyCare, 'has_medical_condition') || Boolean(readText(dailyCare, 'medical_condition_details') || readText(childInfo, 'medical_conditions')),
    medical_conditions: readText(childInfo, 'medical_conditions') || readText(dailyCare, 'medical_condition_details'),
    allergies: readText(childInfo, 'allergies') || readText(dailyCare, 'food_allergies'),
    special_needs: readText(childInfo, 'special_needs') || readText(dailyCare, 'child_behavior_health_notes'),
    photo_privacy: readBool(childInfo, 'photo_privacy'),
    emergency_1_name: readText(emergencySource[0] ?? {}, 'name'),
    emergency_1_phone: readText(emergencySource[0] ?? {}, 'phone'),
    emergency_1_relationship: readText(emergencySource[0] ?? {}, 'relationship'),
    emergency_2_name: readText(emergencySource[1] ?? {}, 'name'),
    emergency_2_phone: readText(emergencySource[1] ?? {}, 'phone'),
    emergency_2_relationship: readText(emergencySource[1] ?? {}, 'relationship'),
    arrival_time: readText(dailyCare, 'arrival_time'),
    takes_breakfast_at_home: boolToYesNo(dailyCare.takes_breakfast_at_home),
    eats_nursery_meals: boolToYesNo(dailyCare.eats_nursery_meals),
    extra_meal_preference: boolToYesNo(dailyCare.accepts_extra_meals),
    sends_extra_snacks: boolToYesNo(dailyCare.accepts_extra_snacks),
    water_preference: boolToYesNo(dailyCare.accepts_mineral_water),
    sends_vitamins: boolToYesNo(dailyCare.sends_vitamins),
    vitamin_details: readText(dailyCare, 'vitamin_details'),
    diaper_supply_method: readText(dailyCare, 'diaper_supply_method'),
    daily_diaper_count: readText(dailyCare, 'daily_diaper_count'),
    rash_cream_usage: readText(dailyCare, 'rash_cream_usage'),
    diaper_change_frequency: readText(dailyCare, 'diaper_change_frequency'),
    toilet_training_status: readText(dailyCare, 'toilet_training_status'),
    nap_time_preference: readText(dailyCare, 'nap_time_preference'),
    max_nap_time: readText(dailyCare, 'max_nap_time'),
    medication_consents: Array.isArray(medicationConsents)
      ? medicationConsents.filter((value): value is string => typeof value === 'string')
      : [],
  };
}

function contactFromFields(name: string, phone: string, relationship: string) {
  if (!name.trim() && !phone.trim() && !relationship.trim()) return null;
  return { name: name.trim(), phone: phone.trim(), relationship: relationship.trim() };
}

function pickupFromFields(name: string, phone: string, relation: string, authorization: string) {
  if (!name.trim() && !phone.trim() && !relation.trim()) return null;
  return { name: name.trim(), phone: phone.trim(), relation: relation.trim() || null, authorization: authorization || 'anytime' };
}

function parentRequiredValue(form: ParentApplicationParentForm, field: (typeof requiredParentFields)[number]) {
  if (field === 'full_name') return form.full_name || form.father_full_name || form.mother_full_name;
  if (field === 'email') return form.email || form.father_email || form.mother_email;
  if (field === 'phone') return form.phone || form.father_mobile || form.mother_mobile;
  return form[field];
}

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const phonePattern = egyptianMobilePattern;
const nationalIdPattern = /^\d{14}$/;
const digitsOnly = (value: string) => value.replace(/\D/g, '');
const phoneInputProps = {
  type: 'tel',
  inputMode: 'numeric' as const,
  pattern: '[0-9]*',
  maxLength: 11,
};
const nationalIdInputProps = {
  type: 'text',
  inputMode: 'numeric' as const,
  pattern: '[0-9]*',
  maxLength: 14,
};

function hasText(value: string) {
  return value.trim().length > 0;
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

function isOptionalEmailValid(value: string) {
  return !hasText(value) || emailPattern.test(value.trim());
}

function isPhoneValid(value: string) {
  return phonePattern.test(value.trim());
}

function isOptionalNationalIdValid(value: string) {
  return !hasText(value) || nationalIdPattern.test(value.trim());
}

/** Field name → i18n key of the message shown under that field. */
type FieldErrors = Record<string, string>;

/**
 * Per-field validation for one application step. A step is complete exactly when this
 * returns no errors, so the inline messages and the Next/submit gates can't disagree.
 */
function applicationStepFieldErrors(step: number, parentForm: ParentApplicationParentForm, childForm: ParentApplicationChildForm): FieldErrors {
  const errors: FieldErrors = {};
  const requireText = (field: string, value: string) => {
    if (!hasText(value)) errors[field] = 'signup.requiredField';
  };
  const requirePhone = (field: string, value: string) => {
    if (!hasText(value)) errors[field] = 'signup.requiredField';
    else if (!isPhoneValid(value)) errors[field] = 'signup.invalidPhone';
  };

  if (step === 1) {
    const parents = (['father', 'mother'] as const).map((prefix) => ({
      prefix,
      started: hasText(parentForm[`${prefix}_full_name`]) || hasText(parentForm[`${prefix}_mobile`]) ||
        hasText(parentForm[`${prefix}_email`]) || hasText(parentForm[`${prefix}_national_id`]),
    }));
    const noneStarted = parents.every((parent) => !parent.started);
    // One complete parent is enough; with neither started, point at the father's fields.
    const checked = noneStarted ? [parents[0]] : parents.filter((parent) => parent.started);
    for (const { prefix } of checked) {
      if (noneStarted) {
        errors[`${prefix}_full_name`] = 'signup.oneParentRequired';
        errors[`${prefix}_mobile`] = 'signup.oneParentRequired';
      } else {
        requireText(`${prefix}_full_name`, parentForm[`${prefix}_full_name`]);
        requirePhone(`${prefix}_mobile`, parentForm[`${prefix}_mobile`]);
      }
      if (!isOptionalEmailValid(parentForm[`${prefix}_email`])) errors[`${prefix}_email`] = 'signup.invalidEmail';
      if (!isOptionalNationalIdValid(parentForm[`${prefix}_national_id`])) errors[`${prefix}_national_id`] = 'signup.invalidNationalId';
    }
    // Email is required at submission (see requiredParentFields), so require it here too.
    if (!hasText(parentRequiredValue(parentForm, 'email'))) {
      for (const { prefix } of checked) errors[`${prefix}_email`] = 'signup.requiredField';
    }
  }
  if (step === 2) {
    requireText('address', parentForm.address);
    requireText('emergency_contact', parentForm.emergency_contact);
    if (childForm.has_siblings) requireText('sibling_ages', childForm.sibling_ages);
  }
  if (step === 3) {
    requireText('first_name', childForm.first_name);
    requireText('middle_name', childForm.middle_name);
    requireText('last_name', childForm.last_name);
    requireText('nickname', childForm.nickname);
    requireText('nationality', childForm.nationality);
    if (!hasText(childForm.dob)) errors.dob = 'signup.requiredField';
    else if (!isValidIsoDate(childForm.dob)) errors.dob = 'signup.invalidDate';
    else if (!isChildAgeValid(childForm.dob)) errors.dob = 'signup.childAgeRange';
  }
  if (step === 5) {
    if (childForm.has_allergy) {
      if (childForm.allergy_types.length === 0) errors.allergy_types = 'signup.allergyTypeRequired';
      if (childForm.allergy_types.includes(OTHER_ALLERGY_VALUE)) requireText('allergy_details', childForm.allergy_details);
    }
    if (childForm.has_medical_condition) requireText('medical_conditions', childForm.medical_conditions);
  }
  if (step === 6) {
    for (const n of [1, 2] as const) {
      requireText(`emergency_${n}_name`, childForm[`emergency_${n}_name`]);
      requirePhone(`emergency_${n}_phone`, childForm[`emergency_${n}_phone`]);
      requireText(`emergency_${n}_relationship`, childForm[`emergency_${n}_relationship`]);
    }
  }
  if (step === 7) {
    if (childForm.nap_time_preference !== 'Yes' && childForm.nap_time_preference !== 'No') {
      errors.nap_time_preference = 'signup.requiredField';
    } else if (
      childForm.nap_time_preference === 'Yes' &&
      !NAP_DURATION_VALUES.includes(childForm.max_nap_time as (typeof NAP_DURATION_VALUES)[number])
    ) {
      errors.max_nap_time = 'signup.requiredField';
    }
  }
  if (step === 8) {
    for (const n of [1, 2] as const) {
      requireText(`pickup_${n}_name`, parentForm[`pickup_${n}_name`]);
      requirePhone(`pickup_${n}_phone`, parentForm[`pickup_${n}_phone`]);
    }
  }
  return errors;
}

function hasCompleteApplicationStep(step: number, parentForm: ParentApplicationParentForm, childForm: ParentApplicationChildForm) {
  return Object.keys(applicationStepFieldErrors(step, parentForm, childForm)).length === 0;
}

function mergeParentInfo(parentInfo: JsonRecord, form: ParentApplicationParentForm): JsonRecord {
  const primaryFullName = form.full_name.trim() || form.father_full_name.trim() || form.mother_full_name.trim();
  const primaryEmail = form.email.trim() || form.father_email.trim() || form.mother_email.trim();
  const primaryPhone = form.phone.trim() || form.father_mobile.trim() || form.mother_mobile.trim();
  const primaryNationalId = form.national_id.trim() || form.father_national_id.trim() || form.mother_national_id.trim();
  const next: JsonRecord = {
    ...parentInfo,
    full_name: primaryFullName,
    email: primaryEmail,
    phone: primaryPhone,
    national_id: primaryNationalId || null,
    address: form.address.trim(),
    emergency_contact: form.emergency_contact.trim(),
  };

  const father = { ...recordAt(parentInfo, 'father') };
  if (form.father_full_name.trim() || form.father_mobile.trim() || form.father_email.trim() || form.father_job.trim() || form.father_national_id.trim()) {
    next.father = {
      ...father,
      full_name: form.father_full_name.trim(),
      job: form.father_job.trim() || null,
      mobile: form.father_mobile.trim(),
      email: form.father_email.trim() || null,
      national_id: form.father_national_id.trim() || null,
    };
  }

  const mother = { ...recordAt(parentInfo, 'mother') };
  if (form.mother_full_name.trim() || form.mother_mobile.trim() || form.mother_email.trim() || form.mother_job.trim() || form.mother_national_id.trim()) {
    next.mother = {
      ...mother,
      full_name: form.mother_full_name.trim(),
      job: form.mother_job.trim() || null,
      mobile: form.mother_mobile.trim(),
      email: form.mother_email.trim() || null,
      national_id: form.mother_national_id.trim() || null,
    };
  }

  const primary = primaryParentKey(next);
  if (primary && isRecord(next[primary])) {
    next[primary] = {
      ...(next[primary] as JsonRecord),
      full_name: primaryFullName || readText(next[primary] as JsonRecord, 'full_name'),
      email: primaryEmail || readText(next[primary] as JsonRecord, 'email') || null,
      mobile: primaryPhone || readText(next[primary] as JsonRecord, 'mobile'),
    };
  }

  next.family = {
    ...recordAt(parentInfo, 'family'),
    address: form.address.trim() || null,
    marital_status: form.marital_status || null,
    emergency_contact: form.emergency_contact.trim() || null,
    password_recovery_contact: form.password_recovery_contact.trim() || null,
    referral_source: form.referral_source || null,
  };

  next.pickups = [
    pickupFromFields(form.pickup_1_name, form.pickup_1_phone, form.pickup_1_relation, form.pickup_1_authorization),
    pickupFromFields(form.pickup_2_name, form.pickup_2_phone, form.pickup_2_relation, form.pickup_2_authorization),
  ].filter(Boolean);

  return next;
}

function mergeChildInfo(childInfo: JsonRecord, form: ParentApplicationChildForm): JsonRecord {
  const emergencyContacts = [
    contactFromFields(form.emergency_1_name, form.emergency_1_phone, form.emergency_1_relationship),
    contactFromFields(form.emergency_2_name, form.emergency_2_phone, form.emergency_2_relationship),
  ].filter(Boolean);
  const dailyCare = {
    ...recordAt(childInfo, 'daily_care_preferences'),
    arrival_time: form.arrival_time || null,
    takes_breakfast_at_home: yesNoToBool(form.takes_breakfast_at_home),
    eats_nursery_meals: yesNoToBool(form.eats_nursery_meals),
    accepts_extra_meals: yesNoToBool(form.extra_meal_preference),
    accepts_extra_snacks: yesNoToBool(form.sends_extra_snacks),
    accepts_mineral_water: yesNoToBool(form.water_preference),
    sends_vitamins: yesNoToBool(form.sends_vitamins),
    vitamin_details: form.sends_vitamins === 'Yes' ? form.vitamin_details.trim() || null : null,
    food_allergies: form.has_allergy ? form.allergies.trim() || null : null,
    allergy_types: form.has_allergy ? form.allergy_types : [],
    allergy_other_details: form.has_allergy && form.allergy_types.includes(OTHER_ALLERGY_VALUE)
      ? form.allergy_details.trim() || null
      : null,
    has_allergy: form.has_allergy,
    has_medical_condition: form.has_medical_condition,
    medical_condition_details: form.has_medical_condition ? form.medical_conditions.trim() || null : null,
    child_behavior_health_notes: form.special_needs.trim() || null,
    diaper_supply_method: form.diaper_supply_method || null,
    daily_diaper_count: form.daily_diaper_count ? Number(form.daily_diaper_count) || null : null,
    rash_cream_usage: form.rash_cream_usage.trim() || null,
    diaper_change_frequency: form.diaper_change_frequency.trim() || null,
    toilet_training_status: form.toilet_training_status || null,
    nap_time_preference: form.nap_time_preference || null,
    max_nap_time: form.nap_time_preference ? form.max_nap_time || null : null,
    emergency_medications: form.medication_consents.length > 0 ? form.medication_consents : null,
  };

  const fullName = [form.first_name, form.middle_name, form.last_name].map((part) => part.trim()).filter(Boolean).join(' ') || form.full_name.trim();
  return {
    ...childInfo,
    full_name: fullName,
    full_name_ar: fullName,
    full_name_en: fullName,
    first_name: form.first_name.trim(),
    middle_name: form.middle_name.trim() || null,
    last_name: form.last_name.trim(),
    nickname: form.nickname.trim() || null,
    dob: form.dob,
    gender: form.gender || null,
    nationality: form.nationality.trim() || null,
    department: form.department || null,
    school_preference: form.school_preference || null,
    school_admissions_plan: form.school_admissions_plan || null,
    academic_year: form.academic_year || null,
    has_siblings: form.has_siblings,
    sibling_ages: form.has_siblings ? form.sibling_ages.trim() || null : null,
    medical_conditions: form.has_medical_condition ? form.medical_conditions.trim() : '',
    allergies: form.has_allergy ? form.allergies.trim() : '',
    special_needs: form.special_needs.trim(),
    photo_privacy: form.photo_privacy,
    daily_care_preferences: dailyCare,
    emergency_contacts: emergencyContacts,
    home_address: readText(childInfo, 'home_address'),
  };
}

export function ParentApplicationFormPage() {
  const { t, i18n } = useTranslation();
  const { id } = useParams();
  const [searchParams] = useSearchParams();
  const { user } = useAuthSession();
  const { data: profile } = useUserProfile(user?.id);
  const apps = useApplications({ applicationId: id, parentId: user?.id });
  const [step, setStep] = useState(searchParams.get('newChild') === '1' ? 3 : 1);
  const [activeTab, setActiveTab] = useState<ApplicationWorkspaceTab>(() => {
    const tab = searchParams.get('tab');
    return tab === 'packages' || tab === 'payments' ? tab : 'information';
  });
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

  useEffect(() => {
    if (!app) return;
    setParentForm(parentFormFromApplication(parentInfo, childInfo, profile, parentAccount.data, previousChildInfo));
    setChildForm(childFormFromApplication(childInfo, previousChildInfo));
    setTerms(Boolean(app.terms_accepted));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [app?.id, parentAccount.data?.sourceApplicationId, previousChildInfo]);

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
  const firstIncompleteInformationStep = firstInvalidInformationStep ?? (missingRequired.length > 0 ? 10 : null);
  const isInformationComplete = firstIncompleteInformationStep === null;
  const childDobBounds = childDateOfBirthBounds();
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
  // Submit stays locked until a package is chosen (and paid in full or part) and the terms are accepted.
  const isSubmitReady = terms && hasSubmittedPackagePayment;
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
  const goToNextStep = () => {
    if (revealStepErrors(step)) return;
    setStep((s) => Math.min(APPLICATION_STEP_COUNT, s + 1));
  };
  const draftUpdates = () => ({
    parent_info_json: mergeParentInfo(parentInfo, parentForm),
    child_info_json: mergeChildInfo(childInfo, childForm),
    terms_accepted: terms,
    parent_id: user?.id,
  });
  const informationIncompleteMessage = firstIncompleteInformationStep === null
    ? ''
    : firstIncompleteInformationStep === 10
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
  const payReturnTo = encodeURIComponent(`/parent/applications/${id}?tab=packages`);
  const payLink = packageInvoice ? `/parent/invoices/${packageInvoice.id}/pay?returnTo=${payReturnTo}` : null;
  const canChoosePackage =
    isInformationComplete &&
    status !== 'rejected' &&
    !packageInvoice?.paidAmount &&
    !packageInvoice?.pendingAmount;
  // Extra hours has no invoice/payment gate of its own — it's a free, optional pick
  // right up until the application is finally decided.
  const canChooseExtraHours = isInformationComplete && status !== 'approved' && status !== 'rejected';

  const selectExtraHoursPackage = async (packageId: string | null) => {
    try {
      await extraHoursPackage.selectPackage(packageId);
      toast.success(
        packageId
          ? t('applications.extraHoursPackage.selected', { defaultValue: 'Extra hours package selected.' })
          : t('applications.extraHoursPackage.cleared', { defaultValue: 'Extra hours package removed.' }),
      );
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t('applications.paymentPackage.selectFailed', { defaultValue: 'Could not update the selection.' }));
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
      toast.success(t('applications.paymentPackage.selectedToast', {
        defaultValue: 'Package selected. Pay all or part of it - the application is sent for review automatically.',
      }));
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
        setStep(10);
        return;
      }
      if (!hasRequestedUpload) {
        toast.error(t('applications.requestedDocumentsValidation', {
          defaultValue: 'Please upload or replace at least one requested document before submitting again.',
        }));
        setStep(10);
        return;
      }
      toast.error(t('applications.submitTermsValidation', { defaultValue: 'Please accept the terms before submitting.' }));
      return;
    }
    if (!packageInvoice) {
      toast.error(t('applications.paymentPackage.selectBeforeSubmit', {
        defaultValue: 'Please choose a package before submitting the application.',
      }));
      setActiveTab('packages');
      return;
    }
    if (!hasSubmittedPackagePayment) {
      toast.error(t('applications.paymentPackage.payBeforeSubmit', {
        defaultValue: 'Please submit a full or partial package payment before sending the application for review.',
      }));
      setActiveTab('packages');
      return;
    }
    setSubmittingApplication(true);
    try {
      if (canEditApplication) {
        await apps.saveApplicationDraft({ id, updates: draftUpdates() });
      }
      await apps.submitApplication({
        id,
        nurseryId: String(app.nursery_id),
        parentName: parentRequiredValue(parentForm, 'full_name') || t('common.parent'),
      });
      toast.success(t('applications.submittedSuccess'));
    } catch (error) {
      const message = error instanceof Error ? error.message : '';
      if (message === 'missing_required_documents') {
        toast.error(t('applications.submitValidation'));
        setStep(10);
      } else if (message === 'requested_documents_not_updated') {
        toast.error(t('applications.requestedDocumentsValidation', {
          defaultValue: 'Please upload or replace at least one requested document before submitting again.',
        }));
        setStep(10);
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
        packagesLocked={!isInformationComplete && !packageInvoice}
      />

      {activeTab === 'information' ? (
        <FieldValidationContext.Provider value={fieldValidation}>
          <div className="grid gap-5 xl:grid-cols-[280px_minmax(0,1fr)]">
            <ApplicationSteps
              step={step}
              labels={applicationStepLabels}
              icons={applicationStepIcons}
              onStepClick={setStep}
            />

            <div className="min-w-0">
              {step === 1 ? (
                <fieldset disabled={!canEditApplication} className={stepCardClassName(1)}>
                  <PanelHeader icon="account_circle" title={applicationStepLabels[0]} />
                  <div className="grid gap-4">
                    <div className={cn(nestedCardClassName, 'grid gap-4 md:grid-cols-2')}>
                      <h3 className="md:col-span-2 text-sm font-semibold text-on-surface">{t('signup.fatherInfo', { defaultValue: 'Father information' })}</h3>
                      <FormField name="father_full_name" label={t('signup.fatherFullName')}><Input value={parentForm.father_full_name} onChange={(e) => setParentField('father_full_name', e.target.value)} /></FormField>
                      <FormField label={t('signup.fatherJob')}><Input value={parentForm.father_job} onChange={(e) => setParentField('father_job', e.target.value)} /></FormField>
                      <FormField name="father_mobile" label={t('signup.fatherMobile')}><Input {...phoneInputProps} value={parentForm.father_mobile} onChange={(e) => setParentField('father_mobile', digitsOnly(e.target.value))} /></FormField>
                      <FormField name="father_email" label={t('signup.fatherEmail')}><Input type="email" value={parentForm.father_email} onChange={(e) => setParentField('father_email', e.target.value)} /></FormField>
                      <FormField name="father_national_id" label={t('applications.nationalId', { defaultValue: 'National ID' })} className="md:col-span-2"><Input {...nationalIdInputProps} value={parentForm.father_national_id} onChange={(e) => setParentField('father_national_id', digitsOnly(e.target.value))} /></FormField>
                    </div>
                    <div className={cn(nestedCardClassName, 'grid gap-4 md:grid-cols-2')}>
                      <h3 className="md:col-span-2 text-sm font-semibold text-on-surface">{t('signup.motherInfo', { defaultValue: 'Mother information' })}</h3>
                      <FormField name="mother_full_name" label={t('signup.motherFullName')}><Input value={parentForm.mother_full_name} onChange={(e) => setParentField('mother_full_name', e.target.value)} /></FormField>
                      <FormField label={t('signup.motherJob')}><Input value={parentForm.mother_job} onChange={(e) => setParentField('mother_job', e.target.value)} /></FormField>
                      <FormField name="mother_mobile" label={t('signup.motherMobile')}><Input {...phoneInputProps} value={parentForm.mother_mobile} onChange={(e) => setParentField('mother_mobile', digitsOnly(e.target.value))} /></FormField>
                      <FormField name="mother_email" label={t('signup.motherEmail')}><Input type="email" value={parentForm.mother_email} onChange={(e) => setParentField('mother_email', e.target.value)} /></FormField>
                      <FormField name="mother_national_id" label={t('applications.nationalId', { defaultValue: 'National ID' })} className="md:col-span-2"><Input {...nationalIdInputProps} value={parentForm.mother_national_id} onChange={(e) => setParentField('mother_national_id', digitsOnly(e.target.value))} /></FormField>
                    </div>
                  </div>
                </fieldset>
              ) : null}

              {step === 2 ? (
                <fieldset disabled={!canEditApplication} className={stepCardClassName(2)}>
                  <PanelHeader icon="home" title={applicationStepLabels[1]} />
                  <div className="grid gap-4 md:grid-cols-2">
                    <FormField label={t('signup.maritalStatus')}><Input value={parentForm.marital_status} onChange={(e) => setParentField('marital_status', e.target.value)} /></FormField>
                    <FormField name="address" label={t('applications.address')}><Input value={parentForm.address} onChange={(e) => setParentField('address', e.target.value)} /></FormField>
                    <FormField name="emergency_contact" label={t('applications.emergencyContact')} className="md:col-span-2"><Input value={parentForm.emergency_contact} onChange={(e) => setParentField('emergency_contact', e.target.value)} /></FormField>
                    <div className="flex items-center gap-2 md:col-span-2">
                      <input type="checkbox" checked={childForm.has_siblings} onChange={(e) => setChildField('has_siblings', e.target.checked)} />
                      <Label>{t('signup.hasSiblings', { defaultValue: 'Has siblings' })}</Label>
                    </div>
                    {childForm.has_siblings ? (
                      <FormField name="sibling_ages" label={t('signup.siblingAges')} className="md:col-span-2"><Input value={childForm.sibling_ages} onChange={(e) => setChildField('sibling_ages', e.target.value)} /></FormField>
                    ) : null}
                  </div>
                </fieldset>
              ) : null}

              {step === 3 ? (
                <fieldset disabled={!canEditApplication} className={stepCardClassName(3)}>
                  <PanelHeader icon="child_care" title={applicationStepLabels[2]} body={t('applications.newChildInfoHint', { defaultValue: 'Parent and family data is already copied. Add the new child details here.' })} />
                  <div className="grid gap-4 md:grid-cols-2">
                    <FormField name="first_name" label={t('signup.childFirstName')}><Input value={childForm.first_name} onChange={(e) => setChildField('first_name', e.target.value)} /></FormField>
                    <FormField name="middle_name" label={t('signup.childMiddleName')}><Input value={childForm.middle_name} onChange={(e) => setChildField('middle_name', e.target.value)} /></FormField>
                    <FormField name="last_name" label={t('signup.childLastName')}><Input value={childForm.last_name} onChange={(e) => setChildField('last_name', e.target.value)} /></FormField>
                    <FormField name="nickname" label={t('signup.childNickname')}><Input value={childForm.nickname} onChange={(e) => setChildField('nickname', e.target.value)} /></FormField>
                    <FormField name="dob" label={t('applications.childDob')} hint={t('signup.childAgeRange')}><Input type="date" min={childDobBounds.min} max={childDobBounds.max} value={childForm.dob} onChange={(e) => setChildField('dob', e.target.value)} /></FormField>
                    <FormField label={t('applications.gender')}>
                      <StyledSelect
                        value={childForm.gender}
                        onChange={(value) => setChildField('gender', value)}
                        options={[
                          { value: '', label: t('common.select') },
                          { value: 'male', label: t('common.genderMale', { defaultValue: 'Male' }) },
                          { value: 'female', label: t('common.genderFemale', { defaultValue: 'Female' }) },
                        ]}
                      />
                    </FormField>
                    <FormField name="nationality" label={t('signup.childNationality')} className="md:col-span-2">
                      <SearchableSelect
                        name="nationality"
                        value={childForm.nationality}
                        onChange={(value) => setChildField('nationality', value)}
                        options={childNationalityOptions}
                        searchPlaceholder={t('signup.nationalitySearch')}
                      />
                    </FormField>
                  </div>
                </fieldset>
              ) : null}

              {step === 4 ? (
                <fieldset disabled={!canEditApplication} className={stepCardClassName(4)}>
                  <PanelHeader icon="school" title={applicationStepLabels[3]} />
                  <div className="grid gap-5 md:grid-cols-2">
                    <FormField label={t('signup.department')}><Input value={childForm.department} onChange={(e) => setChildField('department', e.target.value)} /></FormField>
                    <FormField label={t('signup.schoolPreference')}>
                      <StyledSelect
                        value={childForm.school_preference}
                        onChange={(value) => setChildField('school_preference', value)}
                        options={[
                          { value: '', label: t('common.select') },
                          { value: 'british', label: t('signup.schoolBritish', { defaultValue: 'British' }) },
                          { value: 'american', label: t('signup.schoolAmerican', { defaultValue: 'American' }) },
                          { value: 'national', label: t('signup.schoolNational', { defaultValue: 'National' }) },
                          { value: 'ib', label: t('signup.schoolIb', { defaultValue: 'IB' }) },
                          { value: 'french', label: t('signup.schoolFrench', { defaultValue: 'French' }) },
                          { value: 'canadian', label: t('signup.schoolCanadian', { defaultValue: 'Canadian' }) },
                          { value: 'other', label: t('signup.schoolOther', { defaultValue: 'Other' }) },
                        ]}
                      />
                    </FormField>
                    <FormField label={t('signup.schoolAdmissionsPlan')}><Input value={childForm.school_admissions_plan} onChange={(e) => setChildField('school_admissions_plan', e.target.value)} /></FormField>
                    <FormField label={t('signup.academicYear')}><Input value={childForm.academic_year} onChange={(e) => setChildField('academic_year', e.target.value)} /></FormField>
                    <FormField label={t('signup.referralSource')}>
                      <StyledSelect
                        value={parentForm.referral_source}
                        onChange={(value) => setParentField('referral_source', value)}
                        options={[
                          { value: '', label: t('common.select') },
                          { value: 'social_media', label: t('signup.refSocialMedia') },
                          { value: 'tiktok', label: t('signup.refTikTok') },
                          { value: 'friend', label: t('signup.refFriend') },
                          { value: 'website', label: t('signup.refWebsite') },
                          { value: 'walkIn', label: t('signup.refWalkIn') },
                          { value: 'other', label: t('signup.refOther') },
                        ]}
                      />
                    </FormField>
                  </div>
                </fieldset>
              ) : null}

              {step === 5 ? (
                <fieldset disabled={!canEditApplication} className={stepCardClassName(5)}>
                  <PanelHeader icon="health_and_safety" title={applicationStepLabels[4]} />
                  <div className="grid gap-4 lg:grid-cols-2">
                    <div className="space-y-3 rounded-xl border border-outline-variant bg-surface p-4 lg:col-span-2">
                      <label className="flex items-center gap-2 text-sm font-semibold">
                        <input
                          type="checkbox"
                          checked={childForm.has_allergy}
                          onChange={(e) => {
                            setChildField('has_allergy', e.target.checked);
                            if (!e.target.checked) {
                              setChildField('allergy_types', []);
                              setChildField('allergy_details', '');
                              setChildField('allergies', '');
                            }
                          }}
                        />
                        {t('signup.hasAllergy')}
                      </label>
                      {childForm.has_allergy ? (
                        <>
                          <div className="grid gap-2 sm:grid-cols-2">
                            {ALLERGY_OPTIONS.map((option) => {
                              const checked = childForm.allergy_types.includes(option.value);
                              return (
                                <label key={option.value} className="flex items-center gap-2 rounded-lg border border-outline-variant bg-surface px-3 py-2 text-sm">
                                  <input
                                    type="checkbox"
                                    checked={checked}
                                    onChange={(event) => {
                                      setChildField(
                                        'allergy_types',
                                        event.target.checked
                                          ? [...childForm.allergy_types, option.value]
                                          : childForm.allergy_types.filter((value) => value !== option.value),
                                      );
                                    }}
                                  />
                                  {allergyLabel(option.value, false)}
                                </label>
                              );
                            })}
                          </div>
                          <FieldErrorText error={fieldValidation.errorFor('allergy_types')} />
                          {childForm.allergy_types.includes(OTHER_ALLERGY_VALUE) ? (
                            <FormField name="allergy_details" label={t('signup.allergyDetails')}><Input value={childForm.allergy_details} onChange={(e) => setChildField('allergy_details', e.target.value)} /></FormField>
                          ) : null}
                          <FormField label={t('applications.allergies')}><textarea className={textareaClassName} value={childForm.allergies} onChange={(e) => setChildField('allergies', e.target.value)} /></FormField>
                        </>
                      ) : null}
                    </div>
                    <div className="space-y-3 rounded-xl border border-outline-variant bg-surface p-4 lg:col-span-2">
                      <label className="flex items-center gap-2 text-sm font-semibold">
                        <input
                          type="checkbox"
                          checked={childForm.has_medical_condition}
                          onChange={(e) => {
                            setChildField('has_medical_condition', e.target.checked);
                            if (!e.target.checked) setChildField('medical_conditions', '');
                          }}
                        />
                        {t('signup.hasMedicalCondition')}
                      </label>
                      {childForm.has_medical_condition ? (
                        <FormField name="medical_conditions" label={t('applications.medicalConditions')}><textarea className={textareaClassName} value={childForm.medical_conditions} onChange={(e) => setChildField('medical_conditions', e.target.value)} /></FormField>
                      ) : null}
                    </div>
                    <FormField label={t('applications.specialNeeds')} className="lg:col-span-2"><textarea className={textareaClassName} value={childForm.special_needs} onChange={(e) => setChildField('special_needs', e.target.value)} /></FormField>
                    <label className="flex items-center gap-2 text-sm lg:col-span-2"><input type="checkbox" checked={childForm.photo_privacy} onChange={(e) => setChildField('photo_privacy', e.target.checked)} />{t('applications.photoPrivacyConsent')}</label>
                  </div>
                </fieldset>
              ) : null}

              {step === 6 ? (
                <fieldset disabled={!canEditApplication} className={stepCardClassName(6)}>
                  <PanelHeader icon="emergency" title={applicationStepLabels[5]} />
                  <div className="grid gap-4">
                    <div className={cn(nestedCardClassName, 'grid gap-4 md:grid-cols-2')}>
                      <FormField name="emergency_1_name" label={`${t('signup.contactName')} 1`}><Input value={childForm.emergency_1_name} onChange={(e) => setChildField('emergency_1_name', e.target.value)} /></FormField>
                      <FormField name="emergency_1_phone" label={t('signup.contactPhone')}><Input {...phoneInputProps} value={childForm.emergency_1_phone} onChange={(e) => setChildField('emergency_1_phone', digitsOnly(e.target.value))} /></FormField>
                      <FormField name="emergency_1_relationship" label={t('signup.contactRelationship')} className="md:col-span-2"><Input value={childForm.emergency_1_relationship} onChange={(e) => setChildField('emergency_1_relationship', e.target.value)} /></FormField>
                    </div>
                    <div className={cn(nestedCardClassName, 'grid gap-4 md:grid-cols-2')}>
                      <FormField name="emergency_2_name" label={`${t('signup.contactName')} 2`}><Input value={childForm.emergency_2_name} onChange={(e) => setChildField('emergency_2_name', e.target.value)} /></FormField>
                      <FormField name="emergency_2_phone" label={t('signup.contactPhone')}><Input {...phoneInputProps} value={childForm.emergency_2_phone} onChange={(e) => setChildField('emergency_2_phone', digitsOnly(e.target.value))} /></FormField>
                      <FormField name="emergency_2_relationship" label={t('signup.contactRelationship')} className="md:col-span-2"><Input value={childForm.emergency_2_relationship} onChange={(e) => setChildField('emergency_2_relationship', e.target.value)} /></FormField>
                    </div>
                  </div>
                </fieldset>
              ) : null}

              {step === 7 ? (
                <fieldset disabled={!canEditApplication} className={stepCardClassName(7)}>
                  <PanelHeader icon="restaurant" title={applicationStepLabels[6]} />
                  <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                    <FormField label={t('signup.arrivalTime')}><Input type="time" value={childForm.arrival_time} onChange={(e) => setChildField('arrival_time', e.target.value)} /></FormField>
                    {[
                      ['takes_breakfast_at_home', t('signup.takesBreakfastAtHome')],
                      ['eats_nursery_meals', t('signup.eatsNurseryMeals')],
                      ['extra_meal_preference', t('signup.acceptExtraMeals')],
                      ['sends_extra_snacks', t('signup.acceptExtraSnacks')],
                      ['water_preference', t('signup.acceptMineralWater')],
                      ['sends_vitamins', t('signup.sendsVitamins')],
                    ].map(([field, label]) => (
                      <FormField key={field} label={label}>
                        <StyledSelect
                          value={childForm[field as keyof ParentApplicationChildForm] as string}
                          onChange={(value) => setChildField(field as keyof ParentApplicationChildForm, value)}
                          options={[
                            { value: '', label: t('common.select') },
                            { value: 'Yes', label: t('common.yes', { defaultValue: 'Yes' }) },
                            { value: 'No', label: t('common.no', { defaultValue: 'No' }) },
                          ]}
                        />
                      </FormField>
                    ))}
                    {childForm.sends_vitamins === 'Yes' ? (
                      <FormField label={t('signup.vitaminDetails')}><Input value={childForm.vitamin_details} onChange={(e) => setChildField('vitamin_details', e.target.value)} /></FormField>
                    ) : null}
                    <FormField label={t('signup.diaperSupplyMethod')}>
                      <StyledSelect
                        value={childForm.diaper_supply_method}
                        onChange={(value) => setChildField('diaper_supply_method', value)}
                        options={[
                          { value: '', label: t('common.select') },
                          { value: 'Stock', label: t('signup.stock') },
                          { value: 'On daily basis', label: t('signup.daily') },
                        ]}
                      />
                    </FormField>
                    <FormField label={t('signup.dailyDiaperCount')}><Input type="number" value={childForm.daily_diaper_count} onChange={(e) => setChildField('daily_diaper_count', e.target.value)} /></FormField>
                    <FormField label={t('signup.rashCreamUsage')}><Input value={childForm.rash_cream_usage} onChange={(e) => setChildField('rash_cream_usage', e.target.value)} /></FormField>
                    <FormField label={t('signup.diaperChangeFrequency')}><Input value={childForm.diaper_change_frequency} onChange={(e) => setChildField('diaper_change_frequency', e.target.value)} /></FormField>
                    <FormField label={t('signup.toiletTrainingStatus')}>
                      <StyledSelect
                        value={childForm.toilet_training_status}
                        onChange={(value) => setChildField('toilet_training_status', value)}
                        options={[
                          { value: '', label: t('common.select') },
                          { value: 'not_started', label: t('signup.notStarted') },
                          { value: 'in_progress', label: t('signup.inProgress') },
                          { value: 'completed', label: t('signup.completed') },
                        ]}
                      />
                    </FormField>
                    <FormField name="nap_time_preference" label={t('signup.napTimePreference')}>
                      <StyledSelect
                        value={childForm.nap_time_preference}
                        onChange={(value) => {
                          setChildField('nap_time_preference', value);
                          if (value !== 'Yes') setChildField('max_nap_time', '');
                        }}
                        options={[
                          { value: '', label: t('common.select') },
                          { value: 'Yes', label: t('common.yes', { defaultValue: 'Yes' }) },
                          { value: 'No', label: t('common.no', { defaultValue: 'No' }) },
                        ]}
                      />
                    </FormField>
                    {childForm.nap_time_preference === 'Yes' ? (
                      <FormField name="max_nap_time" label={t('signup.maxNapTime')}>
                        <StyledSelect
                          value={childForm.max_nap_time}
                          onChange={(value) => setChildField('max_nap_time', value)}
                          options={[
                            { value: '', label: t('common.select') },
                            ...NAP_DURATION_VALUES.map((value) => ({
                              value,
                              label: value === '1'
                                ? t('signup.napDurationOneHour')
                                : t('signup.napDurationHours', { hours: value }),
                            })),
                          ]}
                        />
                      </FormField>
                    ) : null}
                  </div>
                </fieldset>
              ) : null}

              {step === 8 ? (
                <fieldset disabled={!canEditApplication} className={stepCardClassName(8)}>
                  <PanelHeader icon="directions_car" title={applicationStepLabels[7]} />
                  <div className="grid gap-4 xl:grid-cols-2">
                    <div className={cn(nestedCardClassName, 'grid gap-4 md:grid-cols-2')}>
                      <FormField name="pickup_1_name" label={`${t('signup.pickupName')} 1`}><Input value={parentForm.pickup_1_name} onChange={(e) => setParentField('pickup_1_name', e.target.value)} /></FormField>
                      <FormField name="pickup_1_phone" label={t('signup.pickupPhone')}><Input {...phoneInputProps} value={parentForm.pickup_1_phone} onChange={(e) => setParentField('pickup_1_phone', digitsOnly(e.target.value))} /></FormField>
                      <FormField label={t('signup.pickupRelation')}><Input value={parentForm.pickup_1_relation} onChange={(e) => setParentField('pickup_1_relation', e.target.value)} /></FormField>
                      <FormField label={t('signup.pickupAuthorization')}>
                        <StyledSelect
                          value={parentForm.pickup_1_authorization}
                          onChange={(value) => setParentField('pickup_1_authorization', value)}
                          options={[
                            { value: 'anytime', label: t('signup.anytime', { defaultValue: 'Anytime' }) },
                            { value: 'scheduled', label: t('signup.scheduled', { defaultValue: 'Scheduled' }) },
                            { value: 'emergency_only', label: t('signup.emergencyOnly', { defaultValue: 'Emergency only' }) },
                          ]}
                        />
                      </FormField>
                    </div>
                    <div className={cn(nestedCardClassName, 'grid gap-4 md:grid-cols-2')}>
                      <FormField name="pickup_2_name" label={`${t('signup.pickupName')} 2`}><Input value={parentForm.pickup_2_name} onChange={(e) => setParentField('pickup_2_name', e.target.value)} /></FormField>
                      <FormField name="pickup_2_phone" label={t('signup.pickupPhone')}><Input {...phoneInputProps} value={parentForm.pickup_2_phone} onChange={(e) => setParentField('pickup_2_phone', digitsOnly(e.target.value))} /></FormField>
                      <FormField label={t('signup.pickupRelation')}><Input value={parentForm.pickup_2_relation} onChange={(e) => setParentField('pickup_2_relation', e.target.value)} /></FormField>
                      <FormField label={t('signup.pickupAuthorization')}>
                        <StyledSelect
                          value={parentForm.pickup_2_authorization}
                          onChange={(value) => setParentField('pickup_2_authorization', value)}
                          options={[
                            { value: 'anytime', label: t('signup.anytime', { defaultValue: 'Anytime' }) },
                            { value: 'scheduled', label: t('signup.scheduled', { defaultValue: 'Scheduled' }) },
                            { value: 'emergency_only', label: t('signup.emergencyOnly', { defaultValue: 'Emergency only' }) },
                          ]}
                        />
                      </FormField>
                    </div>
                  </div>
                </fieldset>
              ) : null}

              {step === 9 ? (
                <fieldset disabled={!canEditApplication} className={stepCardClassName(9)}>
                  <PanelHeader
                    icon="medication"
                    title={applicationStepLabels[8]}
                    body={t('signup.medicationConsents.description', {
                      defaultValue: 'Select the emergency medication permissions that apply to this child.',
                    })}
                  />
                  <div className="flex items-center justify-between rounded-xl bg-primary/5 px-4 py-2 text-xs">
                    <span className="text-on-surface-variant">
                      {t('signup.medicationConsents.selectedCount', {
                        count: childForm.medication_consents.length,
                        total: MEDICATION_CONSENT_OPTIONS.length,
                      })}
                    </span>
                    <div className="flex items-center gap-3">
                      <button
                        type="button"
                        className="font-medium text-primary hover:underline"
                        onClick={() => setChildField('medication_consents', MEDICATION_CONSENT_OPTIONS.map((option) => option.id))}
                      >
                        {t('signup.medicationConsents.selectAll')}
                      </button>
                      <button
                        type="button"
                        className="font-medium text-on-surface-variant hover:underline"
                        onClick={() => setChildField('medication_consents', [])}
                      >
                        {t('signup.medicationConsents.clearAll')}
                      </button>
                    </div>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    {MEDICATION_CONSENT_OPTIONS.map((option) => {
                      const checked = childForm.medication_consents.includes(option.id);
                      return (
                        <label
                          key={option.id}
                          className={cn(
                            'flex cursor-pointer items-start gap-3 rounded-xl border p-3 transition-colors',
                            checked
                              ? 'border-primary bg-primary/5'
                              : 'border-outline-variant bg-surface hover:border-primary/50',
                          )}
                        >
                          <input
                            type="checkbox"
                            className="mt-1"
                            checked={checked}
                            onChange={(event) => {
                              setChildField(
                                'medication_consents',
                                event.target.checked
                                  ? [...childForm.medication_consents, option.id]
                                  : childForm.medication_consents.filter((id) => id !== option.id),
                              );
                            }}
                          />
                          <span className="min-w-0">
                            <span className="block text-sm font-medium text-on-surface">{option.labelEn}</span>
                            <span className="mt-0.5 block text-xs leading-5 text-on-surface-variant">{option.descriptionEn}</span>
                          </span>
                        </label>
                      );
                    })}
                  </div>
                  <div className="rounded-xl bg-surface-container px-4 py-3 text-xs text-on-surface-variant">
                    {t('signup.medicationConsents.disclaimer')}
                  </div>
                </fieldset>
              ) : null}

              {step === 10 ? (
                <div className={stepCardClassName(10)}>
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

              {step === 11 ? (
                <fieldset disabled={!canEditApplication} className={stepCardClassName(11)}>
                  <PanelHeader icon="task_alt" title={applicationStepLabels[10]} body={t('applications.reviewText')} />
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
                    {!packageInvoice || !hasSubmittedPackagePayment ? (
                      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-warning/30 bg-warning/10 px-3 py-2 text-xs text-warning">
                        <span>
                          {!packageInvoice
                            ? t('applications.paymentPackage.selectBeforeSubmit', {
                                defaultValue: 'Please choose a package before submitting the application.',
                              })
                            : t('applications.paymentPackage.payBeforeSubmit', {
                                defaultValue: 'Please submit a full or partial package payment before sending the application for review.',
                              })}
                        </span>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className="gap-1 border-warning/40 text-warning hover:bg-warning/10"
                          onClick={() => setActiveTab('packages')}
                        >
                          <span className="material-symbols-outlined text-base" aria-hidden>inventory_2</span>
                          {t('applications.paymentPackage.goToPackages', { defaultValue: 'Go to packages' })}
                        </Button>
                      </div>
                    ) : null}
                  </div>
                  <div className="space-y-1">
                    <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={terms} onChange={(e) => setTerms(e.target.checked)} />{t('applications.termsAccept')}</label>
                    {!terms ? (
                      <p className="text-xs font-medium text-warning">
                        {t('applications.submitTermsValidation', { defaultValue: 'Please accept the terms before submitting.' })}
                      </p>
                    ) : null}
                  </div>
                </fieldset>
              ) : null}
            </div>
          </div>

          <div className="sticky bottom-4 z-10 flex flex-col gap-2 rounded-xl border border-outline-variant bg-surface/95 p-3 shadow-lg backdrop-blur sm:flex-row sm:justify-between">
            <Button variant="outline" disabled={step === 1} onClick={() => setStep((s) => Math.max(1, s - 1))}>{t('common.previous')}</Button>
            <div className="flex flex-col gap-2 sm:flex-row">
              <Button
                variant="outline"
                disabled={!canEditApplication}
                onClick={() => void apps.saveApplicationDraft({ id, updates: draftUpdates() })
                  .then(() => toast.success(t('applications.draftSaved')))}
              >
                {t('applications.saveDraft')}
              </Button>
              {step < APPLICATION_STEP_COUNT ? (
                <Button onClick={goToNextStep}>{t('common.next')}</Button>
              ) : (
                <Button
                  disabled={!canSubmitApplication || !isSubmitReady || submittingApplication}
                  onClick={() => void submitApplication()}
                >
                  {submittingApplication ? t('common.saving') : t('applications.submit')}
                </Button>
              )}
            </div>
          </div>
        </FieldValidationContext.Provider>
      ) : null}

      {activeTab === 'packages' ? (
        isInformationComplete || packageInvoice ? (
          <div className="space-y-4">
            <ApplicationPackagePaymentCard
              packages={applicationPackagePayment.packages}
              invoice={applicationPackagePayment.invoice}
              isLoading={applicationPackagePayment.isLoading}
              isSelecting={applicationPackagePayment.isSelecting || selectingPackage}
              canChoose={canChoosePackage}
              payLink={payLink}
              termsAccepted={terms}
              onTermsChange={setTerms}
              onSelect={selectPackage}
            />
            <ApplicationExtraHoursPackageCard
              packages={extraHoursPackage.packages}
              selectedPackageId={selectedExtraHoursPackageId}
              isLoading={extraHoursPackage.isLoading}
              isSelecting={extraHoursPackage.isSelecting}
              canChoose={canChooseExtraHours}
              onSelect={selectExtraHoursPackage}
            />
          </div>
        ) : (
          <section className="rounded-xl border border-outline-variant bg-surface px-4 py-8 shadow-sm sm:px-6">
            <div className="mx-auto flex max-w-md flex-col items-center text-center">
              <span className="flex h-12 w-12 items-center justify-center rounded-full bg-warning/15 text-warning">
                <span className="material-symbols-outlined text-2xl" aria-hidden>lock</span>
              </span>
              <h2 className="mt-3 text-base font-semibold text-on-surface">
                {t('applications.paymentPackage.lockedTitle', { defaultValue: 'Package selection is locked' })}
              </h2>
              <p className="mt-1 text-sm leading-6 text-on-surface-variant">{informationIncompleteMessage}</p>
              <Button type="button" className="mt-4 gap-1" onClick={goToFirstIncompleteStep}>
                <span className="material-symbols-outlined text-base" aria-hidden>edit_document</span>
                {t('applications.paymentPackage.completeInformation', { defaultValue: 'Complete information' })}
              </Button>
            </div>
          </section>
        )
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
