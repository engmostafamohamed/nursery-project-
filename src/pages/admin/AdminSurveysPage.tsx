import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';

import { SurveyAnalyticsPanel } from '@/components/surveys/SurveyAnalyticsPanel';
import { FormBuilder } from '@/components/surveys/FormBuilder';
import { FormRenderer } from '@/components/surveys/FormRenderer';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { DataTable, IconAction, TablePagination, TBody, Td, Th, THead, Tr } from '@/components/ui/DataTable';
import { MaterialSymbol } from '@/components/ui/MaterialSymbol';
import { cn } from '@/lib/utils';
import { usePagination } from '@/hooks/usePagination';
import { useCanAction } from '@/hooks/usePermissions';
import { useSettings } from '@/lib/useSettings';
import type { SendAudience } from '@/components/surveys/FormBuilder';
import type { FormQuestion, SurveyRow, SurveyStatus, SurveyType } from '@/types/survey';
import { formatQueryError } from '@/lib/utils';
import { useSurveys } from '@/hooks/useSurveys';

type Panel =
  | { kind: 'list' }
  | { kind: 'create' }
  | { kind: 'edit'; survey: SurveyRow }
  | { kind: 'analytics'; survey: SurveyRow }
  | { kind: 'preview'; survey: SurveyRow };

const STATUS_COLORS: Record<SurveyStatus, string> = {
  draft: 'border-outline-variant text-on-surface-variant',
  active: 'border-success/40 bg-success/10 text-success',
  published: 'border-primary/40 bg-primary/10 text-primary',
  closed: 'border-outline-variant bg-surface-high text-on-surface-variant',
};

