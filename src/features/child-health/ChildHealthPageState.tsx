import { useTranslation } from 'react-i18next';

import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/EmptyState';
import { Skeleton } from '@/components/ui/skeleton';

import { healthErrorKey } from './childHealthApi';

/** The page's shape while the profile loads: the header, then the two columns. */
export function ChildHealthSkeleton() {
  return (
    <div className="mx-auto w-full max-w-7xl space-y-5" aria-busy="true">
      <Skeleton className="h-64 rounded-2xl" />
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="space-y-5">
          <Skeleton className="h-56 rounded-2xl" />
          <Skeleton className="h-40 rounded-2xl" />
        </div>
        <div className="space-y-5">
          <Skeleton className="h-64 rounded-2xl" />
          <Skeleton className="h-40 rounded-2xl" />
        </div>
      </div>
    </div>
  );
}

/** Why the profile could not be opened, and a way to try again. */
export function ChildHealthError({ error, onRetry }: { error: unknown; onRetry: () => void }) {
  const { t } = useTranslation();
  const key = healthErrorKey(error);
  return (
    <EmptyState
      icon={key.endsWith('forbidden') ? 'lock' : 'medical_services'}
      title={t('health.profile.errors.title')}
      description={t(key)}
      action={key.endsWith('forbidden') ? undefined : <Button type="button" onClick={onRetry}>{t('common.retry')}</Button>}
    />
  );
}
