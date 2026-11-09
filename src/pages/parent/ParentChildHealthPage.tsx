import { useTranslation } from 'react-i18next';
import { useParams } from 'react-router-dom';

import { ChildHealthError, ChildHealthSkeleton } from '@/features/child-health/ChildHealthPageState';
import { ChildHealthProfileView } from '@/features/child-health/ChildHealthProfileView';
import { useChildHealthProfile } from '@/features/child-health/useChildHealthProfile';

/** The family's view of their child's health profile: read-only, with documents and update requests. */
export function ParentChildHealthPage() {
  const { t } = useTranslation();
  const { childId } = useParams();
  const query = useChildHealthProfile(childId);

  if (query.isPending) return <ChildHealthSkeleton />;
  if (query.isError) return <ChildHealthError error={query.error} onRetry={() => void query.refetch()} />;
  return <ChildHealthProfileView profile={query.data} back={{ to: '/parent/children', label: t('health.profile.backToChildren') }} />;
}
