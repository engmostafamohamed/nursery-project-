import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import type { ClassTeamRole, ClassTeams } from '@/lib/classTeam';
import { supabase } from '@/lib/supabase';

const key = (nurseryId: string | null | undefined) => ['class-teams', nurseryId ?? null];

/** The nursery's classes with their team, every teacher, the latest changes (get_class_teams). */
export function useClassTeams(nurseryId: string | null | undefined) {
  return useQuery({
    queryKey: key(nurseryId),
    queryFn: async (): Promise<ClassTeams> => {
      const { data, error } = await supabase.rpc('get_class_teams' as never, { p_nursery_id: nurseryId } as never);
      if (error) throw error;
      return data as ClassTeams;
    },
    enabled: Boolean(nurseryId),
  });
}

/** Puts a teacher in a class (set_class_team_member) or takes them out (remove_class_team_member). */
export function useClassTeamActions(nurseryId: string | null | undefined) {
  const qc = useQueryClient();
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: key(nurseryId) });
    void qc.invalidateQueries({ queryKey: ['nursery-classes'] });
    void qc.invalidateQueries({ queryKey: ['class-with-staff'] });
    void qc.invalidateQueries({ queryKey: ['teacher-classes'] });
    void qc.invalidateQueries({ queryKey: ['my-classes'] });
  };
  const assign = useMutation({
    mutationFn: async (args: { classId: string; userId: string; role: ClassTeamRole }) => {
      const { error } = await supabase.rpc('set_class_team_member' as never, {
        p_class_id: args.classId,
        p_user_id: args.userId,
        p_role: args.role,
      } as never);
      if (error) throw error;
    },
    onSuccess: refresh,
  });
  const remove = useMutation({
    mutationFn: async (args: { classId: string; userId: string }) => {
      const { error } = await supabase.rpc('remove_class_team_member' as never, { p_class_id: args.classId, p_user_id: args.userId } as never);
      if (error) throw error;
    },
    onSuccess: refresh,
  });
  return { assign, remove };
}
