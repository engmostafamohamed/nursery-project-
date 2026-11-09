import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router-dom';

import { ActionGate } from '@/components/shared/ActionGate';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { DataTable, StatusPill, TableCard, TableEmpty, TablePagination, TBody, Td, Th, THead, Tr } from '@/components/ui/DataTable';
import { FilterBar, SearchInput } from '@/components/ui/FilterBar';
import { FilterChips } from '@/components/ui/FilterChips';
import { FilterField } from '@/components/ui/FilterField';
import { MaterialSymbol } from '@/components/ui/MaterialSymbol';
import { NameStack } from '@/components/ui/NameStack';
import { severityTone } from '@/features/child-health/childHealth';
import type { BilingualNames } from '@/hooks/useBilingualNames';
import { usePagination } from '@/hooks/usePagination';
import { getUserInitials } from '@/lib/utils';

import { ATTENDANCE_LOOK, REPORT_LOOK } from './classLook';
import { CHILD_FILTERS, filterChildren, filterCounts, reportStageOf, type ChildFilter, type ClassChild, type ClassProfile } from './classProfile';
import type { ClassFormat } from './useClassFormat';

const ALLERGIES_SHOWN = 2;

type CellProps = { child: ClassChild; format: ClassFormat };

/**
 * The class's children and their day: where they are, their daily report and what to watch for
 * their health. Search and the filter chips (the tiles above set them too) narrow the list; a child
 * opens their record.
 */
export function ClassChildrenPanel({
  profile,
  names,
  format,
  base,
  filter,
  onFilterChange,
}: {
  profile: ClassProfile;
  names: BilingualNames;
  format: ClassFormat;
  base: string;
  filter: ChildFilter;
  onFilterChange: (filter: ChildFilter) => void;
}) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const counts = useMemo(() => filterCounts(profile.children), [profile.children]);
  const shown = useMemo(() => filterChildren(profile.children, filter, search), [profile.children, filter, search]);
  const pager = usePagination(shown, 25, `${filter}|${search}`);
  const open = (child: ClassChild) => navigate(`${base}/children/${child.id}`);
  const canClear = filter !== 'all' || Boolean(search.trim());

  return (
    <TableCard
      title={t('classProfile.children.title')}
      count={t('classProfile.children.count', { count: shown.length })}
      description={t('classProfile.children.description')}
      filters={
        profile.children.length ? (
          <div className="space-y-3">
            <FilterBar
              onClear={() => {
                setSearch('');
                onFilterChange('all');
              }}
              canClear={canClear}
            >
              <FilterField label={t('common.search')} className="sm:flex-[2]">
                <SearchInput value={search} onChange={setSearch} placeholder={t('classProfile.children.searchPlaceholder')} />
              </FilterField>
            </FilterBar>
            <FilterChips
              value={filter}
              onChange={onFilterChange}
              label={t('classProfile.children.filterLabel')}
              options={CHILD_FILTERS.map((value) => ({ value, label: t(`classProfile.filters.${value}`), count: counts[value] }))}
            />
          </div>
        ) : null
      }
      pagination={shown.length ? <TablePagination pager={pager} /> : null}
    >
      {!profile.children.length ? (
        <TableEmpty
          icon="child_care"
          title={t('classProfile.children.emptyTitle')}
          description={t('classProfile.children.emptyDescription')}
          action={
            <ActionGate feature="classes" action="update">
              <Button asChild className="gap-2">
                <Link to={`${base}/classes/${profile.info.id}/edit`}>
                  <MaterialSymbol name="person_add" size="text-base" />
                  {t('classProfile.children.addChildren')}
                </Link>
              </Button>
            </ActionGate>
          }
        />
      ) : !shown.length ? (
        <TableEmpty icon="filter_alt_off" title={t('classProfile.children.noMatch')} />
      ) : (
        <>
          <ul className="divide-y divide-outline-variant md:hidden" data-testid="class-children-cards">
            {pager.pageItems.map((child) => (
              <li key={child.id}>
                <button type="button" onClick={() => open(child)} className="flex w-full items-start gap-3 px-4 py-3 text-start transition-colors hover:bg-surface-container-lowest">
                  <ChildAvatar child={child} names={names} />
                  <div className="min-w-0 flex-1 space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <NameStack name={names.lines(child.nameAr, child.nameEn)} strong />
                      <MaterialSymbol name="chevron_right" size="text-lg" className="shrink-0 text-on-surface-variant rtl:rotate-180" />
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <TodayCell child={child} format={format} />
                      <ReportCell child={child} />
                    </div>
                    <HealthCell child={child} />
                  </div>
                </button>
              </li>
            ))}
          </ul>
          <div className="hidden md:block">
            <DataTable minWidth={880}>
              <THead>
                <Th>{t('classProfile.children.colChild')}</Th>
                <Th>{t('classProfile.children.colAge')}</Th>
                <Th>{t('classProfile.children.colToday')}</Th>
                <Th>{t('classProfile.children.colReport')}</Th>
                <Th>{t('classProfile.children.colHealth')}</Th>
              </THead>
              <TBody>
                {pager.pageItems.map((child) => (
                  <Tr key={child.id} onClick={() => open(child)} data-testid="class-child-row">
                    <Td>
                      <div className="flex min-w-0 items-center gap-3">
                        <ChildAvatar child={child} names={names} />
                        <div className="min-w-0">
                          <NameStack name={names.lines(child.nameAr, child.nameEn)} strong />
                          {child.code ? (
                            <p className="font-mono text-[11px] text-on-surface-variant" dir="ltr">
                              {child.code}
                            </p>
                          ) : null}
                        </div>
                      </div>
                    </Td>
                    <Td className="whitespace-nowrap text-on-surface-variant">{format.age(child.dob)}</Td>
                    <Td>
                      <TodayCell child={child} format={format} />
                    </Td>
                    <Td>
                      <ReportCell child={child} />
                    </Td>
                    <Td>
                      <HealthCell child={child} />
                    </Td>
                  </Tr>
                ))}
              </TBody>
            </DataTable>
          </div>
        </>
      )}
    </TableCard>
  );
}

