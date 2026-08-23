import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';

import { HelpArticleView } from '@/components/help/HelpArticle';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { helpArticles, type HelpArticleCategory } from '@/data/helpArticles';
import { useAuthSession } from '@/hooks/useAuthSession';
import { trackHelpAnalytics } from '@/lib/helpAnalytics';
import { cn } from '@/lib/utils';

const CATEGORIES: HelpArticleCategory[] = ['getting_started', 'daily_tasks', 'troubleshooting', 'faq'];

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  surfaceRole: 'admin' | 'teacher' | 'parent';
}

function useDebounced<T>(value: T, ms: number): T {
  const [d, setD] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setD(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return d;
}

function matchesArticle(
  article: (typeof helpArticles)[number],
  q: string,
): boolean {
  if (!q) return true;
  const s = q.toLowerCase();
  const blob = [
    article.title_en,
    article.title_ar,
    ...article.steps_en,
    ...article.steps_ar,
  ]
    .join(' ')
    .toLowerCase();
  return blob.includes(s);
}

export function HelpPanel({ open, onOpenChange, surfaceRole }: Props) {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const isArabic = i18n.language.startsWith('ar');
  const { user } = useAuthSession();
  const userId = user?.id;
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState<HelpArticleCategory | 'all'>('all');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const debouncedSearch = useDebounced(search, 280);
  const lastSearchTracked = useRef('');

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onOpenChange(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onOpenChange]);

  const filtered = useMemo(() => {
    return helpArticles.filter((a) => {
      const roleOk = a.role === 'all' || a.role === surfaceRole;
      const catOk = category === 'all' || a.category === category;
      const searchOk = matchesArticle(a, debouncedSearch.trim());
      return roleOk && catOk && searchOk;
    });
  }, [surfaceRole, category, debouncedSearch]);

  useEffect(() => {
    const q = debouncedSearch.trim();
    if (!q || lastSearchTracked.current === q) return;
    lastSearchTracked.current = q;
    trackHelpAnalytics({
      type: 'help_search_query',
      query: q,
      resultsCount: filtered.length,
      timestamp: new Date().toISOString(),
    });
  }, [debouncedSearch, filtered.length]);

  const selected = useMemo(
    () => (selectedId ? filtered.find((a) => a.id === selectedId) ?? null : null),
    [filtered, selectedId],
  );

  const onTryNow = useCallback(() => {
    if (!selected?.relatedPage) return;
    onOpenChange(false);
    navigate(selected.relatedPage);
  }, [navigate, onOpenChange, selected]);

  return (
    <>
      <button
        type="button"
        aria-hidden={!open}
        className={cn(
          'fixed inset-0 z-[60] bg-black/40 transition-opacity duration-300 ease-in-out',
          open ? 'opacity-100' : 'pointer-events-none opacity-0',
        )}
        onClick={() => onOpenChange(false)}
      />
      <aside
        role="dialog"
        aria-modal="true"
        aria-label={t('help.panelTitle')}
        className={cn(
          'fixed inset-y-0 z-[70] flex w-full flex-col border-outline-variant bg-surface-container-lowest shadow-xl transition-transform duration-300 ease-in-out md:max-w-[400px] md:border-s',
          'end-0',
          open ? 'translate-x-0' : 'translate-x-full rtl:-translate-x-full',
        )}
      >
        <header className="flex shrink-0 items-center justify-between border-b border-outline-variant px-4 py-3">
          <h1 className="text-base font-semibold text-on-surface">{t('help.panelTitle')}</h1>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="min-h-11 min-w-11 shrink-0"
            onClick={() => onOpenChange(false)}
            aria-label={t('common.close')}
          >
            <span className="material-symbols-outlined text-xl" aria-hidden>
              close
            </span>
          </Button>
        </header>

        <div className="shrink-0 border-b border-outline-variant p-3">
          <div className="relative">
            <span className="material-symbols-outlined pointer-events-none absolute start-3 top-2.5 text-on-surface-variant text-base">
              search
            </span>
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t('help.searchPlaceholder')}
              className="min-h-11 ps-10"
              aria-label={t('help.searchPlaceholder')}
            />
          </div>
          <div className="mt-2 flex flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
              variant={category === 'all' ? 'default' : 'outline'}
              className="min-h-9"
              onClick={() => setCategory('all')}
            >
              {t('help.categoryAll')}
            </Button>
            {CATEGORIES.map((c) => (
              <Button
                key={c}
                type="button"
                size="sm"
                variant={category === c ? 'default' : 'outline'}
                className="min-h-9"
                onClick={() => setCategory(c)}
              >
                {t(`help.categories.${c}`)}
              </Button>
            ))}
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-3">
          {selected ? (
            <div className="space-y-3">
              <Button type="button" variant="outline" size="sm" className="min-h-10" onClick={() => setSelectedId(null)}>
                {t('help.backToList')}
              </Button>
              <HelpArticleView
                article={selected}
                userId={userId}
                surfaceRole={surfaceRole}
                isArabic={isArabic}
                searchQuery={debouncedSearch}
                onTryNow={onTryNow}
              />
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center gap-3 py-10 text-center">
              <span className="material-symbols-outlined text-4xl text-on-surface-variant" aria-hidden>
                search_off
              </span>
              <p className="text-sm font-medium text-on-surface">{t('help.noResultsTitle')}</p>
              <p className="text-xs text-on-surface-variant">{t('help.noResultsHint')}</p>
              <Button
                type="button"
                variant="secondary"
                className="min-h-11"
                onClick={() => {
                  setSearch('');
                  setCategory('all');
                }}
              >
                {t('help.clearSearch')}
              </Button>
            </div>
          ) : (
            <ul className="space-y-2">
              {filtered.map((a) => (
                <li key={a.id}>
                  <button
                    type="button"
                    className="min-h-[44px] w-full rounded-xl border border-outline-variant bg-surface px-3 py-2 text-start text-sm text-foreground hover:bg-surface-container"
                    onClick={() => setSelectedId(a.id)}
                  >
                    {isArabic ? a.title_ar : a.title_en}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <footer className="shrink-0 border-t border-outline-variant px-3 py-2 text-[10px] text-on-surface-variant">
          {t('help.shortcutsHint')}
        </footer>
      </aside>
    </>
  );
}
