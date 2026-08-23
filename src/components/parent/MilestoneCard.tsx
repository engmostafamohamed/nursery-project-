import { useTranslation } from 'react-i18next';

import { Button } from '@/components/ui/button';
import type { MilestoneItem } from '@/hooks/useMilestones';
import { formatDate } from '@/lib/datetime';

type Props = {
  milestone: MilestoneItem;
  onShare?: (m: MilestoneItem) => Promise<void>;
};

export function MilestoneCard({ milestone, onShare }: Props) {
  const { t } = useTranslation();
  return (
    <article className="rounded-xl border border-outline-variant bg-surface-container-lowest p-3">
      <p className="text-xs text-on-surface-variant">{t(`milestones.categories.${milestone.category}`)}</p>
      <p className="mt-1 font-medium text-on-surface">{milestone.milestone_text}</p>
      <p className="mt-1 text-xs text-on-surface-variant">{formatDate(milestone.achieved_at)}</p>
      {milestone.photo_url ? (
        <img
          src={milestone.photo_url}
          alt={milestone.milestone_text}
          className="mt-2 h-40 w-full rounded-lg object-cover"
          loading="lazy"
          decoding="async"
        />
      ) : null}
      {milestone.notes ? <p className="mt-2 text-sm text-on-surface-variant">{milestone.notes}</p> : null}
      {onShare ? (
        <Button size="sm" variant="outline" className="mt-2" onClick={() => void onShare(milestone)}>
          {t('milestones.share')}
        </Button>
      ) : null}
    </article>
  );
}
