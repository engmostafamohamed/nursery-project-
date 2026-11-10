import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';

import { Button } from '@/components/ui/button';
import { MaterialSymbol } from '@/components/ui/MaterialSymbol';
import type { BilingualNames } from '@/hooks/useBilingualNames';
import { cn, getUserInitials } from '@/lib/utils';

import { clockState, dutyState, teamClockSummary, type ClassProfile, type TeamMember } from './classProfile';
import type { ClassFormat } from './useClassFormat';

const RING: Record<ReturnType<typeof clockState>, string> = {
  in: 'ring-success',
  left: 'ring-outline-variant',
  not_in: 'ring-warning',
  away: 'ring-outline-variant',
};

/**
 * Who works with the class today, at the top of its page: the teachers and the nannies, each with
 * where they stand (in since when, late, not in yet, left, away), and the backup when they cover.
 * Opens the team tab for more.
 */
export function ClassTeamToday({ profile, names, format, base, onOpenTeam }: {
  profile: ClassProfile;
  names: BilingualNames;
  format: ClassFormat;
  base: string;
  onOpenTeam: () => void;
}) {
  const { t } = useTranslation();
  // A backup appears only on the days they cover.
  const working = profile.team.filter((m) => m.role !== 'substitute' || m.covering);
  const summary = teamClockSummary(profile.team);

  return (
    <section aria-labelledby="class-team-today-title" className="rounded-xl border border-outline-variant bg-surface-container-lowest p-3 sm:p-4" data-testid="class-team-today">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <MaterialSymbol name="groups" size="text-lg" className="text-primary" />
          <h2 id="class-team-today-title" className="text-sm font-semibold text-on-surface">{t('classProfile.teamToday.title')}</h2>
          {summary.expected && profile.schoolDay ? (
            <span className="rounded-full bg-surface-high px-2 py-0.5 text-xs font-medium tabular-nums text-on-surface-variant">
              {t('classProfile.teamToday.inCount', { in: summary.in, expected: summary.expected })}
            </span>
          ) : null}
          {summary.late ? (
            <span className="rounded-full bg-warning/10 px-2 py-0.5 text-xs font-medium text-warning">{t('classProfile.teamToday.late', { count: summary.late })}</span>
          ) : null}
        </div>
        <Button type="button" variant="ghost" size="sm" className="gap-1 text-primary" onClick={onOpenTeam}>
          {t('classProfile.teamToday.details')}
          <MaterialSymbol name="chevron_right" size="text-base" className="rtl:rotate-180" />
        </Button>
      </div>

      {working.length ? (
        <ul className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
          {working.map((m) => <TeamChip key={m.id} member={m} names={names} format={format} dayOpen={profile.dayOpen} schoolDay={profile.schoolDay} />)}
        </ul>
      ) : (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-dashed border-warning/50 bg-warning/5 px-3 py-2.5 text-sm">
          <span className="flex items-center gap-2 text-on-surface">
            <MaterialSymbol name="group_off" size="text-lg" className="text-warning" />
            {t('classProfile.teamToday.empty')}
          </span>
          <Button asChild size="sm" variant="outline">
            <Link to={`${base}/settings/team`}>{t('classProfile.team.manage')}</Link>
          </Button>
        </div>
      )}
    </section>
  );
}

function TeamChip({ member, names, format, dayOpen, schoolDay }: { member: TeamMember; names: BilingualNames; format: ClassFormat; dayOpen: boolean; schoolDay: boolean }) {
  const { t } = useTranslation();
  const name = names.lines(member.nameAr, member.nameEn).primary;
  const clock = clockState(member);
  const late = (member.lateMinutes ?? 0) > 5;
  const inactive = dutyState(member) === 'inactive';

  const line = !schoolDay && clock === 'not_in'
    ? t('classProfile.teamToday.closed')
    : clock === 'in'
      ? t('classProfile.teamToday.inSince', { time: format.time(member.clockIn) })
      : clock === 'left'
        ? t('classProfile.teamToday.leftAt', { from: format.time(member.clockIn), to: format.time(member.clockOut) })
        : clock === 'away'
          ? t(`staffAbsence.reasons.${member.absence?.reason ?? 'other'}`)
          : dayOpen ? t('classProfile.teamToday.notInYet') : t('classProfile.teamToday.didNotClock');

  return (
    <li className="flex items-center gap-3 rounded-lg border border-outline-variant bg-surface px-3 py-2.5" data-testid="class-team-today-member">
      <span className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-xs font-semibold ring-2 ring-offset-2 ring-offset-surface',
        RING[clock], member.role === 'lead' ? 'bg-primary/10 text-primary' : 'bg-surface-high text-on-surface-variant')} aria-hidden>
        {getUserInitials(name, member.email)}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-semibold text-on-surface">{name}</span>
        <span className="block truncate text-xs text-primary">
          {member.covering ? t('classProfile.teamToday.covering') : t(`classTeam.roles.${member.role}`)}
        </span>
        <span className={cn('flex items-center gap-1 truncate text-xs', clock === 'in' ? 'text-success' : clock === 'not_in' && schoolDay ? 'text-warning' : 'text-on-surface-variant')}>
          {line}
          {late && clock !== 'away' ? <span className="font-medium text-warning">· {t('classProfile.teamToday.lateBy', { count: member.lateMinutes ?? 0 })}</span> : null}
          {inactive ? <span className="text-error">· {t('classProfile.duty.inactive')}</span> : null}
        </span>
      </span>
    </li>
  );
}
