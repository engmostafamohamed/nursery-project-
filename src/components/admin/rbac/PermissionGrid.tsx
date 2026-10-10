import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import type { FeatureRow } from '@/hooks/useFeatures';
import type { Action } from '@/lib/permissions/types';
import { cn } from '@/lib/utils';

import {
  CATEGORY_ORDER,
  isFullyGranted,
  setApproval,
  setFeaturesAll,
  toggleAction,
  type GrantDraft,
} from './permissionDraft';

interface PermissionGridProps {
  features: readonly FeatureRow[];
  draft: GrantDraft;
  onChange: (next: GrantDraft) => void;
  readOnly: boolean;
}

const ACTION_ICONS: Record<Action, string> = {
  view: 'visibility',
  create: 'add',
  update: 'edit',
  delete: 'delete',
  approve: 'task_alt',
  export: 'download',
};

/** Every module, grouped, with a chip per action the module supports. */
export function PermissionGrid({ features, draft, onChange, readOnly }: PermissionGridProps) {
  const { t } = useTranslation();
  const [search, setSearch] = useState('');

  const groups = useMemo(() => {
    const needle = search.trim().toLowerCase();
    const label = (f: FeatureRow) => t(`rbac.features.${f.id}`, { defaultValue: f.name_en ?? f.id });
    const byCategory = new Map<string, FeatureRow[]>();
    for (const feature of features) {
      if (feature.actions.length === 0) continue;
      if (needle && !label(feature).toLowerCase().includes(needle) && !feature.id.includes(needle)) continue;
      const category = feature.category ?? 'other';
      byCategory.set(category, [...(byCategory.get(category) ?? []), feature]);
    }
    const rank = (c: string) => (CATEGORY_ORDER.includes(c) ? CATEGORY_ORDER.indexOf(c) : CATEGORY_ORDER.length);
    return [...byCategory.entries()].sort(([a], [b]) => rank(a) - rank(b));
  }, [features, search, t]);

  const grantedCount = Object.keys(draft).length;

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-foreground-secondary">
          {t('rbac.grid.summary', { count: grantedCount, total: features.length })}
        </p>
        <div className="relative sm:w-64">
          <span className="material-symbols-outlined pointer-events-none absolute start-3 top-1/2 -translate-y-1/2 text-lg text-foreground-tertiary" aria-hidden>
            search
          </span>
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t('rbac.grid.search')}
            aria-label={t('rbac.grid.search')}
            className="h-10 ps-10 text-sm"
          />
        </div>
      </div>

      {groups.length === 0 ? (
        <p className="rounded-xl border border-dashed border-outline-variant p-6 text-center text-sm text-foreground-secondary">
          {t('rbac.grid.noMatch')}
        </p>
      ) : null}

      {groups.map(([category, items]) => {
        const allOn = items.every((f) => isFullyGranted(draft, f));
        const onCount = items.filter((f) => draft[f.id]).length;
        return (
          <section key={category} className="overflow-hidden rounded-2xl border border-outline-variant bg-surface-container-lowest">
            <header className="flex items-center justify-between gap-3 border-b border-outline-variant bg-surface-low px-4 py-2.5">
              <div className="flex min-w-0 items-center gap-2">
                <h3 className="truncate text-sm font-semibold text-foreground">
                  {t(`rbac.categories.${category}`, { defaultValue: category })}
                </h3>
                <span className="shrink-0 rounded-full bg-surface-high px-2 text-xs leading-5 text-foreground-secondary">
                  {onCount}/{items.length}
                </span>
              </div>
              {!readOnly ? (
                <button
                  type="button"
                  className="shrink-0 rounded-lg px-2 py-1 text-xs font-medium text-primary hover:bg-primary/10"
                  onClick={() => onChange(setFeaturesAll(draft, items, !allOn))}
                >
                  {allOn ? t('rbac.grid.clearAll') : t('rbac.grid.selectAll')}
                </button>
              ) : null}
            </header>
            <ul className="divide-y divide-outline-variant">
              {items.map((feature) => (
                <FeatureRowItem
                  key={feature.id}
                  feature={feature}
                  draft={draft}
                  onChange={onChange}
                  readOnly={readOnly}
                />
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}

function FeatureRowItem({
  feature,
  draft,
  onChange,
  readOnly,
}: {
  feature: FeatureRow;
  draft: GrantDraft;
  onChange: (next: GrantDraft) => void;
  readOnly: boolean;
}) {
  const { t } = useTranslation();
  const grant = draft[feature.id];
  const granted = new Set(grant?.actions ?? []);
  const label = t(`rbac.features.${feature.id}`, { defaultValue: feature.name_en ?? feature.id });
  const approvalId = `approval-${feature.id}`;

  return (
    <li className="flex flex-col gap-2 px-4 py-3 lg:flex-row lg:items-center lg:gap-4">
      <div className="flex min-w-0 items-center gap-2 lg:w-52 lg:shrink-0">
        <span
          className={cn('h-2 w-2 shrink-0 rounded-full', grant ? 'bg-success' : 'bg-outline-variant')}
          aria-hidden
        />
        <span className="truncate text-sm font-medium text-foreground">{label}</span>
      </div>
      <div className="flex flex-1 flex-wrap gap-1.5" role="group" aria-label={label}>
        {feature.actions.map((action) => {
          const on = granted.has(action);
          return (
            <button
              key={action}
              type="button"
              disabled={readOnly}
              aria-pressed={on}
              onClick={() => onChange(toggleAction(draft, feature, action))}
              className={cn(
                'inline-flex h-8 items-center gap-1 rounded-full border px-3 text-xs font-medium transition-colors disabled:cursor-default',
                on
                  ? 'border-primary/40 bg-primary/10 text-primary'
                  : 'border-outline-variant text-foreground-secondary hover:border-primary/40 hover:text-foreground',
                readOnly && !on && 'opacity-60',
              )}
            >
              <span className="material-symbols-outlined text-sm" aria-hidden>
                {on ? 'check' : ACTION_ICONS[action]}
              </span>
              {t(`rbac.actions.${action}`)}
            </button>
          );
        })}
      </div>
      {grant ? (
        <div className="flex items-center gap-2 lg:shrink-0">
          <Checkbox
            id={approvalId}
            checked={grant.requiresApproval}
            disabled={readOnly}
            onCheckedChange={(value) => onChange(setApproval(draft, feature.id, value === true))}
          />
          <label htmlFor={approvalId} className="text-xs text-foreground-secondary">
            {t('rbac.grid.requiresApproval')}
          </label>
        </div>
      ) : null}
    </li>
  );
}
