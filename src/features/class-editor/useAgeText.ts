import { useTranslation } from 'react-i18next';

/** An age as "2 years, 4 months" in the reader's language; '—' without one. */
export function useAgeText() {
  const { t } = useTranslation();
  return (age: { years: number; months: number } | null) => {
    if (!age) return '—';
    const years = age.years ? t('health.profile.age.years', { count: age.years }) : '';
    const months = age.months || !age.years ? t('health.profile.age.months', { count: age.months }) : '';
    return years && months ? `${years}${t('health.profile.age.and')}${months}` : years || months;
  };
}
