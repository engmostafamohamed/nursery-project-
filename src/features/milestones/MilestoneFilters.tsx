import { useTranslation } from 'react-i18next';

import { FilterBar } from '@/components/ui/FilterBar';
import { FilterChips } from '@/components/ui/FilterChips';
import { FilterField } from '@/components/ui/FilterField';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import type { MilestoneCategory, MilestoneItem } from '@/hooks/useMilestones';

import { isFiltered, matchesExceptArea, MILESTONE_CATEGORIES, NO_MILESTONE_FILTER, type MilestoneFilter } from './milestones';

type Props = {
  value: MilestoneFilter;
  onChange: (value: MilestoneFilter) => void;
  /** All the milestones, to count each area under the other filters. */
  items: MilestoneItem[];
  kids: { id: string; name: string }[];
  /** The teacher's view adds "shared with the family or not". */
  withShared?: boolean;
};

/** The filters above a milestone list: child (when there are several), days, the family's view, then the areas as chips with counts. */
export function MilestoneFilters({ value, onChange, items, kids, withShared = false }: Props) {
  const { t } = useTranslation();
  const set = (patch: Partial<MilestoneFilter>) => onChange({ ...value, ...patch });
  const inView = items.filter((m) => matchesExceptArea(m, value));
  const countOf = (c: MilestoneCategory) => inView.filter((m) => m.category === c).length;

  return (
    <div className="space-y-3">
      <FilterBar onClear={() => onChange(NO_MILESTONE_FILTER)} canClear={isFiltered(value)}>
        {kids.length > 1 ? (
          <FilterField label={t('milestones.child')} className="w-full sm:w-56">
            <Select value={value.childId} onChange={(e) => set({ childId: e.target.value })} data-testid="milestone-filter-child">
              <option value="">{t('milestones.allChildren')}</option>
              {kids.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </Select>
          </FilterField>
        ) : null}
        <FilterField label={t('milestones.filters.from')} className="w-[calc(50%-0.375rem)] sm:w-44">
          <Input type="date" value={value.from} max={value.to || undefined} onChange={(e) => set({ from: e.target.value })} />
        </FilterField>
        <FilterField label={t('milestones.filters.to')} className="w-[calc(50%-0.375rem)] sm:w-44">
          <Input type="date" value={value.to} min={value.from || undefined} onChange={(e) => set({ to: e.target.value })} />
        </FilterField>
        {withShared ? (
          <FilterField label={t('milestones.filters.shared')} className="w-full sm:w-48">
            <Select value={value.shared} onChange={(e) => set({ shared: e.target.value as MilestoneFilter['shared'] })}>
              <option value="all">{t('milestones.filters.sharedAll')}</option>
              <option value="shared">{t('milestones.sharedYes')}</option>
              <option value="private">{t('milestones.sharedNo')}</option>
            </Select>
          </FilterField>
        ) : null}
      </FilterBar>
      <FilterChips
        label={t('milestones.category')}
        value={value.category}
        onChange={(category) => set({ category })}
        options={[
          { value: 'all' as const, label: t('milestones.allCategories'), count: inView.length },
          ...MILESTONE_CATEGORIES.map((c) => ({ value: c, label: t(`milestones.categories.${c}`), count: countOf(c) })),
        ]}
        hideEmpty
      />
    </div>
  );
}
