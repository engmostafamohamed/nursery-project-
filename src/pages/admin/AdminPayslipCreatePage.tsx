import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';

import { PayslipForm } from '@/components/admin/PayslipForm';
import { useAuthSession } from '@/hooks/useAuthSession';
import { usePayroll } from '@/hooks/usePayroll';
import { useStaff } from '@/hooks/useStaff';
import { useUserProfile } from '@/hooks/useUserProfile';

export function AdminPayslipCreatePage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { user } = useAuthSession();
  const { data: profile } = useUserProfile(user?.id);
  const staff = useStaff(profile?.nursery_id ?? undefined);
  const payroll = usePayroll(profile?.nursery_id ?? undefined);

  const options = useMemo(
    () =>
      staff.staff
        .filter((s) => s.hasStaffProfile)
        .map((s) => ({
          id: String(s.id),
          userId: String(s.user_id),
          name: String(
            (s.user as Record<string, unknown> | null)?.full_name_ar ??
              (s.user as Record<string, unknown> | null)?.full_name_en ??
              s.employee_id,
          ),
          baseSalary: Number(s.salary_amount ?? 0),
        })),
    [staff.staff],
  );

  if (!profile?.nursery_id) return null;

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <h1 className="text-lg font-semibold text-on-surface">{t('payroll.generatePayslip')}</h1>
      <PayslipForm
        staffOptions={options}
        nurseryId={profile.nursery_id}
        createdBy={user?.id}
        onSubmit={async (payload) => {
          await payroll.createPayslip(payload);
          const staffName = options.find((o) => o.id === payload.staff_id)?.name ?? t('common.staff');
          toast.success(t('payroll.createdToast', { name: staffName }));
          navigate('/admin/staff/payroll');
        }}
      />
    </div>
  );
}
