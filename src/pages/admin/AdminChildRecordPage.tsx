import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useParams } from 'react-router-dom';

import { ChildAvatarUpload } from '@/components/admin/ChildAvatarUpload';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ChildQrCodeCard, type ChildQrInput } from '@/components/qr/ChildQrCodeCard';
import { EmptyState } from '@/components/ui/EmptyState';
import { LoadingSkeleton } from '@/components/ui/LoadingSkeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useNurseryLanguagePref } from '@/hooks/useNurseryLanguagePref';
import { useAuthSession } from '@/hooks/useAuthSession';
import { useUserProfile } from '@/hooks/useUserProfile';
import { supabase } from '@/lib/supabase';

type ChildRecord = ChildQrInput & {
  avatar_url: string | null;
  class_id?: string | null;
  status?: string | null;
  dob?: string | null;
  enrollment_date?: string | null;
  created_at?: string | null;
  nationality?: string | null;
  home_address?: string | null;
  enrollment_department?: string | null;
  school_preference?: string | null;
  school_admission_plan?: string | null;
  toilet_training_status?: string | null;
  nap_preference?: string | null;
  lead_source?: string | null;
  emergency_contacts?: unknown;
  enrollment_extended_json?: unknown;
};

type ParentLink = {
  parent_id: string;
  parent_type: string | null;
  is_emergency_contact: boolean | null;
  is_primary: boolean | null;
  occupation: string | null;
  workplace: string | null;
  work_address: string | null;
  national_id: string | null;
  relationship: string | null;
  user: {
    id: string;
    name_ar: string | null;
    name_en: string | null;
    email: string | null;
    phone: string | null;
  } | null;
};

type DietaryPrefs = {
  usual_arrival_time?: string | null;
  eats_breakfast_at_home?: boolean | null;
  eats_nursery_meals?: boolean | null;
  food_allergies_details?: string | null;
  sends_extra_snacks?: boolean | null;
  extra_snack_type?: string | null;
  leftover_snack_action?: string | null;
  meal_appetite_preference?: string | null;
  sends_vitamins_daily?: boolean | null;
  vitamin_details?: string | null;
  water_preference?: string | null;
  extra_meal_policy?: string | null;
};

type DiaperCare = {
  diaper_supply_method?: string | null;
  diapers_per_day?: number | null;
  rash_cream_usage?: string | null;
  change_schedule?: string | null;
  change_frequency_hours?: number | null;
  notes?: string | null;
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

type EmergencyContact = {
  name?: string;
  phone?: string;
  relation?: string;
  [key: string]: unknown;
};

type ChildRecordPayload = {
  child: ChildRecord | null;
  parents: ParentLink[];
  dietary: DietaryPrefs | null;
  diaper: DiaperCare | null;
  pickups: AuthorizedPickup[];
  childClass: { name_ar: string | null; name_en: string | null } | null;
};

function formatValue(value: string | number | null | undefined) {
  return displayValue(value);
  if (value === null || value === undefined) return '—';
  const s = String(value).trim();
  return s.length ? s : '—';
}

function formatBool(value: boolean | null | undefined, t: (k: string) => string) {
  return displayBool(value, t);
  if (value === null || value === undefined) return '—';
  return value ? t('common.yes') : t('common.no');
}

function emergencyContactsArray(raw: unknown): EmergencyContact[] {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw as EmergencyContact[];
  if (typeof raw === 'object') return [raw as EmergencyContact];
  return [];
}

function displayValue(value: string | number | null | undefined) {
  if (value === null || value === undefined) return '-';
  const s = String(value).trim();
  return s.length ? s : '-';
}

function displayBool(value: boolean | null | undefined, t: (k: string) => string) {
  if (value === null || value === undefined) return '-';
  return value ? t('common.yes') : t('common.no');
}

function initials(name: string): string {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0])
      .join('')
      .toUpperCase() || 'CH'
  );
}

