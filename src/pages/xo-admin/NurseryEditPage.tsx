import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams } from 'react-router-dom';
import { toast } from 'sonner';

import { Card } from '@/components/ui/card';
import { NurseryForm, type NurseryFormValues } from '@/components/Nurseries/NurseryForm';
import { useNursery, useUpdateNursery } from '@/hooks/useNurseries';

export function NurseryEditPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();

  const { nursery, isLoading, error } = useNursery(id ?? null);
  const updateMutation = useUpdateNursery();

  const initialValues: Partial<NurseryFormValues> | undefined = useMemo(() => {
    if (!nursery) return undefined;
    return {
      nameAr: nursery.name_ar,
      nameEn: nursery.name_en,
      city: nursery.city ?? '',
      phone: nursery.phone ?? '',
      languagePref: nursery.language_pref,
      logoFileUrl: nursery.logo_url ?? '',
      opensAt: nursery.opens_at ?? '',
      closesAt: nursery.closes_at ?? '',
      workingDays: (nursery.working_days ?? []).map((d) => Number(d)),
      departments: (nursery.departments ?? ['English', 'French']).map((d) => String(d)),
      subscriptionPlan: (nursery.subscription_plan as any) ?? 'starter',
      pricingModel: (nursery.pricing_model as any) ?? 'fixed',
      baseFee: nursery.base_fee ?? '',
      perChildRate: nursery.per_child_fee ?? '',
      hourlyRate: '',
      adminNameAr: '',
      adminNameEn: '',
      adminEmail: '',
      adminPhone: '',
    };
  }, [nursery]);

  const handleSubmit = async (values: NurseryFormValues) => {
    if (!nursery) return;
    try {
      await updateMutation.mutateAsync({
        id: nursery.id,
        nameAr: values.nameAr,
        nameEn: values.nameEn,
        city: values.city,
        phone: values.phone,
        languagePref: values.languagePref,
        logoFileUrl: values.logoFileUrl ?? null,
        opensAt: values.opensAt,
        closesAt: values.closesAt,
        workingDays: values.workingDays,
        departments: values.departments,
        pricingModel: values.pricingModel,
        baseFee: values.baseFee ? Number(values.baseFee) : null,
        perChildRate: values.perChildRate ? Number(values.perChildRate) : null,
        hourlyRate: values.hourlyRate ? Number(values.hourlyRate) : null,
      });
      toast.success(t('nurseries.toasts.updateSuccess'));
      navigate(`/xo-admin/nurseries/${nursery.id}`);
    } catch {
      toast.error(t('nurseries.toasts.updateError'));
    }
  };

  if (isLoading) {
    return (
      <Card className="p-6">
        <p className="text-sm text-muted-foreground">{t('common.loading')}</p>
      </Card>
    );
  }

  if (error || !nursery) {
    return (
      <Card className="p-6">
        <p className="text-sm text-destructive">{t('nurseries.edit.error')}</p>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold">{t('nurseries.edit.title')}</h1>
        <p className="text-sm text-muted-foreground">{t('nurseries.edit.subtitle')}</p>
      </div>
      <Card className="p-6">
        <NurseryForm
          mode="edit"
          initialValues={initialValues}
          isSubmitting={updateMutation.isPending}
          onSubmit={handleSubmit}
        />
      </Card>
    </div>
  );
}

