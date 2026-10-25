import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { PeriodFilter } from '@/components/admin/PeriodFilter';
import { CompletionBar } from '@/components/daily-reports/CompletionBar';
import { DataTable, StatusPill, TableCard, TableEmpty, TableLoading, TablePagination, TBody, Td, Th, THead, Tr } from '@/components/ui/DataTable';
import { FilterBar, SearchInput } from '@/components/ui/FilterBar';
import { FilterChips } from '@/components/ui/FilterChips';
import { FilterField } from '@/components/ui/FilterField';
import { PageHeader } from '@/components/ui/PageHeader';
import { Select } from '@/components/ui/select';
import { StatTile } from '@/components/ui/StatTile';
import { useActiveNurseryId } from '@/hooks/useActiveNurseryId';
import { useAuthSession } from '@/hooks/useAuthSession';
import { useClassTeams } from '@/hooks/useClassTeams';
import { useDailyReportStats } from '@/hooks/useDailyReportWorkflow';
import { usePagination } from '@/hooks/usePagination';
import { usePeriodState } from '@/hooks/usePeriodState';
import { useUserProfile } from '@/hooks/useUserProfile';
import { KPI_PERIODS, rangeLabel } from '@/lib/attendancePeriods';
import { pickName } from '@/lib/classTeam';
import { pick, rateTone, searchRows, type StatsView } from '@/lib/dailyReportStats';
import { getNurseryCalendarDateString } from '@/lib/nurseryDay';

const VIEWS: StatsView[] = ['teachers', 'classes', 'days', 'children', 'missing'];
/** get_daily_report_stats lists at most this many children and missing reports. */
const CHILDREN_LIMIT = 500;
const MISSING_LIMIT = 300;

/**
 * The daily report send rate, for the nursery admin and the head of teachers: one report is expected
 * per child who came, per day. Over any period (today, a month, a quarter, half a year, a year or
 * picked dates) and for one class or teacher: how many were sent, on the day or late, which are
 * missing, and the same by teacher, class, day and child. Shared by the admin and the teacher sidebar.
 */
