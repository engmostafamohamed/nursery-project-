import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { MaterialSymbol } from '@/components/ui/MaterialSymbol';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import type { AnswerValue, AnswersMap, FormQuestion } from '@/types/survey';

function isVisible(q: FormQuestion, answers: AnswersMap): boolean {
  if (!q.conditional) return true;
  const { questionId, operator, value } = q.conditional;
  const given = answers[questionId];
  const givenStr = Array.isArray(given) ? given.join(',') : String(given ?? '');
  if (operator === 'eq') return givenStr === value;
  if (operator === 'neq') return givenStr !== value;
  return true;
}

type FormRendererProps = {
  title: string;
  questions: FormQuestion[];
  answers: AnswersMap;
  onChange: (answers: AnswersMap) => void;
  mode: 'respond' | 'preview';
  deadline?: string | null;
  onSubmit: () => void;
  submitting?: boolean;
};

export function FormRenderer({
  title,
  questions,
  answers,
  onChange,
  mode,
  deadline,
  onSubmit,
  submitting = false,
}: FormRendererProps) {
  const { t, i18n } = useTranslation();
  const [step, setStep] = useState(0);
  const [error, setError] = useState('');
  const [submitted, setSubmitted] = useState(false);

  const isRtl = i18n.language?.startsWith('ar');

  const visibleQuestions = useMemo(
    () => questions.filter((q) => isVisible(q, answers)),
    [questions, answers],
  );

  const nonSectionQuestions = useMemo(
    () => visibleQuestions.filter((q) => q.type !== 'section_header'),
    [visibleQuestions],
  );

  useEffect(() => {
    if (step >= visibleQuestions.length) {
      setStep(Math.max(0, visibleQuestions.length - 1));
    }
  }, [visibleQuestions.length, step]);

  const current = visibleQuestions[step];
  const isSection = current?.type === 'section_header';
  const totalAnswerable = nonSectionQuestions.length;
  const answeredCount = nonSectionQuestions.filter((q) => {
    const v = answers[q.id];
    return v !== null && v !== undefined && v !== '' && !(Array.isArray(v) && v.length === 0);
  }).length;
  const progress = totalAnswerable > 0 ? (answeredCount / totalAnswerable) * 100 : 0;

  const setAnswer = (id: string, value: AnswerValue) => {
    onChange({ ...answers, [id]: value });
  };

  const goNext = () => {
    if (current && !isSection && current.required) {
      const v = answers[current.id];
      const empty = v === null || v === undefined || v === '' || (Array.isArray(v) && !v.length);
      if (empty) {
        setError(t('survey.renderer.requiredError'));
        return;
      }
    }
    setError('');
    if (step < visibleQuestions.length - 1) {
      setStep(step + 1);
    } else {
      handleSubmit();
    }
  };

  const handleSubmit = () => {
    onSubmit();
    if (mode === 'respond') setSubmitted(true);
  };

  const deadlineMs = deadline ? new Date(deadline).getTime() - Date.now() : null;
  const deadlinePassed = deadlineMs !== null && deadlineMs < 0;
  const deadlineLabel = deadline
    ? deadlinePassed
      ? t('survey.renderer.deadlinePassed')
      : formatDeadlineCountdown(deadlineMs ?? 0, t)
    : null;

  if (submitted && mode === 'respond') {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-6 px-6 py-12 text-center">
        <div className="flex h-20 w-20 items-center justify-center rounded-full bg-success/15 text-success">
          <MaterialSymbol name="check_circle" size="text-5xl" />
        </div>
        <div className="space-y-2">
          <h2 className="text-xl font-semibold text-on-surface">{t('survey.renderer.thankYou')}</h2>
          <p className="text-sm text-on-surface-variant">{t('survey.renderer.submittedMessage')}</p>
        </div>
      </div>
    );
  }

  if (!current) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center px-6 text-sm text-on-surface-variant">
        {t('survey.builder.noQuestions')}
      </div>
    );
  }

  const isLast = step === visibleQuestions.length - 1;

  return (
    <div className="flex min-h-full flex-col">
      <div className="border-b border-outline-variant px-4 py-3">
        <div className="mb-2 flex items-center justify-between text-xs text-on-surface-variant">
          <span>{title}</span>
          {totalAnswerable > 0 && (
            <span>
              {t('survey.renderer.stepOf', {
                current: answeredCount,
                total: totalAnswerable,
              })}
            </span>
          )}
        </div>
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-high">
          <div
            className="h-full rounded-full bg-primary transition-all duration-500"
            style={{ width: `${progress}%` }}
          />
        </div>
        {deadlineLabel && (
          <p className={cn('mt-1.5 text-xs', deadlinePassed ? 'text-error' : 'text-on-surface-variant')}>
            <MaterialSymbol name="schedule" size="text-xs" className="me-1 align-middle" />
            {deadlineLabel}
          </p>
        )}
      </div>

      <div className="flex flex-1 flex-col justify-center px-6 py-8">
        <QuestionStep
          question={current}
          answer={answers[current.id] ?? null}
          onChange={(v) => setAnswer(current.id, v)}
          error={error}
          isRtl={isRtl}
        />
      </div>

      <div className="flex items-center justify-between border-t border-outline-variant px-4 py-4">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => { setError(''); setStep(Math.max(0, step - 1)); }}
          disabled={step === 0}
          className="gap-1"
        >
          <MaterialSymbol name={isRtl ? 'arrow_forward' : 'arrow_back'} size="text-sm" />
          {t('survey.renderer.back')}
        </Button>

        <Button
          size="sm"
          onClick={goNext}
          disabled={(mode === 'respond' && deadlinePassed) || submitting}
          className="gap-1"
        >
          {submitting ? (
            <MaterialSymbol name="progress_activity" size="text-sm" className="animate-spin" />
          ) : null}
          {isLast ? t('survey.renderer.submit') : t('survey.renderer.next')}
          {!isLast && (
            <MaterialSymbol name={isRtl ? 'arrow_back' : 'arrow_forward'} size="text-sm" />
          )}
        </Button>
      </div>
    </div>
  );
}

