import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';

import { ageOn } from '@/features/child-health/childHealth';
import { formatDateTime, formatDay, formatTimeIn } from '@/lib/datetime';

import type { ClassProfile } from './classProfile';

/** The class page's dates, times (in the nursery's clock) and ages, in the reader's language. */
export function useClassFormat(profile: Pick<ClassProfile, 'today' | 'info'>) {
  // `t` changes with the language, so the formatters below follow a language switch.
  const { t } = useTranslation();
  const { today } = profile;
  const { timezone } = profile.info;
  return useMemo(
    () => ({
      /** "2 years, 4 months" on the nursery's today; '—' without a birth date. */
      age: (dob: string | null) => {
        const age = ageOn(dob, today);
        if (!age) return '—';
        const years = age.years ? t('health.profile.age.years', { count: age.years }) : '';
        const months = age.months || !age.years ? t('health.profile.age.months', { count: age.months }) : '';
        return years && months ? `${years}${t('health.profile.age.and')}${months}` : years || months;
      },
      time: (iso: string | null) => formatTimeIn(iso, timezone),
      day: (value: string | null) => formatDay(value),
      moment: (iso: string | null) => formatDateTime(iso, { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }),
    }),
    [t, today, timezone],
  );
}

export type ClassFormat = ReturnType<typeof useClassFormat>;
