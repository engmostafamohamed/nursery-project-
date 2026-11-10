import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { StatusPill } from '@/components/ui/DataTable';
import { PageHeader } from '@/components/ui/PageHeader';
import { roleName } from '@/features/class-team/useClassTeamEditing';
import { REASON_ICON } from '@/features/staff-absence/absenceLook';
import type { Absence } from '@/features/staff-absence/staffAbsence';
import type { NameLines } from '@/lib/bilingualName';
import { pickName, type TeamClass, type TeamTeacher } from '@/lib/classTeam';
import { formatDay, formatTime } from '@/lib/datetime';
import type { StaffAttendanceDayRow } from '@/hooks/useStaffAttendanceMonth';
import { staffAvatarUrl } from '@/lib/staffAvatar';
import { getUserInitials } from '@/lib/utils';

/**
 * A member of staff at a glance: their photo and names, their role, whether their account is
 * active, where they stand today (away and why, in since when, gone home, not in yet) and the
 * classes they work in (each opens that class's team); the page's actions on the side.
 */
export function StaffProfileHero({
  name,
  email,
  roleLabel,
  position,
  active,
  awayToday,
  todayClock,
  teamClasses,
  classHref,
  actions,
}: {
  name: NameLines;
  email: string | null;
  roleLabel: string;
  position: string | null;
  active: boolean;
  awayToday: Absence | null;
  /** Today's clocking, when there is a row for today. */
  todayClock: StaffAttendanceDayRow | null;
  /** The classes they are on, with their place in each. */
  teamClasses: Array<{ cls: TeamClass; role: TeamTeacher['classes'][number]['role'] }>;
  classHref: (classId: string) => string;
  actions: ReactNode;
}) {
  const { t, i18n } = useTranslation();
  const checkIn = todayClock?.check_in_at ?? null;
  const checkOut = todayClock?.check_out_at ?? null;

  const today = !active ? (
    <StatusPill tone="error" icon="block">{t('classProfile.duty.inactive')}</StatusPill>
  ) : awayToday ? (
    <StatusPill tone="warning" icon={REASON_ICON[awayToday.reason]}>
      {t('staff.profile.awayToday', { reason: t(`staffAbsence.reasons.${awayToday.reason}`), date: formatDay(awayToday.endsOn, { day: 'numeric', month: 'short' }) })}
    </StatusPill>
  ) : checkIn && checkOut ? (
    <StatusPill tone="neutral" icon="logout">{t('classProfile.teamToday.leftAt', { from: formatTime(checkIn), to: formatTime(checkOut) })}</StatusPill>
  ) : checkIn ? (
    <StatusPill tone="success" icon="login">{t('classProfile.teamToday.inSince', { time: formatTime(checkIn) })}</StatusPill>
  ) : (
    <StatusPill tone="neutral" icon="schedule">{t('classProfile.teamToday.notInYet')}</StatusPill>
  );

  return (
    <PageHeader
      icon="badge"
      media={
        <Avatar className="h-14 w-14 shrink-0 ring-2 ring-primary/20 ring-offset-2 ring-offset-surface">
          <AvatarImage src={staffAvatarUrl(name.primary)} alt="" />
          <AvatarFallback>{getUserInitials(name.primary, email)}</AvatarFallback>
        </Avatar>
      }
      eyebrow={roleLabel}
      title={name.primary}
      description={
        <div className="space-y-2" data-testid="staff-hero">
          {name.secondary || position ? (
            <p>
              {name.secondary}
              {name.secondary && position ? ' · ' : ''}
              {position}
            </p>
          ) : null}
          <div className="flex flex-wrap items-center gap-2">
            <StatusPill tone={active ? 'success' : 'error'}>{t(active ? 'classTeam.teachersTable.active' : 'classTeam.teachersTable.inactive')}</StatusPill>
            {today}
            {teamClasses.map(({ cls, role }) => (
              <Link key={cls.id} to={classHref(cls.id)} className="rounded-full transition-opacity hover:opacity-80" data-testid="staff-hero-class">
                <StatusPill tone={role === 'lead' ? 'primary' : 'neutral'} icon="school">
                  {pickName(cls, i18n.language)} · {roleName(t, role)}
                </StatusPill>
              </Link>
            ))}
          </div>
        </div>
      }
      actions={actions}
    />
  );
}
