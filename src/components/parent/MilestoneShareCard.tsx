import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';

import type { MilestoneItem } from '@/hooks/useMilestones';
import { generateMilestoneCard } from '@/lib/milestoneCardGenerator';

type Props = {
  milestone: MilestoneItem;
};

export function MilestoneShareCard({ milestone }: Props) {
  const { t } = useTranslation();
  return (
    <button
      type="button"
      className="text-xs text-primary underline"
      onClick={async () => {
        const blob = await generateMilestoneCard({
          childName: milestone.childName ?? 'Child',
          milestoneText: milestone.milestone_text,
          category: t(`milestones.categories.${milestone.category}`),
          achievedAt: milestone.achieved_at,
        });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `milestone-${(milestone.childName ?? 'child').replace(/\s+/g, '-').toLowerCase()}-${milestone.achieved_at}.png`;
        a.click();
        URL.revokeObjectURL(url);
        toast.success(t('milestones.downloaded'));
      }}
    >
      {t('milestones.downloadCard')}
    </button>
  );
}
