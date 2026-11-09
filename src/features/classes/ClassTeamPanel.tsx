import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';

import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { StatusPill, TableCard, TableEmpty } from '@/components/ui/DataTable';
import { MaterialSymbol } from '@/components/ui/MaterialSymbol';
import { NameStack } from '@/components/ui/NameStack';
import { COVER_LOOK, REASON_ICON } from '@/features/staff-absence/absenceLook';
import { coverStatus } from '@/features/staff-absence/staffAbsence';
import type { BilingualNames } from '@/hooks/useBilingualNames';
import { cn, getUserInitials } from '@/lib/utils';

import { DUTY_LOOK } from './classLook';
import { classCover, dutyState, type ClassProfile, type TeamChange, type TeamMember } from './classProfile';
import type { ClassFormat } from './useClassFormat';

/**
 * Who teaches the class and who is with it today: the lead, the backup and the assistants, each
 * with their state today (in, covering for the lead, away and until when) and how to reach them;
 * then the team's last changes. The team itself is set on the Team & classes page.
 */
export function ClassTeamPanel({ profile, names, format, base }: { profile: ClassProfile; names: BilingualNames; format: ClassFormat; base: string }) {
  const { t } = useTranslation();
  const cover = coverStatus(classCover(profile));
  const coverLook = COVER_LOOK[cover];

  return (
    <div className="space-y-5">
      <TableCard
        title={t('classProfile.team.title')}
        count={t('classProfile.team.count', { count: profile.team.length })}
        description={t('classProfile.team.description')}
        actions={
          <>
            <Button asChild variant="outline" size="sm" className="gap-1.5">
              <Link to={`${base}/staff/absences`}>
                <MaterialSymbol name="event_busy" size="text-base" />
                {t('classProfile.team.absences')}
              </Link>
            </Button>
            <Button asChild size="sm" className="gap-1.5">
              <Link to={`${base}/settings/team`}>
                <MaterialSymbol name="groups" size="text-base" />
                {t('classProfile.team.manage')}
              </Link>
            </Button>
          </>
        }
      >
        {cover !== 'normal' ? (
          <div
            className={cn(
              'mx-4 mt-4 flex items-start gap-3 rounded-xl border p-3 text-sm sm:mx-5',
              coverLook.tone === 'error' ? 'border-error/30 bg-error/5 text-error' : coverLook.tone === 'warning' ? 'border-warning/30 bg-warning/5 text-warning' : 'border-outline-variant bg-surface-container-lowest text-on-surface-variant',
            )}
            role={cover === 'uncovered' ? 'alert' : undefined}
          >
            <MaterialSymbol name={coverLook.icon} className="mt-0.5 shrink-0" />
            <div>
              <p className="font-semibold">{t(`staffAbsence.board.status.${cover}`)}</p>
              <p className="text-xs opacity-90">{t(`classProfile.team.cover.${cover}`)}</p>
            </div>
          </div>
        ) : null}
        {profile.team.length ? (
          <ul className="grid gap-3 p-4 sm:grid-cols-2 sm:p-5 xl:grid-cols-3" data-testid="class-team">
            {profile.team.map((member) => (
              <MemberCard key={member.id} member={member} names={names} format={format} />
            ))}
          </ul>
        ) : (
          <TableEmpty icon="group_off" title={t('classProfile.team.emptyTitle')} description={t('classProfile.team.emptyDescription')} />
        )}
      </TableCard>

      <TableCard title={t('classProfile.team.historyTitle')} description={t('classProfile.team.historyDescription')}>
        {profile.teamChanges.length ? (
          <ol className="divide-y divide-outline-variant">
            {profile.teamChanges.map((change) => (
              <ChangeRow key={change.id} change={change} names={names} format={format} className={names.lines(profile.info.nameAr, profile.info.nameEn).primary} />
            ))}
          </ol>
        ) : (
          <p className="px-4 py-6 text-center text-sm text-on-surface-variant sm:px-5">{t('classTeam.changes.empty')}</p>
        )}
      </TableCard>
    </div>
  );
}

