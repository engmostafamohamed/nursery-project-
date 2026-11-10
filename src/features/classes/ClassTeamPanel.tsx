import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router-dom';

import { Button } from '@/components/ui/button';
import { DataTable, IconAction, StatusPill, TableCard, TableEmpty, TBody, Td, Th, THead, Tr } from '@/components/ui/DataTable';
import { MaterialSymbol } from '@/components/ui/MaterialSymbol';
import { NameStack } from '@/components/ui/NameStack';
import { TeamChangesTable, type TeamChangeRow } from '@/features/class-team/TeamChangesTable';
import { COVER_LOOK, REASON_ICON } from '@/features/staff-absence/absenceLook';
import { coverStatus } from '@/features/staff-absence/staffAbsence';
import { RecordStaffTimeDialog } from '@/features/staff-clock/RecordStaffTimeDialog';
import type { BilingualNames } from '@/hooks/useBilingualNames';
import { cn, getUserInitials } from '@/lib/utils';

import { CLOCK_LOOK, DUTY_LOOK } from './classLook';
import { classCover, clockState, dutyState, type ClassProfile, type TeamMember } from './classProfile';
import type { ClassFormat } from './useClassFormat';

const RING: Record<ReturnType<typeof clockState>, string> = {
  in: 'ring-success',
  left: 'ring-outline-variant',
  not_in: 'ring-warning',
  away: 'ring-outline-variant',
};

/**
 * Who teaches and looks after the class and who is with it today, as rows: the lead, the backup, the
 * assistants and the nannies, each with their state today (on duty, covering for the lead, away and
 * until when), their clocking in and out (recorded by hand when someone forgot) and how to reach them;
 * a row opens that member of staff's page. Then the team's last changes. The team itself is set on
 * the Teams page (Classes section).
 */
export function ClassTeamPanel({ profile, names, format, base }: { profile: ClassProfile; names: BilingualNames; format: ClassFormat; base: string }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const cover = coverStatus(classCover(profile));
  const coverLook = COVER_LOOK[cover];
  const [recording, setRecording] = useState<TeamMember | null>(null);
  const className = names.lines(profile.info.nameAr, profile.info.nameEn).primary;
  const personHref = (id: string) => `${base}/staff/${id}`;

  const changes: TeamChangeRow[] = profile.teamChanges.map((c) => ({
    id: c.id,
    action: c.action,
    classId: profile.info.id,
    className,
    personName: names.lines(c.nameAr, c.nameEn).primary,
    role: c.role,
    by: c.byAr || c.byEn ? names.lines(c.byAr, c.byEn).primary : '',
    at: c.at,
  }));

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
              <Link to={`${base}/classes/teams?edit=${profile.info.id}`}>
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
          <DataTable minWidth={980} className="mt-1">
            <THead>
              <Th>{t('classProfile.team.cols.member')}</Th>
              <Th>{t('classProfile.team.cols.today')}</Th>
              <Th>{t('classProfile.team.cols.clock')}</Th>
              <Th>{t('classProfile.team.cols.contact')}</Th>
              <Th>{t('classProfile.team.cols.since')}</Th>
              <Th align="end">{t('classProfile.team.cols.actions')}</Th>
            </THead>
            <TBody>
              {profile.team.map((member) => (
                <MemberRow
                  key={member.id}
                  member={member}
                  names={names}
                  format={format}
                  schoolDay={profile.schoolDay}
                  dayOpen={profile.dayOpen}
                  href={personHref(member.id)}
                  onOpen={() => navigate(personHref(member.id))}
                  onRecord={() => setRecording(member)}
                />
              ))}
            </TBody>
          </DataTable>
        ) : (
          <TableEmpty icon="group_off" title={t('classProfile.team.emptyTitle')} description={t('classProfile.team.emptyDescription')} />
        )}
      </TableCard>

      {recording ? (
        <RecordStaffTimeDialog
          person={{ id: recording.id, name: names.lines(recording.nameAr, recording.nameEn).primary }}
          day={profile.today}
          isToday
          timezone={profile.info.timezone ?? 'Africa/Cairo'}
          current={recording.clockIn ? { checkIn: recording.clockIn, checkOut: recording.clockOut } : null}
          onClose={() => setRecording(null)}
        />
      ) : null}

      <TeamChangesTable rows={changes} title={t('classProfile.team.historyTitle')} description={t('classProfile.team.historyDescription')} showClass={false} />
    </div>
  );
}