type QuestionStepProps = {
  question: FormQuestion;
  answer: AnswerValue;
  onChange: (v: AnswerValue) => void;
  error: string;
  isRtl: boolean;
};

function QuestionStep({ question, answer, onChange, error }: QuestionStepProps) {
  const { t } = useTranslation();

  if (question.type === 'section_header') {
    return (
      <div className="space-y-2 text-center">
        <h2 className="text-2xl font-bold text-on-surface">{question.label}</h2>
        {question.description && (
          <p className="text-base text-on-surface-variant">{question.description}</p>
        )}
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-lg space-y-5">
      <div className="space-y-1.5">
        <h2 className="text-lg font-semibold text-on-surface">
          {question.label}
          {question.required && <span className="ms-1 text-error">*</span>}
        </h2>
        {question.description && (
          <p className="text-sm text-on-surface-variant">{question.description}</p>
        )}
      </div>

      <div>
        {question.type === 'short_text' && (
          <Input
            value={String(answer ?? '')}
            onChange={(e) => onChange(e.target.value)}
            placeholder={t('survey.renderer.shortTextPlaceholder')}
            maxLength={question.maxLength}
            autoFocus
          />
        )}

        {question.type === 'long_text' && (
          <Textarea
            value={String(answer ?? '')}
            onChange={(e) => onChange(e.target.value)}
            placeholder={t('survey.renderer.longTextPlaceholder')}
            maxLength={question.maxLength}
            autoFocus
          />
        )}

        {question.type === 'multiple_choice' && (
          <div className="space-y-2">
            {(question.options ?? []).filter(Boolean).map((opt) => (
              <button
                key={opt}
                type="button"
                onClick={() => onChange(opt)}
                className={cn(
                  'flex w-full items-center gap-3 rounded-xl border-2 px-4 py-3.5 text-start text-sm font-medium transition-all',
                  answer === opt
                    ? 'border-primary bg-primary/10 text-primary'
                    : 'border-outline-variant bg-surface text-on-surface hover:border-primary/50',
                )}
              >
                <span
                  className={cn(
                    'flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 transition-colors',
                    answer === opt ? 'border-primary' : 'border-outline-variant',
                  )}
                >
                  {answer === opt && (
                    <span className="h-2.5 w-2.5 rounded-full bg-primary" />
                  )}
                </span>
                {opt}
              </button>
            ))}
          </div>
        )}

        {question.type === 'checkboxes' && (
          <div className="space-y-2">
            {(question.options ?? []).filter(Boolean).map((opt) => {
              const selected = Array.isArray(answer) ? answer.includes(opt) : false;
              const toggle = () => {
                const current = Array.isArray(answer) ? answer : [];
                onChange(selected ? current.filter((v) => v !== opt) : [...current, opt]);
              };
              return (
                <button
                  key={opt}
                  type="button"
                  onClick={toggle}
                  className={cn(
                    'flex w-full items-center gap-3 rounded-xl border-2 px-4 py-3.5 text-start text-sm font-medium transition-all',
                    selected
                      ? 'border-primary bg-primary/10 text-primary'
                      : 'border-outline-variant bg-surface text-on-surface hover:border-primary/50',
                  )}
                >
                  <span
                    className={cn(
                      'flex h-5 w-5 shrink-0 items-center justify-center rounded-md border-2 transition-colors',
                      selected ? 'border-primary bg-primary' : 'border-outline-variant',
                    )}
                  >
                    {selected && <MaterialSymbol name="check" size="text-xs" className="text-white" />}
                  </span>
                  {opt}
                </button>
              );
            })}
          </div>
        )}

        {question.type === 'dropdown' && (
          <select
            className="h-11 w-full rounded-xl border border-outline-variant bg-surface px-4 text-sm text-foreground"
            value={String(answer ?? '')}
            onChange={(e) => onChange(e.target.value)}
          >
            <option value="">{t('survey.renderer.selectPlaceholder')}</option>
            {(question.options ?? []).filter(Boolean).map((opt) => (
              <option key={opt} value={opt}>
                {opt}
              </option>
            ))}
          </select>
        )}

        {question.type === 'linear_scale' && (
          <LinearScaleInput
            min={question.scaleMin ?? 1}
            max={question.scaleMax ?? 5}
            minLabel={question.scaleMinLabel}
            maxLabel={question.scaleMaxLabel}
            value={typeof answer === 'number' ? answer : null}
            onChange={(v) => onChange(v)}
          />
        )}

        {question.type === 'star_rating' && (
          <StarRatingInput
            value={typeof answer === 'number' ? answer : 0}
            onChange={(v) => onChange(v)}
          />
        )}

        {question.type === 'yes_no' && (
          <div className="grid grid-cols-2 gap-4">
            {(['yes', 'no'] as const).map((opt) => (
              <button
                key={opt}
                type="button"
                onClick={() => onChange(opt)}
                className={cn(
                  'flex flex-col items-center gap-3 rounded-2xl border-2 px-6 py-6 transition-all',
                  answer === opt && opt === 'yes'
                    ? 'border-success bg-success/10'
                    : answer === opt && opt === 'no'
                      ? 'border-error bg-error/10'
                      : 'border-outline-variant bg-surface hover:border-primary/40',
                )}
              >
                <MaterialSymbol
                  name={opt === 'yes' ? 'thumb_up' : 'thumb_down'}
                  size="text-3xl"
                  className={
                    answer === opt
                      ? opt === 'yes' ? 'text-success' : 'text-error'
                      : 'text-on-surface-variant'
                  }
                />
                <span className="text-base font-semibold text-on-surface">
                  {t(`survey.renderer.${opt}`)}
                </span>
              </button>
            ))}
          </div>
        )}

        {question.type === 'date' && (
          <Input
            type="date"
            value={String(answer ?? '')}
            onChange={(e) => onChange(e.target.value)}
          />
        )}
      </div>

      {error && <p className="text-sm text-error">{error}</p>}
    </div>
  );
}

function LinearScaleInput({
  min,
  max,
  minLabel,
  maxLabel,
  value,
  onChange,
}: {
  min: number;
  max: number;
  minLabel?: string;
  maxLabel?: string;
  value: number | null;
  onChange: (v: number) => void;
}) {
  const current = value ?? min;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-4">
        <input
          type="range"
          min={min}
          max={max}
          value={current}
          onChange={(e) => onChange(Number(e.target.value))}
          className="h-2 flex-1 cursor-pointer appearance-none rounded-full accent-primary"
        />
        <span className="min-w-[2.5rem] rounded-xl bg-primary/10 px-3 py-1 text-center text-lg font-bold text-primary">
          {value ?? '–'}
        </span>
      </div>
      <div className="flex justify-between text-xs text-on-surface-variant">
        <span>{minLabel || min}</span>
        <span>{maxLabel || max}</span>
      </div>
      <div className="flex justify-between gap-1">
        {Array.from({ length: max - min + 1 }, (_, i) => min + i).map((n) => (
          <button
            key={n}
            type="button"
            onClick={() => onChange(n)}
            className={cn(
              'flex-1 rounded-lg py-2 text-xs font-medium transition-all',
              value === n
                ? 'bg-primary text-primary-foreground shadow-sm'
                : 'bg-surface-high text-on-surface-variant hover:bg-primary/10 hover:text-primary',
            )}
          >
            {n}
          </button>
        ))}
      </div>
    </div>
  );
}

