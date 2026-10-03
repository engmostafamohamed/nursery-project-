import { useQuery } from '@tanstack/react-query';
import { useMemo, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useParams } from 'react-router-dom';

import { ChildAvatarUpload } from '@/components/admin/ChildAvatarUpload';
import { ChildBillingTab } from '@/components/admin/children/ChildBillingTab';
import { ApplicationDocumentPreview } from '@/components/applications/ApplicationDocumentPreview';
import { ChildQrCodeCard, type ChildQrInput } from '@/components/qr/ChildQrCodeCard';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/EmptyState';
import { LoadingSkeleton } from '@/components/ui/LoadingSkeleton';
import { useAuthSession } from '@/hooks/useAuthSession';
import { useNurseryLanguagePref } from '@/hooks/useNurseryLanguagePref';
import { useUserProfile } from '@/hooks/useUserProfile';
import { MEDICATION_CONSENT_OPTIONS } from '@/lib/admissions/medicationConsentOptions';
import { allergyLabel } from '@/lib/allergies';
import { supabase } from '@/lib/supabase';
import { cn } from '@/lib/utils';

type JsonRecord = Record<string, unknown>;

type ChildRecord = ChildQrInput & {
  avatar_url: string | null;
  class_id: string | null;
  status: string | null;
  first_name: string | null;
  middle_name: string | null;
  last_name: string | null;
  nickname: string | null;
  dob: string | null;
  gender: string | null;
  nationality: string | null;
  blood_type: string | null;
  home_address: string | null;
  enrollment_date: string | null;
  created_at: string | null;
  enrollment_department: string | null;
  school_preference: string | null;
  school_admissions_plan: string | null;
  school_admission_plan: string | null;
  academic_year: string | null;
  has_siblings: boolean | null;
  sibling_ages: string | null;
  siblings_info_json: unknown;
  photo_privacy_restricted: boolean | null;
  lead_source: string | null;
  toilet_training_status: string | null;
  nap_preference: string | null;
  birth_certificate_url: string | null;
  vaccination_card_url: string | null;
  daily_care_preferences: unknown;
  emergency_contacts: unknown;
  enrollment_extended_json: unknown;
};

type ParentLink = {
  parent_id: string;
  parent_type: string | null;
  is_primary: boolean | null;
  occupation: string | null;
  workplace: string | null;
  national_id: string | null;
  relationship: string | null;
  user: { id: string; name_ar: string | null; name_en: string | null; email: string | null; phone: string | null; username: string | null } | null;
};

type AuthorizedPickup = {
  id: string;
  name: string | null;
  phone: string | null;
  mobile_phone: string | null;
  relation: string | null;
  national_id: string | null;
  active: boolean | null;
  can_pickup: boolean | null;
  authorization_level: string | null;
};

type LegacyDietary = {
  usual_arrival_time?: string | null;
  eats_breakfast_at_home?: boolean | null;
  eats_nursery_meals?: boolean | null;
  food_allergies_details?: string | null;
  sends_extra_snacks?: boolean | null;
  sends_vitamins_daily?: boolean | null;
  vitamin_details?: string | null;
  water_preference?: string | null;
};

type LegacyDiaper = {
  diaper_supply_method?: string | null;
  diapers_per_day?: number | null;
  rash_cream_usage?: string | null;
  change_schedule?: string | null;
  change_frequency_hours?: number | null;
  notes?: string | null;
};

type SourceApplication = {
  id: string;
  status: string | null;
  submitted_at: string | null;
  reviewed_at: string | null;
  parent_info_json: unknown;
  child_info_json: unknown;
};

type PackageSummary = { id: string; name_ar: string | null; name_en: string | null; price: number | string | null };

type ChildRecordPayload = {
  child: ChildRecord | null;
  parents: ParentLink[];
  pickups: AuthorizedPickup[];
  legacyDietary: LegacyDietary | null;
  legacyDiaper: LegacyDiaper | null;
  childClass: { name_ar: string | null; name_en: string | null } | null;
  sourceApplication: SourceApplication | null;
  documents: JsonRecord[];
  selectedPackage: PackageSummary | null;
};

type ChildRecordTab = 'overview' | 'parents' | 'care' | 'health' | 'emergency' | 'billing' | 'documents' | 'tools';

