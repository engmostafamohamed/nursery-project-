import { useMemo, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

import { MaterialSymbol } from '@/components/ui/MaterialSymbol';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  MEDICATION_CONSENT_OPTIONS,
  type MedicationConsentId,
} from '@/lib/admissions/medicationConsentOptions';
import { cn } from '@/lib/utils';

type AnyJson = Record<string, unknown>;

type Props = {
  parentInfo: AnyJson;
  childInfo: AnyJson;
};

function readString(obj: unknown, key: string): string | null {
  if (!obj || typeof obj !== 'object') return null;
  const v = (obj as AnyJson)[key];
  if (v === null || v === undefined) return null;
  if (typeof v === 'string') return v.trim() || null;
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  return null;
}

function readBool(obj: unknown, key: string): boolean | null {
  if (!obj || typeof obj !== 'object') return null;
  const v = (obj as AnyJson)[key];
  if (v === null || v === undefined) return null;
  return Boolean(v);
}

function readArray<T = unknown>(obj: unknown, key: string): T[] {
  if (!obj || typeof obj !== 'object') return [];
  const v = (obj as AnyJson)[key];
  return Array.isArray(v) ? (v as T[]) : [];
}

function readObject(obj: unknown, key: string): AnyJson | null {
  if (!obj || typeof obj !== 'object') return null;
  const v = (obj as AnyJson)[key];
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as AnyJson) : null;
}

function formatYesNo(t: (k: string) => string, v: boolean | null): string | null {
  if (v === null) return null;
  return v ? t('common.yes') : t('common.no');
}

// Each value sits on its own soft tile so it reads apart from the white card behind it.
function Row({ label, value, mono }: { label: string; value: ReactNode; mono?: boolean }) {
  const empty = value === null || value === undefined || value === '';
  return (
    <div className="min-w-0 rounded-lg border border-outline-variant bg-surface-container-lowest px-3 py-2">
      <dt className="text-[11px] font-semibold uppercase tracking-wide text-on-surface-variant">{label}</dt>
      <dd
        className={cn(
          'mt-0.5 break-words text-sm font-medium leading-6',
          empty ? 'text-on-surface-variant' : 'text-on-surface',
          mono && !empty && 'font-mono text-[13px]',
        )}
      >
        {empty ? '-' : value}
      </dd>
    </div>
  );
}

function FieldGrid({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <dl className={cn('grid gap-3 sm:grid-cols-2', className)}>
      {children}
    </dl>
  );
}

function Section({ title, icon, children, className }: { title: string; icon: string; children: ReactNode; className?: string }) {
  return (
    <section className={cn('min-w-0', className)}>
      <div className="mb-3 flex items-center gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
          <MaterialSymbol name={icon} size="text-lg" />
        </span>
        <h4 className="text-sm font-semibold text-on-surface">{title}</h4>
      </div>
      {children}
    </section>
  );
}

function ReviewTab({ value, icon, children }: { value: string; icon: string; children: ReactNode }) {
  return (
    <TabsTrigger
      value={value}
      className="h-10 shrink-0 gap-2 rounded-md border border-transparent px-3 text-xs font-semibold data-[state=active]:border-primary data-[state=active]:shadow-sm data-[state=inactive]:hover:bg-surface"
    >
      <MaterialSymbol name={icon} size="text-base" />
      <span>{children}</span>
    </TabsTrigger>
  );
}

function ReviewPanel({ value, children }: { value: string; children: ReactNode }) {
  return (
    <TabsContent value={value} className="space-y-6 p-4 pt-4 sm:p-5">
      {children}
    </TabsContent>
  );
}

