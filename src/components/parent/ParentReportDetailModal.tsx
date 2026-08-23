import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';

import { ReportReactionButtons } from '@/components/parent/ReportReactionButtons';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { MaterialSymbol } from '@/components/ui/MaterialSymbol';
import type { ParentReaction, ParentReportItem } from '@/hooks/useParentReports';
import { formatDateTime } from '@/lib/datetime';
import {
  formatActivityTag,
  formatMealSlot,
  formatMoodLabel,
  formatNapQuality,
} from '@/lib/dailyReportDisplay';
import { generateDailyReportShareText } from '@/lib/reportShare';

type Props = {
  open: boolean;
  report: ParentReportItem | null;
  reaction?: ParentReaction;
  onOpenChange: (open: boolean) => void;
  onPrev: () => void;
  onNext: () => void;
  onReact: (payload: { reaction?: string; comment?: string }) => Promise<void>;
};

export function ParentReportDetailModal({ open, report, reaction, onOpenChange, onPrev, onNext, onReact }: Props) {
  const { t } = useTranslation();

  const shareText = useMemo(() => {
    if (!report) return '';
    const tags = (report.activities.tags as string[] | undefined) ?? (report.activities.participated_in as string[] | undefined) ?? [];
    const activities = tags.map((x) => formatActivityTag(t, x)).join(', ') || '-';
    const napMinutes = Number(report.nap.duration_minutes ?? 0);
    return generateDailyReportShareText({
      childName: report.childName,
      date: report.reportDate,
      mood: formatMoodLabel(t, report.mood.mood),
      meals: formatMealSlot(t, report.meals.breakfast as Record<string, unknown> | undefined),
      nap: napMinutes ? `${napMinutes} ${t('parent.reports.minutes')}` : '-',
      activities,
      teacherName: report.teacherName,
    });
  }, [report, t]);

  const bottleSessions = report?.feeding.bottle_sessions as Array<Record<string, unknown>> | undefined;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <MaterialSymbol name="assignment" className="text-primary" />
            {t('parent.reports.detailTitle')}
          </DialogTitle>
        </DialogHeader>
        {report ? (
          <div className="space-y-3">
            <section className="rounded-xl border border-outline-variant p-3">
              <p className="flex items-center gap-2 font-semibold text-on-surface">
                <MaterialSymbol name="restaurant" />
                {t('parent.reports.sections.meals')}
              </p>
              <p className="text-sm">
                {t('parent.reports.meals.breakfast')}: {formatMealSlot(t, report.meals.breakfast as Record<string, unknown> | undefined)}
              </p>
              <p className="text-sm">
                {t('parent.reports.meals.lunch')}: {formatMealSlot(t, report.meals.lunch as Record<string, unknown> | undefined)}
              </p>
              <p className="text-sm">
                {t('parent.reports.meals.snacks')}: {formatMealSlot(t, report.meals.snacks as Record<string, unknown> | undefined)}
              </p>
              {report.meals.water != null ? (
                <p className="text-sm">
                  {t('parent.reports.meals.water')}: {String(report.meals.water)}
                </p>
              ) : null}
            </section>
            <section className="rounded-xl border border-outline-variant p-3">
              <p className="flex items-center gap-2 font-semibold text-on-surface">
                <MaterialSymbol name="bedtime" />
                {t('parent.reports.sections.nap')}
              </p>
              <p className="text-sm">
                {t('parent.reports.nap.napped')}: {Boolean(report.nap.napped) ? t('common.yes') : t('common.no')}
              </p>
              <p className="text-sm">
                {t('parent.reports.nap.duration')}: {Number(report.nap.duration_minutes ?? 0)} {t('parent.reports.minutes')}
              </p>
              {report.nap.quality != null ? (
                <p className="text-sm">
                  {t('parent.reports.nap.quality')}: {formatNapQuality(t, report.nap.quality)}
                </p>
              ) : null}
            </section>
            <section className="rounded-xl border border-outline-variant p-3">
              <p className="flex items-center gap-2 font-semibold text-on-surface">
                <MaterialSymbol name="sentiment_satisfied" />
                {t('parent.reports.sections.mood')}
              </p>
              <p className="text-sm">
                {t('parent.reports.mood.label')}: {formatMoodLabel(t, report.mood.mood)}
              </p>
              {report.mood.energy_level != null ? (
                <p className="text-sm">
                  {t('parent.reports.mood.energy')}: {String(report.mood.energy_level)}
                </p>
              ) : null}
            </section>
            <section className="rounded-xl border border-outline-variant p-3">
              <p className="flex items-center gap-2 font-semibold text-on-surface">
                <MaterialSymbol name="baby_changing_station" />
                {t('parent.reports.sections.toilet')}
              </p>
              <p className="text-sm">
                {t('parent.reports.toilet.changeCount')}:{' '}
                {Number(report.toilet.change_count ?? report.toilet.diaper_changes ?? 0)}
              </p>
              {report.toilet.notes ? <p className="text-sm">{String(report.toilet.notes)}</p> : null}
            </section>
            <section className="rounded-xl border border-outline-variant p-3">
              <p className="flex items-center gap-2 font-semibold text-on-surface">
                <MaterialSymbol name="palette" />
                {t('parent.reports.sections.activities')}
              </p>
              <p className="text-sm">
                {t('parent.reports.activities.tags')}:{' '}
                {(
                  (report.activities.tags as string[] | undefined) ??
                  (report.activities.participated_in as string[] | undefined) ??
                  []
                )
                  .map((x) => formatActivityTag(t, x))
                  .join(', ') || '—'}
              </p>
              {(report.activities.free_text ?? report.activities.other_activity) ? (
                <p className="text-sm">
                  {t('parent.reports.activities.freeText')}: {String(report.activities.free_text ?? report.activities.other_activity)}
                </p>
              ) : null}
              {report.activities.notes ? <p className="text-sm">{String(report.activities.notes)}</p> : null}
            </section>
            {Array.isArray(bottleSessions) && bottleSessions.length > 0 ? (
              <section className="rounded-xl border border-outline-variant p-3">
                <p className="flex items-center gap-2 font-semibold text-on-surface">
                  <MaterialSymbol name="nutrition" />
                  {t('parent.reports.feeding.bottleSessions')}
                </p>
                <ul className="list-inside list-disc text-sm">
                  {bottleSessions.map((b, i) => (
                    <li key={i}>
                      {String(b.time ?? '—')} — {Number(b.amount_ml ?? b.amountMl ?? 0)} ml
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}
            {(Number(report.feeding.bottle_feeds_count ?? 0) > 0 || Number(report.feeding.nursing_count ?? 0) > 0) &&
            !(Array.isArray(bottleSessions) && bottleSessions.length) ? (
              <section className="rounded-xl border border-outline-variant p-3">
                <p className="flex items-center gap-2 font-semibold text-on-surface">
                  <MaterialSymbol name="nutrition" />
                  {t('parent.reports.sections.feeding')}
                </p>
                <p className="text-sm">
                  {t('parent.reports.feeding.bottleFeeds')}: {Number(report.feeding.bottle_feeds_count ?? 0)}
                </p>
              </section>
            ) : null}
            {report.specialNotes ? (
              <section className="rounded-xl border border-outline-variant p-3">
                <p className="flex items-center gap-2 font-semibold text-on-surface">
                  <MaterialSymbol name="sticky_note_2" />
                  {t('parent.reports.sections.notes')}
                </p>
                <p className="text-sm">{report.specialNotes}</p>
              </section>
            ) : null}
            <p className="text-xs text-on-surface-variant">
              {t('parent.reports.publishedBy', {
                teacher: report.teacherName,
                at: report.publishedAt ? formatDateTime(report.publishedAt) : '-',
              })}
            </p>
            <ReportReactionButtons
              initialReaction={reaction?.reaction}
              initialComment={reaction?.comment}
              onSave={onReact}
            />
            <div className="flex flex-wrap justify-between gap-2">
              <div className="flex gap-2">
                <Button variant="outline" onClick={onPrev}>
                  {t('common.previous')}
                </Button>
                <Button variant="outline" onClick={onNext}>
                  {t('common.next')}
                </Button>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => toast.message(t('common.comingSoon'))}>
                  {t('parent.reports.downloadPdf')}
                </Button>
                <Button
                  variant="outline"
                  onClick={async () => {
                    await navigator.clipboard.writeText(shareText);
                    toast.success(t('parent.reports.shareCopied'));
                  }}
                >
                  {t('parent.reports.share')}
                </Button>
              </div>
            </div>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
