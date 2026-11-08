import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useLocation, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { confirm } from '@/components/ui/confirm';
import { StatusPill } from '@/components/ui/DataTable';
import { MaterialSymbol } from '@/components/ui/MaterialSymbol';
import { PageHeader } from '@/components/ui/PageHeader';
import { Skeleton } from '@/components/ui/skeleton';
import { addDays, weekStartOf } from '@/features/food-and-beverage/menu';
import { copyMenuWeek, menuErrorKey, setMenuWeekPublished } from '@/features/food-and-beverage/menuApi';
import { MenuFileCard } from '@/features/food-and-beverage/MenuFileCard';
import { MenuWeekEditor } from '@/features/food-and-beverage/MenuWeekEditor';
import { MenuWeekView } from '@/features/food-and-beverage/MenuWeekView';
import { useMenuChange, useMenuWeek } from '@/features/food-and-beverage/useMenuWeek';
import { WeekSwitcher } from '@/features/food-and-beverage/WeekSwitcher';
import { getNurseryCalendarDateString } from '@/lib/nurseryDay';
import { useSettings } from '@/lib/useSettings';

/**
 * F&B · the weekly menu: write each day's dishes and what they contain (with the children each is
 * not safe for), add the menu as a photo or PDF, then publish it to the families. Staff without
 * the meals permission read it.
 */
export function AdminMealPlansPage() {
  const { t } = useTranslation();
  const location = useLocation();
  const base = location.pathname.startsWith('/xo-admin') ? '/xo-admin/nursery' : '/admin';
  const { nurseryId } = useSettings();
  const [searchParams, setSearchParams] = useSearchParams();
  const today = getNurseryCalendarDateString();
  const thisWeek = weekStartOf(today);
  const requested = searchParams.get('week');
  const weekStart = requested && /^\d{4}-\d{2}-\d{2}$/.test(requested) ? weekStartOf(requested) : thisWeek;
  const query = useMenuWeek(nurseryId, weekStart);
  const menu = query.data;
  const [dirty, setDirty] = useState(false);
  const onDirtyChange = useCallback((value: boolean) => setDirty(value), []);

  const publish = useMenuChange(nurseryId, (published: boolean) => setMenuWeekPublished(nurseryId!, weekStart, published));
  const copy = useMenuChange(nurseryId, () => copyMenuWeek(nurseryId!, addDays(weekStart, -7), weekStart));

  const goTo = async (next: string) => {
    if (dirty && !(await confirm({ title: t('fnb.editor.discardTitle'), description: t('fnb.editor.discardBody'), confirmText: t('fnb.editor.discard'), icon: 'warning' }))) return;
    setDirty(false);
    setSearchParams(next === thisWeek ? {} : { week: next });
  };

  const run = async (action: () => Promise<unknown>, done: string) => {
    try {
      await action();
      toast.success(t(done));
    } catch (error) {
      toast.error(t(menuErrorKey(error)));
    }
  };

  const status = menu?.week?.status;
  const hasContent = Boolean(menu && (menu.dishes.length || menu.week?.file));

  return (
    <div className="space-y-4 pb-24">
      <PageHeader
        icon="restaurant"
        eyebrow={t('fnb.eyebrow')}
        title={t('fnb.menu.title')}
        description={t('fnb.menu.subtitle')}
        actions={
          <Button asChild variant="outline">
            <Link to={`${base}/food-alerts`}>
              <MaterialSymbol name="no_food" size="text-base" className="me-1" />
              {t('fnb.menu.alertsLink')}
            </Link>
          </Button>
        }
      >
        <div className="flex flex-col gap-3 xl:flex-row xl:items-center">
          <div className="xl:w-[26rem] xl:shrink-0">
            <WeekSwitcher weekStart={weekStart} thisWeek={thisWeek} onChange={(next) => void goTo(next)} />
          </div>
          {menu?.canEdit ? (
            <div className="flex flex-1 flex-wrap items-center gap-2 xl:justify-end">
              <StatusPill tone={status === 'published' ? 'success' : 'neutral'} icon={status === 'published' ? 'visibility' : 'edit_note'}>
                {status === 'published' ? t('fnb.status.published') : t('fnb.status.draft')}
              </StatusPill>
              <span className="me-auto text-xs text-on-surface-variant xl:me-0">
                {dirty ? <span className="text-warning">{t('fnb.menu.saveFirst')}</span> : status === 'published' ? t('fnb.menu.publishedHint') : t('fnb.menu.draftHint')}
              </span>
              {!menu.dishes.length ? (
                <Button type="button" variant="outline" size="sm" disabled={copy.isPending} onClick={() => void run(() => copy.mutateAsync(undefined), 'fnb.menu.copied')}>
                  <MaterialSymbol name="content_copy" size="text-base" className="me-1" />
                  {t('fnb.menu.copyLast')}
                </Button>
              ) : null}
              {status === 'published' ? (
                <Button type="button" variant="outline" size="sm" disabled={publish.isPending} onClick={() => void run(() => publish.mutateAsync(false), 'fnb.menu.unpublished')}>
                  <MaterialSymbol name="visibility_off" size="text-base" className="me-1" />
                  {t('fnb.menu.unpublish')}
                </Button>
              ) : (
                <Button
                  type="button"
                  size="sm"
                  disabled={publish.isPending || dirty || !hasContent}
                  title={dirty ? t('fnb.menu.saveFirst') : undefined}
                  onClick={() => void run(() => publish.mutateAsync(true), 'fnb.menu.published')}
                >
                  <MaterialSymbol name="send" size="text-base" className="me-1 rtl:rotate-180" />
                  {t('fnb.menu.publish')}
                </Button>
              )}
            </div>
          ) : null}
        </div>
      </PageHeader>

      {!nurseryId || query.isLoading ? (
        <Skeleton className="h-96 rounded-xl" />
      ) : !menu ? (
        <p role="alert" className="rounded-xl border border-error/40 bg-error/5 p-4 text-sm">{t('fnb.errors.failed')}</p>
      ) : (
        <>
          <MenuFileCard nurseryId={nurseryId} menu={menu} />
          {menu.canEdit ? (
            <MenuWeekEditor key={`${menu.weekStart}:${menu.week?.updatedAt ?? 'new'}`} nurseryId={nurseryId} menu={menu} today={today} onDirtyChange={onDirtyChange} />
          ) : (
            <MenuWeekView menu={menu} today={today} audience="staff" />
          )}
        </>
      )}
    </div>
  );
}