function isRecord(value: unknown): value is JsonRecord {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function recordAt(source: unknown, key: string): JsonRecord {
  const value = isRecord(source) ? source[key] : undefined;
  return isRecord(value) ? value : {};
}

function recordsAt(source: unknown, key: string): JsonRecord[] {
  const value = isRecord(source) ? source[key] : undefined;
  return Array.isArray(value) ? value.filter(isRecord) : [];
}

function text(source: unknown, key: string): string {
  if (!isRecord(source)) return '';
  const value = source[key];
  if (value === null || value === undefined) return '';
  return typeof value === 'string' ? value.trim() : String(value);
}

function bool(source: unknown, key: string): boolean | null {
  if (!isRecord(source)) return null;
  const value = source[key];
  if (value === true || value === 'true' || value === 'Yes') return true;
  if (value === false || value === 'false' || value === 'No') return false;
  return null;
}

function stringList(source: unknown, key: string): string[] {
  if (!isRecord(source)) return [];
  const value = source[key];
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}

/** snake_case / lowercase codes → readable label. */
function humanize(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return '';
  const raw = String(value).trim();
  if (!raw) return '';
  return raw.replace(/_/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase());
}

function initialsOf(name: string): string {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join('').toUpperCase() || 'CH';
}

export function AdminChildRecordPage() {
  const { t, i18n } = useTranslation();
  const { childId } = useParams();
  const { user } = useAuthSession();
  const { data: profile } = useUserProfile(user?.id);
  const { data: languagePref = 'both' } = useNurseryLanguagePref(profile?.nursery_id);
  const [tab, setTab] = useState<ChildRecordTab>('overview');
  const isAr = i18n.language.startsWith('ar');

  const childQuery = useQuery({
    queryKey: ['admin-child-record', childId, profile?.id],
    queryFn: async (): Promise<ChildRecordPayload> => {
      const empty: ChildRecordPayload = {
        child: null,
        parents: [],
        pickups: [],
        legacyDietary: null,
        legacyDiaper: null,
        childClass: null,
        sourceApplication: null,
        documents: [],
        selectedPackage: null,
      };
      if (!childId || !profile?.id) return empty;

      // Tenant scoping is enforced by RLS on `children`; chain and XO admins have nursery_id = NULL.
      const { data: childRow, error: childErr } = await supabase
        .from('children')
        .select('*')
        .eq('id', childId)
        .maybeSingle();
      if (childErr) throw childErr;
      const child = (childRow as ChildRecord | null) ?? null;
      if (!child) return empty;

      const extended = isRecord(child.enrollment_extended_json) ? child.enrollment_extended_json : {};
      const sourceApplicationId = text(extended, 'source_application_id');
      const selectedPackageId = text(extended, 'selected_package_id');

      const [classRes, linksRes, pickupsRes, dietaryRes, diaperRes, applicationRes, documentsRes, packageRes] = await Promise.all([
        child.class_id
          ? supabase.from('classes').select('name_ar, name_en').eq('id', child.class_id).maybeSingle()
          : Promise.resolve({ data: null, error: null }),
        (supabase as never as { from: typeof supabase.from })
          .from('parent_children')
          .select('parent_id, parent_type, is_primary, occupation, workplace, national_id, relationship')
          .eq('child_id', childId),
        (supabase as never as { from: typeof supabase.from })
          .from('authorized_pickups')
          .select('id, name, phone, mobile_phone, relation, national_id, active, can_pickup, authorization_level')
          .eq('child_id', childId),
        (supabase as never as { from: typeof supabase.from })
          .from('child_dietary_preferences')
          .select('usual_arrival_time, eats_breakfast_at_home, eats_nursery_meals, food_allergies_details, sends_extra_snacks, sends_vitamins_daily, vitamin_details, water_preference')
          .eq('child_id', childId)
          .maybeSingle(),
        (supabase as never as { from: typeof supabase.from })
          .from('child_diaper_care')
          .select('diaper_supply_method, diapers_per_day, rash_cream_usage, change_schedule, change_frequency_hours, notes')
          .eq('child_id', childId)
          .maybeSingle(),
        sourceApplicationId
          ? supabase
              .from('applications')
              .select('id, status, submitted_at, reviewed_at, parent_info_json, child_info_json')
              .eq('id', sourceApplicationId)
              .maybeSingle()
          : Promise.resolve({ data: null, error: null }),
        sourceApplicationId
          ? supabase
              .from('application_documents')
              .select('*')
              .eq('application_id', sourceApplicationId)
              .order('uploaded_at', { ascending: false })
          : Promise.resolve({ data: [], error: null }),
        selectedPackageId
          ? supabase.from('packages').select('id, name_ar, name_en, price').eq('id', selectedPackageId).maybeSingle()
          : Promise.resolve({ data: null, error: null }),
      ]);
      if (linksRes.error) throw linksRes.error;

      const links = ((linksRes.data ?? []) as Array<JsonRecord>).map((row) => ({
        parent_id: text(row, 'parent_id'),
        parent_type: (row.parent_type as string | null) ?? null,
        is_primary: (row.is_primary as boolean | null) ?? null,
        occupation: (row.occupation as string | null) ?? null,
        workplace: (row.workplace as string | null) ?? null,
        national_id: (row.national_id as string | null) ?? null,
        relationship: (row.relationship as string | null) ?? null,
      }));
      const parentIds = links.map((row) => row.parent_id).filter(Boolean);
      const usersRes = parentIds.length
        ? await supabase.from('users').select('id, name_ar, name_en, email, phone, username').in('id', parentIds)
        : { data: [], error: null };
      if (usersRes.error) throw usersRes.error;
      const userMap = new Map(
        ((usersRes.data ?? []) as Array<JsonRecord>).map((row) => [
          text(row, 'id'),
          {
            id: text(row, 'id'),
            name_ar: (row.name_ar as string | null) ?? null,
            name_en: (row.name_en as string | null) ?? null,
            email: (row.email as string | null) ?? null,
            phone: (row.phone as string | null) ?? null,
            username: (row.username as string | null) ?? null,
          },
        ]),
      );

      // Documents older than the reupload keep their type; show the latest file per type.
      const latestDocuments = Object.values(
        ((documentsRes.data ?? []) as JsonRecord[]).reduce<Record<string, JsonRecord>>((acc, doc) => {
          const type = text(doc, 'document_type');
          if (type && !acc[type]) acc[type] = doc;
          return acc;
        }, {}),
      );

      return {
        child,
        parents: links.map((row) => ({ ...row, user: userMap.get(row.parent_id) ?? null })),
        pickups: (pickupsRes.data as AuthorizedPickup[] | null) ?? [],
        legacyDietary: (dietaryRes.data as LegacyDietary | null) ?? null,
        legacyDiaper: (diaperRes.data as LegacyDiaper | null) ?? null,
        childClass: (classRes.data as { name_ar: string | null; name_en: string | null } | null) ?? null,
        sourceApplication: (applicationRes.data as SourceApplication | null) ?? null,
        documents: latestDocuments,
        selectedPackage: (packageRes.data as PackageSummary | null) ?? null,
      };
    },
    enabled: Boolean(childId && profile?.id),
  });

  const localized = useMemo(
    () => (ar: string | null | undefined, en: string | null | undefined) => {
      const a = ar?.trim() ?? '';
      const e = en?.trim() ?? '';
      if (languagePref === 'ar') return a || e;
      if (languagePref === 'en') return e || a;
      if (a && e && a !== e) return `${a} / ${e}`;
      return a || e;
    },
    [languagePref],
  );

  const tk = (key: string, defaultValue: string, options?: Record<string, unknown>) =>
    t(`admin.children.childRecord.${key}`, { defaultValue, ...options });
  const dash = '-';
  const show = (value: string | number | null | undefined) => {
    if (value === null || value === undefined) return dash;
    const s = String(value).trim();
    return s.length ? s : dash;
  };
  const showCode = (value: string | number | null | undefined) => humanize(value) || dash;
  const yesNo = (value: boolean | null | undefined) => (value === null || value === undefined ? dash : value ? t('common.yes') : t('common.no'));
  const fmtDate = (value: string | null | undefined) => {
    if (!value) return dash;
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? show(value) : date.toLocaleDateString(isAr ? 'ar-EG' : undefined);
  };
  const ageOf = (dob: string | null | undefined) => {
    if (!dob) return dash;
    const birth = new Date(dob);
    if (Number.isNaN(birth.getTime())) return dash;
    const now = new Date();
    let months = (now.getFullYear() - birth.getFullYear()) * 12 + (now.getMonth() - birth.getMonth());
    if (now.getDate() < birth.getDate()) months -= 1;
    if (months < 0) return dash;
    const years = Math.floor(months / 12);
    const rest = months % 12;
    if (years === 0) return tk('ageMonths', '{{count}} months', { count: rest });
    if (rest === 0) return tk('ageYears', '{{count}} years', { count: years });
    return tk('ageYearsMonths', '{{years}} y {{months}} m', { years, months: rest });
  };

  if (childQuery.isLoading) return <LoadingSkeleton />;
  if (!childQuery.data?.child) {
    return <EmptyState icon="child_care" title={t('qr.childNotFoundTitle')} description={t('qr.childNotFoundDescription')} />;
  }

  const { child, parents, pickups, legacyDietary, legacyDiaper, childClass, sourceApplication, documents, selectedPackage } = childQuery.data;
  const extended = isRecord(child.enrollment_extended_json) ? child.enrollment_extended_json : {};
  const family = recordAt(extended, 'family');
  const extendedParents = recordAt(extended, 'parents');
  const father = recordAt(extendedParents, 'father');
  const mother = recordAt(extendedParents, 'mother');
  const care = isRecord(child.daily_care_preferences) ? child.daily_care_preferences : {};
  const applicationParentInfo = isRecord(sourceApplication?.parent_info_json) ? sourceApplication.parent_info_json : {};
  const applicationPickups = recordsAt(applicationParentInfo, 'pickups');
  const emergencyContacts = Array.isArray(child.emergency_contacts) ? child.emergency_contacts.filter(isRecord) : [];
  const applicationInvoiceId = text(extended, 'application_invoice_id');

  const childName = localized(child.full_name_ar, child.full_name_en) || dash;
  const className = childClass ? localized(childClass.name_ar, childClass.name_en) || dash : dash;
  const packageName = selectedPackage ? localized(selectedPackage.name_ar, selectedPackage.name_en) || dash : dash;
  const avatarSrc = child.avatar_url ?? `https://ui-avatars.com/api/?name=${encodeURIComponent(initialsOf(childName))}&background=eceef0&color=191c1e`;
  const parentName = (p: ParentLink) => localized(p.user?.name_ar, p.user?.name_en) || dash;
  const enrolledOn = child.enrollment_date ?? child.created_at;

  // Daily care: application data first, legacy per-child tables as fallback.
  const careValue = (careKey: string, legacy?: string | number | boolean | null | undefined) => {
    const value = text(care, careKey);
    if (value) return value;
    return legacy === null || legacy === undefined ? '' : String(legacy);
  };
  const careBool = (careKey: string, legacy?: boolean | null) => bool(care, careKey) ?? legacy ?? null;
  const allergyTypes = stringList(care, 'allergy_types');
  const consents = stringList(care, 'emergency_medications');
  const consentLabel = (id: string) => {
    const option = MEDICATION_CONSENT_OPTIONS.find((item) => item.id === id);
    return option ? (isAr ? option.labelAr : option.labelEn) : humanize(id);
  };
  const hasAllergy = careBool('has_allergy') ?? (allergyTypes.length > 0 || Boolean(careValue('food_allergies', legacyDietary?.food_allergies_details)));
  const hasMedicalCondition = careBool('has_medical_condition') ?? Boolean(careValue('medical_condition_details'));
  const toiletTraining = careValue('toilet_training_status', child.toilet_training_status);
  const napPreference = careValue('nap_time_preference', child.nap_preference);
  const siblings = Array.isArray(child.siblings_info_json) ? child.siblings_info_json.filter(isRecord) : [];

  const tabs: Array<{ id: ChildRecordTab; icon: string; label: string; count?: number }> = [
    { id: 'overview', icon: 'badge', label: tk('tabOverview', 'Overview') },
    { id: 'parents', icon: 'family_restroom', label: tk('tabParents', 'Parents'), count: parents.length },
    { id: 'care', icon: 'restaurant', label: tk('tabCare', 'Daily care') },
    { id: 'health', icon: 'health_and_safety', label: tk('tabHealth', 'Health') },
    { id: 'emergency', icon: 'emergency', label: tk('tabEmergency', 'Emergency & Pickup'), count: emergencyContacts.length + applicationPickups.length + pickups.length },
    { id: 'billing', icon: 'payments', label: tk('tabBilling', 'Billing') },
    { id: 'documents', icon: 'folder_open', label: tk('tabDocuments', 'Documents'), count: documents.length },
    { id: 'tools', icon: 'qr_code_2', label: tk('tabTools', 'Photo & QR') },
  ];

  const statusTone = child.status === 'active'
    ? 'border-success/30 bg-success/10 text-success'
    : child.status === 'inactive' || child.status === 'withdrawn'
      ? 'border-error/30 bg-error/10 text-error'
      : 'border-warning/30 bg-warning/10 text-warning';

  return (
    <div className="w-full max-w-none space-y-5 pb-6">
      {/* Header */}
      <section className="overflow-hidden rounded-xl border border-outline-variant bg-surface shadow-sm">
        <div className="flex flex-col gap-4 border-b border-outline-variant bg-surface-container-lowest px-4 py-5 sm:px-5 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex min-w-0 items-center gap-4">
            <img src={avatarSrc} alt="" className="h-20 w-20 shrink-0 rounded-xl object-cover ring-4 ring-surface" loading="lazy" decoding="async" />
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase text-primary">{tk('eyebrow', 'Child record')}</p>
              <h1 className="mt-1 truncate text-2xl font-semibold text-on-surface">{childName}</h1>
              <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
                <span className={cn('inline-flex items-center gap-1 rounded-full border px-2.5 py-1 font-semibold', statusTone)}>
                  <span className="material-symbols-outlined text-sm" aria-hidden>{child.status === 'active' ? 'check_circle' : 'pause_circle'}</span>
                  {showCode(child.status)}
                </span>
                <span className="inline-flex items-center gap-1 rounded-full border border-outline-variant bg-surface px-2.5 py-1 font-semibold text-on-surface-variant">
                  <span className="material-symbols-outlined text-sm" aria-hidden>school</span>
                  {className}
                </span>
                <span className="text-on-surface-variant">
                  {tk('dob', 'Date of birth')}: {fmtDate(child.dob)} · {ageOf(child.dob)} · {showCode(child.gender)}
                </span>
              </div>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" asChild className="h-10 rounded-md">
              <Link to={`/admin/children/${child.id}/health`}>
                <span className="material-symbols-outlined me-2 text-base" aria-hidden>medical_services</span>
                {t('health.pageTitle')}
              </Link>
            </Button>
            <Button variant="outline" asChild className="h-10 rounded-md">
              <Link to={`/admin/attendance/child/${child.id}`}>
                <span className="material-symbols-outlined me-2 text-base" aria-hidden>history</span>
                {tk('attendanceReport', 'Attendance report')}
              </Link>
            </Button>
            {sourceApplication ? (
              <Button variant="outline" asChild className="h-10 rounded-md">
                <Link to={`/admin/admissions/applications/${sourceApplication.id}`}>
                  <span className="material-symbols-outlined me-2 text-base" aria-hidden>assignment</span>
                  {tk('viewApplication', 'Application')}
                </Link>
              </Button>
            ) : null}
          </div>
        </div>

        <div className="grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-4 sm:p-5">
          <FactTile icon="school" label={tk('class', 'Class')} value={className} />
          <FactTile icon="how_to_reg" label={tk('enrolledOn', 'Enrolled on')} value={fmtDate(enrolledOn)} />
          <FactTile icon="cake" label={tk('age', 'Age')} value={ageOf(child.dob)} />
          <FactTile icon="public" label={tk('nationality', 'Nationality')} value={show(child.nationality)} />
          <FactTile icon="badge" label={tk('department', 'Department')} value={show(child.enrollment_department)} />
          <FactTile icon="calendar_month" label={tk('academicYear', 'Academic year')} value={show(child.academic_year)} />
          <FactTile icon="inventory_2" label={tk('package', 'Package')} value={selectedPackage ? `${packageName} · ${t('invoice.egpAmount', { amount: Number(selectedPackage.price ?? 0).toFixed(2) })}` : dash} />
          <FactTile icon="call" label={tk('primaryPhone', 'Primary phone')} value={show(text(mother, 'mobile') || text(father, 'mobile') || parents.find((p) => p.user?.phone)?.user?.phone)} />
        </div>
      </section>

      {/* Tabs */}
      <section className="rounded-xl border border-outline-variant bg-surface p-2 shadow-sm">
        <div className="flex gap-2 overflow-x-auto">
          {tabs.map((item) => {
            const active = tab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setTab(item.id)}
                className={cn(
                  'flex h-11 shrink-0 items-center gap-2 rounded-md border px-3 text-sm font-semibold transition',
                  active ? 'border-primary bg-primary text-on-primary shadow-sm' : 'border-transparent text-on-surface-variant hover:bg-surface-container-lowest',
                )}
              >
                <span className="material-symbols-outlined text-base" aria-hidden>{item.icon}</span>
                {item.label}
                {item.count ? (
                  <span className={cn('rounded-full px-2 py-0.5 text-[11px]', active ? 'bg-on-primary/20 text-on-primary' : 'bg-surface-container text-on-surface-variant')}>
                    {item.count}
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>
      </section>

      {tab === 'overview' ? (
        <div className="grid gap-5 xl:grid-cols-2">
          <Section icon="badge" title={tk('identityTitle', 'Identity')}>
            <FieldGrid>
              <Field label={tk('firstName', 'First name')} value={show(child.first_name)} />
              <Field label={tk('middleName', 'Middle name')} value={show(child.middle_name)} />
              <Field label={tk('lastName', 'Last name')} value={show(child.last_name)} />
              <Field label={tk('nickname', 'Nickname')} value={show(child.nickname)} />
              <Field label={tk('nameAr', 'Name (Arabic)')} value={show(child.full_name_ar)} />
              <Field label={tk('nameEn', 'Name (English)')} value={show(child.full_name_en)} />
              <Field label={tk('dob', 'Date of birth')} value={`${fmtDate(child.dob)} · ${ageOf(child.dob)}`} />
              <Field label={tk('gender', 'Gender')} value={showCode(child.gender)} />
              <Field label={tk('nationality', 'Nationality')} value={show(child.nationality)} />
              <Field label={tk('bloodType', 'Blood type')} value={show(child.blood_type)} />
              <Field label={tk('homeAddress', 'Home address')} value={show(child.home_address || text(family, 'address'))} wide />
              <Field label={tk('photoPrivacy', 'Photo privacy')} value={child.photo_privacy_restricted ? tk('photoRestricted', 'Restricted — do not publish photos') : tk('photoAllowed', 'Photos allowed')} wide />
            </FieldGrid>
          </Section>

          <Section icon="how_to_reg" title={tk('enrollmentTitle', 'Enrollment')}>
            <FieldGrid>
              <Field label={tk('status', 'Status')} value={showCode(child.status)} />
              <Field label={tk('class', 'Class')} value={className} />
              <Field label={tk('enrolledOn', 'Enrolled on')} value={fmtDate(enrolledOn)} />
              <Field label={tk('department', 'Department')} value={show(child.enrollment_department)} />
              <Field label={tk('academicYear', 'Academic year')} value={show(child.academic_year)} />
              <Field label={tk('schoolPreference', 'School preference')} value={showCode(child.school_preference)} />
              <Field label={tk('admissionPlan', 'Future school plan')} value={show(child.school_admissions_plan || child.school_admission_plan)} />
              <Field label={tk('leadSource', 'How they heard about us')} value={showCode(child.lead_source || text(family, 'referral_source'))} />
              <Field
                label={tk('package', 'Package')}
                value={selectedPackage ? `${packageName} · ${t('invoice.egpAmount', { amount: Number(selectedPackage.price ?? 0).toFixed(2) })}` : dash}
                wide
              />
              {sourceApplication ? (
                <Field
                  label={tk('sourceApplication', 'Registration application')}
                  wide
                  value={
                    <span className="flex flex-wrap items-center gap-2">
                      <Link className="font-semibold text-primary underline" to={`/admin/admissions/applications/${sourceApplication.id}`}>
                        {sourceApplication.id.slice(0, 8)}
                      </Link>
                      <span className="text-on-surface-variant">
                        {t(`applications.statuses.${sourceApplication.status ?? 'draft'}`, { defaultValue: showCode(sourceApplication.status) })} · {t('applications.submittedAt')}: {fmtDate(sourceApplication.submitted_at)}
                      </span>
                      {applicationInvoiceId ? (
                        <Link className="font-semibold text-primary underline" to={`/admin/invoices/${applicationInvoiceId}`}>
                          {tk('registrationInvoice', 'Registration invoice')}
                        </Link>
                      ) : null}
                    </span>
                  }
                />
              ) : null}
            </FieldGrid>
          </Section>

          <Section icon="diversity_1" title={tk('familyTitle', 'Family & siblings')} className="xl:col-span-2">
            <FieldGrid columns={3}>
              <Field label={tk('maritalStatus', 'Marital status')} value={showCode(text(family, 'marital_status'))} />
              <Field label={tk('familyEmergencyContact', 'Family emergency contact')} value={show(text(family, 'emergency_contact'))} />
              <Field label={tk('referralSource', 'Referral source')} value={showCode(text(family, 'referral_source'))} />
              <Field label={tk('hasSiblings', 'Has siblings')} value={yesNo(child.has_siblings)} />
              <Field label={tk('siblingAges', 'Sibling ages')} value={show(child.sibling_ages)} />
              <Field label={tk('siblings', 'Siblings')} value={siblings.length ? siblings.map((s) => text(s, 'name') || text(s, 'full_name') || JSON.stringify(s)).join(', ') : dash} />
            </FieldGrid>
          </Section>
        </div>
      ) : null}

      {tab === 'parents' ? (
        <div className="space-y-5">
          <div className="grid gap-5 xl:grid-cols-2">
            <PersonCard
              icon="man"
              title={t('signup.fatherInfo', { defaultValue: 'Father information' })}
              empty={tk('noParentDetails', 'No details recorded.')}
              rows={Object.keys(father).length ? [
                [tk('fullName', 'Full name'), show(text(father, 'full_name'))],
                [tk('occupation', 'Occupation'), show(text(father, 'job'))],
                [tk('phone', 'Phone'), show(text(father, 'mobile'))],
                [tk('email', 'Email'), show(text(father, 'email'))],
                [tk('nationalId', 'National ID'), show(text(father, 'national_id'))],
              ] : []}
            />
            <PersonCard
              icon="woman"
              title={t('signup.motherInfo', { defaultValue: 'Mother information' })}
              empty={tk('noParentDetails', 'No details recorded.')}
              rows={Object.keys(mother).length ? [
                [tk('fullName', 'Full name'), show(text(mother, 'full_name'))],
                [tk('occupation', 'Occupation'), show(text(mother, 'job'))],
                [tk('phone', 'Phone'), show(text(mother, 'mobile'))],
                [tk('email', 'Email'), show(text(mother, 'email'))],
                [tk('nationalId', 'National ID'), show(text(mother, 'national_id'))],
              ] : []}
            />
          </div>

          <Section icon="account_circle" title={tk('linkedAccounts', 'Linked parent accounts')} body={tk('linkedAccountsBody', 'Accounts that can sign in to the parent app for this child.')}>
            {parents.length === 0 ? (
              <p className="text-sm text-on-surface-variant">{tk('parentsEmpty', 'No parents linked to this child yet.')}</p>
            ) : (
              <div className="grid gap-3 md:grid-cols-2">
                {parents.map((p) => (
                  <div key={p.parent_id} className="rounded-lg border border-outline-variant bg-surface-container-lowest p-4">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-on-surface">{parentName(p)}</p>
                        <p className="mt-0.5 text-xs uppercase text-on-surface-variant">{showCode(p.parent_type ?? p.relationship)}</p>
                      </div>
                      {p.is_primary ? (
                        <span className="rounded-full bg-primary/10 px-2.5 py-1 text-[11px] font-semibold text-primary">{tk('primary', 'Primary')}</span>
                      ) : null}
                    </div>
                    <FieldGrid className="mt-3">
                      <Field label={tk('username', 'Username')} value={show(p.user?.username)} />
                      <Field label={tk('phone', 'Phone')} value={show(p.user?.phone)} />
                      <Field label={tk('email', 'Email')} value={show(p.user?.email)} wide />
                      <Field label={tk('occupation', 'Occupation')} value={show(p.occupation)} />
                      <Field label={tk('nationalId', 'National ID')} value={show(p.national_id)} />
                    </FieldGrid>
                  </div>
                ))}
              </div>
            )}
          </Section>
        </div>
      ) : null}

      {tab === 'care' ? (
        <div className="grid gap-5 xl:grid-cols-2">
          <Section icon="restaurant" title={tk('mealsTitle', 'Arrival & meals')}>
            <FieldGrid>
              <Field label={tk('usualArrival', 'Usual arrival time')} value={show(careValue('arrival_time', legacyDietary?.usual_arrival_time))} />
              <Field label={tk('eatsBreakfastHome', 'Eats breakfast at home')} value={yesNo(careBool('takes_breakfast_at_home', legacyDietary?.eats_breakfast_at_home))} />
              <Field label={tk('eatsNurseryMeals', 'Eats nursery meals')} value={yesNo(careBool('eats_nursery_meals', legacyDietary?.eats_nursery_meals))} />
              <Field label={tk('acceptsExtraMeals', 'Accepts extra meals')} value={yesNo(careBool('accepts_extra_meals'))} />
              <Field label={tk('sendsExtraSnacks', 'Sends extra snacks')} value={yesNo(careBool('accepts_extra_snacks', legacyDietary?.sends_extra_snacks))} />
              <Field label={tk('waterPreference', 'Accepts mineral water')} value={careBool('accepts_mineral_water') !== null ? yesNo(careBool('accepts_mineral_water')) : show(legacyDietary?.water_preference)} />
              <Field label={tk('vitaminsDaily', 'Sends vitamins')} value={yesNo(careBool('sends_vitamins', legacyDietary?.sends_vitamins_daily))} />
              <Field label={tk('vitaminDetails', 'Vitamin details')} value={show(careValue('vitamin_details', legacyDietary?.vitamin_details))} />
            </FieldGrid>
          </Section>

          <Section icon="baby_changing_station" title={tk('diaperTitle', 'Diapers & toilet care')}>
            <FieldGrid>
              <Field label={tk('diaperSupply', 'Diaper supply')} value={showCode(careValue('diaper_supply_method', legacyDiaper?.diaper_supply_method))} />
              <Field label={tk('diapersPerDay', 'Diapers per day')} value={show(careValue('daily_diaper_count', legacyDiaper?.diapers_per_day))} />
              <Field label={tk('rashCream', 'Rash cream usage')} value={show(careValue('rash_cream_usage', legacyDiaper?.rash_cream_usage))} />
              <Field label={tk('changeFrequency', 'Change frequency')} value={show(careValue('diaper_change_frequency', legacyDiaper?.change_schedule ?? legacyDiaper?.change_frequency_hours))} />
              <Field label={tk('toiletTraining', 'Toilet training')} value={showCode(toiletTraining)} />
              <Field label={tk('notes', 'Notes')} value={show(legacyDiaper?.notes)} />
            </FieldGrid>
          </Section>

          <Section icon="bedtime" title={tk('napTitle', 'Nap time')} className="xl:col-span-2">
            <FieldGrid columns={3}>
              <Field label={tk('napPreference', 'Naps at the nursery')} value={napPreference ? yesNo(bool({ v: napPreference }, 'v')) : dash} />
              <Field label={tk('maxNap', 'Maximum nap time')} value={careValue('max_nap_time') ? tk('hoursValue', '{{count}} hours', { count: Number(careValue('max_nap_time')) }) : dash} />
            </FieldGrid>
          </Section>
        </div>
      ) : null}

      {tab === 'health' ? (
        <div className="grid gap-5 xl:grid-cols-2">
          <Section icon="allergies" title={tk('allergiesTitle', 'Allergies')}>
            <FieldGrid>
              <Field label={tk('hasAllergy', 'Has allergies')} value={yesNo(hasAllergy)} />
              <Field label={tk('allergyTypes', 'Allergy types')} value={allergyTypes.length ? allergyTypes.map((value) => allergyLabel(value, isAr)).join(', ') : dash} />
              <Field label={tk('foodAllergies', 'Food allergies / notes')} value={show(careValue('food_allergies', legacyDietary?.food_allergies_details))} wide />
              <Field label={tk('allergyDetails', 'Other allergy details')} value={show(careValue('allergy_other_details'))} wide />
            </FieldGrid>
          </Section>

          <Section icon="medical_information" title={tk('medicalTitle', 'Medical')}>
            <FieldGrid>
              <Field label={tk('hasMedicalCondition', 'Has a medical condition')} value={yesNo(hasMedicalCondition)} />
              <Field label={tk('bloodType', 'Blood type')} value={show(child.blood_type)} />
              <Field label={tk('medicalDetails', 'Condition details')} value={show(careValue('medical_condition_details'))} wide />
              <Field label={tk('behaviorNotes', 'Behaviour & health notes')} value={show(careValue('child_behavior_health_notes'))} wide />
            </FieldGrid>
          </Section>

          <Section
            icon="medication"
            title={tk('medicationConsents', 'Emergency medication consents')}
            body={t('signup.medicationConsents.description', { defaultValue: 'Medicines the parent allows the nursery to give in an emergency.' })}
            className="xl:col-span-2"
          >
            {consents.length === 0 ? (
              <p className="text-sm text-on-surface-variant">{tk('noConsents', 'No medication consents given.')}</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {consents.map((id) => (
                  <span key={id} className="inline-flex items-center gap-1 rounded-full border border-success/30 bg-success/10 px-3 py-1 text-xs font-semibold text-success">
                    <span className="material-symbols-outlined text-sm" aria-hidden>check</span>
                    {consentLabel(id)}
                  </span>
                ))}
              </div>
            )}
            <div className="mt-4">
              <Button variant="outline" asChild className="h-10 rounded-md">
                <Link to={`/admin/children/${child.id}/health`}>
                  <span className="material-symbols-outlined me-2 text-base" aria-hidden>medical_services</span>
                  {t('health.pageTitle')}
                </Link>
              </Button>
            </div>
          </Section>
        </div>
      ) : null}

      {tab === 'emergency' ? (
        <div className="grid gap-5 xl:grid-cols-2">
          <Section icon="emergency" title={tk('emergencyTitle', 'Emergency contacts')}>
            {emergencyContacts.length === 0 && !text(family, 'emergency_contact') ? (
              <p className="text-sm text-on-surface-variant">{tk('emergencyEmpty', 'No emergency contacts on file.')}</p>
            ) : (
              <div className="grid gap-3 md:grid-cols-2">
                {emergencyContacts.map((c, index) => (
                  <ContactCard
                    key={`emergency-${index}`}
                    icon="contact_emergency"
                    name={show(text(c, 'name') || text(c, 'full_name'))}
                    subtitle={showCode(text(c, 'relationship') || text(c, 'relation'))}
                    phone={show(text(c, 'phone') || text(c, 'mobile'))}
                    badge={{ label: `#${index + 1}`, tone: 'neutral' }}
                  />
                ))}
                {text(family, 'emergency_contact') ? (
                  <ContactCard
                    icon="diversity_1"
                    name={tk('familyEmergencyContact', 'Family emergency contact')}
                    subtitle={tk('fromParentAccount', 'From the parent account')}
                    phone={show(text(family, 'emergency_contact'))}
                  />
                ) : null}
              </div>
            )}
          </Section>

          <Section icon="approval_delegation" title={tk('pickupTitle', 'Authorized pickup')} body={tk('pickupBody', 'People allowed to collect the child, besides the parents.')}>
            {parents.length === 0 && applicationPickups.length === 0 && pickups.length === 0 ? (
              <p className="text-sm text-on-surface-variant">{tk('pickupEmpty', 'No pickup authorization records yet.')}</p>
            ) : (
              <div className="grid gap-3 md:grid-cols-2">
                {parents.map((p) => (
                  <ContactCard
                    key={`parent-${p.parent_id}`}
                    icon="family_restroom"
                    name={parentName(p)}
                    subtitle={showCode(p.parent_type ?? p.relationship ?? tk('relationParent', 'Parent'))}
                    phone={show(p.user?.phone)}
                    badge={{ label: tk('allowed', 'Allowed'), tone: 'success' }}
                  />
                ))}
                {applicationPickups.map((row, index) => (
                  <ContactCard
                    key={`app-pickup-${index}`}
                    icon="person"
                    name={show(text(row, 'name'))}
                    subtitle={showCode(text(row, 'relation') || tk('relationGuardian', 'Guardian'))}
                    phone={show(text(row, 'phone'))}
                    badge={{ label: showCode(text(row, 'authorization') || 'anytime'), tone: 'success' }}
                  />
                ))}
                {pickups.map((row) => {
                  const allowed = Boolean(row.active ?? row.can_pickup);
                  return (
                    <ContactCard
                      key={`pickup-${row.id}`}
                      icon="person"
                      name={show(row.name)}
                      subtitle={showCode(row.relation ?? tk('relationGuardian', 'Guardian'))}
                      phone={show(row.mobile_phone ?? row.phone)}
                      extra={row.national_id ? `${tk('nationalId', 'National ID')}: ${row.national_id}` : undefined}
                      badge={{ label: allowed ? tk('allowed', 'Allowed') : tk('notAllowed', 'Not allowed'), tone: allowed ? 'success' : 'error' }}
                    />
                  );
                })}
              </div>
            )}
          </Section>
        </div>
      ) : null}

      {tab === 'billing' ? (
        <ChildBillingTab childId={child.id} nurseryId={child.nursery_id} />
      ) : null}

      {tab === 'documents' ? (
        <Section icon="folder_open" title={tk('documentsTitle', 'Documents')} body={tk('documentsBody', 'Files uploaded with the registration application.')}>
          {documents.length === 0 && !child.birth_certificate_url && !child.vaccination_card_url ? (
            <p className="text-sm text-on-surface-variant">{t('applications.noDocuments')}</p>
          ) : (
            <div className="space-y-3">
              {documents.map((doc) => (
                <ApplicationDocumentPreview key={text(doc, 'id')} document={doc} />
              ))}
              {child.birth_certificate_url ? (
                <LegacyFileRow label={t('applications.documentTypes.birth_certificate')} url={child.birth_certificate_url} />
              ) : null}
              {child.vaccination_card_url ? (
                <LegacyFileRow label={t('applications.documentTypes.vaccination_card')} url={child.vaccination_card_url} />
              ) : null}
            </div>
          )}
        </Section>
      ) : null}

      {tab === 'tools' ? (
        <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(340px,420px)]">
          <ChildAvatarUpload childId={child.id} nurseryId={child.nursery_id} fullNameForPlaceholder={childName} avatarUrl={child.avatar_url} />
          <div className="self-start">
            <ChildQrCodeCard child={child} languagePref={languagePref} qrSize={180} />
          </div>
        </div>
      ) : null}
    </div>
  );
}

function FactTile({ icon, label, value }: { icon: string; label: string; value: string }) {
  return (
    <div className="flex items-start gap-3 rounded-lg border border-outline-variant bg-surface-container-lowest p-3">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
        <span className="material-symbols-outlined text-lg" aria-hidden>{icon}</span>
      </span>
      <div className="min-w-0">
        <p className="text-[11px] font-semibold uppercase text-on-surface-variant">{label}</p>
        <p className="mt-0.5 truncate text-sm font-semibold text-on-surface" title={value}>{value}</p>
      </div>
    </div>
  );
}

function Section({ icon, title, body, className, children }: { icon: string; title: string; body?: string; className?: string; children: ReactNode }) {
  return (
    <section className={cn('rounded-xl border border-outline-variant bg-surface p-4 shadow-sm sm:p-5', className)}>
      <div className="mb-4 flex items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
          <span className="material-symbols-outlined text-xl" aria-hidden>{icon}</span>
        </span>
        <div className="min-w-0">
          <h2 className="text-base font-semibold text-on-surface">{title}</h2>
          {body ? <p className="mt-0.5 text-xs leading-5 text-on-surface-variant">{body}</p> : null}
        </div>
      </div>
      {children}
    </section>
  );
}

function FieldGrid({ children, columns = 2, className }: { children: ReactNode; columns?: 2 | 3; className?: string }) {
  return (
    <dl className={cn('grid gap-x-4 gap-y-3 sm:grid-cols-2', columns === 3 && 'xl:grid-cols-3', className)}>
      {children}
    </dl>
  );
}

function Field({ label, value, wide }: { label: string; value: ReactNode; wide?: boolean }) {
  const empty = value === '-' || value === '' || value === null || value === undefined;
  return (
    <div className={cn('rounded-lg border border-outline-variant bg-surface-container-lowest px-3 py-2', wide && 'sm:col-span-2 xl:col-span-full')}>
      <dt className="text-[11px] font-semibold uppercase text-on-surface-variant">{label}</dt>
      <dd className={cn('mt-0.5 break-words text-sm font-medium', empty ? 'text-on-surface-variant' : 'text-on-surface')}>{empty ? '-' : value}</dd>
    </div>
  );
}

function PersonCard({ icon, title, rows, empty }: { icon: string; title: string; rows: Array<[string, string]>; empty: string }) {
  return (
    <Section icon={icon} title={title}>
      {rows.length === 0 ? (
        <p className="text-sm text-on-surface-variant">{empty}</p>
      ) : (
        <FieldGrid>
          {rows.map(([label, value]) => (
            <Field key={label} label={label} value={value} wide={label.toLowerCase().includes('email') || label.toLowerCase().includes('name')} />
          ))}
        </FieldGrid>
      )}
    </Section>
  );
}

function ContactCard({
  icon,
  name,
  subtitle,
  phone,
  extra,
  badge,
}: {
  icon: string;
  name: string;
  subtitle: string;
  phone: string;
  extra?: string;
  badge?: { label: string; tone: 'success' | 'error' | 'neutral' };
}) {
  const toneClass = {
    success: 'border-success/30 bg-success/10 text-success',
    error: 'border-error/30 bg-error/10 text-error',
    neutral: 'border-outline-variant bg-surface text-on-surface-variant',
  };
  return (
    <div className="flex items-start gap-3 rounded-lg border border-outline-variant bg-surface-container-lowest p-4">
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
        <span className="material-symbols-outlined text-xl" aria-hidden>{icon}</span>
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-on-surface">{name}</p>
            <p className="mt-0.5 text-xs text-on-surface-variant">{subtitle}</p>
          </div>
          {badge ? <span className={cn('rounded-full border px-2.5 py-1 text-[11px] font-semibold', toneClass[badge.tone])}>{badge.label}</span> : null}
        </div>
        <p className="mt-2 inline-flex items-center gap-1 text-sm font-medium text-on-surface">
          <span className="material-symbols-outlined text-base text-on-surface-variant" aria-hidden>call</span>
          {phone}
        </p>
        {extra ? <p className="mt-1 text-xs text-on-surface-variant">{extra}</p> : null}
      </div>
    </div>
  );
}

function LegacyFileRow({ label, url }: { label: string; url: string }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border border-outline-variant bg-surface-container-lowest px-4 py-3">
      <span className="inline-flex items-center gap-2 text-sm font-medium text-on-surface">
        <span className="material-symbols-outlined text-base text-primary" aria-hidden>description</span>
        {label}
      </span>
      <a className="inline-flex items-center gap-1 text-sm font-semibold text-primary underline" href={url} target="_blank" rel="noreferrer">
        <span className="material-symbols-outlined text-base" aria-hidden>open_in_new</span>
        {label}
      </a>
    </div>
  );
}
