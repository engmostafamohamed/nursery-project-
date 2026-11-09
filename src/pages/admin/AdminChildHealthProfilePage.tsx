import { useTranslation } from 'react-i18next';
import { useLocation, useParams, useSearchParams } from 'react-router-dom';

import type { HealthBackState } from '@/features/child-health/childHealth';
import { ChildHealthError, ChildHealthSkeleton } from '@/features/child-health/ChildHealthPageState';
import { ChildHealthProfileView } from '@/features/child-health/ChildHealthProfileView';
import { useChildHealthProfile } from '@/features/child-health/useChildHealthProfile';

/**
 * The nursery's view of a child's health profile (branch admins, managers, chain admins and XO).
 * `?allergy=` points at one allergy, e.g. from the menu's allergies it is not checked against.
 */
export function AdminChildHealthProfilePage() {
  const { t } = useTranslation();
  const { childId } = useParams();
  const location = useLocation();
  const [params] = useSearchParams();
  const base = location.pathname.startsWith('/xo-admin') ? '/xo-admin/nursery' : '/admin';
  const query = useChildHealthProfile(childId);
  const state = location.state as HealthBackState;
  const back = state?.from
    ? { to: state.from, label: state.fromLabelKey ? t(state.fromLabelKey) : t('common.back') }
    : { to: `${base}/children/${childId}`, label: t('health.profile.backToRecord') };

  if (query.isPending) return <ChildHealthSkeleton />;
  if (query.isError) return <ChildHealthError error={query.error} onRetry={() => void query.refetch()} />;
  return <ChildHealthProfileView profile={query.data} back={back} highlightAllergy={params.get('allergy')} />;
}
