import { Navigate, Outlet, useLocation } from 'react-router-dom';

import { PageSkeleton } from '@/components/PageSkeleton';
import { useAuthSession } from '@/hooks/useAuthSession';
import { useRouteGuard } from '@/hooks/useRouteGuard';
import { mustChangePassword } from '@/lib/passwordReset';
import type { UserRole } from '@/types/user';

interface ProtectedRouteProps {
  allowedRoles: UserRole[];
}

export function ProtectedRoute({ allowedRoles }: ProtectedRouteProps) {
  const status = useRouteGuard(allowedRoles);
  const { user } = useAuthSession();
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

  if (status === 'unauthenticated') {
    if (isPreviewAllowedRoute) {
      return <Outlet />;
    }
    // Carry where to put them back afterwards. Why they landed here (an expired session) is
    // left by sessionExpiry for the sign-in page.
    return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />;
  }

  if (status === 'database') {
    return <Navigate to="/error" replace />;
  }

  // Signed in with a first password someone else gave them: they choose their own first.
  if (mustChangePassword(user)) {
    return <Navigate to="/reset-password" replace />;
  }

  if (status === 'forbidden') {
    // Just signed in and sent back to a page this account may not open: they never asked for it.
    const afterSignIn = (location.state as { afterSignIn?: boolean } | null)?.afterSignIn === true;
    return <Navigate to={afterSignIn ? '/' : '/unauthorized'} replace />;
  }

  return <Outlet />;
}
