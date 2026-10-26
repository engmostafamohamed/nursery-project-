import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { DailyReportSheet } from '@/components/daily-reports/DailyReportSheet';
import { Button } from '@/components/ui/button';
import { DataTable, TableCard, TableEmpty, TableLoading, TablePager, TBody, Td, Th, THead, Tr } from '@/components/ui/DataTable';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { FilterBar, SearchInput } from '@/components/ui/FilterBar';
import { FilterChips } from '@/components/ui/FilterChips';
import { FilterField } from '@/components/ui/FilterField';
import { Input } from '@/components/ui/input';
import { MaterialSymbol } from '@/components/ui/MaterialSymbol';
import { Select } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { useAuthSession } from '@/hooks/useAuthSession';
import { useDailyReportCard, useDailyReportHistory } from '@/hooks/useDailyReportWorkflow';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { dailyReportErrorKey, parseMood } from '@/lib/dailyReport';
import { MOOD_EMOJI, moodName } from '@/lib/dailyReportLabels';
import {
  defaultHistoryFilters,
  historyFiltered,
  historyRange,
  HISTORY_SEARCH_MAX,
  type DailyReportHistoryRow,
  type HistoryFilters,
  type HistoryMode,
} from '@/lib/dailyReportHistory';
import { getNurseryCalendarDateString } from '@/lib/nurseryDay';
import { getUserInitials } from '@/lib/utils';

const PAGE_SIZES = [20, 50, 100];

