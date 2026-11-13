import { useQuery, type QueryClient } from '@tanstack/react-query';

import { fetchBoard, fetchClasses, fetchMyItems, fetchStaff, fetchTasks } from './staffTasksApi';

/** After any change, every staff-task screen reads again. */
export const refreshStaffTasks = (queryClient: QueryClient) => queryClient.invalidateQueries({ queryKey: ['staff-tasks'] });

export function useTaskBoard(nurseryId: string | null | undefined, day: string) {
  return useQuery({
    queryKey: ['staff-tasks', 'board', nurseryId, day],
    queryFn: () => fetchBoard(nurseryId as string, day),
    enabled: Boolean(nurseryId),
    refetchInterval: 60_000,
  });
}

export function useTaskList(nurseryId: string | null | undefined) {
  return useQuery({ queryKey: ['staff-tasks', 'list', nurseryId], queryFn: () => fetchTasks(nurseryId as string), enabled: Boolean(nurseryId) });
}

export function useTaskPeople(nurseryId: string | null | undefined) {
  return useQuery({ queryKey: ['staff-tasks', 'people', nurseryId], queryFn: () => fetchStaff(nurseryId as string), enabled: Boolean(nurseryId), staleTime: 300_000 });
}

export function useTaskClasses(nurseryId: string | null | undefined) {
  return useQuery({ queryKey: ['staff-tasks', 'classes', nurseryId], queryFn: () => fetchClasses(nurseryId as string), enabled: Boolean(nurseryId), staleTime: 300_000 });
}

/** The signed-in person's items: the last week up to today (late ones can still be done). */
export function useMyTasks(userId: string | undefined, fromDay: string, today: string) {
  return useQuery({
    queryKey: ['staff-tasks', 'mine', userId, fromDay, today],
    queryFn: () => fetchMyItems(userId as string, fromDay, today),
    enabled: Boolean(userId),
    refetchInterval: 60_000,
  });
}