export function DailyReportRatesPage() {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const locale = lang.startsWith('ar') ? 'ar-EG' : 'en-GB';
  const { user } = useAuthSession();
  const { data: profile } = useUserProfile(user?.id);
  const { activeNurseryId } = useActiveNurseryId();
  const nurseryId = activeNurseryId ?? profile?.nursery_id ?? null;
  const [today] = useState(() => getNurseryCalendarDateString());
  const period = usePeriodState('today', today);
  const [classId, setClassId] = useState('');
  const [teacherId, setTeacherId] = useState('');
  const [view, setView] = useState<StatsView>('teachers');
  const [search, setSearch] = useState('');

  const teams = useClassTeams(nurseryId);
  const query = useDailyReportStats(nurseryId, period.range, { classId, teacherId });
  const stats = query.data;
  const totals = stats?.totals;

  const classes = useMemo(() => teams.data?.classes ?? [], [teams.data]);
  const teachers = useMemo(() => (teams.data?.staff ?? []).filter((s) => s.classes.length > 0), [teams.data]);

  const childRows = useMemo(() => searchRows(stats?.children ?? [], search), [stats, search]);
  const missingRows = useMemo(() => searchRows(stats?.missing ?? [], search), [stats, search]);
  const childPager = usePagination(childRows, 20, `${search}|${period.range?.from}|${period.range?.to}|${classId}|${teacherId}`);
  const missingPager = usePagination(missingRows, 20, `${search}|${period.range?.from}|${period.range?.to}|${classId}|${teacherId}`);

  const forbidden = query.isError && String((query.error as { message?: string })?.message ?? '').includes('class_team_forbidden');
  const dayLabel = (day: string) => new Date(`${day}T12:00:00`).toLocaleDateString(locale, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
  const filtered = classId !== '' || teacherId !== '';
  const viewName = (v: StatsView) => {
    if (v === 'teachers') return t('dailyReport.rates.views.teachers');
    if (v === 'classes') return t('dailyReport.rates.views.classes');
    if (v === 'days') return t('dailyReport.rates.views.days');
    if (v === 'children') return t('dailyReport.rates.views.children');
    return t('dailyReport.rates.views.missing');
  };
  const viewCount = (v: StatsView) => {
    if (!stats) return undefined;
    if (v === 'teachers') return stats.by_teacher.length;
    if (v === 'classes') return stats.by_class.length;
    if (v === 'days') return stats.by_day.length;
    if (v === 'children') return stats.children.length;
    return totals?.missing ?? 0;
  };
  const percent = (value: number | null | undefined) => (value == null ? '—' : t('dailyReport.percent', { value }));

  return (
    <div className="space-y-5 pb-8">
      <PageHeader icon="monitoring" title={t('dailyReport.rates.title')} description={t('dailyReport.rates.subtitle')}>
        <PeriodFilter state={period} choices={KPI_PERIODS} />
        <FilterBar
          onClear={() => {
            setClassId('');
            setTeacherId('');
          }}
          canClear={filtered}
        >
          <FilterField label={t('dailyReport.rates.class')} className="w-full sm:w-60">
            <Select value={classId} onChange={(e) => setClassId(e.target.value)}>
              <option value="">{t('dailyReport.list.allClasses')}</option>
              {classes.map((c) => <option key={c.id} value={c.id}>{pickName(c, lang)}</option>)}
            </Select>
          </FilterField>
          <FilterField label={t('dailyReport.rates.teacher')} className="w-full sm:w-60">
            <Select value={teacherId} onChange={(e) => setTeacherId(e.target.value)}>
              <option value="">{t('dailyReport.rates.allTeachers')}</option>
              {teachers.map((s) => <option key={s.id} value={s.id}>{pickName(s, lang)}</option>)}
            </Select>
          </FilterField>
          {period.shown ? (
            <p className="self-center text-sm text-on-surface-variant">{rangeLabel(period.shown, locale)}</p>
          ) : null}
        </FilterBar>
      </PageHeader>

      {forbidden ? (
        <TableCard title={t('dailyReport.rates.title')}>
          <TableEmpty icon="lock" title={t('dailyReport.errors.rates_forbidden')} />
        </TableCard>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
            <StatTile icon="how_to_reg" label={t('dailyReport.rates.tiles.expected')} value={totals?.expected ?? '—'} helper={t('dailyReport.rates.tiles.expectedHint')} />
            <StatTile icon="mark_email_read" tone={rateTone(totals?.rate)} label={t('dailyReport.rates.tiles.sent')} value={totals ? `${totals.sent}` : '—'} helper={t('dailyReport.rates.tiles.rate', { rate: percent(totals?.rate) })} />
            <StatTile icon="schedule" tone={rateTone(totals?.on_time_rate)} label={t('dailyReport.rates.tiles.onTime')} value={totals?.on_time ?? '—'} helper={t('dailyReport.rates.tiles.onTimeHint', { rate: percent(totals?.on_time_rate) })} />
            <StatTile icon="history" tone={totals?.late ? 'warning' : 'neutral'} label={t('dailyReport.rates.tiles.late')} value={totals?.late ?? '—'} helper={t('dailyReport.rates.tiles.lateHint')} />
            <StatTile
              icon="pending_actions"
              tone={totals?.missing ? 'error' : 'neutral'}
              label={t('dailyReport.rates.tiles.missing')}
              value={totals?.missing ?? '—'}
              helper={totals?.drafts ? t('dailyReport.rates.tiles.drafts', { count: totals.drafts }) : undefined}
              onClick={() => setView('missing')}
              active={view === 'missing'}
            />
            <StatTile icon="checklist" label={t('dailyReport.rates.tiles.completion')} value={percent(totals?.avg_completion)} helper={t('dailyReport.rates.tiles.completionHint')} />
          </div>

          <TableCard
            title={viewName(view)}
            description={view === 'teachers' ? t('dailyReport.rates.teachersHint') : view === 'missing' ? t('dailyReport.rates.missingHint') : undefined}
            filters={
              <div className="space-y-3">
                <FilterChips value={view} onChange={setView} options={VIEWS.map((v) => ({ value: v, label: viewName(v), count: viewCount(v) }))} label={t('dailyReport.rates.viewLabel')} />
                {view === 'children' || view === 'missing' ? (
                  <FilterField label={t('dailyReport.list.search')} className="max-w-md">
                    <SearchInput value={search} onChange={setSearch} placeholder={t('dailyReport.rates.searchPlaceholder')} />
                  </FilterField>
                ) : null}
              </div>
            }
            pagination={view === 'children' ? <TablePagination pager={childPager} /> : view === 'missing' ? <TablePagination pager={missingPager} /> : undefined}
          >
            {query.isPending || !stats ? (
              query.isError ? <TableEmpty icon="error" title={t('dailyReport.errors.failed')} /> : <TableLoading />
            ) : view === 'teachers' ? (
              !stats.by_teacher.length ? (
                <TableEmpty icon="groups" title={t('dailyReport.rates.noTeachers')} />
              ) : (
                <DataTable minWidth={820}>
                  <THead>
                    <Th>{t('dailyReport.rates.columns.teacher')}</Th>
                    <Th align="end">{t('dailyReport.rates.columns.expected')}</Th>
                    <Th align="end">{t('dailyReport.rates.columns.sent')}</Th>
                    <Th align="end">{t('dailyReport.rates.columns.onTime')}</Th>
                    <Th align="end">{t('dailyReport.rates.columns.missing')}</Th>
                    <Th>{t('dailyReport.rates.columns.rate')}</Th>
                    <Th align="end">{t('dailyReport.rates.columns.sentByThem')}</Th>
                  </THead>
                  <TBody>
                    {stats.by_teacher.map((r) => (
                      <Tr key={r.teacher_id} onClick={() => setTeacherId(r.teacher_id)}>
                        <Td>
                          <p className="font-semibold text-on-surface">{pick(r.name_ar, r.name_en, lang) || '—'}</p>
                          <p className="text-xs text-on-surface-variant">{pick(r.classes_ar, r.classes_en, lang)}</p>
                        </Td>
                        <Td align="end" className="tabular-nums">{r.expected}</Td>
                        <Td align="end" className="tabular-nums">{r.sent}</Td>
                        <Td align="end" className="tabular-nums">{r.on_time}</Td>
                        <Td align="end" className={r.missing ? 'font-semibold tabular-nums text-error' : 'tabular-nums'}>{r.missing}</Td>
                        <Td><CompletionBar percent={r.rate} tone={rateTone(r.rate)} label={t('dailyReport.rates.rateOf', { name: pick(r.name_ar, r.name_en, lang) })} /></Td>
                        <Td align="end" className="tabular-nums">{r.sent_by_them}</Td>
                      </Tr>
                    ))}
                  </TBody>
                </DataTable>
              )
            ) : view === 'classes' ? (
              !stats.by_class.length ? (
                <TableEmpty icon="school" title={t('dailyReport.rates.noClasses')} />
              ) : (
                <DataTable minWidth={820}>
                  <THead>
                    <Th>{t('dailyReport.rates.columns.class')}</Th>
                    <Th>{t('dailyReport.rates.columns.lead')}</Th>
                    <Th align="end">{t('dailyReport.rates.columns.expected')}</Th>
                    <Th align="end">{t('dailyReport.rates.columns.sent')}</Th>
                    <Th align="end">{t('dailyReport.rates.columns.onTime')}</Th>
                    <Th align="end">{t('dailyReport.rates.columns.missing')}</Th>
                    <Th>{t('dailyReport.rates.columns.rate')}</Th>
                  </THead>
                  <TBody>
                    {stats.by_class.map((r) => (
                      <Tr key={r.class_id} onClick={() => setClassId(r.class_id)}>
                        <Td className="font-semibold text-on-surface">{pick(r.name_ar, r.name_en, lang) || '—'}</Td>
                        <Td className="text-on-surface-variant">{pick(r.lead_ar, r.lead_en, lang) || t('dailyReport.rates.noLead')}</Td>
                        <Td align="end" className="tabular-nums">{r.expected}</Td>
                        <Td align="end" className="tabular-nums">{r.sent}</Td>
                        <Td align="end" className="tabular-nums">{r.on_time}</Td>
                        <Td align="end" className={r.missing ? 'font-semibold tabular-nums text-error' : 'tabular-nums'}>{r.missing}</Td>
                        <Td><CompletionBar percent={r.rate} tone={rateTone(r.rate)} label={t('dailyReport.rates.rateOf', { name: pick(r.name_ar, r.name_en, lang) })} /></Td>
                      </Tr>
                    ))}
                  </TBody>
                </DataTable>
              )
            ) : view === 'days' ? (
              !stats.by_day.length ? (
                <TableEmpty icon="calendar_month" title={t('dailyReport.rates.noDays')} />
              ) : (
                <DataTable minWidth={680}>
                  <THead>
                    <Th>{t('dailyReport.rates.columns.day')}</Th>
                    <Th align="end">{t('dailyReport.rates.columns.expected')}</Th>
                    <Th align="end">{t('dailyReport.rates.columns.sent')}</Th>
                    <Th align="end">{t('dailyReport.rates.columns.onTime')}</Th>
                    <Th>{t('dailyReport.rates.columns.rate')}</Th>
                  </THead>
                  <TBody>
                    {stats.by_day.map((r) => (
                      <Tr key={r.day} onClick={() => period.openDay(r.day)}>
                        <Td className="font-semibold tabular-nums text-on-surface">{dayLabel(r.day)}</Td>
                        <Td align="end" className="tabular-nums">{r.expected}</Td>
                        <Td align="end" className="tabular-nums">{r.sent}</Td>
                        <Td align="end" className="tabular-nums">{r.on_time}</Td>
                        <Td><CompletionBar percent={r.rate} tone={rateTone(r.rate)} label={t('dailyReport.rates.rateOf', { name: dayLabel(r.day) })} /></Td>
                      </Tr>
                    ))}
                  </TBody>
                </DataTable>
              )
            ) : view === 'children' ? (
              !childRows.length ? (
                <TableEmpty icon="child_care" title={t('dailyReport.rates.noChildren')} />
              ) : (
                <>
                  {stats.children.length >= CHILDREN_LIMIT ? <p className="px-4 pt-3 text-xs text-on-surface-variant sm:px-5">{t('dailyReport.rates.limited', { count: CHILDREN_LIMIT })}</p> : null}
                  <DataTable minWidth={760}>
                    <THead>
                      <Th>{t('dailyReport.list.columns.child')}</Th>
                      <Th>{t('dailyReport.rates.columns.class')}</Th>
                      <Th align="end">{t('dailyReport.rates.columns.expected')}</Th>
                      <Th align="end">{t('dailyReport.rates.columns.sent')}</Th>
                      <Th align="end">{t('dailyReport.rates.columns.missing')}</Th>
                      <Th>{t('dailyReport.rates.columns.rate')}</Th>
                    </THead>
                    <TBody>
                      {childPager.pageItems.map((r) => (
                        <Tr key={r.child_id}>
                          <Td>
                            <p className="font-semibold text-on-surface">{pick(r.name_ar, r.name_en, lang) || '—'}</p>
                            {r.code ? <p className="text-xs tabular-nums text-on-surface-variant">{r.code}</p> : null}
                          </Td>
                          <Td className="text-on-surface-variant">{pick(r.class_ar, r.class_en, lang)}</Td>
                          <Td align="end" className="tabular-nums">{r.expected}</Td>
                          <Td align="end" className="tabular-nums">{r.sent}</Td>
                          <Td align="end" className={r.missing ? 'font-semibold tabular-nums text-error' : 'tabular-nums'}>{r.missing}</Td>
                          <Td><CompletionBar percent={r.rate} tone={rateTone(r.rate)} label={t('dailyReport.rates.rateOf', { name: pick(r.name_ar, r.name_en, lang) })} /></Td>
                        </Tr>
                      ))}
                    </TBody>
                  </DataTable>
                </>
              )
            ) : !missingRows.length ? (
              <TableEmpty icon="task_alt" title={t('dailyReport.rates.noMissing')} />
            ) : (
              <>
                {stats.missing.length >= MISSING_LIMIT ? <p className="px-4 pt-3 text-xs text-on-surface-variant sm:px-5">{t('dailyReport.rates.limited', { count: MISSING_LIMIT })}</p> : null}
                <DataTable minWidth={820}>
                  <THead>
                    <Th>{t('dailyReport.rates.columns.day')}</Th>
                    <Th>{t('dailyReport.list.columns.child')}</Th>
                    <Th>{t('dailyReport.rates.columns.class')}</Th>
                    <Th>{t('dailyReport.rates.columns.lead')}</Th>
                    <Th>{t('dailyReport.list.columns.status')}</Th>
                  </THead>
                  <TBody>
                    {missingPager.pageItems.map((r) => (
                      <Tr key={`${r.day}|${r.child_id}`}>
                        <Td className="tabular-nums text-on-surface">{dayLabel(r.day)}</Td>
                        <Td>
                          <p className="font-semibold text-on-surface">{pick(r.name_ar, r.name_en, lang) || '—'}</p>
                          {r.code ? <p className="text-xs tabular-nums text-on-surface-variant">{r.code}</p> : null}
                        </Td>
                        <Td className="text-on-surface-variant">{pick(r.class_ar, r.class_en, lang)}</Td>
                        <Td className="text-on-surface-variant">{pick(r.lead_ar, r.lead_en, lang) || t('dailyReport.rates.noLead')}</Td>
                        <Td>
                          {r.status === 'draft' ? (
                            <StatusPill tone="warning" icon="edit_note">{t('dailyReport.rates.draftOf', { answered: r.answered, required: 7 })}</StatusPill>
                          ) : (
                            <StatusPill tone="error" icon="pending_actions">{t('dailyReport.stage.not_started')}</StatusPill>
                          )}
                        </Td>
                      </Tr>
                    ))}
                  </TBody>
                </DataTable>
              </>
            )}
          </TableCard>
        </>
      )}
    </div>
  );
}
