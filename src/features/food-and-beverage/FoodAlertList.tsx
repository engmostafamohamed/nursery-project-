import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';

import { DataTable, StatusPill, TablePagination, TBody, Td, Th, THead, Tr } from '@/components/ui/DataTable';
import { MaterialSymbol } from '@/components/ui/MaterialSymbol';
import { usePagination } from '@/hooks/usePagination';
import { cn } from '@/lib/utils';

import { dayLabel, MEAL_LOOK } from './mealLook';
import { alertsByDayAndChild, groupUnmatched, type ChildAlert } from './foodAlerts';
import { localName } from '@/lib/bilingualName';
import { severityTone } from './menu';
import type { FoodAlerts } from './foodAlertsApi';

/**
 * Who must not eat what: per day, each child once (worst reaction first) with the dishes and why,
 * what to do if they react, and whether the family sends their food. Then the allergies the menu
 * is not checked against.
 */
export function FoodAlertList({
  alerts,
  showUnmatched = true,
  childHref,
  childLinkState,
}: {
  alerts: FoodAlerts;
  showUnmatched?: boolean;
  /** Where a child's name leads (their health record, at the allergy), for staff who may open it. */
  childHref?: (childId: string, allergyName: string) => string;
  /** Passed along with that link, e.g. so the record's back link returns here. */
  childLinkState?: unknown;
}) {
  const { t, i18n } = useTranslation();
  const isArabic = i18n.language.startsWith('ar');
  const locale = isArabic ? 'ar-EG' : 'en-GB';
  const days = alertsByDayAndChild(alerts.conflicts);
  const rows = days.flatMap(({ day, children }) => children.map((child) => ({ day, child })));
  const pager = usePagination(rows, 10, `${rows.length}`);

  return (
    <div className="space-y-5">
      {days.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-2xl border border-success/30 bg-success/5 p-8 text-center" data-testid="food-alerts-none">
          <span className="flex h-12 w-12 items-center justify-center rounded-full bg-success/15 text-success">
            <MaterialSymbol name="verified" size="text-2xl" />
          </span>
          <p className="text-sm font-medium text-success">{t('fnb.alerts.none')}</p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-outline-variant bg-surface shadow-sm">
          <DataTable minWidth={980}>
            <THead>
              <Th>{t('fnb.alerts.table.day')}</Th>
              <Th>{t('fnb.alerts.table.child')}</Th>
              <Th>{t('fnb.alerts.table.severity')}</Th>
              <Th>{t('fnb.alerts.table.dishes')}</Th>
              <Th>{t('fnb.alerts.table.whatToDo')}</Th>
            </THead>
            <TBody>
              {pager.pageItems.map(({ day, child }) => (
                <ChildAlertRow key={`${day}-${child.childId}`} day={day} child={child} isArabic={isArabic} locale={locale} />
              ))}
            </TBody>
          </DataTable>
          <TablePagination pager={pager} pageSizeOptions={[10, 20, 50]} />
        </div>
      )}

      {showUnmatched && alerts.unmatched.length ? <UnmatchedAllergies items={alerts.unmatched} childHref={childHref} linkState={childLinkState} isArabic={isArabic} /> : null}
    </div>
  );
}

/** One child on one day, as a table row: the day, who, how bad, the dishes and why, and what to do if they react. */
function ChildAlertRow({ day, child, isArabic, locale }: { day: string; child: ChildAlert; isArabic: boolean; locale: string }) {
  const { t } = useTranslation();
  const tone = severityTone(child.worstSeverity);
  const name = localName(child.childNameAr, child.childNameEn, isArabic);
  const first = child.items[0];
  const urgent = child.eatsNurseryMeals;

  return (
    <Tr data-testid="food-alert" className={cn(urgent && tone === 'error' && 'bg-error/5')}>
      <Td className="whitespace-nowrap font-medium text-on-surface">{dayLabel(day, locale, { weekday: 'short', day: 'numeric', month: 'short' })}</Td>
      <Td className="min-w-[11rem]">
        <span className="flex min-w-0 items-center gap-2.5">
          <span
            aria-hidden
            className={cn(
              'flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-bold',
              !urgent ? 'bg-surface-high text-on-surface-variant' : tone === 'error' ? 'bg-error/15 text-error' : 'bg-warning/15 text-warning',
            )}
          >
            {name.charAt(0)}
          </span>
          <span className="min-w-0">
            <span className="block truncate font-semibold text-on-surface">{name}</span>
            {child.classNameAr || child.classNameEn ? (
              <span className="block truncate text-xs text-on-surface-variant">{localName(child.classNameAr, child.classNameEn, isArabic)}</span>
            ) : null}
          </span>
        </span>
      </Td>
      <Td>
        <span className="flex flex-col items-start gap-1">
          {child.worstSeverity ? <StatusPill tone={tone} icon="warning">{t(`fnb.severity.${child.worstSeverity}`, { defaultValue: child.worstSeverity })}</StatusPill> : null}
          {!urgent ? <StatusPill tone="neutral" icon="lunch_dining">{t('fnb.ownFood')}</StatusPill> : null}
          {first.weekStatus === 'draft' ? <StatusPill tone="neutral">{t('fnb.status.draft')}</StatusPill> : null}
        </span>
      </Td>
      <Td className="min-w-[15rem]">
        <ul className="space-y-1">
          {child.items.map((c) => {
            const look = MEAL_LOOK[c.meal];
            return (
              <li key={`${c.dishId}-${c.allergen}`} className="flex items-center gap-2 text-sm">
                <span className={cn('flex h-6 w-6 shrink-0 items-center justify-center rounded-md', look.tint)} aria-hidden>
                  <MaterialSymbol name={look.icon} size="text-sm" />
                </span>
                <span className="min-w-0 text-on-surface">
                  {t('fnb.alerts.item', { meal: t(`fnb.meals.${c.meal}`), dish: c.dishName, allergen: t(`fnb.allergens.${c.allergen}`) })}
                </span>
              </li>
            );
          })}
        </ul>
      </Td>
      <Td className="min-w-[13rem] max-w-[20rem] text-xs">
        {first.reaction || first.treatment ? (
          <dl className="space-y-0.5">
            {first.treatment ? (
              <div>
                <dt className="inline font-semibold text-on-surface">{t('fnb.alerts.treatment')}: </dt>
                <dd className="inline text-on-surface">{first.treatment}</dd>
              </div>
            ) : null}
            {first.reaction ? (
              <div>
                <dt className="inline font-semibold text-on-surface-variant">{t('fnb.alerts.reaction')}: </dt>
                <dd className="inline text-on-surface-variant">{first.reaction}</dd>
              </div>
            ) : null}
          </dl>
        ) : (
          <span className="text-on-surface-variant">—</span>
        )}
      </Td>
    </Tr>
  );
}

