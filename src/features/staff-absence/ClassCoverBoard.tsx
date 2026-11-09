import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';

import { StatusPill } from '@/components/ui/DataTable';
import { MaterialSymbol } from '@/components/ui/MaterialSymbol';
import { cn } from '@/lib/utils';

import { COVER_LOOK } from './absenceLook';
import { coverStatus, sortClassCover, type ClassCover, type ClassPerson } from './staffAbsence';

/**
 * Each class today: its lead and backup, who is away, and whether someone is on duty. A class left
 * with nobody comes first, then the ones a backup covers; each leads to the class to set its team.
 */
export function ClassCoverBoard({ classes, classHref }: { classes: ClassCover[]; classHref: (classId: string) => string }) {
  const { t, i18n } = useTranslation();
  const isArabic = i18n.language.startsWith('ar');
  const name = (ar: string, en: string) => (isArabic ? ar || en : en || ar) || '—';

  if (!classes.length) {
    return <p className="rounded-xl border border-dashed border-outline-variant p-6 text-center text-sm text-on-surface-variant">{t('staffAbsence.board.noClasses')}</p>;
  }

  const person = (label: string, p: ClassPerson | null, covering: boolean) => (
    <div className="flex items-center justify-between gap-2 text-sm">
      <span className="text-xs text-on-surface-variant">{label}</span>
      {p ? (
        <span className="flex min-w-0 items-center gap-1.5">
          <span className={cn('truncate', p.away ? 'text-on-surface-variant line-through' : 'font-medium text-on-surface')}>{name(p.nameAr, p.nameEn)}</span>
          {p.away ? <StatusPill tone="warning">{t('staffAbsence.board.away')}</StatusPill> : covering ? <StatusPill tone="primary">{t('staffAbsence.board.covering')}</StatusPill> : null}
        </span>
      ) : (
        <span className="text-xs text-on-surface-variant">{t('staffAbsence.board.none')}</span>
      )}
    </div>
  );

  return (
    <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3" data-testid="class-cover-board">
      {sortClassCover(classes).map((c) => {
        const status = coverStatus(c);
        const look = COVER_LOOK[status];
        return (
          <li
            key={c.classId}
            className={cn(
              'flex flex-col gap-3 rounded-xl border bg-surface p-4',
              status === 'uncovered' ? 'border-error/40 ring-1 ring-error/20' : status === 'covered' ? 'border-warning/40' : 'border-outline-variant',
            )}
            data-testid="class-cover"
          >
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="truncate font-semibold text-on-surface">{name(c.nameAr, c.nameEn)}</p>
                <p className="text-xs text-on-surface-variant">{t('staffAbsence.board.children', { count: c.children })}</p>
              </div>
              <StatusPill tone={look.tone} icon={look.icon}>{t(`staffAbsence.board.status.${status}`)}</StatusPill>
            </div>
            <div className="space-y-1.5 border-t border-outline-variant pt-3">
              {person(t('staffAbsence.board.lead'), c.lead, false)}
              {person(t('staffAbsence.board.backup'), c.backup, c.coveredByBackup)}
            </div>
            {status === 'uncovered' || status === 'no_lead' || (c.lead?.away && !c.backup) ? (
              <Link to={classHref(c.classId)} className="inline-flex items-center gap-1 self-start text-sm font-medium text-primary hover:underline">
                <MaterialSymbol name="group_add" size="text-base" />
                {t('staffAbsence.board.setTeam')}
              </Link>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}