/** One member of the team: who, where they stand today, their clocking, how to reach them; the row opens their page. */
function MemberRow({ member, names, format, schoolDay, dayOpen, href, onOpen, onRecord }: {
  member: TeamMember;
  names: BilingualNames;
  format: ClassFormat;
  schoolDay: boolean;
  dayOpen: boolean;
  href: string;
  onOpen: () => void;
  onRecord: () => void;
}) {
  const { t } = useTranslation();
  const state = dutyState(member);
  const look = DUTY_LOOK[state];
  const name = names.lines(member.nameAr, member.nameEn);
  const clock = clockState(member);
  const clockLook = CLOCK_LOOK[clock];
  const late = (member.lateMinutes ?? 0) > 5;
  const clocked = clock === 'in' || clock === 'left';

  const clockLine =
    !schoolDay && clock === 'not_in'
      ? t('classProfile.closedToday')
      : clock === 'in'
        ? t('classProfile.teamToday.inSince', { time: format.time(member.clockIn) })
        : clock === 'left'
          ? t('classProfile.teamToday.leftAt', { from: format.time(member.clockIn), to: format.time(member.clockOut) })
          : clock === 'away'
            ? t('classProfile.teamToday.away')
            : dayOpen ? t('classProfile.teamToday.notInYet') : t('classProfile.teamToday.didNotClock');

  return (
    <Tr onClick={onOpen} className={cn(state === 'away' && 'bg-warning/5')} data-testid="class-team-member">
      <Td>
        <span className="flex items-center gap-3">
          <span
            className={cn(
              'flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-xs font-semibold ring-2 ring-offset-2 ring-offset-surface',
              RING[clock],
              member.role === 'lead' ? 'bg-primary/10 text-primary' : 'bg-surface-high text-on-surface-variant',
            )}
            aria-hidden
          >
            {getUserInitials(name.primary, member.email)}
          </span>
          <span className="min-w-0">
            <Link to={href} className="block hover:text-primary hover:underline">
              <NameStack name={name} strong />
            </Link>
            <span className="block text-xs font-medium text-primary">
              {member.covering ? t('classProfile.duty.covering') : t(`classTeam.roles.${member.role}`)}
            </span>
          </span>
        </span>
      </Td>
      <Td>
        <StatusPill tone={look.tone} icon={look.icon}>{t(`classProfile.duty.${state}`)}</StatusPill>
        {member.absence ? (
          <p className="mt-1 flex items-center gap-1 text-xs text-on-surface-variant">
            <MaterialSymbol name={REASON_ICON[member.absence.reason]} size="text-sm" />
            {t(`staffAbsence.reasons.${member.absence.reason}`)} · {t('classProfile.duty.until', { date: format.day(member.absence.endsOn) })}
          </p>
        ) : null}
      </Td>
      <Td>
        <span className="block min-w-0" data-testid="member-clock">
          <span className="flex items-center gap-1.5 font-medium text-on-surface">
            <MaterialSymbol
              name={clockLook.icon}
              size="text-base"
              className={clock === 'in' ? 'text-success' : clock === 'not_in' && schoolDay ? 'text-warning' : 'text-on-surface-variant'}
            />
            {clockLine}
          </span>
          <span className="block text-xs text-on-surface-variant">
            {late && clock !== 'away' ? (
              <span className="text-warning">{t('classProfile.teamToday.lateBy', { count: member.lateMinutes ?? 0 })}</span>
            ) : clocked ? t('classProfile.teamToday.onTime') : clock === 'not_in' && schoolDay ? t('classProfile.teamToday.clockHint') : null}
            {member.clockSource === 'admin' ? ` · ${t('classProfile.teamToday.byAdmin')}` : ''}
          </span>
        </span>
      </Td>
      <Td>
        <span className="flex max-w-[16rem] flex-col gap-0.5 text-sm">
          {member.phone ? (
            <a href={`tel:${member.phone}`} className="inline-flex items-center gap-1.5 text-on-surface hover:text-primary">
              <MaterialSymbol name="call" size="text-sm" className="text-on-surface-variant" />
              <span dir="ltr">{member.phone}</span>
            </a>
          ) : null}
          {member.email ? (
            <a href={`mailto:${member.email}`} className="inline-flex min-w-0 items-center gap-1.5 text-xs text-on-surface-variant hover:text-primary">
              <MaterialSymbol name="mail" size="text-sm" />
              <span className="truncate" dir="ltr">{member.email}</span>
            </a>
          ) : null}
          {!member.phone && !member.email ? <span className="text-xs text-on-surface-variant">—</span> : null}
        </span>
      </Td>
      <Td className="whitespace-nowrap text-on-surface-variant">{format.day(member.since)}</Td>
      <Td align="end">
        <span className="inline-flex items-center gap-0.5">
          <IconAction
            icon="edit_calendar"
            label={t(clocked ? 'classProfile.team.correctFor' : 'classProfile.team.recordFor', { name: name.primary })}
            onClick={onRecord}
          />
          <IconAction icon="badge" label={t('staffAbsence.table.openPerson', { name: name.primary })} to={href} />
        </span>
      </Td>
    </Tr>
  );
}
