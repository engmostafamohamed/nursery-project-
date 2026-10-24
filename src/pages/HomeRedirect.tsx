import { useTranslation } from 'react-i18next';
import { Navigate } from 'react-router-dom';

import { PageSkeleton } from '@/components/PageSkeleton';
import { usePermissionMatrix } from '@/hooks/usePermissionMatrix';
import { useSessionProfile } from '@/hooks/useSessionProfile';

export function HomeRedirect() {
  const { t } = useTranslation();
  const { status, profile } = useSessionProfile();
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

  // A teacher with no role_id uses the default teacher grants (see user_can): there is no matrix
  // to wait for, and the disabled query would stay pending forever.
  const waitingForMatrix = profile?.role === 'teacher' && Boolean(profile.role_id) && matrix.isPending;

  // An expired token keeps this on 'loading' until it is refreshed or the session ends.
  if (status === 'loading' || waitingForMatrix) {
    return <PageSkeleton />;
  }

  if (status === 'unauthenticated') {
    return <Navigate to="/login" replace />;
  }

  if (status === 'database') {
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
