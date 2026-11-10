import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { listRange } from './courseSessions';
import { cancelCourseSession, fetchCourseSessions, restoreCourseSession } from './courseSessionsApi';

export const courseSessionKeys = {
  course: (courseId: string) => ['course-sessions', courseId] as const,
  list: (courseId: string, from: string) => ['course-sessions', courseId, from] as const,
};

/** The course's sessions of the past week and the next four. */
export function useCourseSessions(courseId: string, today: string) {
  const { from, to } = listRange(today);
  return useQuery({
    queryKey: courseSessionKeys.list(courseId, from),
    queryFn: () => fetchCourseSessions(courseId, from, to),
  });
}

/** Cancelling (with a reason) or restoring a session; the list is read again after either. */
export function useCourseSessionChanges(courseId: string) {
  const queryClient = useQueryClient();
  const onSettled = () => queryClient.invalidateQueries({ queryKey: courseSessionKeys.course(courseId) });
  return {
    cancel: useMutation({ mutationFn: (input: { date: string; reason: string }) => cancelCourseSession({ courseId, ...input }), onSettled }),
    restore: useMutation({ mutationFn: (date: string) => restoreCourseSession({ courseId, date }), onSettled }),
  };
}
