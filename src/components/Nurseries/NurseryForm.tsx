import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Checkbox } from '@/components/ui/checkbox';
import { Select } from '@/components/ui/select';
import { supabase } from '@/lib/supabase';
import type { PricingModel, SubscriptionPlan } from '@/types/nursery';

const workingDayOptions = [
  { value: 0, key: 'sun' },
  { value: 1, key: 'mon' },
  { value: 2, key: 'tue' },
  { value: 3, key: 'wed' },
  { value: 4, key: 'thu' },
  { value: 6, key: 'sat' },
];

const stepFields = [
  ['nameAr', 'nameEn', 'city', 'phone', 'languagePref', 'logoFileUrl'],
  ['opensAt', 'closesAt', 'workingDays', 'departments', 'subscriptionPlan', 'pricingModel', 'baseFee', 'perChildRate', 'hourlyRate'],
  ['adminNameAr', 'adminNameEn', 'adminEmail', 'adminPhone'],
] as const satisfies readonly (readonly (keyof NurseryFormValues)[])[];

const digitsAndPlus = (value: string) => {
  const cleaned = value.replace(/[^\d+]/g, '');
  return cleaned.startsWith('+') ? `+${cleaned.slice(1).replace(/\+/g, '')}` : cleaned.replace(/\+/g, '');
};

const handlePhoneInput = (event: FormEvent<HTMLInputElement>) => {
  const value = event.currentTarget.value;
  const nextValue = digitsAndPlus(value);
  if (value !== nextValue) event.currentTarget.value = nextValue;
};

const phoneInputProps = {
  type: 'tel',
  inputMode: 'tel' as const,
  autoComplete: 'tel',
  onInput: handlePhoneInput,
};

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
type EmailAvailability =
  | { status: 'idle' }
  | { status: 'checking' }
  | { status: 'available' }
  | { status: 'used'; message: string }
  | { status: 'error'; message: string };

type EmailAvailabilityResponse = {
  available?: boolean;
  reason?: 'email_used_by_unassigned_parent' | 'email_used_by_existing_user' | 'email_used_by_auth_account' | 'email_required';
  error?: string;
};

const emailAvailabilityMessageByReason: Record<Exclude<EmailAvailabilityResponse['reason'], undefined>, string> = {
  email_required: 'nurseries.validation.emailInvalid',
  email_used_by_unassigned_parent: 'nurseries.validation.emailUsedByUnassignedParent',
  email_used_by_existing_user: 'nurseries.validation.emailUsedByExistingUser',
  email_used_by_auth_account: 'nurseries.validation.emailUsedByAuthAccount',
};

const baseSchema = z.object({
  nameAr: z.string().min(1, 'nurseries.validation.required'),
  nameEn: z.string().min(1, 'nurseries.validation.required'),
  city: z.string().min(1, 'nurseries.validation.required'),
  phone: z.string().min(1, 'nurseries.validation.phoneRequired'),
  languagePref: z.enum(['ar', 'en', 'both']),
  logoFileUrl: z
    .string()
    .optional()
    .nullable()
    .refine((value) => !value?.trim() || /^https?:\/\/.+/i.test(value.trim()), 'nurseries.validation.logoUrlInvalid'),
  opensAt: z.string().min(1, 'nurseries.validation.opensAtRequired'),
  closesAt: z.string().min(1, 'nurseries.validation.closesAtRequired'),
  workingDays: z.array(z.number().min(0).max(6)).min(1, 'nurseries.validation.workingDaysRequired'),
  // Feeds the parent signup form's department dropdown, so at least one is required.
  departments: z.array(z.string().min(1)).min(1, 'nurseries.validation.departmentsRequired'),
  subscriptionPlan: z.enum(['starter', 'professional', 'enterprise']),
  pricingModel: z.enum(['fixed', 'per_child', 'hourly', 'hybrid']),
  baseFee: z.string().optional().nullable(),
  perChildRate: z.string().optional().nullable(),
  hourlyRate: z.string().optional().nullable(),
  adminNameAr: z.string().min(1, 'nurseries.validation.required'),
  adminNameEn: z.string().min(1, 'nurseries.validation.required'),
  adminEmail: z.string().email('nurseries.validation.emailInvalid'),
  adminPhone: z.string().min(1, 'nurseries.validation.phoneRequired'),
});