export function AdminSurveysPage() {
  const { t } = useTranslation();
  const { nurseryId } = useSettings();
  const surveys = useSurveys({ nurseryId: nurseryId ?? undefined });

  const canCreate = useCanAction('surveys', 'create');
  const canUpdate = useCanAction('surveys', 'update');
  const canDelete = useCanAction('surveys', 'delete');

  const [panel, setPanel] = useState<Panel>({ kind: 'list' });
  const [saving, setSaving] = useState(false);
  const [statusFilter, setStatusFilter] = useState<'all' | SurveyStatus>('all');

  const filtered =
    statusFilter === 'all'
      ? surveys.surveys
      : surveys.surveys.filter((s) => s.status === statusFilter);
  const pager = usePagination(filtered, 10, `${filtered.length}`);

  const handleCreate = async (data: {
    title: string;
    type: SurveyType;
    questions: FormQuestion[];
    deadline: string | null;
    audience: SendAudience;
  }) => {
    if (!nurseryId) return;
    setSaving(true);
    try {
      await surveys.createSurvey({
        nurseryId,
        title: data.title,
        type: data.type,
        questions: data.questions,
        deadline: data.deadline,
        targetClassIds: data.audience.mode === 'classes' ? data.audience.classIds : null,
      });
      toast.success(t('survey.sent'));
      setPanel({ kind: 'list' });
    } catch (err) {
      toast.error(t('survey.createFailed'), { description: formatQueryError(err) });
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = async (
    id: string,
    data: { title: string; type: SurveyType; questions: FormQuestion[]; deadline: string | null; audience: SendAudience },
  ) => {
    setSaving(true);
    try {
      await surveys.updateSurvey({
        id,
        updates: {
          title: data.title,
          title_ar: data.title,
          title_en: data.title,
          type: data.type,
          questions_json: data.questions,
          deadline: data.deadline,
          status: 'active',
        },
        surveyType: data.type,
        title: data.title,
        deadline: data.deadline,
        nurseryId: nurseryId ?? undefined,
        targetClassIds: data.audience.mode === 'classes' ? data.audience.classIds : null,
      });
      toast.success(t('survey.sent'));
      setPanel({ kind: 'list' });
    } catch (err) {
      toast.error(t('survey.createFailed'), { description: formatQueryError(err) });
    } finally {
      setSaving(false);
    }
  };

  const handleActivate = async (s: SurveyRow) => {
    if (s.type === 'permission' && !s.deadline) {
      toast.error(t('survey.validation.deadlineRequired'));
      return;
    }
    try {
      await surveys.updateSurvey({
        id: s.id,
        updates: { status: 'active' },
        surveyType: s.type,
        title: s.title,
        deadline: s.deadline,
        nurseryId: nurseryId ?? undefined,
      });
      toast.success(
        s.type === 'permission' && s.deadline
          ? t('survey.activatedWithNotify')
          : t('survey.activated'),
      );
    } catch (err) {
      toast.error(t('survey.activateFailed'), {
        description: err instanceof Error ? err.message : String(err),
      });
    }
  };

  const handleClose = async (id: string) => {
    try {
      await surveys.updateSurvey({ id, updates: { status: 'closed' } });
      toast.success(t('survey.closed'));
    } catch (err) {
      toast.error(t('survey.closeFailed'), {
        description: err instanceof Error ? err.message : String(err),
      });
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await surveys.deleteSurvey(id);
      toast.success(t('survey.deleted'));
    } catch (err) {
      toast.error(t('survey.deleteFailed'), {
        description: err instanceof Error ? err.message : String(err),
      });
    }
  };

  if (panel.kind === 'create') {
    return (
      <div className="h-[calc(100vh-4rem)]">
        <FormBuilder
          nurseryId={nurseryId}
          onSave={handleCreate}
          onCancel={() => setPanel({ kind: 'list' })}
          saving={saving}
        />
      </div>
    );
  }

  if (panel.kind === 'edit') {
    const s = panel.survey;
    return (
      <div className="h-[calc(100vh-4rem)]">
        <FormBuilder
          initialTitle={s.title}
          initialType={s.type}
          initialDeadline={s.deadline ? new Date(s.deadline).toISOString().slice(0, 16) : ''}
          initialQuestions={s.questions_json ?? []}
          nurseryId={nurseryId}
          onSave={(data) => handleEdit(s.id, data)}
          onCancel={() => setPanel({ kind: 'list' })}
          saving={saving}
        />
      </div>
    );
  }

  if (panel.kind === 'preview') {
    const s = panel.survey;
    return (
      <div className="h-[calc(100vh-4rem)]">
        <FormRenderer
          title={s.title}
          questions={s.questions_json ?? []}
          answers={{}}
          onChange={() => undefined}
          mode="preview"
          deadline={s.deadline}
          onSubmit={() => setPanel({ kind: 'list' })}
        />
      </div>
    );
  }

  if (panel.kind === 'analytics') {
    const s = panel.survey;
    const responses = surveys.allResponses.filter((r) => r.survey_id === s.id);
    return (
      <div className="h-[calc(100vh-4rem)]">
        <SurveyAnalyticsPanel
          questions={s.questions_json ?? []}
          responses={responses}
          onClose={() => setPanel({ kind: 'list' })}
        />
      </div>
    );
  }

  const STATUS_TABS: Array<'all' | SurveyStatus> = ['all', 'draft', 'active', 'closed'];

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-on-surface">{t('survey.adminTitle')}</h1>
          <p className="text-sm text-on-surface-variant">{t('survey.adminSubtitle')}</p>
        </div>
        {canCreate && (
          <Button onClick={() => setPanel({ kind: 'create' })}>
            <MaterialSymbol name="add" size="text-sm" className="me-1.5" />
            {t('survey.new')}
          </Button>
        )}
      </div>

      <div className="flex gap-2 overflow-x-auto pb-1">
        {STATUS_TABS.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setStatusFilter(s)}
            className={cn(
              'shrink-0 rounded-full px-4 py-1.5 text-sm font-medium transition-colors',
              statusFilter === s
                ? 'bg-primary text-primary-foreground'
                : 'bg-surface-high text-on-surface-variant hover:text-on-surface',
            )}
          >
            {s === 'all' ? t('survey.filterAll') : t(`survey.status.${s}`)}
          </button>
        ))}
      </div>

      {surveys.isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-24 animate-pulse rounded-2xl bg-surface-high" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-outline-variant py-16 text-center">
          <MaterialSymbol name="assignment" size="text-5xl" className="text-outline-variant" />
          <p className="text-sm text-on-surface-variant">{t('survey.empty')}</p>
          {canCreate && (
            <Button variant="outline" size="sm" onClick={() => setPanel({ kind: 'create' })}>
              {t('survey.new')}
            </Button>
          )}
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-outline-variant bg-surface shadow-sm">
          <DataTable minWidth={900}>
            <THead>
              <Th>{t('survey.table.survey')}</Th>
              <Th>{t('survey.table.status')}</Th>
              <Th>{t('survey.table.questions')}</Th>
              <Th>{t('survey.responses')}</Th>
              <Th>{t('survey.table.deadline')}</Th>
              <Th align="end">{t('survey.table.actions')}</Th>
            </THead>
            <TBody>
              {pager.pageItems.map((s) => (
                <SurveyRow
                  key={s.id}
                  survey={s}
                  responseCount={surveys.responseCounts.get(s.id) ?? 0}
                  canUpdate={canUpdate}
                  canDelete={canDelete}
                  onEdit={() => setPanel({ kind: 'edit', survey: s })}
                  onPreview={() => setPanel({ kind: 'preview', survey: s })}
                  onAnalytics={() => setPanel({ kind: 'analytics', survey: s })}
                  onActivate={() => void handleActivate(s)}
                  onClose={() => void handleClose(s.id)}
                  onDelete={() => void handleDelete(s.id)}
                />
              ))}
            </TBody>
          </DataTable>
          <TablePagination pager={pager} pageSizeOptions={[10, 20, 50]} />
        </div>
      )}
    </div>
  );
}