/** A sent report, opened in the family's template. */
function SentReportDialog({ row, onClose }: { row: DailyReportHistoryRow | null; onClose: () => void }) {
  const { t, i18n } = useTranslation();
  const { user } = useAuthSession();
  const card = useDailyReportCard(user?.id, row?.child_id ?? null, row?.report_date ?? null);
  const name = row ? (i18n.language.startsWith('ar') ? row.full_name_ar || row.full_name_en : row.full_name_en || row.full_name_ar) : '';
  return (
    <Dialog open={Boolean(row)} onOpenChange={(open) => (!open ? onClose() : undefined)}>
      <DialogContent className="max-h-[92vh] max-w-3xl overflow-y-auto p-0 sm:p-0">
        <DialogHeader className="sr-only">
          <DialogTitle>{t('dailyReport.history.dialogTitle')}</DialogTitle>
          <DialogDescription>{name}</DialogDescription>
        </DialogHeader>
        <div className="p-3 sm:p-5">
          {card.isPending ? (
            <Skeleton className="h-[32rem] w-full rounded-2xl" />
          ) : card.isError || !card.data ? (
            <p role="alert" className="p-6 text-center text-sm text-error">{t(`dailyReport.errors.${dailyReportErrorKey(card.error)}`)}</p>
          ) : (
            <DailyReportSheet key={row?.report_id} card={card.data} />
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

/**
 * The sent reports of the teacher's classes: by one day or a period, class, and a child's name or
 * code, a page at a time; a row opens the report as the family sees it.
 */
export function DailyReportHistory({ classes }: { classes: { id: string; label: string }[] }) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const locale = lang.startsWith('ar') ? 'ar-EG' : 'en-GB';
  const { user } = useAuthSession();
  const today = getNurseryCalendarDateString();
  const [filters, setFilters] = useState<HistoryFilters>(() => defaultHistoryFilters(today));
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(PAGE_SIZES[0]);
  const [open, setOpen] = useState<DailyReportHistoryRow | null>(null);
  const search = useDebouncedValue(filters.search, 350);
  const range = historyRange(filters);

  // React Query keys by content, so a new object each render asks again only when a value changed.
  const history = useDailyReportHistory(
    user?.id,
    range ? { from: range.from, to: range.to, classId: filters.classId, search, limit: pageSize, offset: (page - 1) * pageSize } : null,
  );
  const rows = history.data ?? [];
  const total = rows[0]?.total_count ?? 0;
  const pageCount = Math.max(1, Math.ceil(total / pageSize));

  const change = (patch: Partial<HistoryFilters>) => {
    setFilters((f) => ({ ...f, ...patch }));
    setPage(1);
  };
  const pick = (ar: string | null, en: string | null) => (lang.startsWith('ar') ? ar || en : en || ar) || '—';
  const dayLabel = (iso: string) => new Date(`${iso}T12:00:00`).toLocaleDateString(locale, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
  const time = (iso: string | null) => (iso ? new Date(iso).toLocaleTimeString(locale, { hour: 'numeric', minute: '2-digit', hour12: true }) : '—');
  const modes: { value: HistoryMode; label: string }[] = [
    { value: 'day', label: t('dailyReport.history.modeDay') },
    { value: 'period', label: t('dailyReport.history.modePeriod') },
  ];

  return (
    <>
      <TableCard
        title={t('dailyReport.history.title')}
        count={history.isPending && !history.data ? undefined : t('dailyReport.history.count', { count: total })}
        description={t('dailyReport.history.hint')}
        filters={
          <div className="space-y-3">
            <FilterChips value={filters.mode} onChange={(mode) => change({ mode })} options={modes} label={t('dailyReport.history.mode')} />
            <FilterBar onClear={() => change(defaultHistoryFilters(today))} canClear={historyFiltered(filters, today)}>
              {filters.mode === 'day' ? (
                <FilterField label={t('dailyReport.history.day')} className="w-full sm:w-44">
                  <Input type="date" max={today} value={filters.day} onChange={(e) => change({ day: e.target.value })} />
                </FilterField>
              ) : (
                <>
                  <FilterField label={t('dailyReport.history.from')} className="w-full sm:w-44">
                    <Input type="date" max={filters.to || today} value={filters.from} onChange={(e) => change({ from: e.target.value })} />
                  </FilterField>
                  <FilterField label={t('dailyReport.history.to')} className="w-full sm:w-44">
                    <Input type="date" min={filters.from || undefined} max={today} value={filters.to} onChange={(e) => change({ to: e.target.value })} />
                  </FilterField>
                </>
              )}
              {classes.length > 1 ? (
                <FilterField label={t('dailyReport.history.class')} className="w-full sm:w-52">
                  <Select value={filters.classId} onChange={(e) => change({ classId: e.target.value })}>
                    <option value="">{t('dailyReport.history.allClasses')}</option>
                    {classes.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
                  </Select>
                </FilterField>
              ) : null}
              <FilterField label={t('dailyReport.history.search')} className="min-w-[12rem] flex-1">
                <SearchInput
                  value={filters.search}
                  onChange={(value) => change({ search: value.slice(0, HISTORY_SEARCH_MAX) })}
                  placeholder={t('dailyReport.history.searchPlaceholder')}
                />
              </FilterField>
            </FilterBar>
            {!range ? <p role="alert" className="text-sm text-error">{t('dailyReport.history.rangeInvalid')}</p> : null}
          </div>
        }
        pagination={
          total > 0 ? (
            <TablePager
              page={page}
              pageCount={pageCount}
              total={total}
              startIndex={(page - 1) * pageSize + 1}
              endIndex={(page - 1) * pageSize + rows.length}
              hasPrev={page > 1}
              hasNext={page < pageCount}
              onPrev={() => setPage((p) => Math.max(1, p - 1))}
              onNext={() => setPage((p) => Math.min(pageCount, p + 1))}
              onPageChange={setPage}
              pageSize={pageSize}
              pageSizeOptions={PAGE_SIZES}
              onPageSizeChange={(size) => {
                setPageSize(size);
                setPage(1);
              }}
            />
          ) : null
        }
      >
        {!range ? (
          <TableEmpty icon="event_busy" title={t('dailyReport.history.rangeInvalid')} />
        ) : history.isPending ? (
          <TableLoading />
        ) : history.isError ? (
          <TableEmpty icon="error" title={t(`dailyReport.errors.${dailyReportErrorKey(history.error)}`)} />
        ) : !rows.length ? (
          <TableEmpty
            icon="history"
            title={filters.search.trim() || filters.classId ? t('dailyReport.history.noMatch') : t('dailyReport.history.empty')}
            description={filters.search.trim() || filters.classId ? undefined : t('dailyReport.history.emptyHint')}
          />
        ) : (
          <>
            {/* Phones: a card per report */}
            <ul className="divide-y divide-outline-variant md:hidden">
              {rows.map((r) => {
                const name = pick(r.full_name_ar, r.full_name_en);
                const mood = parseMood(r.mood);
                return (
                  <li key={r.report_id}>
                    <button type="button" onClick={() => setOpen(r)} className="flex w-full items-center gap-3 px-4 py-3 text-start hover:bg-surface-container-lowest">
                      <span className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full bg-primary/10 text-xs font-semibold text-primary" aria-hidden>
                        {r.avatar_url ? <img src={r.avatar_url} alt="" className="h-full w-full object-cover" /> : getUserInitials(name, null)}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-semibold text-on-surface">{name}</span>
                        <span className="block truncate text-xs text-on-surface-variant">
                          {dayLabel(r.report_date)} · {pick(r.class_name_ar, r.class_name_en)}
                        </span>
                        <span className="block truncate text-xs text-on-surface-variant">
                          {pick(r.sender_name_ar, r.sender_name_en)} · <span className="tabular-nums">{time(r.published_at)}</span>
                        </span>
                      </span>
                      {mood ? <span aria-hidden className="text-2xl">{MOOD_EMOJI[mood]}</span> : null}
                      <MaterialSymbol name="chevron_right" className="text-on-surface-variant rtl:rotate-180" />
                    </button>
                  </li>
                );
              })}
            </ul>
            <div className="hidden md:block">
              <DataTable minWidth={900}>
                <THead>
                  <Th>{t('dailyReport.history.columns.date')}</Th>
                  <Th>{t('dailyReport.history.columns.child')}</Th>
                  <Th>{t('dailyReport.history.columns.class')}</Th>
                  <Th>{t('dailyReport.history.columns.mood')}</Th>
                  <Th>{t('dailyReport.history.columns.sentBy')}</Th>
                  <Th>{t('dailyReport.history.columns.sentAt')}</Th>
                  <Th align="end">{t('dailyReport.history.columns.action')}</Th>
                </THead>
                <TBody>
                  {rows.map((r) => {
                    const name = pick(r.full_name_ar, r.full_name_en);
                    const mood = parseMood(r.mood);
                    return (
                      <Tr key={r.report_id} onClick={() => setOpen(r)}>
                        <Td className="whitespace-nowrap font-medium text-on-surface">{dayLabel(r.report_date)}</Td>
                        <Td>
                          <div className="flex items-center gap-2.5">
                            <span className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full bg-primary/10 text-xs font-semibold text-primary" aria-hidden>
                              {r.avatar_url ? <img src={r.avatar_url} alt="" className="h-full w-full object-cover" /> : getUserInitials(name, null)}
                            </span>
                            <div className="min-w-0">
                              <p className="truncate font-semibold text-on-surface">{name}</p>
                              {r.child_code ? <p dir="ltr" className="text-start text-xs tabular-nums text-on-surface-variant">{r.child_code}</p> : null}
                            </div>
                          </div>
                        </Td>
                        <Td className="text-on-surface-variant">{pick(r.class_name_ar, r.class_name_en)}</Td>
                        <Td>
                          {mood ? (
                            <span className="inline-flex items-center gap-1.5 text-on-surface">
                              <span aria-hidden className="text-lg">{MOOD_EMOJI[mood]}</span>
                              {moodName(t, mood)}
                            </span>
                          ) : '—'}
                        </Td>
                        <Td className="text-on-surface-variant">{pick(r.sender_name_ar, r.sender_name_en)}</Td>
                        <Td className="whitespace-nowrap tabular-nums text-on-surface-variant">{time(r.published_at)}</Td>
                        <Td align="end">
                          <Button type="button" size="sm" variant="outline" onClick={() => setOpen(r)}>
                            <MaterialSymbol name="visibility" className="me-1 text-base" />
                            {t('dailyReport.history.open')}
                          </Button>
                        </Td>
                      </Tr>
                    );
                  })}
                </TBody>
              </DataTable>
            </div>
          </>
        )}
      </TableCard>
      <SentReportDialog row={open} onClose={() => setOpen(null)} />
    </>
  );
}
