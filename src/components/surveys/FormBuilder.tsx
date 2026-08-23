import { useCallback, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { MaterialSymbol } from '@/components/ui/MaterialSymbol';
import { Textarea } from '@/components/ui/textarea';
import { supabase } from '@/lib/supabase';
import { cn } from '@/lib/utils';
import type { AnswersMap, FormQuestion, QuestionType, SurveyType } from '@/types/survey';

import { FormRenderer } from './FormRenderer';

type QuestionTypeMeta = {
  type: QuestionType;
  icon: string;
  labelKey: string;
};

const QUESTION_TYPES: QuestionTypeMeta[] = [
  { type: 'short_text', icon: 'short_text', labelKey: 'short_text' },
  { type: 'long_text', icon: 'notes', labelKey: 'long_text' },
  { type: 'multiple_choice', icon: 'radio_button_checked', labelKey: 'multiple_choice' },
  { type: 'checkboxes', icon: 'check_box', labelKey: 'checkboxes' },
  { type: 'dropdown', icon: 'arrow_drop_down_circle', labelKey: 'dropdown' },
  { type: 'linear_scale', icon: 'linear_scale', labelKey: 'linear_scale' },
  { type: 'star_rating', icon: 'star', labelKey: 'star_rating' },
  { type: 'yes_no', icon: 'thumbs_up_down', labelKey: 'yes_no' },
  { type: 'date', icon: 'calendar_today', labelKey: 'date' },
  { type: 'section_header', icon: 'title', labelKey: 'section_header' },
];

function uid(): string {
  return Math.random().toString(36).slice(2, 10);
}

function makeQuestion(type: QuestionType): FormQuestion {
  const base: FormQuestion = { id: uid(), type, label: '', required: false };
  if (type === 'multiple_choice' || type === 'checkboxes' || type === 'dropdown') {
    return { ...base, options: [''] };
  }
  if (type === 'linear_scale') {
    return { ...base, scaleMin: 1, scaleMax: 5, scaleMinLabel: '', scaleMaxLabel: '' };
  }
  return base;
}

export type SendAudience = {
  mode: 'all' | 'classes';
  classIds: string[];
};

type FormBuilderProps = {
  initialTitle?: string;
  initialType?: SurveyType;
  initialDeadline?: string;
  initialQuestions?: FormQuestion[];
  nurseryId?: string | null;
  onSave: (data: {
    title: string;
    type: SurveyType;
    questions: FormQuestion[];
    deadline: string | null;
    audience: SendAudience;
  }) => Promise<void>;
  onCancel: () => void;
  saving?: boolean;
};

export function FormBuilder({
  initialTitle = '',
  initialType = 'questionnaire',
  initialDeadline = '',
  initialQuestions = [],
  nurseryId,
  onSave,
  onCancel,
  saving = false,
}: FormBuilderProps) {
  const { t } = useTranslation();

  const [title, setTitle] = useState(initialTitle);
  const [surveyType, setSurveyType] = useState<SurveyType>(initialType);
  const [deadline, setDeadline] = useState(initialDeadline);
  const [questions, setQuestions] = useState<FormQuestion[]>(initialQuestions);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [showTypePicker, setShowTypePicker] = useState(false);
  const [showSendPanel, setShowSendPanel] = useState(false);
  const [preview, setPreview] = useState(false);
  const [previewAnswers, setPreviewAnswers] = useState<AnswersMap>({});

  const classesQuery = useQuery({
    queryKey: ['builder-classes', nurseryId],
    queryFn: async () => {
      if (!nurseryId) return [];
      const { data } = await supabase
        .from('classes')
        .select('id, name_ar, name_en')
        .eq('nursery_id', nurseryId)
        .order('created_at', { ascending: false });
      return (data ?? []) as { id: string; name_ar: string; name_en: string }[];
    },
    enabled: Boolean(nurseryId),
  });

  const addQuestion = useCallback((type: QuestionType) => {
    const q = makeQuestion(type);
    setQuestions((prev) => [...prev, q]);
    setActiveId(q.id);
    setShowTypePicker(false);
  }, []);

  const updateQuestion = useCallback((id: string, patch: Partial<FormQuestion>) => {
    setQuestions((prev) => prev.map((q) => (q.id === id ? { ...q, ...patch } : q)));
  }, []);

  const deleteQuestion = useCallback((id: string) => {
    setQuestions((prev) => prev.filter((q) => q.id !== id));
    setActiveId(null);
  }, []);

  const moveQuestion = useCallback((id: string, dir: -1 | 1) => {
    setQuestions((prev) => {
      const idx = prev.findIndex((q) => q.id === id);
      if (idx < 0) return prev;
      const next = idx + dir;
      if (next < 0 || next >= prev.length) return prev;
      const arr = [...prev];
      [arr[idx], arr[next]] = [arr[next]!, arr[idx]!];
      return arr;
    });
  }, []);

  const handleSend = async (audience: SendAudience) => {
    await onSave({
      title,
      type: surveyType,
      questions,
      deadline: deadline ? new Date(deadline).toISOString() : null,
      audience,
    });
  };

  if (preview) {
    return (
      <div className="flex h-full flex-col">
        <div className="flex items-center gap-3 border-b border-outline-variant px-4 py-3">
          <button
            onClick={() => setPreview(false)}
            className="flex items-center gap-1.5 text-sm text-on-surface-variant hover:text-on-surface"
          >
            <MaterialSymbol name="arrow_back" size="text-sm" />
            {t('survey.builder.backToEditor')}
          </button>
          <span className="text-sm font-medium text-on-surface">{title || t('survey.builder.untitledForm')}</span>
        </div>
        <div className="flex-1 overflow-y-auto">
          <FormRenderer
            title={title}
            questions={questions}
            answers={previewAnswers}
            onChange={setPreviewAnswers}
            mode="preview"
            onSubmit={() => setPreview(false)}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-outline-variant px-4 py-3">
        <button
          onClick={onCancel}
          className="flex items-center gap-1.5 text-sm text-on-surface-variant hover:text-on-surface"
        >
          <MaterialSymbol name="arrow_back" size="text-sm" />
          {t('survey.builder.backToList')}
        </button>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={() => setPreview(true)}>
            <MaterialSymbol name="visibility" size="text-sm" className="me-1.5" />
            {t('survey.builder.preview')}
          </Button>
          <Button
            size="sm"
            onClick={() => setShowSendPanel(true)}
            disabled={saving || !title.trim() || questions.length === 0}
          >
            <MaterialSymbol name="send" size="text-sm" className="me-1.5" />
            {t('survey.builder.send')}
          </Button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-6 space-y-6 max-w-2xl mx-auto w-full">
        <section className="space-y-4 rounded-2xl border border-outline-variant bg-surface-container-lowest p-5">
          <div className="space-y-1.5">
            <Label>{t('survey.builder.formTitle')}</Label>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={t('survey.builder.formTitlePlaceholder')}
              className="text-base font-medium"
            />
          </div>

          <div className="space-y-1.5">
            <Label>{t('survey.fields.type')}</Label>
            <div className="grid grid-cols-2 gap-2">
              {(['questionnaire', 'permission'] as const).map((opt) => (
                <button
                  key={opt}
                  type="button"
                  onClick={() => setSurveyType(opt)}
                  className={cn(
                    'rounded-xl border px-3 py-2.5 text-sm font-medium transition-all',
                    surveyType === opt
                      ? 'border-primary bg-primary/10 text-primary'
                      : 'border-outline-variant bg-surface text-foreground hover:border-primary/40',
                  )}
                >
                  {t(`survey.typeOptions.${opt}`)}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>
              {t('survey.fields.deadline')}
              {surveyType === 'permission' && <span className="ms-1 text-error">*</span>}
            </Label>
            <Input
              type="datetime-local"
              value={deadline}
              onChange={(e) => setDeadline(e.target.value)}
            />
          </div>
        </section>

        <div className="space-y-3">
          {questions.map((q, idx) => (
            <QuestionCard
              key={q.id}
              question={q}
              index={idx}
              total={questions.length}
              isActive={activeId === q.id}
              allQuestions={questions}
              onActivate={() => setActiveId(activeId === q.id ? null : q.id)}
              onUpdate={(patch) => updateQuestion(q.id, patch)}
              onDelete={() => deleteQuestion(q.id)}
              onMove={(dir) => moveQuestion(q.id, dir)}
            />
          ))}

          {showTypePicker ? (
            <TypePicker onSelect={addQuestion} onClose={() => setShowTypePicker(false)} />
          ) : (
            <button
              onClick={() => setShowTypePicker(true)}
              className="flex w-full items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-outline-variant py-4 text-sm font-medium text-on-surface-variant transition-colors hover:border-primary/60 hover:text-primary"
            >
              <MaterialSymbol name="add_circle" size="text-base" />
              {t('survey.builder.addQuestion')}
            </button>
          )}
        </div>
      </div>

      {showSendPanel && (
        <SendPanel
          classes={classesQuery.data ?? []}
          saving={saving}
          onSend={(audience) => void handleSend(audience)}
          onClose={() => setShowSendPanel(false)}
        />
      )}
    </div>
  );
}

type QuestionCardProps = {
  question: FormQuestion;
  index: number;
  total: number;
  isActive: boolean;
  allQuestions: FormQuestion[];
  onActivate: () => void;
  onUpdate: (patch: Partial<FormQuestion>) => void;
  onDelete: () => void;
  onMove: (dir: -1 | 1) => void;
};

function QuestionCard({
  question,
  index,
  total,
  isActive,
  allQuestions,
  onActivate,
  onUpdate,
  onDelete,
  onMove,
}: QuestionCardProps) {
  const { t } = useTranslation();
  const meta = QUESTION_TYPES.find((m) => m.type === question.type);

  return (
    <div
      className={cn(
        'rounded-2xl border bg-surface-container-lowest transition-all',
        isActive ? 'border-primary/50 shadow-md' : 'border-outline-variant',
      )}
    >
      <button
        type="button"
        onClick={onActivate}
        className="flex w-full items-center gap-3 px-4 py-3 text-start"
      >
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <MaterialSymbol name={meta?.icon ?? 'help'} size="text-sm" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-on-surface">
            {question.label || t('survey.builder.untitledQuestion')}
          </p>
          <p className="text-xs text-on-surface-variant">
            {t(`survey.builder.questionTypes.${question.type}`)}
            {question.required && (
              <span className="ms-2 text-error">*</span>
            )}
          </p>
        </div>
        <MaterialSymbol
          name={isActive ? 'expand_less' : 'expand_more'}
          size="text-base"
          className="shrink-0 text-on-surface-variant"
        />
      </button>

      {isActive && (
        <div className="border-t border-outline-variant px-4 py-4 space-y-4">
          <div className="space-y-1.5">
            <Label>{t('survey.builder.questionLabel')}</Label>
            {question.type === 'section_header' ? (
              <Input
                value={question.label}
                onChange={(e) => onUpdate({ label: e.target.value })}
                placeholder={t('survey.builder.sectionHeaderPlaceholder')}
              />
            ) : (
              <Input
                value={question.label}
                onChange={(e) => onUpdate({ label: e.target.value })}
                placeholder={t('survey.builder.questionLabelPlaceholder')}
              />
            )}
          </div>

          {question.type !== 'section_header' && (
            <div className="space-y-1.5">
              <Label>{t('survey.builder.questionDescription')}</Label>
              <Input
                value={question.description ?? ''}
                onChange={(e) => onUpdate({ description: e.target.value || undefined })}
                placeholder={t('survey.builder.questionDescriptionPlaceholder')}
              />
            </div>
          )}

          {(question.type === 'multiple_choice' ||
            question.type === 'checkboxes' ||
            question.type === 'dropdown') && (
            <OptionsEditor
              options={question.options ?? ['']}
              onChange={(opts) => onUpdate({ options: opts })}
            />
          )}

          {question.type === 'linear_scale' && (
            <ScaleEditor question={question} onUpdate={onUpdate} />
          )}

          {question.type === 'long_text' && (
            <div className="space-y-1.5">
              <Label>{t('survey.builder.maxLength')}</Label>
              <Input
                type="number"
                min={50}
                max={2000}
                value={question.maxLength ?? ''}
                onChange={(e) =>
                  onUpdate({ maxLength: e.target.value ? Number(e.target.value) : undefined })
                }
                placeholder="500"
              />
            </div>
          )}

          {question.type !== 'section_header' && (
            <ConditionalEditor
              question={question}
              allQuestions={allQuestions}
              onUpdate={onUpdate}
            />
          )}

          {question.type !== 'section_header' && (
            <label className="flex cursor-pointer items-center justify-between">
              <span className="text-sm font-medium text-on-surface">
                {t('survey.builder.questionRequired')}
              </span>
              <button
                type="button"
                role="switch"
                aria-checked={question.required}
                onClick={() => onUpdate({ required: !question.required })}
                className={cn(
                  'relative h-6 w-11 rounded-full transition-colors',
                  question.required ? 'bg-primary' : 'bg-outline-variant',
                )}
              >
                <span
                  className={cn(
                    'absolute top-1 h-4 w-4 rounded-full bg-white shadow transition-transform',
                    question.required ? 'start-6' : 'start-1',
                  )}
                />
              </button>
            </label>
          )}

          <div className="flex items-center justify-between border-t border-outline-variant pt-3">
            <div className="flex items-center gap-1">
              <button
                type="button"
                disabled={index === 0}
                onClick={() => onMove(-1)}
                className="rounded-lg p-2 text-on-surface-variant hover:bg-surface-high disabled:opacity-30"
                title={t('survey.builder.moveUp')}
              >
                <MaterialSymbol name="arrow_upward" size="text-sm" />
              </button>
              <button
                type="button"
                disabled={index === total - 1}
                onClick={() => onMove(1)}
                className="rounded-lg p-2 text-on-surface-variant hover:bg-surface-high disabled:opacity-30"
                title={t('survey.builder.moveDown')}
              >
                <MaterialSymbol name="arrow_downward" size="text-sm" />
              </button>
            </div>
            <button
              type="button"
              onClick={onDelete}
              className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm text-error hover:bg-error/10"
            >
              <MaterialSymbol name="delete" size="text-sm" />
              {t('survey.builder.deleteQuestion')}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function OptionsEditor({
  options,
  onChange,
}: {
  options: string[];
  onChange: (opts: string[]) => void;
}) {
  const { t } = useTranslation();

  const updateOption = (idx: number, val: string) => {
    const next = [...options];
    next[idx] = val;
    onChange(next);
  };

  const addOption = () => onChange([...options, '']);

  const removeOption = (idx: number) => {
    if (options.length <= 1) return;
    onChange(options.filter((_, i) => i !== idx));
  };

  return (
    <div className="space-y-1.5">
      <Label>{t('survey.builder.questionOptions')}</Label>
      <div className="space-y-2">
        {options.map((opt, idx) => (
          <div key={idx} className="flex items-center gap-2">
            <div className="h-3 w-3 shrink-0 rounded-full border-2 border-outline-variant" />
            <Input
              value={opt}
              onChange={(e) => updateOption(idx, e.target.value)}
              placeholder={`${t('survey.builder.optionPlaceholder')} ${idx + 1}`}
              className="flex-1"
            />
            {options.length > 1 && (
              <button
                type="button"
                onClick={() => removeOption(idx)}
                className="shrink-0 rounded p-1 text-on-surface-variant hover:text-error"
              >
                <MaterialSymbol name="close" size="text-sm" />
              </button>
            )}
          </div>
        ))}
        <button
          type="button"
          onClick={addOption}
          className="flex items-center gap-1.5 text-sm text-primary hover:underline"
        >
          <MaterialSymbol name="add" size="text-sm" />
          {t('survey.builder.addOption')}
        </button>
      </div>
    </div>
  );
}

function ScaleEditor({
  question,
  onUpdate,
}: {
  question: FormQuestion;
  onUpdate: (patch: Partial<FormQuestion>) => void;
}) {
  const { t } = useTranslation();

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label>{t('survey.builder.scaleMin')}</Label>
          <Input
            type="number"
            value={question.scaleMin ?? 1}
            onChange={(e) => onUpdate({ scaleMin: Number(e.target.value) })}
            min={0}
            max={9}
          />
        </div>
        <div className="space-y-1.5">
          <Label>{t('survey.builder.scaleMax')}</Label>
          <Input
            type="number"
            value={question.scaleMax ?? 5}
            onChange={(e) => onUpdate({ scaleMax: Number(e.target.value) })}
            min={2}
            max={10}
          />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label>{t('survey.builder.scaleMinLabel')}</Label>
          <Input
            value={question.scaleMinLabel ?? ''}
            onChange={(e) => onUpdate({ scaleMinLabel: e.target.value })}
            placeholder={t('survey.builder.scaleMinLabelPlaceholder')}
          />
        </div>
        <div className="space-y-1.5">
          <Label>{t('survey.builder.scaleMaxLabel')}</Label>
          <Input
            value={question.scaleMaxLabel ?? ''}
            onChange={(e) => onUpdate({ scaleMaxLabel: e.target.value })}
            placeholder={t('survey.builder.scaleMaxLabelPlaceholder')}
          />
        </div>
      </div>
    </div>
  );
}

function ConditionalEditor({
  question,
  allQuestions,
  onUpdate,
}: {
  question: FormQuestion;
  allQuestions: FormQuestion[];
  onUpdate: (patch: Partial<FormQuestion>) => void;
}) {
  const { t } = useTranslation();

  const eligible = allQuestions.filter(
    (q) =>
      q.id !== question.id &&
      (q.type === 'multiple_choice' ||
        q.type === 'checkboxes' ||
        q.type === 'dropdown' ||
        q.type === 'yes_no'),
  );

  if (!eligible.length) return null;

  const rule = question.conditional;
  const refQuestion = eligible.find((q) => q.id === rule?.questionId);

  const valueOptions =
    refQuestion?.type === 'yes_no'
      ? [t('survey.renderer.yes'), t('survey.renderer.no')]
      : (refQuestion?.options ?? []).filter(Boolean);

  return (
    <div className="space-y-2 rounded-xl bg-surface-high/50 px-3 py-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-on-surface-variant">
        {t('survey.builder.conditional')}
      </p>
      <div className="space-y-2">
        <select
          className="h-9 w-full rounded-lg border border-outline-variant bg-surface px-3 text-sm text-foreground"
          value={rule?.questionId ?? ''}
          onChange={(e) => {
            if (!e.target.value) {
              onUpdate({ conditional: undefined });
            } else {
              onUpdate({
                conditional: {
                  questionId: e.target.value,
                  operator: rule?.operator ?? 'eq',
                  value: '',
                },
              });
            }
          }}
        >
          <option value="">{t('survey.builder.noCondition')}</option>
          {eligible.map((q) => (
            <option key={q.id} value={q.id}>
              {q.label || t('survey.builder.untitledQuestion')}
            </option>
          ))}
        </select>

        {rule?.questionId && (
          <div className="grid grid-cols-2 gap-2">
            <select
              className="h-9 rounded-lg border border-outline-variant bg-surface px-3 text-sm text-foreground"
              value={rule.operator}
              onChange={(e) =>
                onUpdate({
                  conditional: { ...rule, operator: e.target.value as 'eq' | 'neq' },
                })
              }
            >
              <option value="eq">{t('survey.builder.conditionOperatorEq')}</option>
              <option value="neq">{t('survey.builder.conditionOperatorNeq')}</option>
            </select>
            <select
              className="h-9 rounded-lg border border-outline-variant bg-surface px-3 text-sm text-foreground"
              value={rule.value}
              onChange={(e) =>
                onUpdate({ conditional: { ...rule, value: e.target.value } })
              }
            >
              <option value="">{t('survey.builder.selectValue')}</option>
              {valueOptions.map((v) => (
                <option key={v} value={v}>
                  {v}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>
    </div>
  );
}

function TypePicker({
  onSelect,
  onClose,
}: {
  onSelect: (type: QuestionType) => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();

  return (
    <div className="rounded-2xl border border-primary/30 bg-surface-container-lowest shadow-lg">
      <div className="flex items-center justify-between border-b border-outline-variant px-4 py-3">
        <p className="text-sm font-semibold text-on-surface">{t('survey.builder.chooseType')}</p>
        <button
          type="button"
          onClick={onClose}
          className="rounded-lg p-1 text-on-surface-variant hover:bg-surface-high"
        >
          <MaterialSymbol name="close" size="text-sm" />
        </button>
      </div>
      <div className="grid grid-cols-2 gap-2 p-3 sm:grid-cols-3">
        {QUESTION_TYPES.map((meta) => (
          <button
            key={meta.type}
            type="button"
            onClick={() => onSelect(meta.type)}
            className="flex flex-col items-center gap-2 rounded-xl border border-outline-variant bg-surface px-3 py-4 transition-all hover:border-primary/60 hover:bg-primary/5 hover:shadow-sm"
          >
            <span className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary">
              <MaterialSymbol name={meta.icon} size="text-lg" />
            </span>
            <span className="text-center text-xs font-medium text-on-surface">
              {t(`survey.builder.questionTypes.${meta.labelKey}`)}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

function SendPanel({
  classes,
  saving,
  onSend,
  onClose,
}: {
  classes: { id: string; name_ar: string; name_en: string }[];
  saving: boolean;
  onSend: (audience: SendAudience) => void;
  onClose: () => void;
}) {
  const { t, i18n } = useTranslation();
  const isRtl = i18n.language?.startsWith('ar');
  const [mode, setMode] = useState<'all' | 'classes'>('all');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  const toggleClass = (id: string) =>
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );

  const canSend = mode === 'all' || selectedIds.length > 0;

  return (
    <>
      <div className="fixed inset-0 z-30 bg-black/40" onClick={onClose} />
      <div className="fixed bottom-0 start-0 end-0 z-40 rounded-t-3xl border-t border-outline-variant bg-surface shadow-ambient ms-64">
        <div className="mx-auto max-w-lg px-6 pb-8 pt-5">
          <div className="mx-auto mb-5 h-1 w-10 rounded-full bg-outline-variant" />

          <div className="mb-5 flex items-center justify-between">
            <h2 className="text-base font-semibold text-on-surface">
              {t('survey.builder.sendPanel.title')}
            </h2>
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg p-1.5 text-on-surface-variant hover:bg-surface-high"
            >
              <MaterialSymbol name="close" size="text-base" />
            </button>
          </div>

          <div className="space-y-3 mb-6">
            {(['all', 'classes'] as const).map((opt) => (
              <button
                key={opt}
                type="button"
                onClick={() => setMode(opt)}
                className={cn(
                  'flex w-full items-center gap-4 rounded-2xl border-2 px-4 py-4 text-start transition-all',
                  mode === opt
                    ? 'border-primary bg-primary/8'
                    : 'border-outline-variant bg-surface hover:border-primary/40',
                )}
              >
                <span
                  className={cn(
                    'flex h-10 w-10 shrink-0 items-center justify-center rounded-full',
                    mode === opt ? 'bg-primary text-primary-foreground' : 'bg-surface-high text-on-surface-variant',
                  )}
                >
                  <MaterialSymbol name={opt === 'all' ? 'groups' : 'school'} size="text-lg" />
                </span>
                <div>
                  <p className="text-sm font-semibold text-on-surface">
                    {t(`survey.builder.sendPanel.${opt}`)}
                  </p>
                  <p className="text-xs text-on-surface-variant">
                    {t(`survey.builder.sendPanel.${opt}Hint`)}
                  </p>
                </div>
                <span className={cn(
                  'ms-auto flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 transition-colors',
                  mode === opt ? 'border-primary bg-primary' : 'border-outline-variant',
                )}>
                  {mode === opt && <MaterialSymbol name="check" size="text-xs" className="text-white" />}
                </span>
              </button>
            ))}
          </div>

          {mode === 'classes' && classes.length > 0 && (
            <div className="mb-6 space-y-2 max-h-48 overflow-y-auto">
              {classes.map((c) => {
                const name = isRtl ? (c.name_ar || c.name_en) : (c.name_en || c.name_ar);
                const checked = selectedIds.includes(c.id);
                return (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => toggleClass(c.id)}
                    className={cn(
                      'flex w-full items-center gap-3 rounded-xl border px-4 py-3 text-start transition-all',
                      checked
                        ? 'border-primary/50 bg-primary/8'
                        : 'border-outline-variant bg-surface hover:border-primary/30',
                    )}
                  >
                    <span className={cn(
                      'flex h-5 w-5 shrink-0 items-center justify-center rounded-md border-2 transition-colors',
                      checked ? 'border-primary bg-primary' : 'border-outline-variant',
                    )}>
                      {checked && <MaterialSymbol name="check" size="text-xs" className="text-white" />}
                    </span>
                    <span className="text-sm text-on-surface">{name}</span>
                  </button>
                );
              })}
            </div>
          )}

          <Button
            className="w-full"
            disabled={!canSend || saving}
            onClick={() => onSend({ mode, classIds: selectedIds })}
          >
            {saving ? (
              <MaterialSymbol name="progress_activity" size="text-sm" className="me-2 animate-spin" />
            ) : (
              <MaterialSymbol name="send" size="text-sm" className="me-2" />
            )}
            {t('survey.builder.sendPanel.confirm')}
          </Button>
        </div>
      </div>
    </>
  );
}
