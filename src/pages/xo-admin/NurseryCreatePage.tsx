import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';

import { Card } from '@/components/ui/card';
import { useCreateNursery } from '@/hooks/useNurseries';
import { NurseryForm, type NurseryFormValues } from '@/components/Nurseries/NurseryForm';

export function NurseryCreatePage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const createMutation = useCreateNursery();

  const handleSubmit = async (values: NurseryFormValues) => {
    try {
      const result = await createMutation.mutateAsync({
        nameAr: values.nameAr,
        nameEn: values.nameEn,
        city: values.city,
        phone: values.phone,
        languagePref: values.languagePref,
        logoFileUrl: values.logoFileUrl ?? null,
        opensAt: values.opensAt,
        closesAt: values.closesAt,
        workingDays: values.workingDays,
        subscriptionPlan: values.subscriptionPlan,
        pricingModel: values.pricingModel,
        baseFee: values.baseFee ? Number(values.baseFee) : null,
        perChildRate: values.perChildRate ? Number(values.perChildRate) : null,
        hourlyRate: values.hourlyRate ? Number(values.hourlyRate) : null,
        adminNameAr: values.adminNameAr,
        adminNameEn: values.adminNameEn,
        adminEmail: values.adminEmail,
        adminPhone: values.adminPhone,
      });

      toast.success(t('nurseries.toasts.createSuccess'));
      navigate(`/xo-admin/nurseries/${result.nursery.id}`);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const code = (err as Error & { code?: string }).code;
      if (code === 'email_not_unique') {
        toast.error(t('nurseries.toasts.emailNotUnique'));
      } else if (code === 'email_used_by_unassigned_parent') {
        toast.error(t('nurseries.toasts.emailUsedByUnassignedParent'));
      } else if (code === 'email_used_by_existing_user') {
        toast.error(t('nurseries.toasts.emailUsedByExistingUser'));
      } else if (code === 'email_used_by_auth_account') {
        toast.error(t('nurseries.toasts.emailUsedByAuthAccount'));
      } else {
        toast.error(`${t('nurseries.toasts.createError')} ${message}`);
      }
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold">{t('nurseries.create.title')}</h1>
        <p className="text-sm text-muted-foreground">{t('nurseries.create.subtitle')}</p>
      </div>
      <Card className="p-6">
        <NurseryForm mode="create" isSubmitting={createMutation.isPending} onSubmit={handleSubmit} />
      </Card>
    </div>
  );
}

