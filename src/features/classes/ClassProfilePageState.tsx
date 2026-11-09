import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';

import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/EmptyState';
import { Skeleton } from '@/components/ui/skeleton';

import { classProfileErrorKey } from './classProfileApi';

/** The page's shape while the class loads: the header with today's numbers, the tabs, the list. */
export function ClassProfileSkeleton() {
  return (
    <div className="space-y-5 pb-8" aria-busy="true">
      <Skeleton className="h-5 w-28 rounded-full" />
      <Skeleton className="h-72 rounded-xl" />
      <Skeleton className="h-10 w-full max-w-xl rounded-full" />
      <Skeleton className="h-96 rounded-xl" />
    </div>
  );
}

/** Why the class could not be opened: gone, not this reader's, or a failed read worth retrying. */
export function ClassProfileError({ error, onRetry, listPath }: { error: unknown; onRetry: () => void; listPath: string }) {
  const { t } = useTranslation();
  const key = classProfileErrorKey(error);
  const retryable = key.endsWith('network') || key.endsWith('failed');
  return (
    <EmptyState
      icon={key.endsWith('forbidden') ? 'lock' : key.endsWith('notFound') ? 'search_off' : 'error'}
      title={t('classProfile.errors.title')}
      description={t(key)}
      action={
        retryable ? (
          <Button type="button" onClick={onRetry}>{t('common.retry')}</Button>
        ) : (
          <Button asChild variant="outline">
            <Link to={listPath}>{t('classProfile.backToClasses')}</Link>
          </Button>
        )
      }
    />
  );
}
