import type { MilestoneItem } from '@/hooks/useMilestones';
import { generateMilestoneCard } from '@/lib/milestoneCardGenerator';

/** The card's texts, in the language on screen. */
export type MilestoneCardTexts = { heading: string; category: string; date: string; footer: string; rtl: boolean };

/**
 * A milestone as a picture the family can keep: shared from the phone's share sheet when it can
 * share files, else saved as a download. Returns how it went out.
 */
export async function shareMilestone(milestone: MilestoneItem, texts: MilestoneCardTexts): Promise<'shared' | 'downloaded' | 'cancelled'> {
  const blob = await generateMilestoneCard({ ...texts, childName: milestone.childName ?? '', milestoneText: milestone.milestone_text });
  const file = new File([blob], `milestone-${milestone.achieved_at}.png`, { type: 'image/png' });
  // A phone's share sheet (WhatsApp, the gallery...); on a computer the picture is saved instead.
  const touch = typeof window !== 'undefined' && window.matchMedia?.('(pointer: coarse)').matches;
  if (touch && navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: milestone.milestone_text });
      return 'shared';
    } catch (error) {
      if ((error as { name?: string }).name === 'AbortError') return 'cancelled';
    }
  }
  const url = URL.createObjectURL(file);
  const a = document.createElement('a');
  a.href = url;
  a.download = file.name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return 'downloaded';
}