export type NurseryFormValues = z.infer<typeof baseSchema>;

export interface NurseryFormProps {
  mode: 'create' | 'edit';
  initialValues?: Partial<NurseryFormValues>;
  isSubmitting: boolean;
  onSubmit(values: NurseryFormValues): void;
}

export function NurseryForm({ mode, initialValues, isSubmitting, onSubmit }: NurseryFormProps) {
  const { t, i18n } = useTranslation();
  const [step, setStep] = useState(0);
  const [adminEmailAvailability, setAdminEmailAvailability] = useState<EmailAvailability>({ status: 'idle' });

  const form = useForm<NurseryFormValues>({
    resolver: zodResolver(
      baseSchema.superRefine((data, ctx) => {
        if (data.opensAt && data.closesAt && data.opensAt >= data.closesAt) {
          ctx.addIssue({
            code: 'custom',
            path: ['closesAt'],
            message: 'nurseries.validation.opensBeforeCloses',
          });
        }

        const phoneDigits = data.phone.replace(/\s/g, '');
        if (!/^0\d{10}$/.test(phoneDigits) && !/^\+20\d{9}$/.test(phoneDigits)) {
          ctx.addIssue({
            code: 'custom',
            path: ['phone'],
            message: 'nurseries.validation.invalidPhone',
          });
        }

        const adminPhoneDigits = data.adminPhone.replace(/\s/g, '');
        if (!/^0\d{10}$/.test(adminPhoneDigits) && !/^\+20\d{9}$/.test(adminPhoneDigits)) {
          ctx.addIssue({
            code: 'custom',
            path: ['adminPhone'],
            message: 'nurseries.validation.invalidPhone',
          });
        }

        const pricing = data.pricingModel;
        const base = Number(data.baseFee || '0');
        const perChild = Number(data.perChildRate || '0');
        const hourly = Number(data.hourlyRate || '0');

        if ((pricing === 'fixed' || pricing === 'hybrid') && (!Number.isFinite(base) || base <= 0)) {
          ctx.addIssue({
            code: 'custom',
            path: ['baseFee'],
            message: 'nurseries.validation.baseFeeRequired',
          });
        }
        if ((pricing === 'per_child' || pricing === 'hybrid') && (!Number.isFinite(perChild) || perChild <= 0)) {
          ctx.addIssue({
            code: 'custom',
            path: ['perChildRate'],
            message: 'nurseries.validation.perChildRequired',
          });
        }
        if ((pricing === 'hourly' || pricing === 'hybrid') && (!Number.isFinite(hourly) || hourly <= 0)) {
          ctx.addIssue({
            code: 'custom',
            path: ['hourlyRate'],
            message: 'nurseries.validation.hourlyRequired',
          });
        }
      }),
    ),
    defaultValues: {
      nameAr: '',
      nameEn: '',
      city: '',
      phone: '',
      languagePref: 'ar',
      logoFileUrl: null,
      opensAt: '',
      closesAt: '',
      workingDays: [],
      departments: ['English', 'French'],
      subscriptionPlan: 'starter',
      pricingModel: 'fixed',
      baseFee: '',
      perChildRate: '',
      hourlyRate: '',
      adminNameAr: '',
      adminNameEn: '',
      adminEmail: '',
      adminPhone: '',
      ...initialValues,
    },
    mode: 'onChange',
  });

  const values = form.watch();
  const [departmentDraft, setDepartmentDraft] = useState('');

  const addDepartment = () => {
    const next = departmentDraft.trim();
    if (!next) return;
    const current = form.getValues('departments');
    if (!current.some((d) => d.toLowerCase() === next.toLowerCase())) {
      form.setValue('departments', [...current, next], { shouldDirty: true, shouldValidate: true });
    }
    setDepartmentDraft('');
  };
  const locale = i18n.language.startsWith('ar') ? 'ar-EG' : 'en-US';

  useEffect(() => {
    if (mode !== 'create') {
      setAdminEmailAvailability({ status: 'idle' });
      return;
    }

    const email = values.adminEmail.trim().toLowerCase();
    if (!email || !emailPattern.test(email)) {
      setAdminEmailAvailability({ status: 'idle' });
      return;
    }

    setAdminEmailAvailability({ status: 'checking' });
    let cancelled = false;
    const timer = window.setTimeout(async () => {
      const { data, error } = await supabase.functions.invoke('xo-check-admin-email', { body: { email } });

      if (cancelled) return;
      if (error) {
        setAdminEmailAvailability({ status: 'error', message: 'nurseries.validation.emailCheckError' });
        return;
      }
      const result = data as EmailAvailabilityResponse | null;
      if (result?.available) {
        setAdminEmailAvailability({ status: 'available' });
        return;
      }

      setAdminEmailAvailability({
        status: 'used',
        message: result?.reason
          ? emailAvailabilityMessageByReason[result.reason]
          : 'nurseries.validation.emailUsedByExistingUser',
      });
    }, 450);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [mode, values.adminEmail]);

  const currentStepFields = stepFields[step] ?? [];
  const hasCurrentStepErrors = currentStepFields.some((field) => Boolean(form.formState.errors[field]));
  const isCurrentStepComplete = useMemo(() => {
    if (step === 0) {
      return Boolean(
        values.nameAr.trim() &&
          values.nameEn.trim() &&
          values.city.trim() &&
          values.phone.trim() &&
          !hasCurrentStepErrors,
      );
    }
    if (step === 1) {
      const needsBase = values.pricingModel === 'fixed' || values.pricingModel === 'hybrid';
      const needsPerChild = values.pricingModel === 'per_child' || values.pricingModel === 'hybrid';
      const needsHourly = values.pricingModel === 'hourly' || values.pricingModel === 'hybrid';
      return Boolean(
        values.opensAt &&
          values.closesAt &&
          values.workingDays.length > 0 &&
          values.departments.length > 0 &&
          (!needsBase || values.baseFee) &&
          (!needsPerChild || values.perChildRate) &&
          (!needsHourly || values.hourlyRate) &&
          !hasCurrentStepErrors,
      );
    }
    if (step === 2) {
      return Boolean(
        values.adminNameAr.trim() &&
          values.adminNameEn.trim() &&
          values.adminEmail.trim() &&
          values.adminPhone.trim() &&
          (mode !== 'create' || adminEmailAvailability.status === 'available' || adminEmailAvailability.status === 'error') &&
          !hasCurrentStepErrors,
      );
    }
    return true;
  }, [adminEmailAvailability.status, hasCurrentStepErrors, mode, step, values]);

  const goNext = async () => {
    const fields = stepFields[step];
    if (fields) {
      const valid = await form.trigger(fields);
      if (!valid) return;
    }
    setStep((s) => Math.min(s + 1, 3));
  };
  const goPrev = () => setStep((s) => Math.max(s - 1, 0));

  const handleSubmit = form.handleSubmit((data) => {
    onSubmit(data);
  });

  const notProvided = t('nurseries.review.notProvided');
  const formatMoney = (value?: string | null) => {
    const number = Number(value || '0');
    if (!Number.isFinite(number) || number <= 0) return notProvided;
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency: 'EGP',
      maximumFractionDigits: 2,
    }).format(number);
  };
  const pricingLabel = (model: PricingModel) => {
    if (model === 'per_child') return t('nurseries.pricing.perChild');
    return t(`nurseries.pricing.${model}`);
  };
  const workingDaysLabel = values.workingDays
    .slice()
    .sort((a, b) => a - b)
    .map((day) => t(`staffOnboarding.weekdays.${day}`))
    .join(', ');

  const renderStep = () => {
    if (step === 0) {
      return (
        <div className="space-y-4">
          <div>
            <Label htmlFor="nameAr">{t('nurseries.fields.nameAr')}</Label>
            <Input id="nameAr" {...form.register('nameAr')} />
            <FieldError error={form.formState.errors.nameAr?.message} />
          </div>
          <div>
            <Label htmlFor="nameEn">{t('nurseries.fields.nameEn')}</Label>
            <Input id="nameEn" {...form.register('nameEn')} />
            <FieldError error={form.formState.errors.nameEn?.message} />
          </div>
          <div>
            <Label htmlFor="city">{t('nurseries.fields.city')}</Label>
            <Input id="city" {...form.register('city')} />
            <FieldError error={form.formState.errors.city?.message} />
          </div>
          <div>
            <Label htmlFor="phone">{t('nurseries.fields.phone')}</Label>
            <Input id="phone" {...phoneInputProps} {...form.register('phone')} />
            <FieldError error={form.formState.errors.phone?.message} />
          </div>
          <div>
            <Label>{t('nurseries.fields.languagePref')}</Label>
            <RadioGroup
              value={values.languagePref}
              onValueChange={(v) => form.setValue('languagePref', v as 'ar' | 'en' | 'both')}
              className="flex gap-4"
            >
              <RadioItem value="ar" label={t('nurseries.language.ar')} />
              <RadioItem value="en" label={t('nurseries.language.en')} />
              <RadioItem value="both" label={t('nurseries.language.both')} />
            </RadioGroup>
          </div>
          <div>
            <Label htmlFor="logo">{t('nurseries.fields.logo')}</Label>
            <Input
              id="logo"
              type="url"
              placeholder={t('nurseries.fields.logoPlaceholder')}
              {...form.register('logoFileUrl')}
            />
            <FieldError error={form.formState.errors.logoFileUrl?.message} />
          </div>
        </div>
      );
    }

    if (step === 1) {
      return (
        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="opensAt">{t('nurseries.fields.opensAt')}</Label>
              <Input id="opensAt" type="time" {...form.register('opensAt')} />
              <FieldError error={form.formState.errors.opensAt?.message} />
            </div>
            <div>
              <Label htmlFor="closesAt">{t('nurseries.fields.closesAt')}</Label>
              <Input id="closesAt" type="time" {...form.register('closesAt')} />
              <FieldError error={form.formState.errors.closesAt?.message} />
            </div>
          </div>

          <div>
            <Label>{t('nurseries.fields.workingDays')}</Label>
            <div className="mt-2 grid grid-cols-3 gap-2">
              {workingDayOptions.map((opt) => {
                const checked = values.workingDays.includes(opt.value);
                return (
                  <label
                    key={opt.value}
                    className="flex cursor-pointer items-center gap-2 rounded-md border border-outline-variant px-2 py-1 text-sm"
                  >
                    <Checkbox
                      checked={checked}
                      onCheckedChange={(v) => {
                        const isChecked = Boolean(v);
                        const current = values.workingDays;
                        if (isChecked && !current.includes(opt.value)) {
                          form.setValue('workingDays', [...current, opt.value], { shouldDirty: true, shouldValidate: true });
                        } else if (!isChecked) {
                          form.setValue(
                            'workingDays',
                            current.filter((d) => d !== opt.value),
                            { shouldDirty: true, shouldValidate: true },
                          );
                        }
                      }}
                    />
                    <span>{t(`staffOnboarding.weekdays.${opt.value}`)}</span>
                  </label>
                );
              })}
            </div>
            <FieldError error={form.formState.errors.workingDays?.message} />
          </div>

          {/* Drives the department dropdown parents see when they pick this nursery. */}
          <div>
            <Label>{t('nurseries.fields.departments')}</Label>
            <div className="mt-2 flex flex-wrap gap-2">
              {values.departments.map((dept) => (
                <span
                  key={dept}
                  className="flex items-center gap-1 rounded-full border border-outline-variant bg-surface-container px-3 py-1 text-sm"
                >
                  {dept}
                  <button
                    type="button"
                    aria-label={`${t('common.remove', { defaultValue: 'Remove' })} ${dept}`}
                    className="text-on-surface-variant hover:text-error"
                    onClick={() =>
                      form.setValue(
                        'departments',
                        values.departments.filter((d) => d !== dept),
                        { shouldDirty: true, shouldValidate: true },
                      )
                    }
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>
            <div className="mt-2 flex gap-2">
              <Input
                value={departmentDraft}
                onChange={(e) => setDepartmentDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    addDepartment();
                  }
                }}
                placeholder={t('nurseries.fields.departmentsPlaceholder')}
              />
              <Button type="button" variant="outline" onClick={addDepartment} disabled={!departmentDraft.trim()}>
                {t('common.add', { defaultValue: 'Add' })}
              </Button>
            </div>
            <p className="mt-1 text-xs text-on-surface-variant">{t('nurseries.fields.departmentsHint')}</p>
            <FieldError error={form.formState.errors.departments?.message} />
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <Label>{t('nurseries.fields.subscriptionPlan')}</Label>
              <Select
                value={values.subscriptionPlan}
                onChange={(e) => form.setValue('subscriptionPlan', e.target.value as SubscriptionPlan)}
              >
                <option value="starter">{t('nurseries.plans.starter')}</option>
                <option value="professional">{t('nurseries.plans.professional')}</option>
                <option value="enterprise">{t('nurseries.plans.enterprise')}</option>
              </Select>
            </div>
            <div>
              <Label>{t('nurseries.fields.pricingModel')}</Label>
              <Select
                value={values.pricingModel}
                onChange={(e) => form.setValue('pricingModel', e.target.value as PricingModel)}
              >
                <option value="fixed">{t('nurseries.pricing.fixed')}</option>
                <option value="per_child">{t('nurseries.pricing.perChild')}</option>
                <option value="hourly">{t('nurseries.pricing.hourly')}</option>
                <option value="hybrid">{t('nurseries.pricing.hybrid')}</option>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            {(values.pricingModel === 'fixed' || values.pricingModel === 'hybrid') && (
              <div>
                <Label htmlFor="baseFee">{t('nurseries.fields.baseFee')}</Label>
                <Input id="baseFee" type="number" step="0.01" {...form.register('baseFee')} />
                <FieldError error={form.formState.errors.baseFee?.message} />
              </div>
            )}
            {(values.pricingModel === 'per_child' || values.pricingModel === 'hybrid') && (
              <div>
                <Label htmlFor="perChildRate">{t('nurseries.fields.perChildRate')}</Label>
                <Input id="perChildRate" type="number" step="0.01" {...form.register('perChildRate')} />
                <FieldError error={form.formState.errors.perChildRate?.message} />
              </div>
            )}
            {(values.pricingModel === 'hourly' || values.pricingModel === 'hybrid') && (
              <div>
                <Label htmlFor="hourlyRate">{t('nurseries.fields.hourlyRate')}</Label>
                <Input id="hourlyRate" type="number" step="0.01" {...form.register('hourlyRate')} />
                <FieldError error={form.formState.errors.hourlyRate?.message} />
              </div>
            )}
          </div>
        </div>
      );
    }

    if (step === 2) {
      return (
        <div className="space-y-4">
          <div>
            <Label htmlFor="adminNameAr">{t('nurseries.fields.adminNameAr')}</Label>
            <Input id="adminNameAr" {...form.register('adminNameAr')} />
            <FieldError error={form.formState.errors.adminNameAr?.message} />
          </div>
          <div>
            <Label htmlFor="adminNameEn">{t('nurseries.fields.adminNameEn')}</Label>
            <Input id="adminNameEn" {...form.register('adminNameEn')} />
            <FieldError error={form.formState.errors.adminNameEn?.message} />
          </div>
          <div>
            <Label htmlFor="adminEmail">{t('nurseries.fields.adminEmail')}</Label>
            <Input id="adminEmail" type="email" {...form.register('adminEmail')} />
            <FieldError error={form.formState.errors.adminEmail?.message} />
            {mode === 'create' && !form.formState.errors.adminEmail ? (
              <EmailAvailabilityMessage availability={adminEmailAvailability} />
            ) : null}
          </div>
          <div>
            <Label htmlFor="adminPhone">{t('nurseries.fields.adminPhone')}</Label>
            <Input id="adminPhone" {...phoneInputProps} {...form.register('adminPhone')} />
            <FieldError error={form.formState.errors.adminPhone?.message} />
          </div>
          <p className="text-xs text-muted-foreground">
            {t('nurseries.copy.adminPasswordHint')}
          </p>
        </div>
      );
    }

    return (
      <div className="space-y-6" aria-label={t('nurseries.review.ariaLabel')}>
        <div className="border-b border-outline-variant pb-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-primary">
            {t('nurseries.review.title')}
          </p>
          <h2 className="mt-1 text-2xl font-semibold text-on-surface">{values.nameAr || values.nameEn}</h2>
          <p className="mt-2 max-w-2xl text-sm text-on-surface-variant">{t('nurseries.review.subtitle')}</p>
        </div>

        <div className="grid gap-5 lg:grid-cols-2">
          <ReviewSection title={t('nurseries.review.sections.identity')}>
            <ReviewRow label={t('nurseries.fields.nameAr')} value={values.nameAr} />
            <ReviewRow label={t('nurseries.fields.nameEn')} value={values.nameEn} />
            <ReviewRow label={t('nurseries.fields.city')} value={values.city} />
            <ReviewRow label={t('nurseries.fields.phone')} value={values.phone} />
            <ReviewRow label={t('nurseries.fields.languagePref')} value={t(`nurseries.language.${values.languagePref}`)} />
            <ReviewRow
              label={t('nurseries.fields.logo')}
              value={values.logoFileUrl?.trim() ? values.logoFileUrl.trim() : notProvided}
              mono={Boolean(values.logoFileUrl?.trim())}
            />
          </ReviewSection>

          <ReviewSection title={t('nurseries.review.sections.schedule')}>
            <ReviewRow label={t('nurseries.fields.opensAt')} value={values.opensAt} />
            <ReviewRow label={t('nurseries.fields.closesAt')} value={values.closesAt} />
            <ReviewRow label={t('nurseries.fields.workingDays')} value={workingDaysLabel || notProvided} />
            <div className="pt-1">
              <p className="text-xs font-medium text-on-surface-variant">{t('nurseries.review.daysSelected')}</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {values.workingDays
                  .slice()
                  .sort((a, b) => a - b)
                  .map((day) => (
                    <span
                      key={day}
                      className="rounded-full border border-outline-variant px-3 py-1 text-xs font-medium text-on-surface"
                    >
                      {t(`staffOnboarding.weekdays.${day}`)}
                    </span>
                  ))}
              </div>
            </div>
          </ReviewSection>

          <ReviewSection title={t('nurseries.review.sections.billing')}>
            <ReviewRow label={t('nurseries.fields.subscriptionPlan')} value={t(`nurseries.plans.${values.subscriptionPlan}`)} />
            <ReviewRow label={t('nurseries.fields.pricingModel')} value={pricingLabel(values.pricingModel)} />
            <ReviewRow label={t('nurseries.fields.baseFee')} value={formatMoney(values.baseFee)} />
            <ReviewRow label={t('nurseries.fields.perChildRate')} value={formatMoney(values.perChildRate)} />
            <ReviewRow label={t('nurseries.fields.hourlyRate')} value={formatMoney(values.hourlyRate)} />
          </ReviewSection>

          <ReviewSection title={t('nurseries.review.sections.admin')}>
            <ReviewRow label={t('nurseries.fields.adminNameAr')} value={values.adminNameAr} />
            <ReviewRow label={t('nurseries.fields.adminNameEn')} value={values.adminNameEn} />
            <ReviewRow label={t('nurseries.fields.adminEmail')} value={values.adminEmail} />
            <ReviewRow label={t('nurseries.fields.adminPhone')} value={values.adminPhone} />
            <p className="rounded-md border border-outline-variant px-3 py-2 text-xs text-on-surface-variant">
              {t('nurseries.copy.adminPasswordHint')}
            </p>
          </ReviewSection>
        </div>

        <div className="flex flex-col gap-2 border-t border-outline-variant pt-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-semibold text-on-surface">{t('nurseries.review.readyTitle')}</p>
            <p className="text-sm text-on-surface-variant">{t('nurseries.review.hint')}</p>
          </div>
          <p className="text-xs text-on-surface-variant">{t('nurseries.review.finalCheck')}</p>
        </div>
      </div>
    );
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {renderStep()}
      <div className="flex items-center justify-between">
        <Button type="button" variant="outline" onClick={goPrev} disabled={step === 0 || isSubmitting}>
          {t('common.previous')}
        </Button>
        <div className="space-x-2">
          {step < 3 && (
            <Button type="button" onClick={() => void goNext()} disabled={isSubmitting || !isCurrentStepComplete}>
              {t('common.next')}
            </Button>
          )}
          {step === 3 && (
            <Button type="submit" disabled={isSubmitting}>
              {mode === 'create' ? t('nurseries.actions.create') : t('nurseries.actions.save')}
            </Button>
          )}
        </div>
      </div>
    </form>
  );
}

