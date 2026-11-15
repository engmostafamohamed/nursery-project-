import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';

import { FormRenderer } from '@/components/surveys/FormRenderer';
import { MaterialSymbol } from '@/components/ui/MaterialSymbol';
import { Badge } from '@/components/ui/badge';
import { DataTable, TablePagination, TBody, Td, Th, THead, Tr } from '@/components/ui/DataTable';
import { formatDate } from '@/lib/datetime';
import { cn } from '@/lib/utils';
import { usePagination } from '@/hooks/usePagination';
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
  const pager = usePagination(pending, 10, `${pending.length}`);

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
        <div className="overflow-hidden rounded-xl border border-outline-variant bg-surface shadow-sm">
          <DataTable minWidth={640}>
            <THead>
              <Th>{t('survey.table.survey')}</Th>
              <Th>{t('survey.table.questions')}</Th>
              <Th>{t('survey.table.deadline')}</Th>
              <Th align="end"><span className="sr-only">{t('survey.table.open')}</span></Th>
            </THead>
            <TBody>
              {pager.pageItems.map((s) => (
                <PendingSurveyRow key={s.id} survey={s} onOpen={() => openSurvey(s)} />
              ))}
            </TBody>
          </DataTable>
          <TablePagination pager={pager} pageSizeOptions={[10, 20, 50]} />
        </div>
      )}
    </div>
  );
}

/** One survey to answer, as a table row: its kind (urgent when a permission is due soon), title, questions and deadline. */
function PendingSurveyRow({ survey: s, onOpen }: { survey: SurveyRow; onOpen: () => void }) {
  const { t } = useTranslation();
  const sType = s.type as SurveyType;
  const urgent = sType === 'permission' && deadlineUrgent(s.deadline);
  const passed = deadlinePassed(s.deadline);
  const questionCount = (s.questions_json ?? []).filter((q) => q.type !== 'section_header').length;

  return (
    <Tr onClick={onOpen} className={cn(urgent && 'bg-error/5')} data-testid="parent-survey-row">
      <Td className="min-w-[14rem]">
        <span className="block font-semibold text-on-surface">{s.title}</span>
        <span className="mt-1 flex flex-wrap gap-1.5">
          {urgent ? <Badge className="border-error bg-error/10 text-[10px] text-error">{t('survey.urgentBadge')}</Badge> : null}
          <Badge className="text-[10px]">{t(`survey.typeOptions.${sType}`)}</Badge>
        </span>
      </Td>
      <Td className="whitespace-nowrap text-on-surface-variant">{questionCount > 0 ? t('survey.questionCount', { count: questionCount }) : '—'}</Td>
      <Td className={cn('whitespace-nowrap', passed || urgent ? 'text-error' : 'text-on-surface-variant')}>{s.deadline ? formatDate(s.deadline) : '—'}</Td>
      <Td align="end">
        <MaterialSymbol name="chevron_right" size="text-xl" className="text-primary rtl:rotate-180" />
      </Td>
    </Tr>
  );
}
