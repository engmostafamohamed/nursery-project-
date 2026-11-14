import { useTranslation } from 'react-i18next';

import { formatDay } from '@/lib/datetime';

import { holidayLength } from './daysOff';

const DAY: Intl.DateTimeFormatOptions = { weekday: 'short', day: 'numeric', month: 'short' };

/** A day off's dates: "Thu 7 Jan", or "Fri 20 Mar – Sun 22 Mar · 3 days". */
export function HolidayDates({ startsOn, endsOn }: { startsOn: string; endsOn: string }) {
  const { t } = useTranslation();
  const days = holidayLength({ starts_on: startsOn, ends_on: endsOn });
  if (days === 1) return <span>{formatDay(startsOn, DAY)}</span>;
  return (
    <span>
      {t('daysOff.range', { from: formatDay(startsOn, DAY), to: formatDay(endsOn, DAY) })} · {t('daysOff.days', { count: days })}
    </span>
  );
}
