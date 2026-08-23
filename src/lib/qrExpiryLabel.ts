import type { TFunction } from 'i18next';

/** Human-readable relative expiry from remaining seconds (for live countdown). */
export function qrExpiryLabelFromSeconds(secondsLeft: number, t: TFunction): string {
  if (secondsLeft <= 0) return t('qr.expired');
  const days = Math.floor(secondsLeft / 86400);
  if (days >= 1) return t('qr.expiresInDays', { count: days });
  const hours = Math.floor(secondsLeft / 3600);
  if (hours >= 1) return t('qr.expiresInHours', { count: hours });
  const mins = Math.floor(secondsLeft / 60);
  if (mins >= 1) return t('qr.expiresInMinutes', { count: mins });
  return t('qr.expiresInSeconds', { count: secondsLeft });
}

/** Primary line: “expires in X days” style from remaining seconds. */
export function qrExpirySummaryFromSeconds(secondsLeft: number, t: TFunction): string {
  if (secondsLeft <= 0) return t('qr.expired');
  const days = Math.floor(secondsLeft / 86400);
  if (days >= 1) return t('qr.parentPage.expiresInDaysFull', { count: days });
  const hours = Math.floor(secondsLeft / 3600);
  if (hours >= 1) return t('qr.expiresInHours', { count: hours });
  const mins = Math.floor(secondsLeft / 60);
  return t('qr.expiresInMinutes', { count: Math.max(1, mins) });
}
