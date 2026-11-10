import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';

import { confirm } from '@/components/ui/confirm';
import { useClassTeamActions, useClassTeams } from '@/hooks/useClassTeams';
import { classTeamErrorKey, lead, pickName, substitute, type ClassTeamRole, type TeamClass } from '@/lib/classTeam';

type T = ReturnType<typeof useTranslation>['t'];

/** A place in a class, in the reader's language. */
export function roleName(t: T, role: ClassTeamRole): string {
  if (role === 'lead') return t('classTeam.roles.lead');
  if (role === 'assistant') return t('classTeam.roles.assistant');
  if (role === 'nanny') return t('classTeam.roles.nanny');
  return t('classTeam.roles.substitute');
}

/** Why a team change was refused: shown under the place it was for (`role` null: the whole team). */
export type TeamProblem = { classId: string; role: ClassTeamRole | null; message: string };

/**
 * The nursery's class teams and the way to change them, for the Teams page and a class's edit page
 * alike: put someone in a place (replacing the lead or the backup asks first) or take them out (asks
 * first). Each change is saved at once; a refusal shows under the place it was for.
 */
export function useClassTeamEditing(nurseryId: string | null | undefined) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const query = useClassTeams(nurseryId);
  const { assign, remove } = useClassTeamActions(nurseryId);
  const [problem, setProblem] = useState<TeamProblem | null>(null);
  const data = query.data;
  const staff = useMemo(() => data?.staff ?? [], [data]);
  const classes = useMemo(() => data?.classes ?? [], [data]);
  const byId = useMemo(() => new Map(staff.map((s) => [s.id, s])), [staff]);
  const canUpdate = Boolean(data?.can_update);
  const busy = assign.isPending || remove.isPending;
  const nameOf = (id: string | null) => (id ? pickName(byId.get(id) ?? { name_ar: null, name_en: null }, lang) : '');
  const refused = (cls: TeamClass, role: ClassTeamRole | null, error: unknown) =>
    setProblem({ classId: cls.id, role, message: t(`classTeam.errors.${classTeamErrorKey(error)}`) });

  /** Puts someone in a place; replacing the lead or backup asks first. */
  const place = async (cls: TeamClass, role: ClassTeamRole, userId: string) => {
    const current = role === 'lead' ? lead(cls) : role === 'substitute' ? substitute(cls) : null;
    if (current && current !== userId) {
      const ok = await confirm({
        title: t('classTeam.confirm.replaceTitle', { role: roleName(t, role) }),
        description: t('classTeam.confirm.replaceBody', { old: nameOf(current), new: nameOf(userId), class: pickName(cls, lang) }),
        confirmText: t('classTeam.confirm.replace'),
      });
      if (!ok) return;
    }
    setProblem(null);
    try {
      await assign.mutateAsync({ classId: cls.id, userId, role });
      toast.success(t('classTeam.saved'));
    } catch (error) {
      refused(cls, role, error);
    }
  };

  const takeOut = async (cls: TeamClass, userId: string) => {
    const ok = await confirm({
      title: t('classTeam.confirm.removeTitle', { name: nameOf(userId), class: pickName(cls, lang) }),
      description: t('classTeam.confirm.removeBody'),
      confirmText: t('classTeam.confirm.remove'),
      variant: 'danger',
    });
    if (!ok) return;
    setProblem(null);
    try {
      await remove.mutateAsync({ classId: cls.id, userId });
      toast.success(t('classTeam.removed'));
    } catch (error) {
      refused(cls, null, error);
    }
  };

  /** The refusal to show on a class's team, if the last change to it was refused. */
  const problemFor = (classId: string) => (problem?.classId === classId ? problem : null);

  return { query, data, staff, classes, byId, canUpdate, busy, nameOf, place, takeOut, problemFor, clearProblem: () => setProblem(null) };
}

export type ClassTeamEditing = ReturnType<typeof useClassTeamEditing>;
