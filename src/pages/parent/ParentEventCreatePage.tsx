import { useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/EmptyState';
import { LoadError } from '@/components/ui/LoadError';
import { LoadingSkeleton } from '@/components/ui/LoadingSkeleton';
import { MaterialSymbol } from '@/components/ui/MaterialSymbol';
import { PageHeader } from '@/components/ui/PageHeader';
import { FamilyEventForm } from '@/features/events/FamilyEventForm';
import { useParentChildren } from '@/hooks/useParentChildren';
import { invalidateFamilyEventQueries } from '@/lib/eventCache';

/** A family tells the nursery about something for its child (an urgent event). */
export function ParentEventCreatePage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const kidsQuery = useParentChildren();

  const header = (
    <PageHeader
      icon="priority_high"
      title={t('familyEvent.pageTitle')}
      description={t('familyEvent.pageSubtitle')}
      actions={
        <Button asChild variant="outline">
          <Link to="/parent/events">
            <MaterialSymbol name="arrow_back" size="text-base" className="me-1 rtl:-scale-x-100" />
            {t('parent.events.create.back')}
          </Link>
        </Button>
      }
    />
  );

  return (
    <div className="mx-auto max-w-3xl space-y-5 pb-28">
      {header}
      {kidsQuery.isPending && kidsQuery.fetchStatus !== 'idle' ? (
        <LoadingSkeleton />
      ) : kidsQuery.isError ? (
        <LoadError message={t('familyEvent.childrenLoadError')} onRetry={() => void kidsQuery.refetch()} />
      ) : !kidsQuery.data?.length ? (
        <EmptyState icon="child_care" title={t('parent.events.create.noChildren')} description={t('familyEvent.noChildrenHint')} />
      ) : (
        <FamilyEventForm
          kids={kidsQuery.data}
          onCreated={async (eventId) => {
            toast.success(t('familyEvent.sent'), { description: t('familyEvent.sentHint') });
            await invalidateFamilyEventQueries(queryClient);
            navigate(`/parent/events/${eventId}`);
          }}
        />
      )}
    </div>
  );
}
