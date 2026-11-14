import { useQuery, type QueryClient } from '@tanstack/react-query';

import { adminCourseEnrollmentsQueryKey } from '@/hooks/useAdminCourseDetail';

import { fetchCatalog, fetchCourseRequests } from './courseRequestsApi';

/** After asking, withdrawing or answering: the catalog, the family's courses, the requests and the roster read again. */
export function refreshCourseRequests(queryClient: QueryClient, courseId?: string) {
  void queryClient.invalidateQueries({ queryKey: ['parent-course-catalog'] });
  void queryClient.invalidateQueries({ queryKey: ['parent-courses'] });
  void queryClient.invalidateQueries({ queryKey: ['course-requests'] });
  if (courseId) void queryClient.invalidateQueries({ queryKey: adminCourseEnrollmentsQueryKey(courseId) });
}

export function useCourseCatalog(enabled = true) {
  return useQuery({ queryKey: ['parent-course-catalog'], queryFn: fetchCatalog, enabled });
}

export function useCourseRequests(courseId: string | null | undefined) {
  return useQuery({ queryKey: ['course-requests', courseId], queryFn: () => fetchCourseRequests(courseId as string), enabled: Boolean(courseId) });
}