/**
 * Allergies that name no food (medicines, dust…): the menu cannot be checked against them, so the
 * nursery sees them grouped by allergy, each child coloured by how severe it is.
 */
function UnmatchedAllergies({
  items,
  childHref,
  linkState,
  isArabic,
}: {
  items: FoodAlerts['unmatched'];
  childHref?: (childId: string, allergyName: string) => string;
  linkState?: unknown;
  isArabic: boolean;
}) {
  const { t } = useTranslation();
  const groups = groupUnmatched(items);
  const children = new Set(items.map((u) => u.childId)).size;

  return (
    <section aria-labelledby="alerts-unmatched" className="overflow-hidden rounded-2xl border border-outline-variant bg-surface shadow-sm" data-testid="unmatched-allergies">
      <div className="flex items-start gap-3 border-b border-outline-variant bg-surface-container-lowest p-4">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-warning/10 text-warning" aria-hidden>
          <MaterialSymbol name="policy_alert" size="text-xl" />
        </span>
        <div className="min-w-0 flex-1">
          <h3 id="alerts-unmatched" className="font-semibold text-on-surface">{t('fnb.alerts.unmatchedTitle')}</h3>
          <p className="text-xs text-on-surface-variant">{t('fnb.alerts.unmatchedHint')}</p>
        </div>
        <span className="shrink-0 rounded-full bg-surface-high px-2.5 py-0.5 text-xs font-medium text-on-surface-variant">
          {t('fnb.alerts.unmatchedCount', { count: children })}
        </span>
      </div>
      <ul className="divide-y divide-outline-variant">
        {groups.map((group) => (
          <li key={group.key} className="flex flex-col gap-2 p-4 sm:flex-row sm:items-start">
            <div className="flex items-center gap-2 sm:w-48 sm:shrink-0">
              <span className="font-semibold text-on-surface">{group.name}</span>
              <span className="rounded-full bg-warning/10 px-2 py-0.5 text-xs font-semibold text-warning">{group.children.length}</span>
            </div>
            <ul className="flex flex-1 flex-wrap gap-1.5">
              {group.children.map((child) => {
                const tone = severityTone(child.severity);
                const label = localName(child.childNameAr, child.childNameEn, isArabic);
                const look = cn(
                  'inline-flex items-center gap-1.5 rounded-full border bg-surface px-2.5 py-1 text-xs text-on-surface',
                  tone === 'error' ? 'border-error/30' : 'border-outline-variant',
                );
                const dot = <span className={cn('h-2 w-2 rounded-full', tone === 'error' ? 'bg-error' : 'bg-warning')} aria-hidden />;
                const title = child.severity ? t(`fnb.severity.${child.severity}`, { defaultValue: child.severity }) : undefined;
                return (
                  <li key={child.childId}>
                    {childHref ? (
                      <Link to={childHref(child.childId, group.name)} state={linkState} title={title} className={cn(look, 'transition-colors hover:border-primary hover:text-primary')}>
                        {dot}
                        {label}
                      </Link>
                    ) : (
                      <span title={title} className={look}>
                        {dot}
                        {label}
                      </span>
                    )}
                  </li>
                );
              })}
            </ul>
          </li>
        ))}
      </ul>
    </section>
  );
}
