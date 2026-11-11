import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Checkbox } from '@/components/ui/checkbox';
import { DataTable, StatusPill, TableEmpty, TablePagination, TBody, Td, Th, THead, Tr } from '@/components/ui/DataTable';
import { FilterChips } from '@/components/ui/FilterChips';
import { SearchInput } from '@/components/ui/FilterBar';
import { usePagination } from '@/hooks/usePagination';
import { localName } from '@/lib/bilingualName';
import { getUserInitials } from '@/lib/utils';

import { ageOf, candidatesIn, childName, type Candidate, type CandidateScope } from './classEditor';
import { useAgeText } from './useAgeText';

/**
 * Choosing children to put in a class: those without a class first (or every child, to move one from
 * another class: their class shows), searched by name or code, a page at a time, ticked one by one or
 * a whole page at once. The selection is kept across searches and pages.
 */
export function ChildPickerTable({
  candidates,
  selected,
  onChange,
  today,
}: {
  candidates: Candidate[];
  selected: Set<string>;
  onChange: (next: Set<string>) => void;
  today: string;
}) {
  const { t, i18n } = useTranslation();
  const isArabic = i18n.language.startsWith('ar');
  const ageText = useAgeText();
  const unassigned = useMemo(() => candidates.filter((c) => !c.classId).length, [candidates]);
  const [scope, setScope] = useState<CandidateScope>(unassigned ? 'unassigned' : 'all');
  const [search, setSearch] = useState('');
  const shown = useMemo(() => candidatesIn(candidates, scope, search), [candidates, scope, search]);
  const pager = usePagination(shown, 10, `${scope}|${search}`);
  const pageIds = pager.pageItems.map((c) => c.id);
  const allOnPage = pageIds.length > 0 && pageIds.every((id) => selected.has(id));

  const toggle = (id: string) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    onChange(next);
  };
  const togglePage = () => {
    const next = new Set(selected);
    for (const id of pageIds) {
      if (allOnPage) next.delete(id);
      else next.add(id);
    }
    onChange(next);
  };

  return (
    <div className="space-y-3" data-testid="child-picker">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <FilterChips
          value={scope}
          onChange={setScope}
          label={t('classEditor.picker.scope')}
          options={[
            { value: 'unassigned', label: t('classEditor.picker.unassigned'), count: unassigned },
            { value: 'all', label: t('classEditor.picker.all'), count: candidates.length },
          ]}
        />
        <div className="sm:w-72">
          <SearchInput value={search} onChange={setSearch} placeholder={t('classEditor.picker.search')} />
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-outline-variant">
        {!shown.length ? (
          <TableEmpty
            icon="child_care"
            title={candidates.length ? t('classEditor.picker.noMatch') : t('classEditor.picker.none')}
            description={!candidates.length ? t('classEditor.picker.noneHint') : undefined}
          />
        ) : (
          <>
            <DataTable minWidth={560}>
              <THead>
                <Th className="w-10">
                  <Checkbox checked={allOnPage} onCheckedChange={togglePage} aria-label={t('classEditor.picker.selectPage')} />
                </Th>
                <Th>{t('classEditor.table.child')}</Th>
                <Th>{t('classEditor.table.age')}</Th>
                <Th>{t('classEditor.picker.currentClass')}</Th>
              </THead>
              <TBody>
                {pager.pageItems.map((c) => {
                  const name = childName(c, isArabic);
                  const checked = selected.has(c.id);
                  return (
                    <Tr key={c.id} onClick={() => toggle(c.id)} className={checked ? 'bg-primary/5' : undefined} data-testid="picker-row">
                      <Td className="w-10">
                        <Checkbox checked={checked} onCheckedChange={() => toggle(c.id)} aria-label={t('classEditor.picker.select', { name })} />
                      </Td>
                      <Td>
                        <span className="flex items-center gap-3">
                          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-surface-high text-xs font-semibold text-on-surface-variant" aria-hidden>
                            {getUserInitials(name, null)}
                          </span>
                          <span className="min-w-0">
                            <span className="block truncate font-medium text-on-surface">{name}</span>
                            {c.code ? <span className="block text-xs text-on-surface-variant" dir="ltr">{c.code}</span> : null}
                          </span>
                        </span>
                      </Td>
                      <Td className="whitespace-nowrap text-on-surface-variant">{ageText(ageOf(c.dob, today))}</Td>
                      <Td>
                        {c.classId ? (
                          <StatusPill tone="neutral" icon="school">{localName(c.classAr, c.classEn, isArabic)}</StatusPill>
                        ) : (
                          <StatusPill tone="warning" icon="person_off">{t('classEditor.picker.noClass')}</StatusPill>
                        )}
                      </Td>
                    </Tr>
                  );
                })}
              </TBody>
            </DataTable>
            <TablePagination pager={pager} pageSizeOptions={[10, 25, 50]} />
          </>
        )}
      </div>
    </div>
  );
}