export function ApplicationReviewTabs({ parentInfo, childInfo }: Props) {
  const { t, i18n } = useTranslation();
  const isArabic = i18n.language === 'ar';

  const father = readObject(parentInfo, 'father');
  const mother = readObject(parentInfo, 'mother');
  const family = readObject(parentInfo, 'family');
  const pickups = readArray<AnyJson>(parentInfo, 'pickups');

  const dailyCare = useMemo(() => readObject(childInfo, 'daily_care_preferences') ?? {}, [childInfo]);
  const emergencyContacts = readArray<AnyJson>(childInfo, 'emergency_contacts');
  const enrollmentConsents = readObject(parentInfo, 'consents');

  const medicationIds = useMemo(() => {
    const raw = (dailyCare['emergency_medications'] ?? null) as unknown;
    if (!Array.isArray(raw)) return [] as MedicationConsentId[];
    const ids = new Set(MEDICATION_CONSENT_OPTIONS.map((o) => o.id));
    return raw.filter((x): x is MedicationConsentId => typeof x === 'string' && ids.has(x as MedicationConsentId));
  }, [dailyCare]);

  const childFullName = [
    readString(childInfo, 'first_name'),
    readString(childInfo, 'middle_name'),
    readString(childInfo, 'last_name'),
  ]
    .filter(Boolean)
    .join(' ') || readString(childInfo, 'full_name_en') || readString(childInfo, 'full_name_ar');

  return (
    <Tabs
      defaultValue="child"
      className="overflow-hidden rounded-xl border border-outline-variant bg-surface shadow-sm"
    >
      <TabsList className="flex h-auto w-full justify-start gap-1 overflow-x-auto rounded-none border-b border-outline-variant bg-surface-container-lowest p-2">
        <ReviewTab value="child" icon="child_care">{t('admin.applications.tabs.child')}</ReviewTab>
        <ReviewTab value="parents" icon="supervisor_account">{t('admin.applications.tabs.parents')}</ReviewTab>
        <ReviewTab value="family" icon="home">{t('admin.applications.tabs.family')}</ReviewTab>
        <ReviewTab value="enrollment" icon="school">{t('admin.applications.tabs.enrollment')}</ReviewTab>
        <ReviewTab value="health" icon="health_and_safety">{t('admin.applications.tabs.health')}</ReviewTab>
        <ReviewTab value="dailyCare" icon="restaurant">{t('admin.applications.tabs.dailyCare')}</ReviewTab>
        <ReviewTab value="emergency" icon="emergency">{t('admin.applications.tabs.emergency')}</ReviewTab>
        <ReviewTab value="pickups" icon="directions_car">{t('admin.applications.tabs.pickups')}</ReviewTab>
        <ReviewTab value="medication" icon="medication">{t('admin.applications.tabs.medication')}</ReviewTab>
        <ReviewTab value="consents" icon="verified">{t('admin.applications.tabs.consents')}</ReviewTab>
      </TabsList>

      <ReviewPanel value="child">
        <Section title={t('admin.applications.tabs.child')} icon="child_care">
          <FieldGrid>
            <Row label={t('signup.childFirstName')} value={childFullName} />
            <Row label={t('signup.childNickname')} value={readString(childInfo, 'nickname')} />
            <Row label={t('signup.childDob')} value={readString(childInfo, 'dob')} />
            <Row label={t('signup.childNationality')} value={readString(childInfo, 'nationality')} />
            <Row label={t('signup.childGender')} value={readString(childInfo, 'gender')} />
            <Row label={t('signup.address')} value={readString(childInfo, 'home_address')} />
          </FieldGrid>
        </Section>
      </ReviewPanel>

      <ReviewPanel value="parents">
        <div className="grid gap-6 lg:grid-cols-2">
          <Section title={t('signup.fatherInfo')} icon="man">
            <FieldGrid className="sm:grid-cols-1">
              <Row label={t('signup.fatherFullName')} value={readString(father, 'full_name')} />
              <Row label={t('signup.fatherJob')} value={readString(father, 'job')} />
              <Row label={t('signup.fatherMobile')} value={readString(father, 'mobile')} mono />
              <Row label={t('signup.fatherEmail')} value={readString(father, 'email')} mono />
              <Row label={t('signup.fatherIdPhoto')} value={readString(father, 'id_photo_path')} mono />
            </FieldGrid>
          </Section>
          <Section title={t('signup.motherInfo')} icon="woman">
            <FieldGrid className="sm:grid-cols-1">
              <Row label={t('signup.motherFullName')} value={readString(mother, 'full_name')} />
              <Row label={t('signup.motherJob')} value={readString(mother, 'job')} />
              <Row label={t('signup.motherMobile')} value={readString(mother, 'mobile')} mono />
              <Row label={t('signup.motherEmail')} value={readString(mother, 'email')} mono />
              <Row label={t('signup.motherIdPhoto')} value={readString(mother, 'id_photo_path')} mono />
            </FieldGrid>
          </Section>
        </div>
      </ReviewPanel>

      <ReviewPanel value="family">
        <Section title={t('admin.applications.tabs.family')} icon="home">
          <FieldGrid>
            <Row label={t('signup.maritalStatus')} value={readString(family, 'marital_status')} />
            <Row label={t('signup.address')} value={readString(family, 'address')} />
            <Row label={t('signup.hasSiblings')} value={formatYesNo(t, readBool(childInfo, 'has_siblings'))} />
            <Row label={t('signup.siblingAges')} value={readString(childInfo, 'sibling_ages')} />
            <Row label={t('signup.passwordRecoveryContact')} value={readString(family, 'password_recovery_contact')} />
            <Row label={t('signup.referralSource')} value={readString(family, 'referral_source')} />
          </FieldGrid>
        </Section>
      </ReviewPanel>

      <ReviewPanel value="enrollment">
        <Section title={t('admin.applications.tabs.enrollment')} icon="school">
          <FieldGrid>
            <Row label={t('signup.department')} value={readString(childInfo, 'department')} />
            <Row label={t('signup.schoolPreference')} value={readString(childInfo, 'school_preference')} />
            <Row label={t('signup.schoolAdmissionsPlan')} value={readString(childInfo, 'school_admissions_plan')} />
            <Row label={t('signup.academicYear')} value={readString(childInfo, 'academic_year')} />
          </FieldGrid>
        </Section>
      </ReviewPanel>

      <ReviewPanel value="health">
        <Section title={t('admin.applications.tabs.health')} icon="health_and_safety">
          <FieldGrid>
            <Row label={t('signup.birthCertificate')} value={readString(childInfo, 'birth_certificate_path')} mono />
            <Row label={t('signup.vaccinationCard')} value={readString(childInfo, 'vaccination_card_path')} mono />
          </FieldGrid>
        </Section>
      </ReviewPanel>

      <ReviewPanel value="dailyCare">
        <div className="grid gap-6 lg:grid-cols-2">
          <Section title={t('signup.mealsSection')} icon="restaurant">
            <FieldGrid className="sm:grid-cols-1">
              <Row label={t('signup.arrivalTime')} value={readString(dailyCare, 'arrival_time')} />
              <Row label={t('signup.takesBreakfastAtHome')} value={formatYesNo(t, readBool(dailyCare, 'takes_breakfast_at_home'))} />
              <Row label={t('signup.eatsNurseryMeals')} value={formatYesNo(t, readBool(dailyCare, 'eats_nursery_meals'))} />
              <Row label={t('signup.foodAllergies')} value={readString(dailyCare, 'food_allergies')} />
              <Row label={t('signup.sendsExtraSnacks')} value={formatYesNo(t, readBool(dailyCare, 'sends_extra_snacks'))} />
              <Row label={t('signup.snackType')} value={readString(dailyCare, 'snack_type')} />
              <Row label={t('signup.unfinishedSnackAction')} value={readString(dailyCare, 'unfinished_snack_action')} />
              <Row label={t('signup.nurseryMealsPreference')} value={readString(dailyCare, 'nursery_meals_preference')} />
              <Row label={t('signup.sendsVitamins')} value={formatYesNo(t, readBool(dailyCare, 'sends_vitamins'))} />
              <Row label={t('signup.timeBetweenMeals')} value={readString(dailyCare, 'time_between_meals')} />
              <Row label={t('signup.waterPreference')} value={readString(dailyCare, 'water_preference')} />
              <Row label={t('signup.extraMealPreference')} value={readString(dailyCare, 'extra_meal_preference')} />
            </FieldGrid>
          </Section>

          <div className="space-y-6">
            <Section title={t('signup.diaperSection')} icon="baby_changing_station">
              <FieldGrid className="sm:grid-cols-1">
                <Row label={t('signup.diaperSupplyMethod')} value={readString(dailyCare, 'diaper_supply_method')} />
                <Row label={t('signup.dailyDiaperCount')} value={readString(dailyCare, 'daily_diaper_count')} />
                <Row label={t('signup.rashCreamUsage')} value={readString(dailyCare, 'rash_cream_usage')} />
                <Row label={t('signup.diaperChangeSchedule')} value={readString(dailyCare, 'diaper_change_schedule')} />
                <Row label={t('signup.diaperChangeFrequency')} value={readString(dailyCare, 'diaper_change_frequency')} />
                <Row label={t('signup.toiletTrainingStatus')} value={readString(dailyCare, 'toilet_training_status')} />
              </FieldGrid>
            </Section>
            <Section title={t('signup.napSection')} icon="bedtime">
              <FieldGrid className="sm:grid-cols-1">
                <Row label={t('signup.napTimePreference')} value={readString(dailyCare, 'nap_time_preference')} />
                <Row label={t('signup.maxNapTime')} value={readString(dailyCare, 'max_nap_time')} />
              </FieldGrid>
            </Section>
            <Section title={t('signup.childBehaviorHealthNotes')} icon="psychology">
              <FieldGrid className="sm:grid-cols-1">
                <Row label={t('signup.childBehaviorHealthNotes')} value={readString(dailyCare, 'child_behavior_health_notes')} />
              </FieldGrid>
            </Section>
          </div>
        </div>
      </ReviewPanel>

      <ReviewPanel value="emergency">
        <div className="grid gap-6 lg:grid-cols-2">
          {emergencyContacts.length === 0 && (
            <p className="text-sm text-on-surface-variant">{t('admin.applications.noEmergencyContacts')}</p>
          )}
          {emergencyContacts.map((ec, idx) => (
            <Section key={idx} title={`${t('signup.emergencyContact')} ${idx + 1}`} icon="emergency">
              <FieldGrid className="sm:grid-cols-1">
                <Row label={t('signup.contactName')} value={readString(ec, 'name')} />
                <Row label={t('signup.contactPhone')} value={readString(ec, 'phone')} mono />
                <Row label={t('signup.contactRelationship')} value={readString(ec, 'relationship')} />
              </FieldGrid>
            </Section>
          ))}
        </div>
      </ReviewPanel>

      <ReviewPanel value="pickups">
        <div className="grid gap-6 lg:grid-cols-2">
          {pickups.length === 0 && (
            <p className="text-sm text-on-surface-variant">{t('admin.applications.noPickups')}</p>
          )}
          {pickups.map((p, idx) => (
            <Section key={idx} title={`${t('signup.pickupPerson')} ${idx + 1}`} icon="directions_car">
              <FieldGrid className="sm:grid-cols-1">
                <Row label={t('signup.pickupName')} value={readString(p, 'name')} />
                <Row label={t('signup.pickupPhone')} value={readString(p, 'phone')} mono />
                <Row label={t('signup.pickupRelation')} value={readString(p, 'relation')} />
                <Row label={t('signup.pickupAuthorization')} value={readString(p, 'authorization')} />
                <Row label={t('signup.pickupPhoto')} value={readString(p, 'photo_path')} mono />
              </FieldGrid>
            </Section>
          ))}
        </div>
      </ReviewPanel>

      <ReviewPanel value="medication">
        <Section title={t('admin.applications.tabs.medication')} icon="medication">
          {medicationIds.length === 0 ? (
            <p className="text-sm text-on-surface-variant">{t('signup.review.medicationNone')}</p>
          ) : (
            <ul className="grid gap-2 sm:grid-cols-2">
              {MEDICATION_CONSENT_OPTIONS.map((opt) => {
                const approved = medicationIds.includes(opt.id);
                return (
                  <li
                    key={opt.id}
                    className={`flex items-center gap-3 rounded-lg border px-3 py-2.5 text-sm font-medium ${
                      approved
                        ? 'border-success/30 bg-success/10 text-on-surface'
                        : 'border-outline-variant bg-surface-container-lowest text-on-surface-variant'
                    }`}
                  >
                    <MaterialSymbol
                      name={approved ? 'check_circle' : 'remove_circle_outline'}
                      className={approved ? 'text-success' : 'text-on-surface-variant/60'}
                    />
                    <span>{isArabic ? opt.labelAr : opt.labelEn}</span>
                  </li>
                );
              })}
            </ul>
          )}
        </Section>
      </ReviewPanel>

      <ReviewPanel value="consents">
        <Section title={t('admin.applications.tabs.consents')} icon="verified">
          <FieldGrid>
            <Row
              label={t('signup.agreeHealthPolicyShort')}
              value={formatYesNo(t, readBool(enrollmentConsents, 'health_policy'))}
            />
            <Row
              label={t('signup.agreeFinancialAgreementShort')}
              value={formatYesNo(t, readBool(enrollmentConsents, 'financial_agreement'))}
            />
            <Row
              label={t('signup.agreePoliciesShort')}
              value={formatYesNo(t, readBool(enrollmentConsents, 'policies'))}
            />
            <Row
              label={t('signup.agreeInfoAccuracyShort')}
              value={formatYesNo(t, readBool(enrollmentConsents, 'info_accuracy'))}
            />
          </FieldGrid>
        </Section>
      </ReviewPanel>
    </Tabs>
  );
}
