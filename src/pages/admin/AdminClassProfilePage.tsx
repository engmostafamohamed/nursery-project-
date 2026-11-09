import { useParams } from 'react-router-dom';

import { ClassProfileError, ClassProfileSkeleton } from '@/features/classes/ClassProfilePageState';
import { ClassProfileView } from '@/features/classes/ClassProfileView';
import { useClassProfile } from '@/features/classes/useClassProfile';
import { useAdminBasePath } from '@/hooks/useAdminBasePath';

/**
 * One class as the nursery's admins see it (branch admins, managers, chain admins and XO), opened
 * from a row of the classes list: today's numbers, its children, team, activity, waiting list and
 * details. Changing the class is on its edit page.
 */
export function AdminClassProfilePage() {
  const { classId } = useParams();
  const base = useAdminBasePath();
  const query = useClassProfile(classId);

  if (query.isPending) return <ClassProfileSkeleton />;
  if (query.isError) return <ClassProfileError error={query.error} onRetry={() => void query.refetch()} listPath={`${base}/classes`} />;
  return <ClassProfileView profile={query.data} base={base} />;
}
