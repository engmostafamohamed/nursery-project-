import type { PillTone } from '@/lib/tones';
import type { HealthAlertItem, HealthAlertType, HealthUrgency } from '@/lib/healthAlertsCompute';

/*
 * How the health alerts read on screen: an icon and colour per alert, the four groups the summary
 * shows (allergies, medicines, vaccinations, missing contacts), and the filter. Plain functions,
 * tested on their own.
 */

export const ALERT_TYPES: HealthAlertType[] = [
  'life_threatening_allergy',
  'severe_allergy',
  'medication_expired',
  'vaccination_overdue',
  'missing_emergency',
  'missing_pediatrician',
];

export const URGENCIES: HealthUrgency[] = ['critical', 'high', 'medium', 'low'];

export const ALERT_LOOK: Record<HealthAlertType, { icon: string; tone: PillTone }> = {
  life_threatening_allergy: { icon: 'emergency', tone: 'error' },
  severe_allergy: { icon: 'allergy', tone: 'error' },
  medication_expired: { icon: 'medication', tone: 'warning' },
  vaccination_overdue: { icon: 'vaccines', tone: 'warning' },
  missing_emergency: { icon: 'contact_emergency', tone: 'primary' },
  missing_pediatrician: { icon: 'stethoscope', tone: 'primary' },
};

export const URGENCY_TONE: Record<HealthUrgency, PillTone> = { critical: 'error', high: 'error', medium: 'warning', low: 'neutral' };

export type AlertGroup = 'allergies' | 'medicines' | 'vaccinations' | 'contacts';
export const ALERT_GROUPS: Record<AlertGroup, { icon: string; tone: PillTone; types: HealthAlertType[] }> = {
  allergies: { icon: 'allergy', tone: 'error', types: ['life_threatening_allergy', 'severe_allergy'] },
  medicines: { icon: 'medication', tone: 'warning', types: ['medication_expired'] },
  vaccinations: { icon: 'vaccines', tone: 'warning', types: ['vaccination_overdue'] },
  contacts: { icon: 'contact_phone', tone: 'primary', types: ['missing_emergency', 'missing_pediatrician'] },
};

/** How many alerts each group has (the summary tiles). */
export function groupCounts(alerts: HealthAlertItem[]): Record<AlertGroup, number> {
  const counts = { allergies: 0, medicines: 0, vaccinations: 0, contacts: 0 } as Record<AlertGroup, number>;
  for (const alert of alerts) {
    for (const [group, def] of Object.entries(ALERT_GROUPS) as Array<[AlertGroup, (typeof ALERT_GROUPS)[AlertGroup]]>) {
      if (def.types.includes(alert.type)) counts[group] += 1;
    }
  }
  return counts;
}

export type AlertFilter = { group: AlertGroup | null; type: HealthAlertType | 'all'; classId: string | 'all'; urgency: HealthUrgency | 'all'; search: string };

export const NO_FILTER: AlertFilter = { group: null, type: 'all', classId: 'all', urgency: 'all', search: '' };

/** The alerts the filter keeps, most urgent first (then by child name). */
export function filterAlerts(alerts: HealthAlertItem[], filter: AlertFilter): HealthAlertItem[] {
  const term = filter.search.trim().toLowerCase();
  return alerts
    .filter((a) => !filter.group || ALERT_GROUPS[filter.group].types.includes(a.type))
    .filter((a) => filter.type === 'all' || a.type === filter.type)
    .filter((a) => filter.classId === 'all' || a.classId === filter.classId)
    .filter((a) => filter.urgency === 'all' || a.urgency === filter.urgency)
    .filter((a) => !term || `${a.childNameAr} ${a.childNameEn}`.toLowerCase().includes(term))
    .sort((a, b) => URGENCIES.indexOf(a.urgency) - URGENCIES.indexOf(b.urgency) || a.childNameEn.localeCompare(b.childNameEn));
}

export const isFiltered = (filter: AlertFilter) =>
  filter.group !== null || filter.type !== 'all' || filter.classId !== 'all' || filter.urgency !== 'all' || filter.search.trim() !== '';

/** A name in the reader's language, falling back to the other. */
export const readerName = (ar: string | null | undefined, en: string | null | undefined, isArabic: boolean) =>
  ((isArabic ? ar?.trim() || en?.trim() : en?.trim() || ar?.trim()) ?? '') || '';
