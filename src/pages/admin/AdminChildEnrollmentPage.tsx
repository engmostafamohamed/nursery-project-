import { useTranslation } from 'react-i18next';

import { ActionGate } from '@/components/shared/ActionGate';
import { LoadingSkeleton } from '@/components/ui/LoadingSkeleton';
import { PageHeader } from '@/components/ui/PageHeader';
import { ChildEnrollmentWizard } from '@/features/child-enrollment/ChildEnrollmentWizard';
import { useAuthSession } from '@/hooks/useAuthSession';
import { useUserProfile } from '@/hooks/useUserProfile';

/** Adding a child to a family that already has an account, with the application's own steps. */
export function AdminChildEnrollmentPage() {
  const { t } = useTranslation();
  const { user, loading: authLoading } = useAuthSession();
  const { data: profile, isPending: profilePending } = useUserProfile(user?.id);

  if (authLoading || profilePending) return <LoadingSkeleton />;
  if (!profile?.nursery_id) {
    return <p className="text-sm text-error">{t('admin.children.missingNursery')}</p>;
  }

  return (
    <div className="space-y-5">
      <PageHeader icon="person_add" title={t('childEnrollment.pageTitle')} description={t('childEnrollment.pageDescription')} />
      <ActionGate
        feature="child_enrollment"
        action="create"
        fallback={<p className="text-sm text-on-surface-variant">{t('childEnrollment.noCreatePermission')}</p>}
      >
        <ChildEnrollmentWizard nurseryId={profile.nursery_id} />
      </ActionGate>
    </div>
  );
}
