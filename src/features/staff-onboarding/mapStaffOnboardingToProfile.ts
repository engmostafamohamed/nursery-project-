import type { StaffContractType, StaffDepartment } from '@/types/tables';

import type { StaffOnboardingFormValues } from './staffOnboardingTypes';

export function positionToDepartment(position: StaffOnboardingFormValues['position']): StaffDepartment {
  switch (position) {
    case 'driver':
      return 'driver';
    case 'kitchen':
      return 'kitchen';
    case 'cleaner':
      return 'maintenance';
    case 'security':
      return 'security';
    case 'admin':
      return 'admin';
    default:
      return 'teaching';
  }
}

export function employmentUiToDb(t: StaffOnboardingFormValues['employmentType']): StaffContractType {
  if (t === 'intern') return 'temporary';
  return t as StaffContractType;
}

export function generateEmployeeId(): string {
  const n = Math.floor(100000 + Math.random() * 900000);
  return `EMP-${n}`;
}

export function calcProbationEnd(startIso: string): string {
  const d = new Date(startIso);
  d.setMonth(d.getMonth() + 3);
  return d.toISOString().slice(0, 10);
}

export function parseWeeklyHours(start: string, end: string, dayCount: number): number {
  const [sh, sm] = start.split(':').map(Number);
  const [eh, em] = end.split(':').map(Number);
  const hours = eh + em / 60 - (sh + sm / 60);
  if (!Number.isFinite(hours) || hours <= 0) return 0;
  return Math.round(hours * dayCount * 10) / 10;
}
