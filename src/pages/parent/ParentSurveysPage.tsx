import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';

import { FormRenderer } from '@/components/surveys/FormRenderer';
import { MaterialSymbol } from '@/components/ui/MaterialSymbol';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { formatDate } from '@/lib/datetime';
import { cn } from '@/lib/utils';
import { useAuthSession } from '@/hooks/useAuthSession';
import { useSurveys } from '@/hooks/useSurveys';
import { useSettings } from '@/lib/useSettings';
import type { AnswersMap, SurveyRow, SurveyType } from '@/types/survey';

function deadlineUrgent(iso: string | null | undefined): boolean {
  if (!iso) return false;
  const ms = new Date(iso).getTime() - Date.now();
  return ms > 0 && ms < 48 * 60 * 60 * 1000;
}

function deadlinePassed(iso: string | null | undefined): boolean {
  if (!iso) return false;
  return new Date(iso).getTime() < Date.now();
}

export function ParentSurveysPage() {
  const { t } = useTranslation();
  const { user } = useAuthSession();
  const { nurseryId } = useSettings();
  const surveys = useSurveys({ nurseryId: nurseryId ?? undefined, parentId: user?.id });

  const [active, setActive] = useState<SurveyRow | null>(null);
  const [answers, setAnswers] = useState<AnswersMap>({});
  const [submitting, setSubmitting] = useState(false);

  const pending = useMemo(() => {
    return [...surveys.parentPendingSurveys].sort((a, b) => {
      const aPermission = (a.type as SurveyType) === 'permission';
      const bPermission = (b.type as SurveyType) === 'permission';
      const aUrgent = aPermission && deadlineUrgent(a.deadline);
      const bUrgent = bPermission && deadlineUrgent(b.deadline);
      if (aUrgent !== bUrgent) return aUrgent ? -1 : 1;
      if (aPermission !== bPermission) return aPermission ? -1 : 1;
      const aDeadline = a.deadline ? new Date(a.deadline).getTime() : Infinity;
      const bDeadline = b.deadline ? new Date(b.deadline).getTime() : Infinity;
      return aDeadline - bDeadline;
    });
  }, [surveys.parentPendingSurveys]);

  const openSurvey = (s: SurveyRow) => {
    setActive(s);
    setAnswers({});
  };

  const handleSubmit = async () => {
    if (!user?.id || !active) return;
    setSubmitting(true);
    try {
      await surveys.submitResponse({
        surveyId: active.id,
        userId: user.id,
        answers,
      });
      toast.success(t('survey.submitted'));
    } catch (err) {
      toast.error(t('survey.submitFailed'), {
        description: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setSubmitting(false);
    }
  };

  if (active) {
    return (
      <div className="flex h-[calc(100vh-4rem)] flex-col">
        <div className="flex items-center gap-3 border-b border-outline-variant px-4 py-3">
          <button
            onClick={() => setActive(null)}
            className="flex items-center gap-1.5 text-sm text-on-surface-variant hover:text-on-surface"
          >
            <MaterialSymbol name="arrow_back" size="text-sm" />
          </button>
          <h1 className="flex-1 truncate text-sm font-semibold text-on-surface">
            {active.title}
          </h1>
        </div>
        <div className="flex-1 overflow-y-auto">
          <FormRenderer
            title={active.title}
            questions={active.questions_json ?? []}
            answers={answers}
            onChange={setAnswers}
            mode="respond"
            deadline={active.deadline}
            onSubmit={() => void handleSubmit()}
            submitting={submitting}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5 pb-8">
      <div>
        <h1 className="text-lg font-semibold text-on-surface">{t('survey.parentTitle')}</h1>
        <p className="text-sm text-on-surface-variant">{t('survey.parentSubtitle')}</p>
      </div>

      {surveys.isLoading ? (
        <div className="space-y-3">
          {[1, 2].map((i) => (
            <div key={i} className="h-24 animate-pulse rounded-2xl bg-surface-high" />
          ))}
        </div>
      ) : pending.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-outline-variant py-16 text-center">
          <MaterialSymbol name="check_circle" size="text-5xl" className="text-success" />
          <p className="text-sm font-medium text-on-surface">{t('survey.allDone')}</p>
          <p className="text-xs text-on-surface-variant">{t('survey.noActive')}</p>
        </div>
      ) : (
        <div className="space-y-3">
          {pending.map((s) => (
            <SurveyListItem
              key={s.id}
              survey={s}
              onOpen={() => openSurvey(s)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function SurveyListItem({ survey: s, onOpen }: { survey: SurveyRow; onOpen: () => void }) {
  const { t } = useTranslation();
  const sType = s.type as SurveyType;
  const urgent = sType === 'permission' && deadlineUrgent(s.deadline);
  const passed = deadlinePassed(s.deadline);
  const questionCount = (s.questions_json ?? []).filter((q) => q.type !== 'section_header').length;

  return (
    <button
      type="button"
      onClick={onOpen}
      className={cn(
        'w-full rounded-2xl border p-4 text-start transition-all hover:shadow-md active:scale-[0.99]',
        urgent
          ? 'border-error/50 bg-error/5 ring-1 ring-error/20'
          : 'border-outline-variant bg-surface-container-lowest hover:border-primary/40',
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1 space-y-1.5">
          <div className="flex flex-wrap items-center gap-2">
            {urgent && (
              <Badge className="border-error bg-error/10 text-error text-[10px]">
                {t('survey.urgentBadge')}
              </Badge>
            )}
            <Badge className="text-[10px]">
              {t(`survey.typeOptions.${sType}`)}
            </Badge>
          </div>
          <h2 className="text-sm font-semibold text-on-surface">{s.title}</h2>
          <div className="flex flex-wrap gap-3 text-xs text-on-surface-variant">
            {questionCount > 0 && (
              <span className="flex items-center gap-1">
                <MaterialSymbol name="help_outline" size="text-xs" />
                {t('survey.questionCount', { count: questionCount })}
              </span>
            )}
            {s.deadline && (
              <span
                className={cn(
                  'flex items-center gap-1',
                  passed ? 'text-error' : urgent ? 'text-error' : '',
                )}
              >
                <MaterialSymbol name="schedule" size="text-xs" />
                {formatDate(s.deadline)}
              </span>
            )}
          </div>
        </div>
        <div className="shrink-0 rounded-full bg-primary/10 p-2 text-primary">
          <MaterialSymbol name="chevron_right" size="text-base" />
        </div>
      </div>
    </button>
  );
}