type SurveyCardProps = {
  survey: SurveyRow;
  responseCount: number;
  canUpdate: boolean;
  canDelete: boolean;
  onEdit: () => void;
  onPreview: () => void;
  onAnalytics: () => void;
  onActivate: () => void;
  onClose: () => void;
  onDelete: () => void;
};

function SurveyRow({
  survey: s,
  responseCount,
  canUpdate,
  canDelete,
  onEdit,
  onPreview,
  onAnalytics,
  onActivate,
  onClose,
  onDelete,
}: SurveyCardProps) {
  const { t } = useTranslation();
  const questionCount = (s.questions_json ?? []).filter((q) => q.type !== 'section_header').length;

  return (
    <Tr onClick={onPreview} data-testid="survey-row">
      <Td className="min-w-[14rem]">
        <span className="block font-semibold text-on-surface">{s.title || '—'}</span>
        <Badge className="mt-1 text-[10px]">{t(`survey.typeOptions.${s.type}`)}</Badge>
      </Td>
      <Td>
        <Badge className={cn('border text-[10px]', STATUS_COLORS[s.status])}>{t(`survey.status.${s.status}`)}</Badge>
      </Td>
      <Td className="whitespace-nowrap text-on-surface-variant">{t('survey.questionCount', { count: questionCount })}</Td>
      <Td className="whitespace-nowrap font-semibold tabular-nums text-on-surface">{responseCount}</Td>
      <Td className="whitespace-nowrap text-on-surface-variant">{s.deadline ? new Date(s.deadline).toLocaleString() : '—'}</Td>
      <Td align="end">
        <span className="flex items-center justify-end gap-0.5">
          {canUpdate ? <IconAction icon="edit" label={t('survey.edit')} onClick={onEdit} /> : null}
          <IconAction icon="visibility" label={t('survey.preview')} onClick={onPreview} />
          <IconAction icon="bar_chart" label={t('survey.analytics.title')} onClick={onAnalytics} />
          {canUpdate && s.status === 'draft' ? <IconAction icon="play_arrow" label={t('survey.activate')} onClick={onActivate} /> : null}
          {canUpdate && s.status === 'active' ? <IconAction icon="stop" label={t('survey.close')} onClick={onClose} /> : null}
          {canDelete ? <IconAction icon="delete" label={t('survey.delete')} onClick={onDelete} danger /> : null}
        </span>
      </Td>
    </Tr>
  );
}
