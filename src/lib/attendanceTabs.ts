import type { SectionTab } from '@/components/ui/SectionTabs';

/*
 * The attendance section's pages as tabs. The nursery's attendance is one thing with four faces —
 * the children's day, the staff's, the span's figures and the log of every scan — and each keeps
 * its own address, so a link, a reload or Back lands on the one that was open.
 *
 * Shared so every page of the section shows the same strip and none of them drifts.
 */
export function attendanceSectionTabs(base: string, t: (key: string) => string): SectionTab[] {
  return [
    { to: `${base}/attendance`, label: t('admin.attendance.tabs.children'), icon: 'child_care', end: true },
    { to: `${base}/attendance/staff`, label: t('admin.attendance.tabs.staff'), icon: 'badge' },
    { to: `${base}/attendance/dashboard`, label: t('admin.attendance.tabs.analytics'), icon: 'monitoring' },
    { to: `${base}/attendance/logs`, label: t('admin.attendance.tabs.logs'), icon: 'receipt_long' },
  ];
}
