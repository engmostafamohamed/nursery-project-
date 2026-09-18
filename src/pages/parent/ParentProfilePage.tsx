import { useEffect, useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';

import { ParentPasswordResetCard } from '@/components/parent/ParentPasswordResetCard';
import { LoadingSkeleton } from '@/components/ui/LoadingSkeleton';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useAuthSession } from '@/hooks/useAuthSession';
import { parentDisplayNameFromProfile, useParentAccountProfile, type ParentContactProfile } from '@/hooks/useParentAccountProfile';
import { parentNurseryLabel, useParentNursery } from '@/hooks/useParentNursery';
import { useUserProfile } from '@/hooks/useUserProfile';
import { isValidInternationalMobile, normalizeInternationalMobile } from '@/lib/phoneValidation';
import { supabase } from '@/lib/supabase';

type PhoneOwner = 'account' | 'father' | 'mother';

type ParentProfileForm = {
  accountName: string;
  accountEmail: string;
  father: ParentContactProfile;
  mother: ParentContactProfile;
  familyAddress: string;
  maritalStatus: string;
  emergencyContact: string;
};

const blankContact: ParentContactProfile = {
  fullName: '',
  job: '',
  mobile: '',
  email: '',
  nationalId: '',
  idPhotoPath: '',
};

function randomSixDigitCode(): string {
  const bytes = new Uint32Array(1);
  globalThis.crypto?.getRandomValues(bytes);
  const source = bytes[0] || Math.floor(Math.random() * 900000);
  return String(100000 + (source % 900000));
}

function mergeContact(previous: Record<string, unknown>, next: ParentContactProfile) {
  return {
    ...previous,
    full_name: next.fullName.trim(),
    job: next.job.trim() || null,
    mobile: next.mobile.trim(),
    email: next.email.trim() || null,
    national_id: next.nationalId.trim() || null,
    id_photo_path: next.idPhotoPath.trim() || null,
  };
}

function mergeParentInfo(source: Record<string, unknown>, form: ParentProfileForm) {
  const fatherPrevious =
    source.father && typeof source.father === 'object' && !Array.isArray(source.father)
      ? source.father as Record<string, unknown>
      : {};
  const motherPrevious =
    source.mother && typeof source.mother === 'object' && !Array.isArray(source.mother)
      ? source.mother as Record<string, unknown>
      : {};
  const familyPrevious =
    source.family && typeof source.family === 'object' && !Array.isArray(source.family)
      ? source.family as Record<string, unknown>
      : {};

  return {
    ...source,
    full_name: form.father.fullName.trim() || form.accountName.trim(),
    email: form.father.email.trim() || form.accountEmail.trim(),
    phone: form.father.mobile.trim(),
    national_id: form.father.nationalId.trim() || null,
    address: form.familyAddress.trim() || null,
    emergency_contact: form.emergencyContact.trim() || null,
    father: mergeContact(fatherPrevious, form.father),
    mother: mergeContact(motherPrevious, form.mother),
    family: {
      ...familyPrevious,
      address: form.familyAddress.trim() || null,
      marital_status: form.maritalStatus || null,
      emergency_contact: form.emergencyContact.trim() || null,
    },
  };
}

function contactInputId(role: 'father' | 'mother', field: keyof ParentContactProfile) {
  return `parent-profile-${role}-${field}`;
}

function ContactFields({
  title,
  icon,
  value,
  onChange,
  role,
}: {
  title: string;
  icon: string;
  value: ParentContactProfile;
  onChange: (next: ParentContactProfile) => void;
  role: 'father' | 'mother';
}) {
  const { t } = useTranslation();
  const setField = (field: keyof ParentContactProfile, nextValue: string) => onChange({ ...value, [field]: nextValue });

  return (
    <section className="rounded-xl border border-outline-variant bg-surface p-4 shadow-sm">
      <div className="mb-4 flex items-center gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
          <span className="material-symbols-outlined text-xl" aria-hidden>{icon}</span>
        </span>
        <h2 className="text-base font-semibold text-on-surface">{title}</h2>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor={contactInputId(role, 'fullName')}>{t(`signup.${role}FullName`)}</Label>
          <Input id={contactInputId(role, 'fullName')} value={value.fullName} onChange={(event) => setField('fullName', event.target.value)} />
        </div>
        <div className="space-y-2">
          <Label htmlFor={contactInputId(role, 'job')}>{t(`signup.${role}Job`)}</Label>
          <Input id={contactInputId(role, 'job')} value={value.job} onChange={(event) => setField('job', event.target.value)} />
        </div>
        <div className="space-y-2">
          <Label htmlFor={contactInputId(role, 'mobile')}>{t(`signup.${role}Mobile`)}</Label>
          <Input id={contactInputId(role, 'mobile')} value={value.mobile} onChange={(event) => setField('mobile', event.target.value)} />
        </div>
        <div className="space-y-2">
          <Label htmlFor={contactInputId(role, 'email')}>{t(`signup.${role}Email`)}</Label>
          <Input id={contactInputId(role, 'email')} type="email" value={value.email} onChange={(event) => setField('email', event.target.value)} />
        </div>
        <div className="space-y-2">
          <Label htmlFor={contactInputId(role, 'nationalId')}>{t('applications.nationalId')}</Label>
          <Input id={contactInputId(role, 'nationalId')} value={value.nationalId} onChange={(event) => setField('nationalId', event.target.value)} />
        </div>
      </div>
    </section>
  );
}

