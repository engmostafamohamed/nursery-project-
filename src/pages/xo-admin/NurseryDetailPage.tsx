import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import { useForm } from 'react-hook-form';
import { ArrowLeft, Building2, Loader2, Upload } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Skeleton } from '@/components/ui/skeleton';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { confirm } from '@/components/ui/confirm';
import { useNurseryDetail, useUpdateNursery, useUploadNurseryLogo, type NurseryWithSettings } from '@/hooks/useNurseryDetail';
import { useAssignNurseryAdmin, useNurseryStats, useNurseryUsers } from '@/hooks/useNurseries';

type NurseryOverviewFormData = {
  name_ar: string;
  name_en: string;
  city?: string;
  opens_at?: string;
  closes_at?: string;
  working_days: string[];
  language_pref: 'ar' | 'en' | 'both';
  subscription_plan?: string;
  subscription_status?: string;
  trial_ends_at?: string | null;
};

const DAYS_OF_WEEK = [
  { value: '0', labelKey: 'staffOnboarding.weekdays.0' },
  { value: '1', labelKey: 'staffOnboarding.weekdays.1' },
  { value: '2', labelKey: 'staffOnboarding.weekdays.2' },
  { value: '3', labelKey: 'staffOnboarding.weekdays.3' },
  { value: '4', labelKey: 'staffOnboarding.weekdays.4' },
  { value: '5', labelKey: 'staffOnboarding.weekdays.5' },
  { value: '6', labelKey: 'staffOnboarding.weekdays.6' },
];

const emptyOverviewDefaults: NurseryOverviewFormData = {
  name_ar: '',
  name_en: '',
  city: '',
  opens_at: '',
  closes_at: '',
  working_days: [],
  language_pref: 'both',
  subscription_plan: '',
  subscription_status: '',
  trial_ends_at: null,
};

function getOverviewDefaults(nursery: NurseryWithSettings): NurseryOverviewFormData {
  return {
    name_ar: nursery.name_ar ?? '',
    name_en: nursery.name_en ?? '',
    city: nursery.city ?? '',
    opens_at: nursery.opens_at ?? '',
    closes_at: nursery.closes_at ?? '',
    working_days: Array.isArray(nursery.working_days) ? nursery.working_days.map(String) : [],
    language_pref: nursery.language_pref ?? 'both',
    subscription_plan: nursery.subscription_plan ?? '',
    subscription_status: nursery.subscription_status ?? '',
    trial_ends_at: nursery.trial_ends_at ?? null,
  };
}

function isDisplayableLogoUrl(value: unknown): value is string {
  return typeof value === 'string' && /^(https?:\/\/|data:image\/|blob:)/i.test(value.trim());
}

type NurseryOperationalStatus = 'active' | 'inactive' | 'cancelled' | 'deleted';

function getOperationalStatus(nursery: NurseryWithSettings): NurseryOperationalStatus {
  if (nursery.deleted_at || nursery.subscription_status === 'deleted') return 'deleted';
  if (nursery.suspended_at || nursery.subscription_status === 'inactive') return 'inactive';
  if (nursery.subscription_status === 'cancelled') return 'cancelled';
  return 'active';
}

function DetailItem({ label, value }: { label: string; value: ReactNode }) {
  const displayValue = value === null || value === undefined || value === '' ? '—' : value;
  return (
    <div className="rounded-lg border border-outline-variant bg-surface-container-lowest p-4">
      <p className="text-xs font-medium text-on-surface-variant">{label}</p>
      <div className="mt-1 text-sm font-semibold text-on-surface">{displayValue}</div>
    </div>
  );
}

