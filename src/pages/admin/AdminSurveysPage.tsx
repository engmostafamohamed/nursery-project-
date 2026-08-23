import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';

import { SurveyAnalyticsPanel } from '@/components/surveys/SurveyAnalyticsPanel';
import { FormBuilder } from '@/components/surveys/FormBuilder';
import { FormRenderer } from '@/components/surveys/FormRenderer';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { MaterialSymbol } from '@/components/ui/MaterialSymbol';
import { cn } from '@/lib/utils';
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
        <div className="space-y-3">
          {filtered.map((s) => (
            <SurveyCard
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

function SurveyCard({
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
  const [menuOpen, setMenuOpen] = useState(false);

  const questionCount = (s.questions_json ?? []).filter((q) => q.type !== 'section_header').length;

  return (
    <article className="rounded-2xl border border-outline-variant bg-surface-container-lowest p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-sm font-semibold text-on-surface">
              {s.title || '—'}
            </h2>
            <Badge className={cn('text-[10px] border', STATUS_COLORS[s.status])}>
              {t(`survey.status.${s.status}`)}
            </Badge>
            <Badge className="text-[10px]">
              {t(`survey.typeOptions.${s.type}`)}
            </Badge>
          </div>
          <div className="flex flex-wrap gap-3 text-xs text-on-surface-variant">
            <span className="flex items-center gap-1">
              <MaterialSymbol name="help" size="text-xs" />
              {t('survey.questionCount', { count: questionCount })}
            </span>
            <span className="flex items-center gap-1">
              <MaterialSymbol name="people" size="text-xs" />
              {t('survey.responses')}: {responseCount}
            </span>
            {s.deadline && (
              <span className="flex items-center gap-1">
                <MaterialSymbol name="schedule" size="text-xs" />
                {new Date(s.deadline).toLocaleString()}
              </span>
            )}
          </div>
        </div>

        <div className="relative shrink-0">
          <button
            type="button"
            onClick={() => setMenuOpen((o) => !o)}
            className="rounded-xl p-2 text-on-surface-variant hover:bg-surface-high"
          >
            <MaterialSymbol name="more_vert" size="text-base" />
          </button>
          {menuOpen && (
            <>
              <div
                className="fixed inset-0 z-10"
                onClick={() => setMenuOpen(false)}
              />
              <div className="absolute end-0 top-10 z-20 w-52 rounded-2xl border border-outline-variant bg-surface shadow-lg py-1">
                {[
                  ...(canUpdate ? [{ icon: 'edit', label: t('survey.edit'), action: onEdit }] : []),
                  { icon: 'visibility', label: t('survey.preview'), action: onPreview },
                  { icon: 'bar_chart', label: t('survey.analytics.title'), action: onAnalytics },
                  ...(canUpdate && s.status === 'draft'
                    ? [{ icon: 'play_arrow', label: t('survey.activate'), action: onActivate }]
                    : []),
                  ...(canUpdate && s.status === 'active'
                    ? [{ icon: 'stop', label: t('survey.close'), action: onClose }]
                    : []),
                ].map(({ icon, label, action }) => (
                  <button
                    key={label}
                    type="button"
                    onClick={() => { setMenuOpen(false); action(); }}
                    className="flex w-full items-center gap-3 px-4 py-2.5 text-sm text-on-surface hover:bg-surface-high"
                  >
                    <MaterialSymbol name={icon} size="text-sm" className="text-on-surface-variant" />
                    {label}
                  </button>
                ))}
                {canDelete && (
                  <>
                    <div className="my-1 border-t border-outline-variant" />
                    <button
                      type="button"
                      onClick={() => { setMenuOpen(false); onDelete(); }}
                      className="flex w-full items-center gap-3 px-4 py-2.5 text-sm text-error hover:bg-error/5"
                    >
                      <MaterialSymbol name="delete" size="text-sm" />
                      {t('survey.delete')}
                    </button>
                  </>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </article>
  );
}