export function ParentProfilePage() {
  const { t, i18n } = useTranslation();
  const qc = useQueryClient();
  const { user, loading: authLoading } = useAuthSession();
  const { data: profile, isPending: profilePending } = useUserProfile(user?.id);
  const accountProfile = useParentAccountProfile(user?.id, profile?.nursery_id);
  const nurseryQuery = useParentNursery(profile?.nursery_id);
  const nurseryLabel = parentNurseryLabel(nurseryQuery.data, i18n.language);
  const [isSaving, setIsSaving] = useState(false);
  const [phoneOwner, setPhoneOwner] = useState<PhoneOwner>('father');
  const [newPhone, setNewPhone] = useState('');
  const [sentPhoneCode, setSentPhoneCode] = useState('');
  const [enteredPhoneCode, setEnteredPhoneCode] = useState('');
  const [isSendingPhoneCode, setIsSendingPhoneCode] = useState(false);
  const [isVerifyingPhone, setIsVerifyingPhone] = useState(false);
  const [form, setForm] = useState<ParentProfileForm>({
    accountName: '',
    accountEmail: '',
    father: blankContact,
    mother: blankContact,
    familyAddress: '',
    maritalStatus: '',
    emergencyContact: '',
  });

  useEffect(() => {
    if (!profile && !accountProfile.data) return;
    const account = accountProfile.data;
    const accountName = account?.father.fullName || parentDisplayNameFromProfile(profile, account, i18n.language);
    setForm({
      accountName,
      accountEmail: profile?.email ?? account?.father.email ?? '',
      father: account?.father ?? blankContact,
      mother: account?.mother ?? blankContact,
      familyAddress: account?.family.address ?? '',
      maritalStatus: account?.family.maritalStatus ?? '',
      emergencyContact: account?.family.emergencyContact ?? '',
    });
    setNewPhone(profile?.phone ?? account?.father.mobile ?? '');
  }, [accountProfile.data, profile]);

  const editableApplications = useMemo(
    () => (accountProfile.data?.applications ?? []).filter((application) => application.status === 'draft'),
    [accountProfile.data?.applications],
  );

  const savedApplicationsCount = editableApplications.length;
  const lockedApplicationsCount = Math.max(0, (accountProfile.data?.applications.length ?? 0) - savedApplicationsCount);

  const updateDraftApplications = async (nextForm: ParentProfileForm) => {
    await Promise.all(
      editableApplications.map((application) =>
        supabase
          .from('applications')
          .update({ parent_info_json: mergeParentInfo(application.parentInfo, nextForm) } as never)
          .eq('id', application.id),
      ),
    ).then((results) => {
      const failed = results.find((result) => result.error);
      if (failed?.error) throw failed.error;
    });
  };

  const saveProfile = async () => {
    if (!user?.id) return;
    const fatherMobile = form.father.mobile.trim();
    const motherMobile = form.mother.mobile.trim();
    if (fatherMobile && !isValidInternationalMobile(fatherMobile)) {
      toast.error(t('staffOnboarding.validation.mobileInvalid', { defaultValue: 'Invalid mobile number.' }));
      return;
    }
    if (motherMobile && !isValidInternationalMobile(motherMobile)) {
      toast.error(t('staffOnboarding.validation.mobileInvalid', { defaultValue: 'Invalid mobile number.' }));
      return;
    }

    setIsSaving(true);
    try {
      const displayName = form.father.fullName.trim() || form.accountName.trim();
      const { error } = await supabase
        .from('users')
        .update({
          name_ar: displayName,
          name_en: displayName,
          email: form.accountEmail.trim() || null,
          occupation: form.father.job.trim() || null,
        } as never)
        .eq('id', user.id);
      if (error) throw error;

      await updateDraftApplications(form);
      await Promise.all([
        qc.invalidateQueries({ queryKey: ['user-profile', user.id] }),
        qc.invalidateQueries({ queryKey: ['parent-account-profile', user.id] }),
        qc.invalidateQueries({ queryKey: ['parent-applications'] }),
        qc.invalidateQueries({ queryKey: ['application-detail'] }),
      ]);
      toast.success(t('parent.profile.saveSuccess', { defaultValue: 'Parent profile updated.' }));
    } catch (error) {
      toast.error(`${t('parent.profile.saveError', { defaultValue: 'Could not save parent profile.' })} (${error instanceof Error ? error.message : String(error)})`);
    } finally {
      setIsSaving(false);
    }
  };

  const sendPhoneCode = async () => {
    if (!profile?.nursery_id || !user?.id) return;
    const normalized = normalizeInternationalMobile(newPhone);
    if (!normalized) {
      toast.error(t('staffOnboarding.validation.mobileInvalid', { defaultValue: 'Invalid mobile number.' }));
      return;
    }

    const code = randomSixDigitCode();
    setIsSendingPhoneCode(true);
    try {
      const { error } = await supabase.functions.invoke('sms-dispatch', {
        body: {
          trigger_type: 'otp_login',
          recipient_phone: normalized,
          language: i18n.language.startsWith('en') ? 'en' : 'ar',
          nursery_id: profile.nursery_id,
          user_id: user.id,
          data: { otp_code: code },
        },
      });
      if (error) throw error;
      setSentPhoneCode(code);
      setEnteredPhoneCode('');
      toast.success(t('parent.profile.phoneCodeSent', { defaultValue: 'Verification code sent.' }));
    } catch (error) {
      toast.error(`${t('parent.profile.phoneCodeFailed', { defaultValue: 'Could not send verification code.' })} (${error instanceof Error ? error.message : String(error)})`);
    } finally {
      setIsSendingPhoneCode(false);
    }
  };

  const verifyPhone = async () => {
    if (!user?.id || !sentPhoneCode) return;
    if (enteredPhoneCode.trim() !== sentPhoneCode) {
      toast.error(t('parent.dashboard.passwordReset.codeInvalid'));
      return;
    }

    const normalized = normalizeInternationalMobile(newPhone);
    const nextForm: ParentProfileForm = {
      ...form,
      father: phoneOwner === 'father' ? { ...form.father, mobile: normalized } : form.father,
      mother: phoneOwner === 'mother' ? { ...form.mother, mobile: normalized } : form.mother,
    };

    setIsVerifyingPhone(true);
    try {
      const { error } = await supabase.from('users').update({ phone: normalized } as never).eq('id', user.id);
      if (error) throw error;
      if (phoneOwner !== 'account') {
        await updateDraftApplications(nextForm);
        setForm(nextForm);
      }
      await Promise.all([
        qc.invalidateQueries({ queryKey: ['user-profile', user.id] }),
        qc.invalidateQueries({ queryKey: ['parent-account-profile', user.id] }),
      ]);
      setSentPhoneCode('');
      setEnteredPhoneCode('');
      toast.success(t('parent.profile.phoneVerified', { defaultValue: 'Phone number verified and saved.' }));
    } catch (error) {
      toast.error(`${t('parent.profile.phoneVerifyFailed', { defaultValue: 'Could not verify phone number.' })} (${error instanceof Error ? error.message : String(error)})`);
    } finally {
      setIsVerifyingPhone(false);
    }
  };

  if (authLoading || profilePending || accountProfile.isPending) return <LoadingSkeleton />;

  return (
    <div className="w-full max-w-none space-y-5 pb-6">
      <section className="overflow-hidden rounded-xl border border-outline-variant bg-surface shadow-sm">
        <div className="border-b border-outline-variant bg-surface-container-lowest px-4 py-5 sm:px-5">
          <p className="text-xs font-semibold uppercase text-primary">{t('parent.nav.profile')}</p>
          <h1 className="mt-1 text-2xl font-semibold text-on-surface">
            {form.father.fullName || form.accountName || t('common.parent')}
          </h1>
          <p className="mt-1 text-sm text-on-surface-variant">
            {t('parent.profile.subtitle', { defaultValue: 'Manage the parent account and family contact details.' })}
          </p>
          <span className="mt-3 inline-flex items-center gap-2 rounded-md border border-primary/30 bg-primary/10 px-3 py-1.5 text-xs font-semibold text-primary">
            <span className="material-symbols-outlined text-base" aria-hidden>home_work</span>
            {t('parent.profile.nurseryLabel', { defaultValue: 'Nursery' })}:
            <span className="text-on-surface">
              {nurseryLabel || (nurseryQuery.isPending && profile?.nursery_id
                ? t('common.loading')
                : t('parent.profile.noNursery', { defaultValue: 'Not assigned to a nursery yet' }))}
            </span>
          </span>
        </div>
        <div className="grid gap-4 p-4 sm:p-5 lg:grid-cols-[minmax(0,1fr)_320px]">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="parent-profile-account-name">
                {t('parent.profile.accountDisplayName', { defaultValue: 'Parent display name' })}
              </Label>
              <Input
                id="parent-profile-account-name"
                value={form.accountName}
                onChange={(event) => setForm((current) => ({ ...current, accountName: event.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="parent-profile-account-email">
                {t('parent.profile.accountEmail', { defaultValue: 'Account email' })}
              </Label>
              <Input
                id="parent-profile-account-email"
                type="email"
                value={form.accountEmail}
                onChange={(event) => setForm((current) => ({ ...current, accountEmail: event.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="parent-profile-current-phone">
                {t('parent.profile.currentPhone', { defaultValue: 'Current verified phone' })}
              </Label>
              <Input id="parent-profile-current-phone" value={profile?.phone ?? ''} readOnly />
            </div>
            <div className="space-y-2">
              <Label htmlFor="parent-profile-nursery">
                {t('parent.profile.registeredNursery', { defaultValue: 'Registered nursery' })}
              </Label>
              <Input
                id="parent-profile-nursery"
                value={nurseryLabel || t('parent.profile.noNursery', { defaultValue: 'Not assigned to a nursery yet' })}
                readOnly
              />
              <p className="text-xs leading-5 text-on-surface-variant">
                {t('parent.profile.nurseryHint', {
                  defaultValue: 'Set when you registered. Packages, invoices, and applications belong to this nursery.',
                })}
              </p>
            </div>
          </div>
          <div className="rounded-lg border border-outline-variant bg-surface-container-lowest p-4 text-sm leading-6 text-on-surface-variant">
            {t('parent.profile.qrMoved', {
              defaultValue: 'QR codes are kept with child pickup and application pages, not the parent account profile.',
            })}
            <Button asChild variant="outline" className="mt-4 h-10 w-full rounded-md">
              <Link to="/parent/qr-code">
                <span className="material-symbols-outlined me-2 text-base" aria-hidden>qr_code_2</span>
                {t('parent.nav.qrCode')}
              </Link>
            </Button>
          </div>
        </div>
      </section>

      <div className="grid gap-4 xl:grid-cols-2">
        <ContactFields
          title={t('signup.fatherInfo')}
          icon="man"
          role="father"
          value={form.father}
          onChange={(father) => setForm((current) => ({ ...current, father }))}
        />
        <ContactFields
          title={t('signup.motherInfo')}
          icon="woman"
          role="mother"
          value={form.mother}
          onChange={(mother) => setForm((current) => ({ ...current, mother }))}
        />
      </div>

      <section className="rounded-xl border border-outline-variant bg-surface p-4 shadow-sm">
        <div className="mb-4 flex items-center gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
            <span className="material-symbols-outlined text-xl" aria-hidden>home</span>
          </span>
          <h2 className="text-base font-semibold text-on-surface">
            {t('parent.profile.familyTitle', { defaultValue: 'Family information' })}
          </h2>
        </div>
        <div className="grid gap-4 md:grid-cols-3">
          <div className="space-y-2 md:col-span-2">
            <Label htmlFor="parent-profile-family-address">{t('applications.address')}</Label>
            <Input
              id="parent-profile-family-address"
              value={form.familyAddress}
              onChange={(event) => setForm((current) => ({ ...current, familyAddress: event.target.value }))}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="parent-profile-marital-status">
              {t('parent.profile.maritalStatus', { defaultValue: 'Marital status' })}
            </Label>
            <select
              id="parent-profile-marital-status"
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-on-surface ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              value={form.maritalStatus}
              onChange={(event) => setForm((current) => ({ ...current, maritalStatus: event.target.value }))}
            >
              <option value="">{t('common.select', { defaultValue: 'Select' })}</option>
              {['married', 'divorced', 'separated', 'widowed', 'single'].map((status) => (
                <option key={status} value={status}>
                  {t(`parent.profile.maritalStatuses.${status}`, { defaultValue: status })}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-2 md:col-span-3">
            <Label htmlFor="parent-profile-emergency-contact">{t('applications.emergencyContact')}</Label>
            <Input
              id="parent-profile-emergency-contact"
              value={form.emergencyContact}
              onChange={(event) => setForm((current) => ({ ...current, emergencyContact: event.target.value }))}
            />
          </div>
        </div>
        <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs text-on-surface-variant">
            {t('parent.profile.draftSyncNote', {
              count: savedApplicationsCount,
              defaultValue: '{{count}} draft application(s) will receive these family details.',
            })}
            {lockedApplicationsCount > 0
              ? ` ${t('parent.profile.lockedSyncNote', {
                  count: lockedApplicationsCount,
                  defaultValue: '{{count}} reviewed application(s) stay locked.',
                })}`
              : ''}
          </p>
          <Button type="button" className="h-10 min-w-28 rounded-lg px-4" disabled={isSaving} onClick={() => void saveProfile()}>
            <span className="material-symbols-outlined me-2 text-base" aria-hidden>save</span>
            {isSaving ? t('common.saving') : t('common.save')}
          </Button>
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <section className="rounded-xl border border-outline-variant bg-surface p-4 shadow-sm">
          <div className="mb-4 flex items-center gap-3">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
              <span className="material-symbols-outlined text-xl" aria-hidden>verified_user</span>
            </span>
            <div>
              <h2 className="text-base font-semibold text-on-surface">
                {t('parent.profile.verifyPhoneTitle', { defaultValue: 'Verify new phone number' })}
              </h2>
              <p className="mt-1 text-xs text-on-surface-variant">
                {t('parent.profile.verifyPhoneSubtitle', { defaultValue: 'Send a code, then save the verified number to the account.' })}
              </p>
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="parent-profile-new-phone">
                {t('parent.profile.newPhone', { defaultValue: 'New phone number' })}
              </Label>
              <Input
                id="parent-profile-new-phone"
                value={newPhone}
                onChange={(event) => setNewPhone(event.target.value)}
                inputMode="tel"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="parent-profile-phone-owner">
                {t('parent.profile.phoneOwner', { defaultValue: 'Save phone as' })}
              </Label>
              <select
                id="parent-profile-phone-owner"
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-on-surface ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                value={phoneOwner}
                onChange={(event) => setPhoneOwner(event.target.value as PhoneOwner)}
              >
                <option value="father">{t('signup.father')}</option>
                <option value="mother">{t('signup.mother')}</option>
                <option value="account">{t('parent.profile.accountOnly', { defaultValue: 'Account only' })}</option>
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="parent-profile-phone-code">
                {t('parent.dashboard.passwordReset.codeLabel')}
              </Label>
              <Input
                id="parent-profile-phone-code"
                value={enteredPhoneCode}
                maxLength={6}
                inputMode="numeric"
                disabled={!sentPhoneCode}
                onChange={(event) => setEnteredPhoneCode(event.target.value.replace(/\D/g, ''))}
              />
            </div>
            <div className="grid gap-2 sm:col-span-2 sm:grid-cols-2">
              <Button
                type="button"
                variant="outline"
                className="h-11 min-w-0 rounded-lg px-3"
                disabled={isSendingPhoneCode}
                onClick={() => void sendPhoneCode()}
              >
                <span className="material-symbols-outlined me-2 text-base" aria-hidden>sms</span>
                <span className="truncate">
                  {isSendingPhoneCode ? t('common.loading') : t('parent.dashboard.passwordReset.sendCode')}
                </span>
              </Button>
              <Button
                type="button"
                className="h-11 min-w-0 rounded-lg px-3"
                disabled={!sentPhoneCode || isVerifyingPhone}
                onClick={() => void verifyPhone()}
              >
                <span className="material-symbols-outlined me-2 text-base" aria-hidden>verified</span>
                <span className="truncate">
                  {isVerifyingPhone ? t('common.loading') : t('parent.profile.verify', { defaultValue: 'Verify' })}
                </span>
              </Button>
            </div>
          </div>
        </section>

        <ParentPasswordResetCard profile={profile} />
      </section>
    </div>
  );
}
