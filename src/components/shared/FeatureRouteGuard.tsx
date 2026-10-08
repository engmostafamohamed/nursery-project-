import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useLocation } from 'react-router-dom';

import { PageRouteSkeleton } from '@/components/shared/PageRouteSkeleton';
import { Button } from '@/components/ui/button';
import { useCan, usePermissionsReady } from '@/hooks/usePermissions';
import { featureForPath, type FeatureKey } from '@/lib/permissions';

interface FeatureRouteGuardProps {
  /** Where "back to home" goes for this area (e.g. /admin, /teacher). */
  homePath: string;
  children: ReactNode;
}

/**
 * Wraps a layout's <Outlet/>: a screen whose permission (see routeFeatures.ts) the user's role
 * doesn't grant shows a "no access" message instead of the page. The server enforces the same
 * grants, so this only keeps people from landing on screens that would fail.
 */
export function FeatureRouteGuard({ homePath, children }: FeatureRouteGuardProps) {
  const { pathname } = useLocation();
  const feature = featureForPath(pathname);
  if (!feature) return <>{children}</>;
  return (
    <FeatureCheck feature={feature} homePath={homePath}>
      {children}
    </FeatureCheck>
  );
}

function FeatureCheck({ feature, homePath, children }: FeatureRouteGuardProps & { feature: FeatureKey }) {
  const ready = usePermissionsReady();
  const allowed = useCan(feature);
  if (!ready) return <PageRouteSkeleton />;
  if (!allowed) return <NoPermission feature={feature} homePath={homePath} />;
  return <>{children}</>;
}

function NoPermission({ feature, homePath }: { feature: FeatureKey; homePath: string }) {
  const { t } = useTranslation();
  return (
    <div className="mx-auto flex max-w-md flex-col items-center gap-4 px-4 py-16 text-center" role="alert">
      <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-warning/10 text-warning">
        <span className="material-symbols-outlined text-3xl" aria-hidden>lock</span>
      </span>
      <div className="space-y-1">
        <h1 className="text-lg font-semibold text-foreground">{t('rbac.noAccess.title')}</h1>
        <p className="text-sm text-foreground-secondary">
          {t('rbac.noAccess.body', { feature: t(`rbac.features.${feature}`) })}
        </p>
      </div>
      <Button asChild variant="outline">
        <Link to={homePath}>{t('errors.goHome')}</Link>
      </Button>
    </div>
  );
}
