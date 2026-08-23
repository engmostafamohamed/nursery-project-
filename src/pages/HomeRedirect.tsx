import { useTranslation } from 'react-i18next';
import { Navigate } from 'react-router-dom';

import { PageSkeleton } from '@/components/PageSkeleton';
import { useAuthSession } from '@/hooks/useAuthSession';
import { usePermissionMatrix } from '@/hooks/usePermissionMatrix';
import { useUserProfile } from '@/hooks/useUserProfile';
import { isAuthSessionError } from '@/lib/authErrors';

export function HomeRedirect() {
  const { t } = useTranslation();
  const { session, loading: sessionLoading } = useAuthSession();
  const userId = session?.user?.id;
  const { data: profile, isPending, isError, error } = useUserProfile(userId);
  // For hybrid teacher roles (e.g. "Manager Teacher") whose base_role is
  // teacher but whose custom feature set includes admin-tier features like
  // `staff_onboarding`, route them to /admin instead of /teacher so they can
  // actually use the management features they were granted.
  const matrix = usePermissionMatrix(profile?.role_id ?? null);
  const teacherHasAdminFeatures = Boolean(
    profile?.role === 'teacher' &&
      matrix.data &&
      (matrix.data.get('staff_onboarding')?.actions.has('view') ||
        matrix.data.get('staff')?.actions.has('view')),
  );

  if (sessionLoading || (session && isPending) || (profile?.role === 'teacher' && matrix.isPending)) {
    return <PageSkeleton />;
  }

  if (!session) {
    return <Navigate to="/login" replace />;
  }

  // An expired token fails this fetch too; that is a sign-in problem, not a database one.
  if (isError && isAuthSessionError(error)) {
    return <Navigate to="/login" replace />;
  }

  if (isError || !profile) {
    return <Navigate to="/error" replace />;
  }

  switch (profile.role) {
    case 'xo_super_admin':
      return <Navigate to="/xo-admin" replace />;
    case 'chain_super_admin':
    case 'branch_admin':
      if (!profile.onboarding_completed) {
        return <Navigate to="/admin/onboarding" replace />;
      }
      return <Navigate to="/admin" replace />;
    case 'manager':
      return <Navigate to="/admin" replace />;
    case 'teacher':
      return <Navigate to={teacherHasAdminFeatures ? '/admin' : '/teacher'} replace />;
    case 'parent':
      return <Navigate to="/parent" replace />;
    default:
      return (
        <div className="p-6 text-center text-sm text-xo-danger">
          {t('errors.unauthorized')}
        </div>
      );
  }
}
