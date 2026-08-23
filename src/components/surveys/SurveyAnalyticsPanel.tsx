import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Bar, BarChart, Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts';

import { Button } from '@/components/ui/button';
import { MaterialSymbol } from '@/components/ui/MaterialSymbol';
import type { FormQuestion, SurveyResponseRow } from '@/types/survey';

const CHART_COLORS = ['#68abff', '#0060ac', '#afc8f0', '#001f3f', '#4a90d9', '#2166cc'];

type Props = {
  questions: FormQuestion[];
  responses: SurveyResponseRow[];
  onClose: () => void;
};

export function SurveyAnalyticsPanel({ questions, responses, onClose }: Props) {
  const { t } = useTranslation();

  const handleExport = () => {
    if (!responses.length) return;
    const answerableQs = questions.filter((q) => q.type !== 'section_header');
    const headers = ['response_id', 'submitted_at', ...answerableQs.map((q) => q.label || q.id)];
    const rows = responses.map((r) => {
      const base = [r.id, r.created_at];
      const answers = answerableQs.map((q) => {
        const v = (r.answers_json as Record<string, unknown>)[q.id];
        return Array.isArray(v) ? v.join('; ') : String(v ?? '');
      });
      return [...base, ...answers];
    });
    const csv = [headers, ...rows].map((row) => row.map((c) => `"${c}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `survey-responses-${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-outline-variant px-4 py-3">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onClose}
            className="flex items-center gap-1.5 text-sm text-on-surface-variant hover:text-on-surface"
          >
            <MaterialSymbol name="arrow_back" size="text-sm" />
          </button>
          <div>
            <p className="text-sm font-semibold text-on-surface">
              {t('survey.analytics.title')}
            </p>
            <p className="text-xs text-on-surface-variant">
              {t('survey.analytics.total', { count: responses.length })}
            </p>
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={handleExport} disabled={!responses.length}>
          <MaterialSymbol name="download" size="text-sm" className="me-1.5" />
          {t('survey.analytics.export')}
        </Button>
      </div>

      <div className="flex-1 overflow-y-auto space-y-4 p-4">
        {responses.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
            <MaterialSymbol name="bar_chart" size="text-5xl" className="text-outline-variant" />
            <p className="text-sm text-on-surface-variant">{t('survey.analytics.noResponses')}</p>
          </div>
        ) : (
          questions
            .filter((q) => q.type !== 'section_header')
            .map((q) => <QuestionChart key={q.id} question={q} responses={responses} />)
        )}
      </div>
    </div>
  );
}

function QuestionChart({ question, responses }: { question: FormQuestion; responses: SurveyResponseRow[] }) {
  const { t } = useTranslation();

  const data = useMemo(() => {
    const answers = responses.map((r) => (r.answers_json as Record<string, unknown>)[question.id]);

    if (question.type === 'multiple_choice' || question.type === 'dropdown' || question.type === 'yes_no') {
      const counts: Record<string, number> = {};
      answers.forEach((v) => {
        const key = String(v ?? '');
        if (key) counts[key] = (counts[key] ?? 0) + 1;
      });
      return Object.entries(counts).map(([name, value]) => ({ name, value }));
    }

    if (question.type === 'checkboxes') {
      const counts: Record<string, number> = {};
      answers.forEach((v) => {
        const arr = Array.isArray(v) ? v : [];
        arr.forEach((opt) => {
          counts[opt] = (counts[opt] ?? 0) + 1;
        });
      });
      return Object.entries(counts).map(([name, value]) => ({ name, value }));
    }

    if (question.type === 'star_rating') {
      const counts: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
      answers.forEach((v) => {
        const n = Number(v);
        if (n >= 1 && n <= 5) counts[n] = (counts[n] ?? 0) + 1;
      });
      return Object.entries(counts).map(([name, value]) => ({ name: `${'★'.repeat(Number(name))}`, value }));
    }

    if (question.type === 'linear_scale') {
      const counts: Record<string, number> = {};
      answers.forEach((v) => {
        const key = String(v ?? '');
        if (key) counts[key] = (counts[key] ?? 0) + 1;
      });
      const min = question.scaleMin ?? 1;
      const max = question.scaleMax ?? 5;
      return Array.from({ length: max - min + 1 }, (_, i) => {
        const n = String(min + i);
        return { name: n, value: counts[n] ?? 0 };
      });
    }

    return null;
  }, [question, responses]);

  const textAnswers = useMemo(() => {
    if (question.type !== 'short_text' && question.type !== 'long_text') return null;
    return responses
      .map((r) => String((r.answers_json as Record<string, unknown>)[question.id] ?? ''))
      .filter(Boolean);
  }, [question, responses]);

  const avgRating = useMemo(() => {
    if (question.type !== 'star_rating') return null;
    const answers = responses.map((r) =>
      Number((r.answers_json as Record<string, unknown>)[question.id]),
    ).filter((n) => n > 0);
    if (!answers.length) return null;
    return (answers.reduce((a, b) => a + b, 0) / answers.length).toFixed(1);
  }, [question, responses]);

  const isPie =
    question.type === 'multiple_choice' ||
    question.type === 'checkboxes' ||
    question.type === 'dropdown' ||
    question.type === 'yes_no';

  return (
    <section className="rounded-2xl border border-outline-variant bg-surface-container-lowest p-4 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm font-semibold text-on-surface leading-snug">{question.label}</p>
        {avgRating && (
          <div className="flex items-center gap-1 shrink-0 rounded-full bg-yellow-400/15 px-3 py-1 text-sm font-bold text-yellow-600">
            <MaterialSymbol name="star" size="text-sm" />
            {t('survey.analytics.avgRating', { value: avgRating })}
          </div>
        )}
      </div>

      {data && isPie && data.length > 0 && (
        <div className="grid grid-cols-2 gap-4 items-center">
          <div className="h-44">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={data} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={70}>
                  {data.map((_, idx) => (
                    <Cell key={idx} fill={CHART_COLORS[idx % CHART_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="space-y-1.5">
            {data.map((item, idx) => (
              <div key={item.name} className="flex items-center gap-2 text-xs">
                <span
                  className="h-2.5 w-2.5 shrink-0 rounded-full"
                  style={{ background: CHART_COLORS[idx % CHART_COLORS.length] }}
                />
                <span className="flex-1 truncate text-on-surface">{item.name}</span>
                <span className="font-semibold text-on-surface">{item.value}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {data && !isPie && data.length > 0 && (
        <div className="h-40">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} barSize={28}>
              <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                {data.map((_, idx) => (
                  <Cell key={idx} fill={CHART_COLORS[idx % CHART_COLORS.length]} />
                ))}
              </Bar>
              <Tooltip />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {textAnswers && (
        <div className="space-y-1.5">
          <p className="text-xs font-medium text-on-surface-variant uppercase tracking-wide">
            {t('survey.analytics.textResponses')}
          </p>
          <div className="max-h-40 overflow-y-auto space-y-1.5">
            {textAnswers.length === 0 ? (
              <p className="text-xs text-on-surface-variant">{t('survey.analytics.noResponses')}</p>
            ) : (
              textAnswers.map((ans, i) => (
                <p
                  key={i}
                  className="rounded-lg bg-surface-high px-3 py-2 text-sm text-on-surface"
                >
                  {ans}
                </p>
              ))
            )}
          </div>
        </div>
      )}

      {question.type === 'date' && (
        <div className="space-y-1.5">
          <p className="text-xs font-medium text-on-surface-variant uppercase tracking-wide">
            {t('survey.analytics.textResponses')}
          </p>
          <div className="flex flex-wrap gap-2">
            {responses
              .map((r) => String((r.answers_json as Record<string, unknown>)[question.id] ?? ''))
              .filter(Boolean)
              .map((d, i) => (
                <span key={i} className="rounded-full bg-surface-high px-3 py-1 text-xs text-on-surface">
                  {d}
                </span>
              ))}
          </div>
        </div>
      )}
    </section>
  );
}
