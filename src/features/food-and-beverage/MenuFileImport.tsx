import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { confirm } from '@/components/ui/confirm';
import { MaterialSymbol } from '@/components/ui/MaterialSymbol';
import { cn } from '@/lib/utils';

import { toImportedDrafts, type DraftDish } from './menuDrafts';
import { extractMenuFromFile } from './menuFileApi';
import { menuErrorKey } from './menuErrors';
import type { Menu } from './menuApi';

type Summary = { count: number; dropped: number; unclear: string[] };

/**
 * Filling the menu from its file: the app's AI reads the photo or PDF and writes each day's dishes
 * with their allergens. They land in the editor unsaved, replacing what is there (after asking), for
 * the admin to check and then save. Shown only when the menu has a file.
 */
export function MenuFileImport({ nurseryId, menu, hasDishes, onImport }: { nurseryId: string; menu: Menu; hasDishes: boolean; onImport: (drafts: DraftDish[]) => void }) {
  const { t } = useTranslation();
  const [summary, setSummary] = useState<Summary | null>(null);
  const read = useMutation({ mutationFn: () => extractMenuFromFile(nurseryId, menu.startsOn) });

  if (!menu.canEdit || !menu.info?.file) return null;

  const run = async () => {
    try {
      const result = await read.mutateAsync();
      if (!result.dishes.length) {
        setSummary({ count: 0, dropped: result.dropped, unclear: result.unclear });
        toast.error(t('fnb.extract.nothingFound'));
        return;
      }
      if (hasDishes && !(await confirm({ title: t('fnb.extract.replaceTitle'), description: t('fnb.extract.replaceBody', { count: result.dishes.length }), confirmText: t('fnb.extract.replace'), icon: 'auto_awesome' }))) {
        return;
      }
      onImport(toImportedDrafts(result.dishes));
      setSummary({ count: result.dishes.length, dropped: result.dropped, unclear: result.unclear });
      toast.success(t('fnb.extract.done', { count: result.dishes.length }));
    } catch (error) {
      toast.error(t(menuErrorKey(error)));
    }
  };

  return (
    <section className="rounded-xl border border-primary/30 bg-primary/5 p-4 shadow-sm" aria-labelledby="menu-import-title" data-testid="menu-file-import">
      <div className="flex flex-wrap items-center gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-primary text-primary-foreground">
          <MaterialSymbol name="auto_awesome" size="text-xl" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 id="menu-import-title" className="text-sm font-semibold text-on-surface">{t('fnb.extract.title')}</h2>
          <p className="text-xs text-on-surface-variant">{read.isPending ? t('fnb.extract.reading') : t('fnb.extract.hint')}</p>
        </div>
        <Button type="button" size="sm" onClick={() => void run()} disabled={read.isPending} aria-busy={read.isPending}>
          <MaterialSymbol name={read.isPending ? 'progress_activity' : 'auto_awesome'} size="text-base" className={cn('me-1', read.isPending && 'animate-spin')} />
          {read.isPending ? t('fnb.extract.running') : t('fnb.extract.button')}
        </Button>
      </div>
      {summary ? (
        <div className="mt-3 space-y-1.5 border-t border-primary/20 pt-3 text-xs" role="status">
          {summary.count ? (
            <p className="flex items-center gap-1.5 font-medium text-on-surface">
              <MaterialSymbol name="fact_check" size="text-base" className="text-primary" />
              {t('fnb.extract.review', { count: summary.count })}
            </p>
          ) : null}
          {summary.dropped ? <p className="text-on-surface-variant">{t('fnb.extract.dropped', { count: summary.dropped })}</p> : null}
          {summary.unclear.length ? (
            <div className="rounded-lg border border-warning/30 bg-warning/5 p-2 text-on-surface">
              <p className="mb-1 font-semibold text-warning">{t('fnb.extract.unclear')}</p>
              <ul className="list-disc space-y-0.5 ps-5">
                {summary.unclear.map((note) => (
                  <li key={note}>{note}</li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
