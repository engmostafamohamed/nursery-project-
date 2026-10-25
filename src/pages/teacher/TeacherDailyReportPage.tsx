import { useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';

import { CompletionBar } from '@/components/daily-reports/CompletionBar';
import { ReportDueBanner } from '@/components/daily-reports/ReportDueBanner';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { confirm } from '@/components/ui/confirm';
import { DataTable, StatusPill, TableCard, TableEmpty, TableLoading, TablePagination, TBody, Td, Th, THead, Tr } from '@/components/ui/DataTable';
import { FilterBar, SearchInput } from '@/components/ui/FilterBar';
import { FilterChips } from '@/components/ui/FilterChips';
import { FilterField } from '@/components/ui/FilterField';
import { Input } from '@/components/ui/input';
import { MaterialSymbol } from '@/components/ui/MaterialSymbol';
import { PageHeader } from '@/components/ui/PageHeader';
import { Select } from '@/components/ui/select';
import { StatTile } from '@/components/ui/StatTile';
import { useAuthSession } from '@/hooks/useAuthSession';
import { useMyDailyReports, useSendDailyReports } from '@/hooks/useDailyReportWorkflow';
import { usePagination } from '@/hooks/usePagination';
import { useCan } from '@/hooks/usePermissions';
import {
  canSend,
  dailyReportErrorKey,
  filterDay,
  NO_DAY_FILTERS,
  percentOf,
  reportDay,
  stageOf,
  type DayFilters,
  type MyDailyReport,
  type SendResult,
  type StageFilter,
} from '@/lib/dailyReport';
import { ATTENDANCE_TONE, attendanceName, questionList, STAGE_ICON, STAGE_TONE, stageName } from '@/lib/dailyReportLabels';
import { addCalendarDaysYmd, getNurseryCalendarDateString } from '@/lib/nurseryDay';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
/** How far back the day's list goes (get_my_daily_reports' limit). */
const LIST_DAYS_BACK = 30;
const STAGES: StageFilter[] = ['all', 'open', 'not_started', 'in_progress', 'ready', 'sent'];

/**
 * The teacher's daily reports for a day: an alarm as the end of the day nears, how many reports are
 * sent, ready, in progress or not started, and a table of every child with how far their report is.
 * The complete ones can be picked (or all at once) and sent to the families together.
 */
export function TeacherDailyReportPage() {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const locale = lang.startsWith('ar') ? 'ar-EG' : 'en-GB';
  const navigate = useNavigate();
  const { user } = useAuthSession();
  const canSeeRates = useCan('class_team');
  const [params, setParams] = useSearchParams();
  const today = getNurseryCalendarDateString();
  const earliest = addCalendarDaysYmd(today, -LIST_DAYS_BACK);
  const asked = params.get('date') ?? '';
  // A picked day, else the nursery's today as the server counts it.
  const chosenDay = DATE_RE.test(asked) && asked <= today && asked >= earliest ? asked : null;

  const query = useMyDailyReports(user?.id, chosenDay);
  const send = useSendDailyReports(user?.id);
  const all = useMemo(() => query.data ?? [], [query.data]);
  const tally = reportDay(all);
  const dueAt = all[0]?.due_at ?? null;
  const day = chosenDay ?? all[0]?.day ?? today;

  const [filters, setFilters] = useState<DayFilters>(NO_DAY_FILTERS);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [result, setResult] = useState<SendResult | null>(null);
  const [sendError, setSendError] = useState<string | null>(null);

  const rows = useMemo(() => filterDay(all, filters), [all, filters]);
  const pager = usePagination(rows, 20, `${day}|${JSON.stringify(filters)}`);
  const classes = useMemo(() => {
    const seen = new Map<string, string>();
    for (const r of all) seen.set(r.class_id, (lang.startsWith('ar') ? r.class_name_ar || r.class_name_en : r.class_name_en || r.class_name_ar) || '—');
    return [...seen].map(([id, label]) => ({ id, label }));
  }, [all, lang]);

  // Only complete reports not sent yet can be picked; a pick that stopped being one drops out.
  const sendable = useMemo(() => all.filter(canSend), [all]);
  const sendableIds = useMemo(() => new Set(sendable.map((r) => r.report_id as string)), [sendable]);
  const selected = [...picked].filter((id) => sendableIds.has(id));
  const shownSendable = rows.filter(canSend).map((r) => r.report_id as string);
  const allShownPicked = shownSendable.length > 0 && shownSendable.every((id) => picked.has(id));
  const someShownPicked = shownSendable.some((id) => picked.has(id));

  const name = (r: MyDailyReport) => (lang.startsWith('ar') ? r.full_name_ar || r.full_name_en : r.full_name_en || r.full_name_ar) || '—';
  const time = (iso: string | null) => (iso ? new Date(iso).toLocaleTimeString(locale, { hour: 'numeric', minute: '2-digit', hour12: true }) : '—');
  const nameOf = (childId: string) => {
    const r = all.find((x) => x.child_id === childId);
    return r ? name(r) : '—';
  };
  const editLink = (r: MyDailyReport) => `/teacher/daily-reports/${r.child_id}/${r.day}`;
  const nextToFill = all.find((r) => stageOf(r) === 'not_started' || stageOf(r) === 'in_progress');

  const setDay = (value: string) => {
    setPicked(new Set());
    setResult(null);
    setParams(value && value !== today ? { date: value } : {}, { replace: true });
  };
  const showStage = (stage: StageFilter) => setFilters((f) => ({ ...f, stage: f.stage === stage ? 'all' : stage }));
  const toggle = (id: string, on: boolean) =>
    setPicked((prev) => {
      const nextSet = new Set(prev);
      if (on) nextSet.add(id);
      else nextSet.delete(id);
      return nextSet;
    });
  const toggleAllShown = (on: boolean) =>
    setPicked((prev) => {
      const nextSet = new Set(prev);
      for (const id of shownSendable) {
        if (on) nextSet.add(id);
        else nextSet.delete(id);
      }
      return nextSet;
    });

  const sendReports = async (ids: string[]) => {
    if (!ids.length) return;
    setSendError(null);
    const ok = await confirm({
      title: t('dailyReport.list.sendTitle', { count: ids.length }),
      description: t('dailyReport.list.sendBody'),
      confirmText: t('dailyReport.list.sendConfirm', { count: ids.length }),
      icon: 'send',
    });
    if (!ok) return;
    try {
      const res = await send.mutateAsync(ids);
      setResult(res);
      setPicked(new Set());
      if (res.sent_count > 0) toast.success(t('dailyReport.list.sentToast', { count: res.sent_count }));
    } catch (error) {
      setSendError(t(`dailyReport.errors.${dailyReportErrorKey(error)}`));
    }
  };

  const stageOptions = STAGES.map((value) => ({
    value,
    label: value === 'all' ? t('dailyReport.list.allChildren') : value === 'open' ? t('dailyReport.list.toSend') : stageName(t, value),
    count: value === 'all' ? all.length : filterDay(all, { ...NO_DAY_FILTERS, stage: value }).length,
  }));
  const filtered = filters.search !== '' || filters.classId !== '' || filters.stage !== 'all';

  return (
    <div className="space-y-5 pb-8">
      <PageHeader
        icon="description"
        title={t('dailyReport.title')}
        description={t('dailyReport.subtitle')}
        actions={
          <>
            <div className="flex items-center gap-2">
              <label htmlFor="report-day" className="text-sm font-medium text-on-surface-variant">{t('dailyReport.list.day')}</label>
              <Input id="report-day" type="date" className="w-44" min={earliest} max={today} value={day} onChange={(e) => setDay(e.target.value)} />
              {day !== today ? (
                <Button type="button" variant="ghost" size="sm" onClick={() => setDay(today)}>{t('dailyReport.list.today')}</Button>
              ) : null}
            </div>
            {canSeeRates ? (
              <Button asChild variant="outline">
                <Link to="/teacher/report-rates">
                  <MaterialSymbol name="monitoring" className="me-1 text-base" />
                  {t('dailyReport.list.rates')}
                </Link>
              </Button>
            ) : null}
          </>
        }
      />

      {!query.isPending && all.length ? (
        <ReportDueBanner
          day={tally}
          dueAt={dueAt}
          actions={
            <>
              {sendable.length ? (
                <Button type="button" disabled={send.isPending} onClick={() => void sendReports(sendable.map((r) => r.report_id as string))}>
                  <MaterialSymbol name="send" className="me-1 text-base rtl:rotate-180" />
                  {t('dailyReport.list.sendAllReady', { count: sendable.length })}
                </Button>
              ) : null}
              {nextToFill ? (
                <Button type="button" variant="outline" className="bg-surface text-on-surface" onClick={() => navigate(editLink(nextToFill))}>
                  <MaterialSymbol name="edit_note" className="me-1 text-base" />
                  {t('dailyReport.list.fillNext', { name: name(nextToFill) })}
                </Button>
              ) : null}
            </>
          }
        />
      ) : null}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5">
        <StatTile icon="how_to_reg" label={t('dailyReport.tiles.expected')} value={tally.expected} helper={t('dailyReport.tiles.expectedHint')} onClick={() => showStage('open')} active={filters.stage === 'open'} />
        <StatTile icon="mark_email_read" tone="success" label={t('dailyReport.tiles.sent')} value={tally.sent} helper={t('dailyReport.tiles.rate', { rate: tally.rate })} onClick={() => showStage('sent')} active={filters.stage === 'sent'} />
        <StatTile icon="task_alt" tone="primary" label={t('dailyReport.tiles.ready')} value={tally.ready} helper={t('dailyReport.tiles.readyHint')} onClick={() => showStage('ready')} active={filters.stage === 'ready'} />
        <StatTile icon="edit_note" tone="warning" label={t('dailyReport.tiles.inProgress')} value={tally.inProgress} helper={t('dailyReport.tiles.avgCompletion', { value: tally.avgCompletion })} onClick={() => showStage('in_progress')} active={filters.stage === 'in_progress'} />
        <StatTile icon="pending_actions" tone={tally.notStarted ? 'error' : 'neutral'} label={t('dailyReport.tiles.notStarted')} value={tally.notStarted} onClick={() => showStage('not_started')} active={filters.stage === 'not_started'} />
      </div>

      {result ? (
        <section role="status" className="space-y-2 rounded-xl border border-outline-variant bg-surface p-4 shadow-sm">
          <div className="flex items-start justify-between gap-2">
            <p className="flex items-center gap-2 text-sm font-semibold text-on-surface">
              <MaterialSymbol name={result.incomplete.length ? 'info' : 'check_circle'} className={result.incomplete.length ? 'text-warning' : 'text-success'} />
              <span>{t('dailyReport.list.resultSent', { count: result.sent_count })}</span>
              {result.already_sent ? <span>· {t('dailyReport.list.resultAlready', { count: result.already_sent })}</span> : null}
            </p>
            <Button type="button" variant="ghost" size="icon" aria-label={t('dailyReport.list.dismiss')} onClick={() => setResult(null)}>
              <MaterialSymbol name="close" />
            </Button>
          </div>
          {result.incomplete.length ? (
            <ul className="space-y-1 text-sm text-on-surface-variant">
              {result.incomplete.map((r) => (
                <li key={r.id}>{t('dailyReport.list.resultIncomplete', { name: nameOf(r.child_id), questions: questionList(t, r.missing, lang) })}</li>
              ))}
            </ul>
          ) : null}
        </section>
      ) : null}

      <TableCard
        title={t('dailyReport.list.tableTitle')}
        count={t('dailyReport.list.count', { count: rows.length })}
        description={t('dailyReport.list.tableHint')}
        actions={
          <Button type="button" disabled={!selected.length || send.isPending} onClick={() => void sendReports(selected)}>
            <MaterialSymbol name="send" className="me-1 text-base rtl:rotate-180" />
            {send.isPending ? t('dailyReport.editor.sending') : t('dailyReport.list.sendSelected', { count: selected.length })}
          </Button>
        }
        filters={
          <div className="space-y-3">
            <FilterBar onClear={() => setFilters(NO_DAY_FILTERS)} canClear={filtered}>
              <FilterField label={t('dailyReport.list.search')} className="min-w-[14rem] flex-1">
                <SearchInput value={filters.search} onChange={(search) => setFilters((f) => ({ ...f, search }))} placeholder={t('dailyReport.list.searchPlaceholder')} />
              </FilterField>
              {classes.length > 1 ? (
                <FilterField label={t('dailyReport.list.class')} className="w-full sm:w-56">
                  <Select value={filters.classId} onChange={(e) => setFilters((f) => ({ ...f, classId: e.target.value }))}>
                    <option value="">{t('dailyReport.list.allClasses')}</option>
                    {classes.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
                  </Select>
                </FilterField>
              ) : null}
            </FilterBar>
            <FilterChips value={filters.stage} onChange={(stage) => setFilters((f) => ({ ...f, stage }))} options={stageOptions} label={t('dailyReport.list.stageFilter')} />
            {sendError ? <p role="alert" className="text-sm text-error">{sendError}</p> : null}
          </div>
        }
        pagination={<TablePagination pager={pager} />}
      >
        {query.isPending ? (
          <TableLoading />
        ) : query.isError ? (
          <TableEmpty icon="error" title={t(`dailyReport.errors.${dailyReportErrorKey(query.error)}`)} />
        ) : !rows.length ? (
          <TableEmpty icon="description" title={all.length ? t('dailyReport.list.noMatch') : t('dailyReport.list.empty')} description={all.length ? undefined : t('dailyReport.list.emptyHint')} />
        ) : (
          <DataTable minWidth={980}>
            <THead>
              <Th className="w-10">
                <Checkbox
                  aria-label={t('dailyReport.list.selectAllReady')}
                  title={t('dailyReport.list.selectAllReady')}
                  disabled={!shownSendable.length}
                  checked={allShownPicked ? true : someShownPicked ? 'indeterminate' : false}
                  onCheckedChange={(v) => toggleAllShown(v === true)}
                />
              </Th>
              <Th>{t('dailyReport.list.columns.child')}</Th>
              <Th>{t('dailyReport.list.columns.class')}</Th>
              <Th>{t('dailyReport.list.columns.attendance')}</Th>
              <Th>{t('dailyReport.list.columns.completion')}</Th>
              <Th>{t('dailyReport.list.columns.status')}</Th>
              <Th>{t('dailyReport.list.columns.saved')}</Th>
              <Th align="end">{t('dailyReport.list.columns.action')}</Th>
            </THead>
            <TBody>
              {pager.pageItems.map((r) => {
                const stage = stageOf(r);
                const sendableRow = canSend(r);
                return (
                  <Tr key={r.child_id} onClick={() => navigate(editLink(r))}>
                    <Td>
                      <Checkbox
                        aria-label={t('dailyReport.list.selectChild', { name: name(r) })}
                        title={sendableRow ? undefined : stage === 'sent' ? t('dailyReport.stage.sent') : t('dailyReport.list.answerAllFirst')}
                        disabled={!sendableRow}
                        checked={sendableRow && picked.has(r.report_id as string)}
                        onCheckedChange={(v) => toggle(r.report_id as string, v === true)}
                      />
                    </Td>
                    <Td>
                      <p className="font-semibold text-on-surface">{name(r)}</p>
                      {r.child_code ? <p className="text-xs tabular-nums text-on-surface-variant">{r.child_code}</p> : null}
                    </Td>
                    <Td className="text-on-surface-variant">{(lang.startsWith('ar') ? r.class_name_ar || r.class_name_en : r.class_name_en || r.class_name_ar) || '—'}</Td>
                    <Td>
                      <StatusPill tone={ATTENDANCE_TONE[r.attendance]}>{attendanceName(t, r.attendance)}</StatusPill>
                      {r.check_in ? (
                        <p className="mt-1 text-xs tabular-nums text-on-surface-variant">
                          {time(r.check_in)}
                          {r.check_out ? ` – ${time(r.check_out)}` : ''}
                        </p>
                      ) : null}
                    </Td>
                    <Td>
                      <CompletionBar
                        percent={stage === 'not_expected' ? null : percentOf(r.answered, r.required)}
                        label={t('dailyReport.list.completionOf', { name: name(r) })}
                        detail={stage === 'not_expected' ? undefined : t('dailyReport.editor.answeredOf', { answered: r.answered, required: r.required })}
                      />
                      {stage === 'in_progress' && r.missing.length ? (
                        <p className="mt-1 max-w-[16rem] truncate text-xs text-warning" title={questionList(t, r.missing, lang)}>
                          {t('dailyReport.list.missing', { questions: questionList(t, r.missing, lang) })}
                        </p>
                      ) : null}
                    </Td>
                    <Td>
                      <StatusPill tone={STAGE_TONE[stage]} icon={STAGE_ICON[stage]}>{stageName(t, stage)}</StatusPill>
                      {r.published_at ? <p className="mt-1 text-xs tabular-nums text-on-surface-variant">{t('dailyReport.list.sentAt', { time: time(r.published_at) })}</p> : null}
                    </Td>
                    <Td className="tabular-nums text-on-surface-variant">{time(r.last_saved_at)}</Td>
                    <Td align="end">
                      <Button asChild size="sm" variant={stage === 'sent' || stage === 'not_expected' ? 'ghost' : 'outline'}>
                        <Link to={editLink(r)}>
                          {stage === 'sent' ? t('dailyReport.list.view') : stage === 'not_started' || stage === 'not_expected' ? t('dailyReport.list.fill') : t('dailyReport.list.continue')}
                        </Link>
                      </Button>
                    </Td>
                  </Tr>
                );
              })}
            </TBody>
          </DataTable>
        )}
      </TableCard>
    </div>
  );
}
