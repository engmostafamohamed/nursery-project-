import { Navigate, Outlet, useLocation } from 'react-router-dom';

import { PageSkeleton } from '@/components/PageSkeleton';
import { useRouteGuard } from '@/hooks/useRouteGuard';
import type { UserRole } from '@/types/user';

interface ProtectedRouteProps {
  allowedRoles: UserRole[];
}

export function ProtectedRoute({ allowedRoles }: ProtectedRouteProps) {
  const status = useRouteGuard(allowedRoles);
  const location = useLocation();
  const isPreview =
    import.meta.env.DEV &&
    new URLSearchParams(location.search).get('preview') === 'true';
  const isPreviewAllowedRoute =
    isPreview &&
    (location.pathname === '/admin' ||
      location.pathname.startsWith('/admin/') ||
      location.pathname.startsWith('/teacher') ||
      location.pathname.startsWith('/parent'));

  if (status === 'loading') {
    return <PageSkeleton />;
  }

  if (status === 'unauthenticated' || status === 'expired') {
    if (isPreviewAllowedRoute) {
      return <Outlet />;
    }
    // Carry why they landed here, and where to put them back afterwards.
    return (
      <Navigate
        to="/login"
        replace
        state={{ sessionExpired: status === 'expired', from: location.pathname + location.search }}
      />
    );
  }

  if (status === 'database') {
    return <Navigate to="/error" replace />;
  }

  if (status === 'forbidden') {
    return <Navigate to="/unauthorized" replace />;
  }

  return <Outlet />;
}
