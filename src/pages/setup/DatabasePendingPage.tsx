import { useTranslation } from 'react-i18next';
import { Link, Navigate, useLocation } from 'react-router-dom';

import { Button } from '@/components/ui/button';
import { hasSessionExpiredFlag } from '@/lib/sessionExpiry';

export function DatabasePendingPage() {
  const { t } = useTranslation();
  const location = useLocation();
  const locationState = location.state as { from?: { pathname?: string; search?: string } } | null;
  const returnTo = `${locationState?.from?.pathname ?? '/'}${locationState?.from?.search ?? ''}`;

  if (hasSessionExpiredFlag()) {
    return <Navigate to="/login" replace state={{ sessionExpired: true, from: returnTo }} />;
  }

  return (
    <div className="mx-auto flex min-h-[60vh] max-w-lg flex-col items-center justify-center space-y-5 px-4 py-12 text-center">
      <div className="flex size-12 items-center justify-center rounded-full bg-error-container text-error">
        <span className="material-symbols-rounded text-3xl" aria-hidden="true">
          error
        </span>
      </div>
      <h1 className="text-xl font-semibold text-xo-navy">
        {t('setup.databasePending')}
      </h1>
      <p className="text-sm text-xo-muted">
        {t('setup.databasePendingDescription')}
      </p>
      <Button asChild variant="outline">
        <Link to="/login">{t('setup.goToLogin')}</Link>
      </Button>
    </div>
  );
}
