import { useTranslation } from 'react-i18next';

import { StatTile } from '@/components/ui/StatTile';

import type { ChildFilter, TodaySummary } from './classProfile';

const TILE = 'xl:flex-col xl:items-start xl:gap-2';

/**
 * Today in the class: who is here, who went home, who is absent, the daily reports still to send,
 * and the children with health needs. Each number opens the children it counts (pressed again, all).
 */
export function ClassTodayTiles({
  summary,
  active,
  onPick,
}: {
  summary: TodaySummary;
  active: ChildFilter;
  onPick: (filter: ChildFilter) => void;
}) {
  const { t } = useTranslation();
  const pick = (filter: ChildFilter) => ({
    onClick: () => onPick(active === filter ? 'all' : filter),
    active: active === filter,
    className: TILE,
  });
  const reportsExpected = summary.reportsSent + summary.reportsDue;

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5" data-testid="class-today-tiles">
      <StatTile
        {...pick('here')}
        icon="how_to_reg"
        label={t('classProfile.today.here')}
        value={summary.here}
        helper={t('classProfile.today.ofExpected', { count: summary.expected })}
        tone="success"
      />
      <StatTile {...pick('went_home')} icon="directions_walk" label={t('classProfile.today.wentHome')} value={summary.wentHome} tone="primary" />
      <StatTile
        {...pick('absent')}
        icon="person_off"
        label={t('classProfile.today.absent')}
        value={summary.absent + summary.excused}
        helper={summary.excused ? t('classProfile.today.excused', { count: summary.excused }) : undefined}
        tone={summary.absent ? 'warning' : 'neutral'}
      />
      <StatTile
        {...pick('reports_due')}
        icon="assignment_turned_in"
        label={t('classProfile.today.reports')}
        value={t('classProfile.today.reportsValue', { sent: summary.reportsSent, expected: reportsExpected })}
        helper={summary.reportsDue ? t('classProfile.today.reportsDue', { count: summary.reportsDue }) : undefined}
        tone={summary.reportsDue ? 'warning' : 'success'}
      />
      <StatTile
        {...pick('health')}
        icon="health_and_safety"
        label={t('classProfile.today.health')}
        value={summary.health}
        helper={summary.seriousAllergies ? t('classProfile.today.seriousAllergies', { count: summary.seriousAllergies }) : undefined}
        tone={summary.seriousAllergies ? 'error' : summary.health ? 'warning' : 'neutral'}
      />
    </div>
  );
}