function ChildAvatar({ child, names }: { child: ClassChild; names: BilingualNames }) {
  return (
    <Avatar className="h-10 w-10 shrink-0 bg-primary/10">
      <AvatarImage src={child.avatarUrl ?? undefined} alt="" />
      <AvatarFallback className="text-xs text-primary">{getUserInitials(names.text(child.nameAr, child.nameEn), null)}</AvatarFallback>
    </Avatar>
  );
}

/** Where the child is today, with the time they came or left, or why they are away. */
function TodayCell({ child, format }: CellProps) {
  const { t } = useTranslation();
  const look = ATTENDANCE_LOOK[child.attendance];
  const detail =
    child.attendance === 'partial'
      ? t('classProfile.attendance.since', { time: format.time(child.checkIn) })
      : child.attendance === 'present'
        ? `${format.time(child.checkIn)} – ${format.time(child.checkOut)}`
        : child.attendance === 'excused' && child.absenceReason
          ? t(`attendance.absence.reasons.${child.absenceReason}`)
          : null;
  return (
    <div className="space-y-1">
      <StatusPill tone={look.tone} icon={look.icon}>{t(`classProfile.attendance.${child.attendance}`)}</StatusPill>
      {detail ? <p className="text-xs text-on-surface-variant">{detail}</p> : null}
    </div>
  );
}

function ReportCell({ child }: { child: ClassChild }) {
  const { t } = useTranslation();
  const stage = reportStageOf(child);
  const look = REPORT_LOOK[stage];
  return <StatusPill tone={look.tone} icon={look.icon}>{t(`dailyReport.stage.${stage}`)}</StatusPill>;
}

/** The child's allergies (the most serious first), conditions and today's medicines. */
function HealthCell({ child }: { child: ClassChild }) {
  const { t } = useTranslation();
  if (!child.allergies.length && !child.conditions && !child.medications) {
    return <span className="text-xs text-on-surface-variant">{t('classProfile.health.none')}</span>;
  }
  const hidden = child.allergies.length - ALLERGIES_SHOWN;
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {child.allergies.slice(0, ALLERGIES_SHOWN).map((allergy) => (
        <StatusPill key={allergy.name} tone={severityTone(allergy.severity)} icon="allergy">
          <span className="max-w-[9rem] truncate" title={`${allergy.name} · ${t(`health.severity.allergy.${allergy.severity}`)}`}>
            {allergy.name}
          </span>
        </StatusPill>
      ))}
      {hidden > 0 ? <span className="text-xs font-medium text-on-surface-variant">{t('classProfile.health.more', { count: hidden })}</span> : null}
      {child.conditions ? <StatusPill tone="warning" icon="monitor_heart">{t('classProfile.health.conditions', { count: child.conditions })}</StatusPill> : null}
      {child.medications ? <StatusPill tone="primary" icon="medication">{t('classProfile.health.medications', { count: child.medications })}</StatusPill> : null}
    </div>
  );
}