function calculateAge(dob: string | null | undefined): string {
  if (!dob) return '-';
  const birth = new Date(dob);
  if (Number.isNaN(birth.getTime())) return displayValue(dob);
  const today = new Date();
  let years = today.getFullYear() - birth.getFullYear();
  const monthDelta = today.getMonth() - birth.getMonth();
  if (monthDelta < 0 || (monthDelta === 0 && today.getDate() < birth.getDate())) years -= 1;
  return years >= 0 ? `${years} years` : '-';
}

function displayDate(value: string | null | undefined): string {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return displayValue(value);
  return date.toLocaleDateString();
}

function statusLabel(status: string | null | undefined): string {
  const raw = displayValue(status);
  if (raw === '-') return raw;
  return raw.replace(/_/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase());
}

function DetailTile({
  icon,
  label,
  value,
  className,
}: {
  icon: string;
  label: string;
  value: string | number | null | undefined;
  className?: string;
}) {
  return (
    <div className={`rounded-2xl border border-outline-variant bg-surface-container-lowest p-4 ${className ?? ''}`}>
      <div className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase text-on-surface-variant">
        <span className="material-symbols-outlined text-base text-primary">{icon}</span>
        {label}
      </div>
      <p className="break-words text-base font-semibold text-on-surface">{displayValue(value)}</p>
    </div>
  );
}