function MemberCard({ member, names, format }: { member: TeamMember; names: BilingualNames; format: ClassFormat }) {
  const { t } = useTranslation();
  const state = dutyState(member);
  const look = DUTY_LOOK[state];
  const name = names.lines(member.nameAr, member.nameEn);

  return (
    <li className={cn('flex flex-col gap-3 rounded-xl border bg-surface p-4', state === 'away' ? 'border-warning/40' : 'border-outline-variant')} data-testid="class-team-member">
      <div className="flex items-start gap-3">
        <Avatar className={cn('h-11 w-11 shrink-0', member.role === 'lead' ? 'bg-primary/10' : 'bg-surface-high')}>
          <AvatarFallback className={cn('text-xs', member.role === 'lead' ? 'text-primary' : 'text-on-surface-variant')}>
            {getUserInitials(name.primary, member.email)}
          </AvatarFallback>
        </Avatar>
        <div className="min-w-0 flex-1">
          <NameStack name={name} strong />
          <p className="mt-0.5 text-xs font-medium text-primary">{t(`classTeam.roles.${member.role}`)}</p>
        </div>
      </div>
      <div className="space-y-1">
        <StatusPill tone={look.tone} icon={look.icon}>{t(`classProfile.duty.${state}`)}</StatusPill>
        {member.absence ? (
          <p className="flex items-center gap-1 text-xs text-on-surface-variant">
            <MaterialSymbol name={REASON_ICON[member.absence.reason]} size="text-sm" />
            {t(`staffAbsence.reasons.${member.absence.reason}`)} · {t('classProfile.duty.until', { date: format.day(member.absence.endsOn) })}
          </p>
        ) : null}
      </div>
      <div className="space-y-1.5 border-t border-outline-variant pt-3 text-sm">
        {member.phone ? (
          <a href={`tel:${member.phone}`} className="flex items-center gap-2 text-on-surface hover:text-primary">
            <MaterialSymbol name="call" size="text-base" className="text-on-surface-variant" />
            <span dir="ltr">{member.phone}</span>
          </a>
        ) : null}
        {member.email ? (
          <a href={`mailto:${member.email}`} className="flex min-w-0 items-center gap-2 text-on-surface hover:text-primary">
            <MaterialSymbol name="mail" size="text-base" className="shrink-0 text-on-surface-variant" />
            <span className="truncate" dir="ltr">{member.email}</span>
          </a>
        ) : null}
        <p className="flex items-center gap-2 text-xs text-on-surface-variant">
          <MaterialSymbol name="event" size="text-base" />
          {t('classProfile.team.since', { date: format.day(member.since) })}
        </p>
      </div>
    </li>
  );
}

const CHANGE_ICON: Record<TeamChange['action'], string> = { assigned: 'person_add', changed: 'swap_horiz', removed: 'person_remove' };

/** A change in a sentence ("Sara joined Butterflies as Assistant"): names in the reader's language only. */
function ChangeRow({ change, names, format, className }: { change: TeamChange; names: BilingualNames; format: ClassFormat; className: string }) {
  const { t } = useTranslation();
  const name = names.lines(change.nameAr, change.nameEn).primary;
  const role = change.role ? t(`classTeam.roles.${change.role}`) : '';
  const by = names.lines(change.byAr, change.byEn).primary;
  return (
    <li className="flex items-start gap-3 px-4 py-3 sm:px-5">
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-surface-high text-on-surface-variant">
        <MaterialSymbol name={CHANGE_ICON[change.action]} size="text-base" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm text-on-surface">{t(`classTeam.changes.${change.action}`, { name, class: className, role })}</p>
        <p className="text-xs text-on-surface-variant">
          {format.moment(change.at)}
          {change.byAr || change.byEn ? ` · ${t('classTeam.changes.by', { name: by })}` : ''}
        </p>
      </div>
    </li>
  );
}