function StarRatingInput({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  const [hovered, setHovered] = useState<number | null>(null);
  const { t } = useTranslation();

  const LABELS = [
    t('survey.renderer.starLabels.1'),
    t('survey.renderer.starLabels.2'),
    t('survey.renderer.starLabels.3'),
    t('survey.renderer.starLabels.4'),
    t('survey.renderer.starLabels.5'),
  ];

  const active = hovered ?? value;

  return (
    <div className="space-y-3">
      <div className="flex justify-center gap-3">
        {[1, 2, 3, 4, 5].map((star) => (
          <button
            key={star}
            type="button"
            onClick={() => onChange(star)}
            onMouseEnter={() => setHovered(star)}
            onMouseLeave={() => setHovered(null)}
            className="transition-transform hover:scale-110 focus:outline-none"
          >
            <MaterialSymbol
              name={star <= active ? 'star' : 'star_border'}
              size="text-4xl"
              className={star <= active ? 'text-yellow-400' : 'text-outline-variant'}
            />
          </button>
        ))}
      </div>
      {active > 0 && (
        <p className="text-center text-sm font-medium text-on-surface-variant">
          {LABELS[active - 1]}
        </p>
      )}
    </div>
  );
}

function formatDeadlineCountdown(ms: number, t: (key: string, opts?: Record<string, unknown>) => string): string {
  const minutes = Math.floor(ms / 60000);
  if (minutes < 60) return t('survey.renderer.deadlineIn', { time: `${minutes}m` });
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return t('survey.renderer.deadlineIn', { time: `${hours}h` });
  const days = Math.floor(hours / 24);
  return t('survey.renderer.deadlineIn', { time: `${days}d` });
}
