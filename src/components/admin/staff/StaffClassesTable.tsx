import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router-dom';

import { Button } from '@/components/ui/button';
import { DataTable, IconAction, StatusPill, TableCard, TableEmpty, TBody, Td, Th, THead, Tr } from '@/components/ui/DataTable';
import { MaterialSymbol } from '@/components/ui/MaterialSymbol';
import { TEAM_STATUS_LOOK } from '@/features/class-team/teamLook';
import { roleName } from '@/features/class-team/useClassTeamEditing';
import { lead, pickName, teamStatus, type TeamClass, type TeamTeacher } from '@/lib/classTeam';

/**
 * The classes a member of staff works in, as rows: their place in each, how many children, the
 * class's lead teacher and how its team stands; a row opens the class's team. Changing their place is
 * done on the Teams page.
 */
export function StaffClassesTable({ personName, teamClasses, staff, classHref, teamsHref }: {
  personName: string;
  teamClasses: Array<{ cls: TeamClass; role: TeamTeacher['classes'][number]['role'] }>;
  staff: TeamTeacher[];
  classHref: (classId: string) => string;
  teamsHref: string;
}) {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const nameOf = (id: string | null) => {
    const person = id ? staff.find((s) => s.id === id) : undefined;
    return person ? pickName(person, i18n.language) : '—';
  };

  return (
    <TableCard
      title={t('staff.profile.classesTitle')}
      count={t('classTeam.table.count', { count: teamClasses.length })}
      description={t('staff.profile.classesDescription', { name: personName })}
      actions={
        <Button asChild size="sm" variant="outline" className="gap-1.5">
          <Link to={teamsHref}>
            <MaterialSymbol name="groups" size="text-base" />
            {t('classesSection.teams')}
          </Link>
        </Button>
      }
    >
      {teamClasses.length ? (
        <DataTable minWidth={760}>
          <THead>
            <Th>{t('classTeam.table.class')}</Th>
            <Th>{t('staff.profile.cols.place')}</Th>
            <Th>{t('staff.profile.cols.children')}</Th>
            <Th>{t('classTeam.table.lead')}</Th>
            <Th>{t('classTeam.table.status')}</Th>
            <Th align="end">{t('classTeam.table.actions')}</Th>
          </THead>
          <TBody>
            {teamClasses.map(({ cls, role }) => {
              const name = pickName(cls, i18n.language);
              const status = teamStatus(cls);
              const look = TEAM_STATUS_LOOK[status];
              return (
                <Tr key={cls.id} onClick={() => navigate(classHref(cls.id))} data-testid="staff-class-row">
                  <Td>
                    <Link to={classHref(cls.id)} className="font-semibold text-on-surface hover:text-primary hover:underline">{name}</Link>
                    {cls.room_number ? <p className="text-xs text-on-surface-variant">{t('classTeam.card.room', { room: cls.room_number })}</p> : null}
                  </Td>
                  <Td><StatusPill tone={role === 'lead' ? 'primary' : 'neutral'}>{roleName(t, role)}</StatusPill></Td>
                  <Td className="tabular-nums">
                    {cls.children_count}
                    {cls.capacity ? <span className="text-on-surface-variant"> / {cls.capacity}</span> : null}
                  </Td>
                  <Td>{lead(cls) ? nameOf(lead(cls)) : <span className="text-error">{t('classTeam.status.no_lead')}</span>}</Td>
                  <Td><StatusPill tone={look.tone} icon={look.icon}>{t(`classTeam.status.${status}`)}</StatusPill></Td>
                  <Td align="end">
                    <IconAction icon="open_in_new" label={t('classTeam.table.openClass', { class: name })} to={classHref(cls.id)} />
                  </Td>
                </Tr>
              );
            })}
          </TBody>
        </DataTable>
      ) : (
        <TableEmpty icon="school" title={t('staff.profile.classesEmpty', { name: personName })} />
      )}
    </TableCard>
  );
}
