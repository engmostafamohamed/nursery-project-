import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';

import { DailyReportSheet } from '@/components/daily-reports/DailyReportSheet';
import { ReportReactionButtons } from '@/components/parent/ReportReactionButtons';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { MaterialSymbol } from '@/components/ui/MaterialSymbol';
import type { ParentReaction, ParentReportItem } from '@/hooks/useParentReports';
import { MEALS } from '@/lib/dailyReport';
import { childNameOf } from '@/lib/dailyReportCard';
import { formatActivityTag } from '@/lib/dailyReportDisplay';
import { mealAmountName, moodName, napDurationText, questionName } from '@/lib/dailyReportLabels';
import { senderParts } from '@/lib/familyMessages';
import { generateDailyReportShareText } from '@/lib/reportShare';

type Props = {
  open: boolean;
  report: ParentReportItem | null;
  reaction?: ParentReaction;
  onOpenChange: (open: boolean) => void;
  onPrev: () => void;
  onNext: () => void;
  hasPrev: boolean;
  hasNext: boolean;
  onReact: (payload: { reaction?: string; comment?: string }) => Promise<void>;
};

/** A sent report in the family's template, with their reaction, previous/next and sharing. */
export function ParentReportDetailModal({ open, report, reaction, onOpenChange, onPrev, onNext, hasPrev, hasNext, onReact }: Props) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;

  const shareText = useMemo(() => {
    if (!report) return '';
    const a = report.answers;
    const meals = MEALS.map((m) => `${questionName(t, m)}: ${a.meals[m].amount ? mealAmountName(t, a.meals[m].amount) : '-'}`).join(' · ');
    const nap = a.nap.napped && a.nap.durationMinutes ? napDurationText(t, a.nap.durationMinutes) : a.nap.napped === false ? t('dailyReport.sheet.noNap') : '-';
    return generateDailyReportShareText({
      childName: childNameOf(report, lang),
      date: report.reportDate,
      mood: a.mood.mood ? moodName(t, a.mood.mood) : '-',
      meals,
      nap,
      activities: a.activities.tags.map((x) => formatActivityTag(t, x)).join(', ') || a.activities.freeText || '-',
      teacherName: report.sender ? senderParts(report.sender, lang).name ?? '-' : '-',
    });
  }, [report, t, lang]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] max-w-3xl overflow-y-auto p-0 sm:p-0">
        <DialogHeader className="sr-only">
          <DialogTitle>{t('parent.reports.detailTitle')}</DialogTitle>
          <DialogDescription>{report ? childNameOf(report, lang) : ''}</DialogDescription>
        </DialogHeader>
        {report ? (
          <div className="space-y-4 p-3 sm:p-5">
            {/* A new sheet per report, so its animations play again. */}
            <DailyReportSheet key={report.id} card={report} />
            <ReportReactionButtons initialReaction={reaction?.reaction} initialComment={reaction?.comment} onSave={onReact} />
            <div className="flex flex-wrap justify-between gap-2">
              <div className="flex gap-2">
                <Button variant="outline" onClick={onPrev} disabled={!hasPrev}>
                  <MaterialSymbol name="chevron_left" className="me-1 text-lg rtl:rotate-180" />
                  {t('common.previous')}
                </Button>
                <Button variant="outline" onClick={onNext} disabled={!hasNext}>
                  {t('common.next')}
                  <MaterialSymbol name="chevron_right" className="ms-1 text-lg rtl:rotate-180" />
                </Button>
              </div>
              <Button
                variant="outline"
                onClick={async () => {
                  await navigator.clipboard.writeText(shareText);
                  toast.success(t('parent.reports.shareCopied'));
                }}
              >
                <MaterialSymbol name="share" className="me-1 text-base" />
                {t('parent.reports.share')}
              </Button>
            </div>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