export function NurseryDetailPage() {
  const { t } = useTranslation();
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);

  const nurseryId = id ?? '';
  const { data: nursery, isLoading, error } = useNurseryDetail(nurseryId);
  const { users, isLoading: usersLoading } = useNurseryUsers(nurseryId);
  const { stats, isLoading: statsLoading } = useNurseryStats(nurseryId);
  const updateNursery = useUpdateNursery();
  const assignAdmin = useAssignNurseryAdmin();
  const [showAddAdmin, setShowAddAdmin] = useState(false);
  const [newAdmin, setNewAdmin] = useState({ nameAr: '', nameEn: '', email: '', phone: '' });
  const uploadLogo = useUploadNurseryLogo();

  const form = useForm<NurseryOverviewFormData>({
    defaultValues: emptyOverviewDefaults,
  });
  const { reset } = form;

  useEffect(() => {
    if (nursery) {
      reset(getOverviewDefaults(nursery));
    }
  }, [nursery, reset]);

  const onSubmit = async (data: NurseryOverviewFormData) => {
    if (!data.name_ar.trim() || !data.name_en.trim()) {
      toast.error(
        t('xoAdmin.nurseryDetail.validationName', {
          defaultValue: 'Arabic and English names are required.',
        }),
      );
      return;
    }

    try {
      await updateNursery.mutateAsync({
        id: nurseryId,
        updates: data,
      });
      toast.success(
        t('xoAdmin.nurseryDetail.saveSuccess', {
          defaultValue: 'Nursery details updated successfully',
        }),
      );
    } catch (error: any) {
      console.error('Form submission error:', error);
      toast.error(
        error?.message ||
          t('xoAdmin.nurseryDetail.saveError', {
            defaultValue: 'Failed to update nursery details',
          }),
      );
    }
  };

  const handleLogoClick = () => {
    fileInputRef.current?.click();
  };

  const handleLogoChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || !nurseryId) return;

    if (!file.type.startsWith('image/')) {
      toast.error(t('xoAdmin.nurseryDetail.logoInvalidType', { defaultValue: 'Please select an image file.' }));
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      toast.error(
        t('xoAdmin.nurseryDetail.logoTooLarge', { defaultValue: 'Image must be less than 5MB in size.' }),
      );
      return;
    }

    const reader = new FileReader();
    reader.onloadend = () => {
      setLogoPreview(reader.result as string);
    };
    reader.readAsDataURL(file);

    try {
      await uploadLogo.mutateAsync({ nurseryId, file });
      toast.success(t('xoAdmin.nurseryDetail.logoSuccess', { defaultValue: 'Logo updated successfully.' }));
    } catch (err) {
      console.error(err);
      setLogoPreview(null);
      toast.error(t('xoAdmin.nurseryDetail.logoError', { defaultValue: 'Failed to upload logo.' }));
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <Skeleton className="h-10 w-10 rounded bg-muted" />
          <Skeleton className="h-8 w-64 bg-muted" />
        </div>
        <Skeleton className="h-72 w-full rounded-2xl bg-muted" />
      </div>
    );
  }

  if (error || !nursery) {
    return (
      <Card className="border-border bg-card p-8 text-center text-card-foreground">
        <p className="mb-4 text-sm text-destructive">
          {t('xoAdmin.nurseryDetail.loadError', { defaultValue: 'Failed to load nursery details.' })}
        </p>
        <Button type="button" onClick={() => navigate('/xo-admin/nurseries')}>
          {t('xoAdmin.nurseryDetail.backToList', { defaultValue: 'Back to Nurseries' })}
        </Button>
      </Card>
    );
  }

  const currentLogo = logoPreview || (isDisplayableLogoUrl(nursery.logo_url) ? nursery.logo_url : null);
  const operationalStatus = getOperationalStatus(nursery);
  const adminUsers = users.filter((user) => user.role === 'branch_admin' || user.role === 'admin');

  const submitNewAdmin = async () => {
    if (!nurseryId) return;
    try {
      const result = await assignAdmin.mutateAsync({
        nurseryId,
        adminNameAr: newAdmin.nameAr.trim(),
        adminNameEn: newAdmin.nameEn.trim(),
        adminEmail: newAdmin.email.trim(),
        adminPhone: newAdmin.phone.trim(),
      });
      // The welcome email is a stub today, so show the password rather than lose it.
      toast.success(
        t('xoAdmin.nurseryDetail.adminCreated', {
          email: result.email,
          password: result.tempPassword,
          defaultValue: 'Admin created. Email: {{email}} — temporary password: {{password}}',
        }),
        { duration: 30000 },
      );
      setNewAdmin({ nameAr: '', nameEn: '', email: '', phone: '' });
      setShowAddAdmin(false);
    } catch (error) {
      const code = error instanceof Error ? error.message : String(error);
      toast.error(
        t(`xoAdmin.nurseryDetail.adminErrors.${code}`, {
          defaultValue: t('xoAdmin.nurseryDetail.adminErrors.generic', { defaultValue: 'Could not add the admin.' }),
        }),
      );
    }
  };

  const canSubmitNewAdmin =
    newAdmin.nameAr.trim().length > 0 && newAdmin.nameEn.trim().length > 0 && newAdmin.email.trim().length > 0;
  const workingDayLabels = (form.watch('working_days') || [])
    .slice()
    .sort()
    .map((day) => t(`staffOnboarding.weekdays.${day}`, { defaultValue: day }))
    .join(', ');

  const handleOperationalStatusChange = async (status: NurseryOperationalStatus) => {
    if (status === operationalStatus) return;

    const confirmed = await confirm({
      title: t('xoAdmin.nurseryDetail.statusConfirmTitle'),
      description: t(`xoAdmin.nurseryDetail.statusConfirm.${status}`),
      confirmText: t('common.confirm'),
      cancelText: t('common.cancel'),
      variant: status === 'deleted' ? 'danger' : 'default',
      icon: status === 'deleted' ? 'warning' : 'published_with_changes',
    });
    if (!confirmed) return;

    const now = new Date().toISOString();
    const updatesByStatus: Record<NurseryOperationalStatus, Record<string, unknown>> = {
      active: {
        subscription_status: 'active',
        suspended_at: null,
        suspension_reason: null,
        deleted_at: null,
      },
      inactive: {
        subscription_status: 'inactive',
        suspended_at: now,
        suspension_reason: 'Manually deactivated by XO admin',
        deleted_at: null,
      },
      cancelled: {
        subscription_status: 'cancelled',
        suspended_at: null,
        suspension_reason: null,
        deleted_at: null,
      },
      deleted: {
        subscription_status: 'deleted',
        suspended_at: null,
        suspension_reason: null,
        deleted_at: now,
      },
    };

    try {
      await updateNursery.mutateAsync({
        id: nurseryId,
        updates: updatesByStatus[status],
      });
      toast.success(t('xoAdmin.nurseryDetail.statusUpdateSuccess'));
    } catch (error: any) {
      console.error('Nursery status update failed:', error);
      toast.error(t('xoAdmin.nurseryDetail.statusUpdateError'));
    }
  };

  return (
    <div className="space-y-6">
      {/* Header with breadcrumb and back button */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="h-8 w-8 hover:bg-muted"
            onClick={() => navigate('/xo-admin/nurseries')}
            aria-label={t('xoAdmin.nurseryDetail.backAria', { defaultValue: 'Back to nursery list' })}
          >
            <ArrowLeft className="h-4 w-4" aria-hidden />
          </Button>
          <div>
            <p className="text-xs text-on-surface-variant">
              {t('xoAdmin.breadcrumb.home', { defaultValue: 'Home' })} /{' '}
              {t('xoAdmin.nav.nurseries')} / {nursery.name_en}
            </p>
            <h1 className="text-2xl font-bold text-foreground">
              {nursery.name_ar} / {nursery.name_en}
            </h1>
            <p className="text-sm text-muted-foreground">
              {nursery.city || t('nurseries.list.cityUnknown')} • {nursery.subscription_plan || '—'}
            </p>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="overview" className="space-y-4">
        <TabsList className="bg-muted">
          <TabsTrigger value="overview" className="data-[state=active]:bg-background">
            {t('xoAdmin.nurseryDetail.tabs.overview', { defaultValue: 'Overview' })}
          </TabsTrigger>
          <TabsTrigger value="contacts" className="data-[state=active]:bg-background">
            {t('xoAdmin.nurseryDetail.tabs.contacts', { defaultValue: 'Contacts' })}
          </TabsTrigger>
          <TabsTrigger value="admins" className="data-[state=active]:bg-background">
            {t('xoAdmin.nurseryDetail.tabs.admins', { defaultValue: 'Admins' })}
          </TabsTrigger>
          <TabsTrigger value="danger" className="data-[state=active]:bg-background">
            {t('xoAdmin.nurseryDetail.tabs.danger', { defaultValue: 'Danger zone' })}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-6">
          {/* Logo */}
          <Card className="border-border bg-card p-6 text-card-foreground">
            <h3 className="mb-4 text-lg font-semibold">
              {t('xoAdmin.nurseryDetail.logoTitle', { defaultValue: 'Nursery Logo' })}
            </h3>
            <div className="flex flex-wrap items-start gap-6">
              <button
                type="button"
                onClick={handleLogoClick}
                className="group relative h-32 w-32 overflow-hidden rounded-lg border-2 border-dashed border-border bg-muted hover:bg-muted/80 transition-colors"
                aria-label={t('xoAdmin.nurseryDetail.changeLogoAria', { defaultValue: 'Change nursery logo' })}
              >
                {currentLogo ? (
                  <img src={currentLogo} alt="" className="h-full w-full object-cover" />
                ) : (
                  <div className="flex h-full w-full items-center justify-center">
                    <Building2 className="h-12 w-12 text-muted-foreground" aria-hidden />
                  </div>
                )}
                <div className="absolute inset-0 flex items-center justify-center rounded-lg bg-black/60 dark:bg-black/80 opacity-0 transition-opacity group-hover:opacity-100">
                  {uploadLogo.isPending ? (
                    <Loader2 className="h-8 w-8 animate-spin text-white" aria-hidden />
                  ) : (
                    <Upload className="h-8 w-8 text-white" aria-hidden />
                  )}
                </div>
              </button>
              <div className="min-w-[200px] flex-1">
                <p className="text-sm text-muted-foreground mb-2">
                  {t('xoAdmin.nurseryDetail.logoHelp', {
                    defaultValue: 'Click the logo to upload a new image. Recommended 1:1 ratio, at least 400×400px.',
                  })}
                </p>
                <p className="text-xs text-muted-foreground">
                  {t('xoAdmin.nurseryDetail.logoLimit', {
                    defaultValue: 'Supported: JPG, PNG, WEBP up to 5MB.',
                  })}
                </p>
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleLogoChange}
                disabled={uploadLogo.isPending}
              />
            </div>
          </Card>

          {/* Basic info form */}
          <Card className="border-border bg-card p-6 text-card-foreground">
            <h3 className="mb-4 text-lg font-semibold">
              {t('xoAdmin.nurseryDetail.basicInfoTitle', { defaultValue: 'Basic Information' })}
            </h3>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-1">
                    <label className="text-sm font-medium text-on-surface">
                      {t('nurseries.fields.nameAr')}
                    </label>
                    <Input dir="rtl" {...form.register('name_ar')} />
                    {form.formState.errors.name_ar?.message ? (
                      <p className="text-xs text-destructive">{form.formState.errors.name_ar.message}</p>
                    ) : null}
                  </div>
                  <div className="space-y-1">
                    <label className="text-sm font-medium text-on-surface">
                      {t('nurseries.fields.nameEn')}
                    </label>
                    <Input {...form.register('name_en')} />
                    {form.formState.errors.name_en?.message ? (
                      <p className="text-xs text-destructive">{form.formState.errors.name_en.message}</p>
                    ) : null}
                  </div>
                  <div className="space-y-1">
                    <label className="text-sm font-medium text-on-surface">
                      {t('nurseries.fields.city')}
                    </label>
                    <Input {...form.register('city')} />
                    {form.formState.errors.city?.message ? (
                      <p className="text-xs text-destructive">{form.formState.errors.city.message}</p>
                    ) : null}
                  </div>
                  <div className="space-y-1">
                    <label className="text-sm font-medium text-on-surface">
                      {t('nurseries.fields.languagePref')}
                    </label>
                    <Select
                      value={form.watch('language_pref')}
                      onChange={(e) => form.setValue('language_pref', e.target.value as 'ar' | 'en' | 'both')}
                      className="h-10 w-full rounded-md border border-outline-variant bg-surface-container-lowest px-3 text-sm"
                    >
                      <option value="ar">{t('nurseries.language.ar')}</option>
                      <option value="en">{t('nurseries.language.en')}</option>
                      <option value="both">{t('nurseries.language.both')}</option>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <label className="text-sm font-medium text-on-surface">
                      {t('nurseries.fields.opensAt')}
                    </label>
                    <Input type="time" {...form.register('opens_at')} />
                  </div>
                  <div className="space-y-1">
                    <label className="text-sm font-medium text-on-surface">
                      {t('nurseries.fields.closesAt')}
                    </label>
                    <Input type="time" {...form.register('closes_at')} />
                  </div>
                  <div className="space-y-1">
                    <label className="text-sm font-medium text-on-surface">
                      {t('nurseries.fields.subscriptionPlan')}
                    </label>
                    <Select
                      value={form.watch('subscription_plan') ?? ''}
                      onChange={(e) => form.setValue('subscription_plan', e.target.value)}
                      className="h-10 w-full rounded-md border border-outline-variant bg-surface-container-lowest px-3 text-sm"
                    >
                      <option value="">{t('common.none', { defaultValue: 'None' })}</option>
                      <option value="starter">{t('nurseries.plans.starter')}</option>
                      <option value="professional">{t('nurseries.plans.professional')}</option>
                      <option value="enterprise">{t('nurseries.plans.enterprise')}</option>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <label className="text-sm font-medium text-on-surface">
                      {t('nurseries.fields.subscriptionStatus')}
                    </label>
                    <Select
                      value={form.watch('subscription_status') ?? ''}
                      onChange={(e) => form.setValue('subscription_status', e.target.value)}
                      className="h-10 w-full rounded-md border border-outline-variant bg-surface-container-lowest px-3 text-sm"
                    >
                      <option value="">{t('common.none', { defaultValue: 'None' })}</option>
                      <option value="trial">{t('nurseries.status.trial')}</option>
                      <option value="active">{t('nurseries.status.active')}</option>
                      <option value="cancelled">{t('nurseries.status.cancelled')}</option>
                      <option value="expired">
                        {t('nurseries.status.expired', { defaultValue: 'Expired' })}
                      </option>
                    </Select>
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="text-sm font-medium text-on-surface">
                    {t('nurseries.fields.workingDays')}
                  </label>
                  <div className="mt-2 grid grid-cols-2 gap-2 md:grid-cols-4">
                    {DAYS_OF_WEEK.map((day) => {
                      const current = form.watch('working_days') || [];
                      const checked = current.includes(day.value);
                      return (
                        <label
                          key={day.value}
                          className="flex cursor-pointer items-center gap-2 rounded-md border border-outline-variant bg-surface-container-lowest px-2 py-1 text-xs"
                        >
                          <Checkbox
                            checked={checked}
                            onCheckedChange={(isChecked) => {
                              if (isChecked) {
                                form.setValue('working_days', [...current, day.value]);
                              } else {
                                form.setValue(
                                  'working_days',
                                  current.filter((v: string) => v !== day.value),
                                );
                              }
                            }}
                          />
                          <span>{t(day.labelKey, { defaultValue: day.value })}</span>
                        </label>
                      );
                    })}
                  </div>
                  {form.formState.errors.working_days?.message ? (
                    <p className="text-xs text-destructive">
                      {form.formState.errors.working_days.message as string}
                    </p>
                  ) : null}
                </div>

                <div className="flex justify-end">
                  <Button type="submit" disabled={!form.formState.isDirty || updateNursery.isPending}>
                    {updateNursery.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />}
                    {t('common.saveChanges', { defaultValue: 'Save Changes' })}
                  </Button>
                </div>
            </form>
          </Card>
        </TabsContent>

        <TabsContent value="contacts" className="space-y-6">
          <Card className="border-border bg-card p-6 text-card-foreground">
            <h3 className="mb-4 text-lg font-semibold">
              {t('xoAdmin.nurseryDetail.contactsTitle', { defaultValue: 'Contact and operations' })}
            </h3>
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              <DetailItem label={t('nurseries.fields.city')} value={nursery.city} />
              <DetailItem label={t('nurseries.fields.phone')} value={nursery.phone} />
              <DetailItem
                label={t('nurseries.fields.languagePref')}
                value={t(`nurseries.language.${nursery.language_pref ?? 'both'}`, { defaultValue: nursery.language_pref ?? '—' })}
              />
              <DetailItem label={t('nurseries.fields.opensAt')} value={nursery.opens_at} />
              <DetailItem label={t('nurseries.fields.closesAt')} value={nursery.closes_at} />
              <DetailItem label={t('nurseries.fields.workingDays')} value={workingDayLabels} />
            </div>
          </Card>

          <Card className="border-border bg-card p-6 text-card-foreground">
            <h3 className="mb-4 text-lg font-semibold">
              {t('xoAdmin.nurseryDetail.subscriptionTitle', { defaultValue: 'Subscription' })}
            </h3>
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <DetailItem
                label={t('nurseries.fields.subscriptionPlan')}
                value={
                  nursery.subscription_plan
                    ? t(`nurseries.plans.${nursery.subscription_plan}`, { defaultValue: nursery.subscription_plan })
                    : null
                }
              />
              <DetailItem
                label={t('nurseries.fields.subscriptionStatus')}
                value={
                  nursery.subscription_status
                    ? t(`nurseries.status.${nursery.subscription_status}`, { defaultValue: nursery.subscription_status })
                    : null
                }
              />
              <DetailItem
                label={t('nurseries.fields.pricingModel')}
                value={
                  nursery.pricing_model
                    ? t(`nurseries.pricing.${nursery.pricing_model === 'per_child' ? 'perChild' : nursery.pricing_model}`, {
                        defaultValue: nursery.pricing_model,
                      })
                    : null
                }
              />
              <DetailItem
                label={t('xoAdmin.nurseryDetail.trialEndsAt', { defaultValue: 'Trial ends' })}
                value={nursery.trial_ends_at ? new Date(nursery.trial_ends_at).toLocaleDateString() : null}
              />
            </div>
          </Card>
        </TabsContent>

        <TabsContent value="admins" className="space-y-6">
          <Card className="border-border bg-card p-6 text-card-foreground">
            <div className="mb-4 flex items-center justify-between gap-3">
              <h3 className="text-lg font-semibold">
                {t('xoAdmin.nurseryDetail.adminsTitle', { defaultValue: 'Nursery admins' })}
              </h3>
              <div className="flex items-center gap-2">
                {usersLoading ? <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" aria-hidden /> : null}
                <Button type="button" size="sm" onClick={() => setShowAddAdmin((open) => !open)}>
                  {t('xoAdmin.nurseryDetail.addAdmin', { defaultValue: 'Add admin' })}
                </Button>
              </div>
            </div>

            {showAddAdmin ? (
              <div className="mb-4 space-y-3 rounded-lg border border-outline-variant bg-surface-container-lowest p-4">
                <div className="grid gap-3 md:grid-cols-2">
                  <Input
                    value={newAdmin.nameAr}
                    onChange={(e) => setNewAdmin((prev) => ({ ...prev, nameAr: e.target.value }))}
                    placeholder={t('xoAdmin.nurseryDetail.adminNameAr', { defaultValue: 'Admin name (Arabic)' })}
                  />
                  <Input
                    value={newAdmin.nameEn}
                    onChange={(e) => setNewAdmin((prev) => ({ ...prev, nameEn: e.target.value }))}
                    placeholder={t('xoAdmin.nurseryDetail.adminNameEn', { defaultValue: 'Admin name (English)' })}
                  />
                  <Input
                    type="email"
                    value={newAdmin.email}
                    onChange={(e) => setNewAdmin((prev) => ({ ...prev, email: e.target.value }))}
                    placeholder={t('auth.email', { defaultValue: 'Email' })}
                  />
                  <Input
                    inputMode="tel"
                    value={newAdmin.phone}
                    onChange={(e) => setNewAdmin((prev) => ({ ...prev, phone: e.target.value }))}
                    placeholder={t('nurseries.fields.phone')}
                  />
                </div>
                <p className="text-xs text-on-surface-variant">
                  {t('xoAdmin.nurseryDetail.addAdminHint', {
                    defaultValue:
                      'A branch admin account is created with a temporary password, shown once after saving.',
                  })}
                </p>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    size="sm"
                    disabled={!canSubmitNewAdmin || assignAdmin.isPending}
                    onClick={() => void submitNewAdmin()}
                  >
                    {assignAdmin.isPending
                      ? t('common.loading', { defaultValue: 'Loading...' })
                      : t('common.save', { defaultValue: 'Save' })}
                  </Button>
                  <Button type="button" size="sm" variant="outline" onClick={() => setShowAddAdmin(false)}>
                    {t('common.cancel', { defaultValue: 'Cancel' })}
                  </Button>
                </div>
              </div>
            ) : null}

            {adminUsers.length > 0 ? (
              <div className="overflow-hidden rounded-lg border border-outline-variant">
                <div className="grid grid-cols-12 gap-3 bg-surface-container px-4 py-3 text-xs font-semibold text-on-surface-variant">
                  <span className="col-span-4">{t('common.name', { defaultValue: 'Name' })}</span>
                  <span className="col-span-4">{t('auth.email', { defaultValue: 'Email' })}</span>
                  <span className="col-span-2">{t('nurseries.fields.phone')}</span>
                  <span className="col-span-2">{t('nurseries.fields.subscriptionStatus', { defaultValue: 'Status' })}</span>
                </div>
                {adminUsers.map((user) => (
                  <div
                    key={user.id}
                    className="grid grid-cols-12 gap-3 border-t border-outline-variant px-4 py-3 text-sm text-on-surface"
                  >
                    <span className="col-span-4 font-medium">{user.name_ar || user.name_en || '—'}</span>
                    <span className="col-span-4 truncate">{user.email || '—'}</span>
                    <span className="col-span-2">{user.phone || '—'}</span>
                    <span className="col-span-2">{user.status || '—'}</span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="rounded-lg border border-dashed border-outline-variant bg-surface-container-lowest p-4 text-sm text-on-surface-variant">
                {usersLoading
                  ? t('common.loading', { defaultValue: 'Loading...' })
                  : t('xoAdmin.nurseryDetail.noAdmins', { defaultValue: 'No admin users are linked to this nursery yet.' })}
              </p>
            )}
          </Card>

          <Card className="border-border bg-card p-6 text-card-foreground">
            <h3 className="mb-4 text-lg font-semibold">
              {t('xoAdmin.nurseryDetail.statsTitle', { defaultValue: 'Current usage' })}
            </h3>
            <div className="grid gap-4 md:grid-cols-3">
              <DetailItem label={t('admin.nav.children', { defaultValue: 'Children' })} value={statsLoading ? '...' : stats?.totalChildren ?? 0} />
              <DetailItem label={t('admin.nav.staff', { defaultValue: 'Staff' })} value={statsLoading ? '...' : stats?.totalStaff ?? 0} />
              <DetailItem label={t('xoAdmin.nurseryDetail.activeParents', { defaultValue: 'Active parents' })} value={statsLoading ? '...' : stats?.activeParents ?? 0} />
            </div>
          </Card>
        </TabsContent>

        <TabsContent value="danger" className="space-y-6">
          <Card className="border-border bg-card p-6 text-card-foreground">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <h3 className="text-lg font-semibold">
                  {t('xoAdmin.nurseryDetail.statusTitle', { defaultValue: 'Nursery status' })}
                </h3>
                <p className="mt-1 text-sm text-on-surface-variant">
                  {t('xoAdmin.nurseryDetail.statusCopy', {
                    defaultValue: 'Control whether this nursery is active, inactive, cancelled, or soft deleted.',
                  })}
                </p>
              </div>
              <Badge className={operationalStatus === 'active' ? 'bg-success/10 text-success' : operationalStatus === 'inactive' ? 'bg-warning/10 text-warning' : 'bg-error/10 text-error'}>
                {t(`nurseries.status.${operationalStatus}`, { defaultValue: operationalStatus })}
              </Badge>
            </div>

            <div className="mt-5 grid gap-3 md:grid-cols-4">
              {(['active', 'inactive', 'cancelled', 'deleted'] as const).map((status) => {
                const isCurrent = operationalStatus === status;
                return (
                  <Button
                    key={status}
                    type="button"
                    variant={status === 'deleted' ? 'destructive' : isCurrent ? 'default' : 'outline'}
                    disabled={isCurrent || updateNursery.isPending}
                    onClick={() => void handleOperationalStatusChange(status)}
                  >
                    {updateNursery.isPending && !isCurrent ? (
                      <Loader2 className="me-2 h-4 w-4 animate-spin" aria-hidden />
                    ) : null}
                    {t(`nurseries.status.${status}`, { defaultValue: status })}
                  </Button>
                );
              })}
            </div>
          </Card>

          <Card className="border-error/30 bg-error/5 p-6 text-card-foreground">
            <h3 className="mb-2 text-lg font-semibold text-error">
              {t('xoAdmin.nurseryDetail.dangerTitle', { defaultValue: 'Danger zone' })}
            </h3>
            <p className="max-w-3xl text-sm text-on-surface-variant">
              {t('xoAdmin.nurseryDetail.dangerCopy', {
                defaultValue:
                  'Deleted nurseries are soft deleted. Their history remains in the database, but they are hidden from signup and normal selection flows.',
              })}
            </p>
            <div className="mt-5 flex flex-wrap gap-3">
              <Button type="button" variant="outline" onClick={() => navigate(`/xo-admin/nurseries/${nurseryId}/edit`)}>
                {t('common.edit', { defaultValue: 'Edit' })}
              </Button>
              <Button type="button" variant="outline" onClick={() => navigate('/xo-admin/nurseries')}>
                {t('xoAdmin.nurseryDetail.backToList', { defaultValue: 'Back to nurseries' })}
              </Button>
            </div>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

