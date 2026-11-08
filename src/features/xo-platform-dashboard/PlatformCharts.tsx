import { useTranslation } from 'react-i18next';
import { Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { TooltipContentProps } from 'recharts';

import { TableCard } from '@/components/ui/DataTable';
import { CHART_CURSOR, CHART_GRID_STROKE, chartColor, chartDirection } from '@/lib/chartTheme';

import { ChartLegend, ChartTooltipBox, PanelEmpty, ScreenReaderTable } from './chartParts';
import { ageBands, agingBands, ratePercent, type PlatformDashboard } from './platformDashboard';
import { useDashboardFormat } from './useDashboardFormat';

/*
 * The platform dashboard's charts over time and over ordered groups. Each plot is drawn left to
 * right (dir="ltr") with chartDirection turning time around in Arabic, as on the nursery dashboard.
 * Single-series charts have no legend (the card title names them); the money chart has two series,
 * the one that matters (collected) in the accent colour and billed in grey as its reference.
 */

const PRIMARY = chartColor('primary');
const PRIMARY_HOVER = 'rgb(var(--primary-hover))';
const REFERENCE = 'rgb(var(--foreground-tertiary))';
const SURFACE = 'rgb(var(--surface))';
const AXIS = { tickLine: false, axisLine: false, fontSize: 11 } as const;

function hovered<T>(props: Pick<TooltipContentProps, 'active' | 'payload'>): T | null {
  if (!props.active || !props.payload?.length) return null;
  return props.payload[0].payload as T;
}

type MoneyRow = { month: string; label: string; billed: number; collected: number };

export function MoneyTrendChart({ data }: { data: PlatformDashboard['finance']['monthly'] }) {
  const { t } = useTranslation();
  const f = useDashboardFormat();
  const chart = chartDirection(f.rtl, 0);
  const rows: MoneyRow[] = data.map((m) => ({ ...m, label: f.monthShort(m.month) }));
  const last = rows[rows.length - 1];
  const legend = [
    { key: 'collected', color: PRIMARY, label: t('xoAdmin.dashboard.money.collected') },
    { key: 'billed', color: REFERENCE, label: t('xoAdmin.dashboard.money.billed') },
  ];

  return (
    <TableCard
      title={t('xoAdmin.dashboard.money.trendTitle')}
      count={last ? t('xoAdmin.dashboard.money.collectedIn', { month: f.monthShort(last.month), amount: f.money(last.collected) }) : undefined}
      description={t('xoAdmin.dashboard.money.trendHint')}
    >
      <div className="space-y-3 p-4 sm:p-5">
        <ChartLegend items={legend} />
        <div className="h-64" dir="ltr">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={rows} margin={chart.margin}>
              <CartesianGrid stroke={CHART_GRID_STROKE} vertical={false} />
              <XAxis dataKey="label" {...AXIS} {...chart.xAxis} />
              <YAxis tickFormatter={(v: number) => f.compact(v)} {...AXIS} width={f.isAr ? 56 : 44} {...chart.yAxis} />
              <Tooltip
                cursor={{ stroke: CHART_GRID_STROKE }}
                content={(props) => {
                  const row = hovered<MoneyRow>(props);
                  if (!row) return null;
                  return (
                    <ChartTooltipBox
                      dir={f.rtl ? 'rtl' : 'ltr'}
                      title={f.monthLong(row.month)}
                      rows={[
                        { key: 'collected', color: PRIMARY, name: legend[0].label, value: f.money(row.collected) },
                        { key: 'billed', color: REFERENCE, name: legend[1].label, value: f.money(row.billed) },
                      ]}
                    />
                  );
                }}
              />
              <Line type="monotone" dataKey="billed" stroke={REFERENCE} strokeWidth={2} dot={false} activeDot={{ r: 4, stroke: SURFACE, strokeWidth: 2 }} />
              <Line type="monotone" dataKey="collected" stroke={PRIMARY} strokeWidth={2} dot={false} activeDot={{ r: 4, stroke: SURFACE, strokeWidth: 2 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
        <ScreenReaderTable
          caption={t('xoAdmin.dashboard.money.trendTitle')}
          columns={[t('xoAdmin.dashboard.month'), legend[1].label, legend[0].label]}
          rows={rows.map((r) => [f.monthLong(r.month), f.money(r.billed), f.money(r.collected)])}
        />
      </div>
    </TableCard>
  );
}

type AttendanceRow = { date: string; label: string; rate: number | null; present: number; expected: number };

export function AttendanceTrendChart({ data }: { data: PlatformDashboard['attendance'] }) {
  const { t } = useTranslation();
  const f = useDashboardFormat();
  const chart = chartDirection(f.rtl, 0);
  const rows: AttendanceRow[] = data.daily.map((d) => ({
    ...d,
    label: f.day(d.date, { day: 'numeric', month: 'short' }),
    rate: ratePercent(d.present, d.expected),
  }));
  const average = ratePercent(data.present, data.expected);

  return (
    <TableCard
      title={t('xoAdmin.dashboard.children.attendanceTitle')}
      count={average != null ? t('xoAdmin.dashboard.children.attendanceAverage', { rate: f.percent(average) }) : undefined}
      description={t('xoAdmin.dashboard.children.attendanceHint')}
    >
      {average == null ? (
        <PanelEmpty>{t('xoAdmin.dashboard.children.attendanceEmpty')}</PanelEmpty>
      ) : (
        <div className="p-4 sm:p-5">
          <div className="h-60" dir="ltr">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={rows} margin={chart.margin}>
                <CartesianGrid stroke={CHART_GRID_STROKE} vertical={false} />
                <XAxis dataKey="label" {...AXIS} interval="preserveStartEnd" minTickGap={24} {...chart.xAxis} />
                <YAxis domain={[0, 100]} ticks={[0, 50, 100]} tickFormatter={(v: number) => f.percent(v)} {...AXIS} width={44} {...chart.yAxis} />
                <Tooltip
                  cursor={CHART_CURSOR}
                  content={(props) => {
                    const row = hovered<AttendanceRow>(props);
                    if (!row) return null;
                    return (
                      <ChartTooltipBox
                        dir={f.rtl ? 'rtl' : 'ltr'}
                        title={f.day(row.date, { weekday: 'long', day: 'numeric', month: 'long' })}
                        rows={
                          row.rate == null
                            ? []
                            : [{ key: 'rate', color: PRIMARY, shape: 'box', name: t('xoAdmin.dashboard.children.rate'), value: f.percent(row.rate) }]
                        }
                        note={
                          row.rate == null
                            ? t('xoAdmin.dashboard.children.closedDay')
                            : t('xoAdmin.dashboard.children.presentOf', { present: f.int(row.present), expected: f.int(row.expected) })
                        }
                      />
                    );
                  }}
                />
                <Bar dataKey="rate" fill={PRIMARY} activeBar={{ fill: PRIMARY_HOVER }} radius={[4, 4, 0, 0]} maxBarSize={14} />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <ScreenReaderTable
            caption={t('xoAdmin.dashboard.children.attendanceTitle')}
            columns={[t('xoAdmin.dashboard.day'), t('xoAdmin.dashboard.children.rate')]}
            rows={rows.map((r) => [r.label, r.rate == null ? t('xoAdmin.dashboard.children.closedDay') : f.percent(r.rate)])}
          />
        </div>
      )}
    </TableCard>
  );
}

type CountRow = { key: string; label: string; title: string; count: number };

/** Columns of one count each, e.g. children per month or per age. */
function CountColumns({ rows, caption, valueName, heightClass = 'h-56' }: { rows: CountRow[]; caption: string; valueName: string; heightClass?: string }) {
  const { t } = useTranslation();
  const f = useDashboardFormat();
  const chart = chartDirection(f.rtl, 0);
  return (
    <>
      <div className={heightClass} dir="ltr">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={rows} margin={chart.margin}>
            <CartesianGrid stroke={CHART_GRID_STROKE} vertical={false} />
            <XAxis dataKey="label" {...AXIS} interval={0} {...chart.xAxis} />
            <YAxis allowDecimals={false} tickFormatter={(v: number) => f.compact(v)} {...AXIS} width={40} {...chart.yAxis} />
            <Tooltip
              cursor={CHART_CURSOR}
              content={(props) => {
                const row = hovered<CountRow>(props);
                if (!row) return null;
                return (
                  <ChartTooltipBox
                    dir={f.rtl ? 'rtl' : 'ltr'}
                    title={row.title}
                    rows={[{ key: 'count', color: PRIMARY, shape: 'box', name: valueName, value: f.int(row.count) }]}
                  />
                );
              }}
            />
            <Bar dataKey="count" fill={PRIMARY} activeBar={{ fill: PRIMARY_HOVER }} radius={[4, 4, 0, 0]} maxBarSize={24} />
          </BarChart>
        </ResponsiveContainer>
      </div>
      <ScreenReaderTable caption={caption} columns={[t('xoAdmin.dashboard.group'), valueName]} rows={rows.map((r) => [r.title, f.int(r.count)])} />
    </>
  );
}

export function EnrollmentTrendChart({ data }: { data: PlatformDashboard['children'] }) {
  const { t } = useTranslation();
  const f = useDashboardFormat();
  const rows: CountRow[] = data.monthly_enrollments.map((m) => ({
    key: m.month,
    label: f.monthShort(m.month),
    title: f.monthLong(m.month),
    count: m.count,
  }));
  const total = rows.reduce((sum, r) => sum + r.count, 0);

  return (
    <TableCard
      title={t('xoAdmin.dashboard.children.enrollmentTitle')}
      count={t('xoAdmin.dashboard.children.childrenCount', { count: total, formatted: f.int(total) })}
      description={t('xoAdmin.dashboard.children.enrollmentHint')}
    >
      <div className="p-4 sm:p-5">
        <CountColumns rows={rows} caption={t('xoAdmin.dashboard.children.enrollmentTitle')} valueName={t('xoAdmin.dashboard.children.joined')} />
      </div>
    </TableCard>
  );
}

/** Active children by age, with the girls and boys split as two figures above. */
export function ChildrenProfilePanel({ data }: { data: PlatformDashboard['children'] }) {
  const { t } = useTranslation();
  const f = useDashboardFormat();
  const rows: CountRow[] = ageBands(data.by_age).map((a) => {
    const label = t(`xoAdmin.dashboard.children.ageShort.${a.years}`);
    return { key: String(a.years), label, title: t(`xoAdmin.dashboard.children.age.${a.years}`), count: a.count };
  });
  const known = data.girls + data.boys;
  const share = (n: number) => (known > 0 ? f.percent(Math.round((n / known) * 1000) / 10) : '—');

  return (
    <TableCard title={t('xoAdmin.dashboard.children.profileTitle')} count={t('xoAdmin.dashboard.children.childrenCount', { count: data.active, formatted: f.int(data.active) })}>
      <div className="space-y-4 p-4 sm:p-5">
        <dl className="grid grid-cols-2 gap-3">
          {(['girls', 'boys'] as const).map((key) => (
            <div key={key} className="rounded-lg bg-surface-container-lowest px-3 py-2">
              <dt className="text-xs text-on-surface-variant">{t(`xoAdmin.dashboard.children.${key}`)}</dt>
              <dd className="mt-0.5 flex items-baseline gap-2">
                <span className="text-lg font-bold text-on-surface">{f.int(data[key])}</span>
                <span className="text-xs text-on-surface-variant">{share(data[key])}</span>
              </dd>
            </div>
          ))}
        </dl>
        <CountColumns rows={rows} caption={t('xoAdmin.dashboard.children.profileTitle')} valueName={t('xoAdmin.dashboard.children.childrenLabel')} heightClass="h-44" />
      </div>
    </TableCard>
  );
}

type AgingRow = { key: string; label: string; title: string; amount: number; count: number };

export function OverdueAgingChart({ data }: { data: PlatformDashboard['finance']['aging'] }) {
  const { t } = useTranslation();
  const f = useDashboardFormat();
  const chart = chartDirection(f.rtl, 0);
  const rows: AgingRow[] = agingBands(data).map((a) => ({
    key: String(a.band),
    label: t(`xoAdmin.dashboard.money.agingShort.${a.band}`),
    title: t(`xoAdmin.dashboard.money.aging.${a.band}`),
    amount: a.amount,
    count: a.count,
  }));
  const total = rows.reduce((sum, r) => sum + r.amount, 0);

  return (
    <TableCard
      title={t('xoAdmin.dashboard.money.agingTitle')}
      count={total > 0 ? f.money(total) : undefined}
      description={t('xoAdmin.dashboard.money.agingHint')}
    >
      {total === 0 ? (
        <PanelEmpty>{t('xoAdmin.dashboard.money.agingEmpty')}</PanelEmpty>
      ) : (
        <div className="p-4 sm:p-5">
          <div className="h-56" dir="ltr">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={rows} margin={chart.margin}>
                <CartesianGrid stroke={CHART_GRID_STROKE} vertical={false} />
                <XAxis dataKey="label" {...AXIS} interval={0} {...chart.xAxis} />
                <YAxis tickFormatter={(v: number) => f.compact(v)} {...AXIS} width={f.isAr ? 56 : 44} {...chart.yAxis} />
                <Tooltip
                  cursor={CHART_CURSOR}
                  content={(props) => {
                    const row = hovered<AgingRow>(props);
                    if (!row) return null;
                    return (
                      <ChartTooltipBox
                        dir={f.rtl ? 'rtl' : 'ltr'}
                        title={row.title}
                        rows={[{ key: 'amount', color: PRIMARY, shape: 'box', name: t('xoAdmin.dashboard.money.stillOwed'), value: f.money(row.amount) }]}
                        note={t('xoAdmin.dashboard.money.invoiceCount', { count: row.count, formatted: f.int(row.count) })}
                      />
                    );
                  }}
                />
                <Bar dataKey="amount" fill={PRIMARY} activeBar={{ fill: PRIMARY_HOVER }} radius={[4, 4, 0, 0]} maxBarSize={24} />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <ScreenReaderTable
            caption={t('xoAdmin.dashboard.money.agingTitle')}
            columns={[t('xoAdmin.dashboard.group'), t('xoAdmin.dashboard.money.stillOwed'), t('xoAdmin.dashboard.money.invoices')]}
            rows={rows.map((r) => [r.title, f.money(r.amount), f.int(r.count)])}
          />
        </div>
      )}
    </TableCard>
  );
}
