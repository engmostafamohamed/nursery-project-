import { useTranslation } from 'react-i18next';

import { SelectedDayChip } from '@/components/events/SelectedDayChip';
import { FilterBar, SearchInput } from '@/components/ui/FilterBar';
import { FilterChips } from '@/components/ui/FilterChips';
import { FilterField } from '@/components/ui/FilterField';
import { Select } from '@/components/ui/select';
import type {
  AdminEventsListCategoryFilter,
  AdminEventsListDateFilter,
  AdminEventsListStatusFilter,
} from '@/hooks/useAdminEventsList';

import { NO_EVENT_FILTERS, type AdminEventsFilterState } from './adminEventFilters';

const STATUSES: AdminEventsListStatusFilter[] = ['all', 'draft', 'active', 'urgent', 'completed', 'cancelled'];
const CATEGORIES: AdminEventsListCategoryFilter[] = ['all', 'trip', 'activity', 'service', 'doctor_visit'];
const DATES: AdminEventsListDateFilter[] = ['all', 'upcoming', 'past'];

/** The admin's event filters: the stage (with counts), the kind, when, a search, and the day picked. */
export function AdminEventsFilters({ value, onChange, statusCounts, categoryCounts, locale }: {
  value: AdminEventsFilterState;
  onChange: (next: AdminEventsFilterState) => void;
  statusCounts: Partial<Record<AdminEventsListStatusFilter, number>>;
  categoryCounts: Partial<Record<AdminEventsListCategoryFilter, number>>;
  locale: string;
}) {
  const { t } = useTranslation();
  const set = (patch: Partial<AdminEventsFilterState>) => onChange({ ...value, ...patch });
  const active = value.status !== 'all' || value.category !== 'all' || value.date !== 'all' || Boolean(value.search.trim()) || Boolean(value.day);

  return (
    <div className="space-y-3">
      <FilterChips
        label={t('admin.events.list.filterStatus')}
        value={value.status}
        onChange={(status) => set({ status })}
        hideEmpty
        options={STATUSES.map((s) => ({ value: s, label: t(`admin.events.list.statusTab.${s}`), count: statusCounts[s] ?? 0 }))}
      />
      <FilterBar onClear={() => onChange(NO_EVENT_FILTERS)} canClear={active}>
        <FilterField label={t('admin.events.list.filterCategory')}>
          <Select value={value.category} onChange={(e) => set({ category: e.target.value as AdminEventsListCategoryFilter })}>
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {t(`admin.events.list.categoryOption.${c}`)} ({categoryCounts[c] ?? 0})
              </option>
            ))}
          </Select>
        </FilterField>
        <FilterField label={t('admin.events.list.filterDate')}>
          <Select value={value.date} onChange={(e) => set({ date: e.target.value as AdminEventsListDateFilter })}>
            {DATES.map((d) => (
              <option key={d} value={d}>{t(`admin.events.list.dateOption.${d}`)}</option>
            ))}
          </Select>
        </FilterField>
        <FilterField label={t('common.search')} className="sm:flex-[2]">
          <SearchInput value={value.search} onChange={(search) => set({ search })} placeholder={t('admin.events.list.searchPlaceholder')} />
        </FilterField>
      </FilterBar>
      {value.day ? <SelectedDayChip dateKey={value.day} locale={locale} onClear={() => set({ day: null })} /> : null}
    </div>
  );
}