function FieldError({ error }: { error?: string }) {
  const { t } = useTranslation();
  if (!error) return null;
  return <p className="mt-1 text-xs text-destructive">{t(error)}</p>;
}

function EmailAvailabilityMessage({ availability }: { availability: EmailAvailability }) {
  const { t } = useTranslation();
  if (availability.status === 'idle') return null;
  if (availability.status === 'checking') {
    return <p className="mt-1 text-xs text-on-surface-variant">{t('nurseries.validation.emailChecking')}</p>;
  }
  if (availability.status === 'available') {
    return <p className="mt-1 text-xs text-emerald-500">{t('nurseries.validation.emailAvailable')}</p>;
  }
  return <p className="mt-1 text-xs text-destructive">{t(availability.message)}</p>;
}

function ReviewSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-3 rounded-lg border border-outline-variant p-4">
      <h3 className="text-sm font-semibold text-on-surface">{title}</h3>
      <div className="space-y-3">{children}</div>
    </section>
  );
}

function ReviewRow({ label, value, mono = false }: { label: string; value?: string | null; mono?: boolean }) {
  return (
    <div className="grid gap-1 border-b border-outline-variant/60 pb-2 last:border-b-0 last:pb-0 sm:grid-cols-[minmax(120px,180px)_1fr]">
      <p className="text-xs font-medium text-on-surface-variant">{label}</p>
      <p className={`break-words text-sm font-medium text-on-surface ${mono ? 'font-mono text-xs' : ''}`}>
        {value?.trim() || '-'}
      </p>
    </div>
  );
}

function RadioItem({ value, label }: { value: string; label: string }) {
  return (
    <label className="flex cursor-pointer items-center gap-2 rounded-md border border-outline-variant px-3 py-1 text-sm">
      <RadioGroupItem value={value} />
      <span>{label}</span>
    </label>
  );
}

