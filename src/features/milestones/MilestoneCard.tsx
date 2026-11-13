import { useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { StatusPill } from '@/components/ui/DataTable';
import { MaterialSymbol } from '@/components/ui/MaterialSymbol';
import { TONE_TINT } from '@/components/ui/toneClasses';
import { MILESTONE_LOOK } from '@/features/milestones/milestones';
import { shareMilestone } from '@/features/milestones/shareMilestone';
import { useMilestonePhoto } from '@/features/milestones/useMilestonePhoto';
import type { MilestoneItem } from '@/hooks/useMilestones';
import { formatDate } from '@/lib/datetime';
import { cn } from '@/lib/utils';

/**
 * One milestone: what the child did, when, its photo and note. The family gets a button to share it
 * as a picture; the teacher passes her own `actions` (and `badge`, e.g. whether the family sees it).
 */
export function MilestoneCard({ milestone, actions, badge }: { milestone: MilestoneItem; actions?: ReactNode; badge?: ReactNode }) {
  const { t, i18n } = useTranslation();
  const [busy, setBusy] = useState(false);
  const photo = useMilestonePhoto(milestone.photo_url);
  const look = MILESTONE_LOOK[milestone.category] ?? MILESTONE_LOOK.creative;
  const category = t(`milestones.categories.${milestone.category}`);

  const share = async () => {
    setBusy(true);
    try {
      const how = await shareMilestone(milestone, {
        heading: t('milestones.card.heading'),
        category,
        date: formatDate(milestone.achieved_at, { day: 'numeric', month: 'long', year: 'numeric' }),
        footer: t('milestones.card.footer'),
        rtl: i18n.dir() === 'rtl',
      });
      if (how === 'downloaded') toast.success(t('milestones.card.downloaded'));
    } catch {
      toast.error(t('milestones.card.failed'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <article className="flex flex-col overflow-hidden rounded-xl border border-outline-variant bg-surface shadow-sm" data-testid="milestone-card">
      {milestone.photo_url ? (
        photo ? (
          <img src={photo} alt={milestone.milestone_text} className="h-44 w-full object-cover" loading="lazy" decoding="async" />
        ) : (
          <div className="h-44 w-full animate-pulse bg-surface-high" />
        )
      ) : null}
      <div className="flex flex-1 flex-col gap-2 p-4">
        <div className="flex items-start gap-3">
          <span className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-lg', TONE_TINT[look.tone])}>
            <MaterialSymbol name={look.icon} size="text-xl" />
          </span>
          <div className="min-w-0 flex-1">
            <h3 className="break-words text-base font-semibold text-on-surface">{milestone.milestone_text}</h3>
            <p className="text-xs text-on-surface-variant">
              {milestone.childName ? `${milestone.childName} · ` : ''}
              {formatDate(milestone.achieved_at, { day: 'numeric', month: 'short', year: 'numeric' })}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-1.5">
          <StatusPill tone={look.tone} icon={look.icon}>{category}</StatusPill>
          {badge}
        </div>
        {milestone.notes ? <p className="whitespace-pre-line text-sm text-on-surface-variant">{milestone.notes}</p> : null}
        <div className="mt-auto flex flex-wrap gap-2 pt-1">
          {actions ?? (
            <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => void share()} data-testid="milestone-share">
              <MaterialSymbol name={busy ? 'progress_activity' : 'share'} size="text-base" className={cn('me-1', busy && 'animate-spin')} />
              {t('milestones.share')}
            </Button>
          )}
        </div>
      </div>
    </article>
  );
}
