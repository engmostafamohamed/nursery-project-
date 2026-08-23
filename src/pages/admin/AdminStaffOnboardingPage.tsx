import { useTranslation } from 'react-i18next';

import { LoadingSkeleton } from '@/components/ui/LoadingSkeleton';
import { useAuthSession } from '@/hooks/useAuthSession';
import { useUserProfile } from '@/hooks/useUserProfile';
import { StaffOnboardingWizard } from '@/features/staff-onboarding/StaffOnboardingWizard';

export function AdminStaffOnboardingPage() {
  const { t } = useTranslation();
  const { user, loading: authLoading } = useAuthSession();
  const { data: profile, isPending: profilePending } = useUserProfile(user?.id);

  if (authLoading || profilePending) {
    return (
      <div className="p-4 md:p-6">
        <LoadingSkeleton />
      </div>
    );
  }

  if (!profile?.nursery_id) {
    return <p className="text-sm text-error">{t('admin.children.missingNursery')}</p>;
  }

  return (
    <div className="space-y-6 p-4 md:p-6">
      <div>
        <h1 className="text-lg font-semibold text-on-surface">{t('staffOnboarding.pageTitle')}</h1>
        <p className="mt-1 text-sm text-on-surface-variant">{t('staffOnboarding.pageDescription')}</p>
      </div>
      <StaffOnboardingWizard />
    </div>
  );
}
