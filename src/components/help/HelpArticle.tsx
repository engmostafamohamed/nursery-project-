import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import type { HelpArticle as HelpArticleModel } from '@/data/helpArticles';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { trackHelpAnalytics } from '@/lib/helpAnalytics';

function storageKey(userId: string | undefined, articleId: string, suffix: string): string {
  const u = userId ?? 'anon';
  return `xo-help-${suffix}-${u}-${articleId}`;
}

interface Props {
  article: HelpArticleModel;
  userId: string | undefined;
  surfaceRole: string;
  isArabic: boolean;
  searchQuery: string;
  onTryNow: () => void;
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function HighlightedText({ text, query }: { text: string; query: string }) {
  const q = query.trim();
  if (!q) return <>{text}</>;
  const parts = text.split(new RegExp(`(${escapeRegExp(q)})`, 'gi'));
  return (
    <>
      {parts.map((part, i) =>
        part.toLowerCase() === q.toLowerCase() ? (
          <mark key={i} className="rounded bg-secondary/40 px-0.5">
            {part}
          </mark>
        ) : (
          <span key={i}>{part}</span>
        ),
      )}
    </>
  );
}

export function HelpArticleView({ article, userId, surfaceRole, isArabic, searchQuery, onTryNow }: Props) {
  const { t } = useTranslation();
  const title = isArabic ? article.title_ar : article.title_en;
  const steps = isArabic ? article.steps_ar : article.steps_en;

  const stepsKey = storageKey(userId, article.id, 'steps');
  const readKey = storageKey(userId, article.id, 'read');

  const [checked, setChecked] = useState<boolean[]>(() => {
    try {
      const raw = localStorage.getItem(stepsKey);
      if (!raw) return steps.map(() => false);
      const parsed = JSON.parse(raw) as unknown;
      if (!Array.isArray(parsed)) return steps.map(() => false);
      return steps.map((_, i) => Boolean(parsed[i]));
    } catch {
      return steps.map(() => false);
    }
  });

  useEffect(() => {
    trackHelpAnalytics({
      type: 'help_article_viewed',
      articleId: article.id,
      role: surfaceRole,
      timestamp: new Date().toISOString(),
    });
    try {
      localStorage.setItem(readKey, new Date().toISOString());
    } catch {
      /* ignore */
    }
  }, [article.id, readKey, surfaceRole]);

  const persistSteps = useCallback(
    (next: boolean[]) => {
      setChecked(next);
      try {
        localStorage.setItem(stepsKey, JSON.stringify(next));
      } catch {
        /* ignore */
      }
    },
    [stepsKey],
  );

  const allDone = useMemo(() => checked.length > 0 && checked.every(Boolean), [checked]);

  const toggleStep = (index: number) => {
    const next = [...checked];
    next[index] = !next[index];
    persistSteps(next);
  };

  return (
    <article className="space-y-4">
      <h2 className="text-base font-semibold text-on-surface">
        <HighlightedText text={title} query={searchQuery} />
      </h2>
      {article.screenshotUrl ? (
        <img
          src={article.screenshotUrl}
          alt=""
          className="w-full rounded-xl border border-outline-variant object-cover"
          loading="lazy"
        />
      ) : null}
      <ol className="list-decimal space-y-3 ps-5 text-sm text-on-surface">
        {steps.map((step, i) => (
          <li key={i} className="leading-relaxed">
            <div className="flex items-start gap-3">
              <div className="flex min-h-11 min-w-11 shrink-0 items-center justify-center">
                <Checkbox
                  id={`help-step-${article.id}-${i}`}
                  checked={checked[i] ?? false}
                  onCheckedChange={() => toggleStep(i)}
                />
              </div>
              <Label htmlFor={`help-step-${article.id}-${i}`} className="cursor-pointer font-normal">
                <HighlightedText text={step} query={searchQuery} />
              </Label>
            </div>
          </li>
        ))}
      </ol>
      {allDone ? (
        <p className="text-xs font-medium text-secondary">{t('help.article.allStepsDone')}</p>
      ) : null}
      {article.relatedPage ? (
        <Button type="button" className="min-h-11 w-full" onClick={onTryNow}>
          {t('help.article.tryNow')}
        </Button>
      ) : null}
    </article>
  );
}
