import { useParams } from 'react-router-dom';

import { ClassProfileError, ClassProfileSkeleton } from '@/features/classes/ClassProfilePageState';
import { ClassProfileView } from '@/features/classes/ClassProfileView';
import { useClassProfile } from '@/features/classes/useClassProfile';

/**
 * One class as the teacher who works in it sees it: today's numbers, its children, the team she is
 * part of, the activity, the waiting list and the details — the same page the nursery reads, with
 * the nursery's own actions (editing the class, opening a colleague's staff file, changing the
 * team) left out. A teacher who is not on this class's team is refused by the server.
 */
export function TeacherClassProfilePage() {
  const { classId } = useParams();
  const query = useClassProfile(classId);

  if (query.isPending) return <ClassProfileSkeleton />;
  if (query.isError) return <ClassProfileError error={query.error} onRetry={() => void query.refetch()} listPath="/teacher/classes" />;
  return <ClassProfileView profile={query.data} base="/teacher" canManage={false} />;
}