export function AdminChildRecordPage() {
  const { t } = useTranslation();
  const { childId } = useParams();
  const { user } = useAuthSession();
  const { data: profile } = useUserProfile(user?.id);
  const { data: languagePref = 'both' } = useNurseryLanguagePref(profile?.nursery_id);

  const childQuery = useQuery({
    queryKey: ['admin-child-record', childId, profile?.id],
    queryFn: async (): Promise<ChildRecordPayload> => {
      const fallback: ChildRecordPayload = {
        child: null,
        parents: [],
        dietary: null,
        diaper: null,
        pickups: [],
        childClass: null,
      };
      if (!childId || !profile?.id) return fallback;

      // Tenant scoping is enforced by RLS on `children` (branch_admin /
      // chain_super_admin / xo_super_admin policies). Don't double-filter on
      // profile.nursery_id — chain & XO super admins have nursery_id = NULL.
      const { data: childRow, error: childErr } = await supabase
        .from('children')
        .select(
          [
            'id',
            'nursery_id',
            'class_id',
            'status',
            'full_name_ar',
            'full_name_en',
            'avatar_url',
            'dob',
            'enrollment_date',
            'created_at',
            'nationality',
            'home_address',
            'enrollment_department',
            'school_preference',
            'school_admission_plan',
            'toilet_training_status',
            'nap_preference',
            'lead_source',
            'emergency_contacts',
            'enrollment_extended_json',
          ].join(', '),
        )
        .eq('id', childId)
        .maybeSingle();
      if (childErr) throw childErr;
      const child = (childRow as ChildRecord | null) ?? null;
      if (!child) return fallback;

      // The class the child is enrolled in (for the overview card).
      let childClass: ChildRecordPayload['childClass'] = null;
      if (child.class_id) {
        const { data: clsRow } = await (supabase as any)
          .from('classes')
          .select('name_ar, name_en')
          .eq('id', child.class_id)
          .maybeSingle();
        childClass = (clsRow as { name_ar: string | null; name_en: string | null } | null) ?? null;
      }

      // Linked parents — read parent_children + the linked user row.
      const { data: linkRows, error: linksError } = await (supabase as any)
        .from('parent_children')
        .select(
          'parent_id, parent_type, is_emergency_contact, is_primary, occupation, workplace, work_address, national_id, relationship',
        )
        .eq('child_id', childId);
      if (linksError) throw linksError;

      const parentIds = (linkRows ?? [])
        .map((r: Record<string, unknown>) => String(r.parent_id ?? ''))
        .filter(Boolean);

      let userMap = new Map<string, ParentLink['user']>();
      if (parentIds.length) {
        const { data: usersData, error: usersErr } = await (supabase as any)
          .from('users')
          .select('id, name_ar, name_en, email, phone')
          .in('id', parentIds);
        if (usersErr) throw usersErr;
        userMap = new Map(
          (usersData ?? []).map((u: Record<string, unknown>) => [
            String(u.id),
            {
              id: String(u.id),
              name_ar: (u.name_ar as string | null) ?? null,
              name_en: (u.name_en as string | null) ?? null,
              email: (u.email as string | null) ?? null,
              phone: (u.phone as string | null) ?? null,
            },
          ]),
        );
      }

      const parents: ParentLink[] = (linkRows ?? []).map((r: Record<string, unknown>) => ({
        parent_id: String(r.parent_id ?? ''),
        parent_type: (r.parent_type as string | null) ?? null,
        is_emergency_contact: (r.is_emergency_contact as boolean | null) ?? null,
        is_primary: (r.is_primary as boolean | null) ?? null,
        occupation: (r.occupation as string | null) ?? null,
        workplace: (r.workplace as string | null) ?? null,
        work_address: (r.work_address as string | null) ?? null,
        national_id: (r.national_id as string | null) ?? null,
        relationship: (r.relationship as string | null) ?? null,
        user: userMap.get(String(r.parent_id ?? '')) ?? null,
      }));

      const [{ data: dietaryRow }, { data: diaperRow }, { data: pickupRows }] = await Promise.all([
        (supabase as any)
          .from('child_dietary_preferences')
          .select(
            'usual_arrival_time, eats_breakfast_at_home, eats_nursery_meals, food_allergies_details, sends_extra_snacks, extra_snack_type, leftover_snack_action, meal_appetite_preference, sends_vitamins_daily, vitamin_details, water_preference, extra_meal_policy',
          )
          .eq('child_id', childId)
          .maybeSingle(),
        (supabase as any)
          .from('child_diaper_care')
          .select('diaper_supply_method, diapers_per_day, rash_cream_usage, change_schedule, change_frequency_hours, notes')
          .eq('child_id', childId)
          .maybeSingle(),
        (supabase as any)
          .from('authorized_pickups')
          .select('id, name, phone, mobile_phone, relation, national_id, active, can_pickup, authorization_level')
          .eq('child_id', childId),
      ]);

      return {
        child,
        parents,
        dietary: (dietaryRow as DietaryPrefs | null) ?? null,
        diaper: (diaperRow as DiaperCare | null) ?? null,
        pickups: (pickupRows as AuthorizedPickup[] | null) ?? [],
        childClass,
      };
    },
    enabled: Boolean(childId && profile?.id),
  });

  const placeholderName = useMemo(() => {
    const c = childQuery.data?.child;
    if (!c) return '';
    const ar = c.full_name_ar?.trim() ?? '';
    const en = c.full_name_en?.trim() ?? '';
    if (languagePref === 'ar') return ar || en;
    if (languagePref === 'en') return en || ar;
    if (ar && en) return `${ar} / ${en}`;
    return ar || en;
  }, [childQuery.data, languagePref]);

  if (childQuery.isLoading) return <LoadingSkeleton />;
  if (!childQuery.data?.child) {
    return (
      <EmptyState
        icon="qr_code_2"
        title={t('qr.childNotFoundTitle')}
        description={t('qr.childNotFoundDescription')}
      />
    );
  }

  const { child, parents, dietary, diaper, pickups, childClass } = childQuery.data;
  const childDisplayName = placeholderName || '-';
  const classNameDisplay = (() => {
    if (!childClass) return '—';
    const ar = childClass.name_ar?.trim() ?? '';
    const en = childClass.name_en?.trim() ?? '';
    if (languagePref === 'ar') return ar || en || '—';
    if (languagePref === 'en') return en || ar || '—';
    if (ar && en) return `${ar} / ${en}`;
    return ar || en || '—';
  })();
  const labelValueClass = 'text-sm font-medium text-on-surface';

  const localizedParentName = (p: ParentLink) => {
    const ar = p.user?.name_ar?.trim() ?? '';
    const en = p.user?.name_en?.trim() ?? '';
    if (languagePref === 'ar') return ar || en || '—';
    if (languagePref === 'en') return en || ar || '—';
    if (ar && en) return `${ar} / ${en}`;
    return ar || en || '—';
  };

  const emergencyContacts = emergencyContactsArray(child.emergency_contacts);
  const family = (child.enrollment_extended_json as { family?: Record<string, unknown> } | null)?.family ?? null;

  const tk = (k: string) => t(`admin.children.childRecord.${k}`);
  const avatarSrc =
    child.avatar_url ??
    `https://ui-avatars.com/api/?name=${encodeURIComponent(childDisplayName)}&background=eceef0&color=191c1e`;
  const primaryParent = parents.find((parent) => parent.is_primary) ?? parents[0] ?? null;
  const primaryPhone = primaryParent?.user?.phone ?? parents.find((parent) => parent.user?.phone)?.user?.phone ?? null;
  const activePickups = pickups.filter((pickup) => Boolean(pickup.active ?? pickup.can_pickup)).length + parents.length;
  const enrolledOn = child.enrollment_date ?? child.created_at;

  return (
    <div className="w-full space-y-5">
      <section className="overflow-hidden rounded-3xl border border-outline-variant bg-surface-container-lowest shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-outline-variant bg-surface-container p-5">
          <div className="flex min-w-0 items-center gap-4">
            <img
              src={avatarSrc}
              alt=""
              className="h-20 w-20 shrink-0 rounded-3xl object-cover ring-4 ring-surface"
              loading="lazy"
              decoding="async"
            />
            <div className="min-w-0">
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <span className="rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
                  {statusLabel(child.status)}
                </span>
                <span className="rounded-full bg-surface px-3 py-1 text-xs font-semibold text-on-surface-variant">
                  {displayValue(classNameDisplay)}
                </span>
              </div>
              <h1 className="truncate text-2xl font-bold text-on-surface">{childDisplayName}</h1>
              <p className="mt-1 text-sm text-on-surface-variant">
                {tk('dob')}: {displayDate(child.dob)} | {calculateAge(child.dob)}
              </p>
            </div>
          </div>
          <Button variant="outline" asChild className="h-11 rounded-2xl">
            <Link to={`/admin/children/${child.id}/health`}>
              <span className="material-symbols-outlined me-2 text-base" aria-hidden>
                medical_services
              </span>
              {t('health.pageTitle')}
            </Link>
          </Button>
        </div>

        <div className="grid gap-3 p-5 md:grid-cols-2 xl:grid-cols-4">
          <DetailTile icon="school" label={tk('class')} value={classNameDisplay} />
          <DetailTile icon="family_restroom" label={tk('tabParents')} value={parents.length} />
          <DetailTile icon="call" label={tk('phone')} value={primaryPhone} />
          <DetailTile icon="how_to_reg" label={tk('tabEnrollment')} value={displayDate(enrolledOn)} />
        </div>

        <div className="grid gap-3 px-5 pb-5 md:grid-cols-2 xl:grid-cols-4">
          <DetailTile icon="public" label={tk('nationality')} value={child.nationality} />
          <DetailTile icon="badge" label={tk('department')} value={child.enrollment_department} />
          <DetailTile icon="approval_delegation" label={tk('pickupTitle')} value={activePickups} />
          <DetailTile icon="home" label={tk('homeAddress')} value={child.home_address} />
        </div>
      </section>

      {/* TABS */}
      <Tabs defaultValue="parents" className="space-y-4">
        <TabsList className="flex h-auto w-full flex-wrap justify-center gap-2 rounded-3xl border border-outline-variant bg-surface-container-lowest p-2 shadow-sm">
          <TabsTrigger value="parents" className="h-10 px-5 text-sm">{tk('tabParents')}</TabsTrigger>
          <TabsTrigger value="care" className="h-10 px-5 text-sm">{tk('tabCare')}</TabsTrigger>
          <TabsTrigger value="emergency" className="h-10 px-5 text-sm">{tk('tabEmergency')}</TabsTrigger>
          <TabsTrigger value="enrollment" className="h-10 px-5 text-sm">{tk('tabEnrollment')}</TabsTrigger>
        </TabsList>

        {/* PARENTS */}
        <TabsContent value="parents" className="pt-0">
          <Card className="rounded-3xl border border-outline-variant bg-surface-container-lowest shadow-sm">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <span className="material-symbols-outlined text-primary">family_restroom</span>
                {tk('tabParents')}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {parents.length === 0 ? (
                <p className="text-sm text-foreground-secondary">{tk('parentsEmpty')}</p>
              ) : (
                <div className="grid gap-3 xl:grid-cols-2">
                  {parents.map((p) => (
                    <div key={p.parent_id} className="space-y-3 rounded-2xl border border-outline-variant bg-surface p-4 shadow-sm">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div>
                          <p className="text-base font-semibold text-on-surface">{localizedParentName(p)}</p>
                          <p className="text-xs font-medium uppercase text-on-surface-variant">{formatValue(p.parent_type ?? p.relationship)}</p>
                        </div>
                        {p.is_primary ? (
                          <span className="rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
                            {tk('primary')}
                          </span>
                        ) : null}
                      </div>
                      <div className="grid gap-2 md:grid-cols-2">
                        <div>
                          <p className="text-xs text-foreground-secondary">{tk('relation')}</p>
                          <p className={labelValueClass}>{formatValue(p.parent_type ?? p.relationship)}</p>
                        </div>
                        <div>
                          <p className="text-xs text-foreground-secondary">{tk('phone')}</p>
                          <p className={labelValueClass}>{formatValue(p.user?.phone)}</p>
                        </div>
                        <div>
                          <p className="text-xs text-foreground-secondary">{tk('email')}</p>
                          <p className={labelValueClass}>{formatValue(p.user?.email)}</p>
                        </div>
                        <div>
                          <p className="text-xs text-foreground-secondary">{tk('occupation')}</p>
                          <p className={labelValueClass}>{formatValue(p.occupation)}</p>
                        </div>
                        <div>
                          <p className="text-xs text-foreground-secondary">{tk('workplace')}</p>
                          <p className={labelValueClass}>{formatValue(p.workplace)}</p>
                        </div>
                        <div>
                          <p className="text-xs text-foreground-secondary">{tk('nationalId')}</p>
                          <p className={labelValueClass}>{formatValue(p.national_id)}</p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* CARE */}
        <TabsContent value="care">
          <div className="space-y-4">
            <Card className="rounded-3xl border border-outline-variant bg-surface-container-lowest shadow-sm">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg">
                  <span className="material-symbols-outlined text-primary">child_care</span>
                  {tk('careTitle')}
                </CardTitle>
              </CardHeader>
              <CardContent className="grid gap-4 md:grid-cols-2">
                <div>
                  <p className="text-xs text-foreground-secondary">{tk('toiletTraining')}</p>
                  <p className={labelValueClass}>{formatValue(child.toilet_training_status)}</p>
                </div>
                <div>
                  <p className="text-xs text-foreground-secondary">{tk('napPreference')}</p>
                  <p className={labelValueClass}>{formatValue(child.nap_preference)}</p>
                </div>
              </CardContent>
            </Card>

            <Card className="rounded-3xl border border-outline-variant bg-surface-container-lowest shadow-sm">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg">
                  <span className="material-symbols-outlined text-primary">restaurant</span>
                  {tk('dietTitle')}
                </CardTitle>
              </CardHeader>
              <CardContent className="grid gap-4 md:grid-cols-2">
                {dietary ? (
                  <>
                    <div>
                      <p className="text-xs text-foreground-secondary">{tk('usualArrival')}</p>
                      <p className={labelValueClass}>{formatValue(dietary.usual_arrival_time)}</p>
                    </div>
                    <div>
                      <p className="text-xs text-foreground-secondary">{tk('appetite')}</p>
                      <p className={labelValueClass}>{formatValue(dietary.meal_appetite_preference)}</p>
                    </div>
                    <div>
                      <p className="text-xs text-foreground-secondary">{tk('eatsBreakfastHome')}</p>
                      <p className={labelValueClass}>{formatBool(dietary.eats_breakfast_at_home, t)}</p>
                    </div>
                    <div>
                      <p className="text-xs text-foreground-secondary">{tk('eatsNurseryMeals')}</p>
                      <p className={labelValueClass}>{formatBool(dietary.eats_nursery_meals, t)}</p>
                    </div>
                    <div>
                      <p className="text-xs text-foreground-secondary">{tk('sendsExtraSnacks')}</p>
                      <p className={labelValueClass}>{formatBool(dietary.sends_extra_snacks, t)}</p>
                    </div>
                    <div>
                      <p className="text-xs text-foreground-secondary">{tk('extraSnackType')}</p>
                      <p className={labelValueClass}>{formatValue(dietary.extra_snack_type)}</p>
                    </div>
                    <div>
                      <p className="text-xs text-foreground-secondary">{tk('leftoverSnackAction')}</p>
                      <p className={labelValueClass}>{formatValue(dietary.leftover_snack_action)}</p>
                    </div>
                    <div>
                      <p className="text-xs text-foreground-secondary">{tk('waterPreference')}</p>
                      <p className={labelValueClass}>{formatValue(dietary.water_preference)}</p>
                    </div>
                    <div>
                      <p className="text-xs text-foreground-secondary">{tk('vitaminsDaily')}</p>
                      <p className={labelValueClass}>{formatBool(dietary.sends_vitamins_daily, t)}</p>
                    </div>
                    <div>
                      <p className="text-xs text-foreground-secondary">{tk('vitaminDetails')}</p>
                      <p className={labelValueClass}>{formatValue(dietary.vitamin_details)}</p>
                    </div>
                    <div>
                      <p className="text-xs text-foreground-secondary">{tk('extraMealPolicy')}</p>
                      <p className={labelValueClass}>{formatValue(dietary.extra_meal_policy)}</p>
                    </div>
                    <div className="md:col-span-2">
                      <p className="text-xs text-foreground-secondary">{tk('foodAllergies')}</p>
                      <p className={labelValueClass}>{formatValue(dietary.food_allergies_details)}</p>
                    </div>
                  </>
                ) : (
                  <p className="md:col-span-2 text-sm text-foreground-secondary">{tk('noDietary')}</p>
                )}
              </CardContent>
            </Card>

            <Card className="rounded-3xl border border-outline-variant bg-surface-container-lowest shadow-sm">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg">
                  <span className="material-symbols-outlined text-primary">baby_changing_station</span>
                  {tk('diaperTitle')}
                </CardTitle>
              </CardHeader>
              <CardContent className="grid gap-4 md:grid-cols-2">
                {diaper ? (
                  <>
                    <div>
                      <p className="text-xs text-foreground-secondary">{tk('diaperSupply')}</p>
                      <p className={labelValueClass}>{formatValue(diaper.diaper_supply_method)}</p>
                    </div>
                    <div>
                      <p className="text-xs text-foreground-secondary">{tk('diapersPerDay')}</p>
                      <p className={labelValueClass}>{formatValue(diaper.diapers_per_day)}</p>
                    </div>
                    <div>
                      <p className="text-xs text-foreground-secondary">{tk('rashCream')}</p>
                      <p className={labelValueClass}>{formatValue(diaper.rash_cream_usage)}</p>
                    </div>
                    <div>
                      <p className="text-xs text-foreground-secondary">{tk('changeSchedule')}</p>
                      <p className={labelValueClass}>{formatValue(diaper.change_schedule)}</p>
                    </div>
                    <div>
                      <p className="text-xs text-foreground-secondary">{tk('changeFrequencyHours')}</p>
                      <p className={labelValueClass}>{formatValue(diaper.change_frequency_hours)}</p>
                    </div>
                    <div className="md:col-span-2">
                      <p className="text-xs text-foreground-secondary">{tk('notes')}</p>
                      <p className={labelValueClass}>{formatValue(diaper.notes)}</p>
                    </div>
                  </>
                ) : (
                  <p className="md:col-span-2 text-sm text-foreground-secondary">{tk('noDiaper')}</p>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* EMERGENCY & PICKUP */}
        <TabsContent value="emergency" className="pt-0">
          <div className="space-y-4">
            <Card className="rounded-3xl border border-outline-variant bg-surface-container-lowest shadow-sm">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg">
                  <span className="material-symbols-outlined text-primary">emergency_home</span>
                  {tk('emergencyTitle')}
                </CardTitle>
              </CardHeader>
              <CardContent>
                {emergencyContacts.length === 0 ? (
                  <p className="text-sm text-foreground-secondary">{tk('emergencyEmpty')}</p>
                ) : (
                  <div className="grid gap-3 xl:grid-cols-2">
                    {emergencyContacts.map((c, i) => (
                      <div key={`emerg-${i}`} className="rounded-2xl border border-outline-variant bg-surface p-4 shadow-sm">
                        <p className="text-base font-semibold text-on-surface">{displayValue(c.name as string | undefined)}</p>
                        <p className="mt-2 text-sm text-on-surface-variant">
                          {tk('relation')}: {displayValue(c.relation as string | undefined)}
                        </p>
                        <p className="text-sm text-on-surface-variant">
                          {tk('phone')}: {displayValue(c.phone as string | undefined)}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            <Card className="rounded-3xl border border-outline-variant bg-surface-container-lowest shadow-sm">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg">
                  <span className="material-symbols-outlined text-primary">approval_delegation</span>
                  {tk('pickupTitle')}
                </CardTitle>
              </CardHeader>
              <CardContent>
                {parents.length === 0 && pickups.length === 0 ? (
                  <p className="text-sm text-foreground-secondary">{tk('pickupEmpty')}</p>
                ) : (
                  <div className="grid gap-3 xl:grid-cols-2">
                    {parents.map((p) => (
                      <div key={`pp-${p.parent_id}`} className="rounded-2xl border border-outline-variant bg-surface p-4 shadow-sm">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <p className="text-base font-semibold text-on-surface">{localizedParentName(p)}</p>
                          <span className="rounded-full bg-success/10 px-3 py-1 text-xs font-semibold text-success">
                            {tk('allowed')}
                          </span>
                        </div>
                        <p className="mt-2 text-sm text-on-surface-variant">
                          {tk('relation')}: {displayValue(p.parent_type ?? p.relationship ?? tk('relationParent'))}
                        </p>
                        <p className="text-sm text-on-surface-variant">
                          {tk('phone')}: {displayValue(p.user?.phone)}
                        </p>
                      </div>
                    ))}
                    {pickups.map((row) => {
                      const allowed = Boolean(row.active ?? row.can_pickup);
                      return (
                        <div key={`au-${row.id}`} className="rounded-2xl border border-outline-variant bg-surface p-4 shadow-sm">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <p className="text-base font-semibold text-on-surface">{displayValue(row.name)}</p>
                            <span
                              className={`rounded-full px-3 py-1 text-xs font-semibold ${
                                allowed ? 'bg-success/10 text-success' : 'bg-error/10 text-error'
                              }`}
                            >
                              {allowed ? tk('allowed') : tk('notAllowed')}
                            </span>
                          </div>
                          <p className="mt-2 text-sm text-on-surface-variant">
                            {tk('relation')}: {displayValue(row.relation ?? tk('relationGuardian'))}
                          </p>
                          <p className="text-sm text-on-surface-variant">
                            {tk('phone')}: {displayValue(row.mobile_phone ?? row.phone)}
                          </p>
                          {row.national_id ? (
                            <p className="text-sm text-on-surface-variant">
                              {tk('nationalId')}: {displayValue(row.national_id)}
                            </p>
                          ) : null}
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* ENROLLMENT */}
        <TabsContent value="enrollment" className="pt-0">
          <div className="space-y-4">
            <Card className="rounded-3xl border border-outline-variant bg-surface-container-lowest shadow-sm">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg">
                  <span className="material-symbols-outlined text-primary">how_to_reg</span>
                  {tk('enrollmentTitle')}
                </CardTitle>
              </CardHeader>
              <CardContent className="grid gap-4 md:grid-cols-2">
                <div>
                  <p className="text-xs text-foreground-secondary">{tk('department')}</p>
                  <p className={labelValueClass}>{formatValue(child.enrollment_department)}</p>
                </div>
                <div>
                  <p className="text-xs text-foreground-secondary">{tk('schoolPreference')}</p>
                  <p className={labelValueClass}>{formatValue(child.school_preference)}</p>
                </div>
                <div>
                  <p className="text-xs text-foreground-secondary">{tk('admissionPlan')}</p>
                  <p className={labelValueClass}>{formatValue(child.school_admission_plan)}</p>
                </div>
                <div>
                  <p className="text-xs text-foreground-secondary">{tk('leadSource')}</p>
                  <p className={labelValueClass}>{formatValue(child.lead_source)}</p>
                </div>
              </CardContent>
            </Card>

            {family ? (() => {
              const familyEntries = Object.entries(family).filter(
                ([k]) => k !== 'siblings' && k !== 'sibling_count' && k !== 'siblings_list',
              );
              const siblingsRaw =
                (family as Record<string, unknown>).siblings ??
                (family as Record<string, unknown>).siblings_list ??
                null;
              const siblings: Array<Record<string, unknown> | string> = Array.isArray(siblingsRaw)
                ? (siblingsRaw as Array<Record<string, unknown> | string>)
                : [];
              const siblingCount = (family as Record<string, unknown>).sibling_count;
              return (
                <Card className="rounded-3xl border border-outline-variant bg-surface-container-lowest shadow-sm">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-lg">
                      <span className="material-symbols-outlined text-primary">diversity_1</span>
                      {tk('familyTitle')}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {familyEntries.length > 0 ? (
                      <div className="grid gap-3 md:grid-cols-2">
                        {familyEntries.map(([k, v]) => (
                          <div key={k}>
                            <p className="text-xs text-foreground-secondary">{k.replace(/_/g, ' ')}</p>
                            <p className={labelValueClass}>
                              {typeof v === 'object' && v !== null ? JSON.stringify(v) : formatValue(v as string | number | null)}
                            </p>
                          </div>
                        ))}
                      </div>
                    ) : null}
                    {siblingCount !== undefined ? (
                      <div>
                        <p className="text-xs text-foreground-secondary">{tk('siblingCount')}</p>
                        <p className={labelValueClass}>{formatValue(siblingCount as string | number | null)}</p>
                      </div>
                    ) : null}
                    {siblings.length > 0 ? (
                      <div className="space-y-2">
                        <p className="text-xs text-foreground-secondary">{tk('siblings')}</p>
                        <div className="space-y-2">
                          {siblings.map((s, i) => (
                            <div key={`sib-${i}`} className="rounded-2xl border border-outline-variant bg-surface p-3 text-sm font-medium text-on-surface shadow-sm">
                              {typeof s === 'string'
                                ? s
                                : Object.entries(s)
                                    .map(([k, v]) => `${k}: ${typeof v === 'object' ? JSON.stringify(v) : String(v)}`)
                                    .join(' • ')}
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : null}
                  </CardContent>
                </Card>
              );
            })() : null}
          </div>
        </TabsContent>
      </Tabs>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(340px,420px)]">
        <div className="space-y-5">
          <section className="rounded-3xl border border-outline-variant bg-surface-container-lowest p-5 shadow-sm">
            <div className="mb-4 flex items-center gap-3">
              <span className="material-symbols-outlined flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-xl text-primary">
                manage_accounts
              </span>
              <div>
                <h2 className="text-lg font-semibold text-on-surface">Profile tools</h2>
                <p className="text-sm text-on-surface-variant">Photo, health record, and family QR access.</p>
              </div>
            </div>
            <div className="flex flex-wrap gap-3">
              <Button variant="outline" asChild className="h-11 rounded-2xl">
                <Link to={`/admin/children/${child.id}/health`}>
                  <span className="material-symbols-outlined me-2 text-base" aria-hidden>
                    medical_services
                  </span>
                  {t('health.pageTitle')}
                </Link>
              </Button>
            </div>
          </section>

          <ChildAvatarUpload
            childId={child.id}
            nurseryId={child.nursery_id}
            fullNameForPlaceholder={placeholderName}
            avatarUrl={child.avatar_url}
          />
        </div>

        <div className="self-start xl:sticky xl:top-24">
          <ChildQrCodeCard child={child} languagePref={languagePref} qrSize={180} />
        </div>
      </div>
    </div>
  );
}
