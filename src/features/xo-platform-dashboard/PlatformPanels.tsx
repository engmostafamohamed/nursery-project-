import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';

import { StatusPill, TableCard } from '@/components/ui/DataTable';
import { CHART_STATE } from '@/lib/chartTheme';

import { PanelEmpty } from './chartParts';
import {
  invoiceStatusParts,
  topWithOther,
  type InvoiceStatus,
  type KeyCount,
  type NurseryRow,
  type PlatformDashboard,
} from './platformDashboard';
import { useDashboardFormat } from './useDashboardFormat';

/*
 * The platform dashboard's breakdown cards: how invoices, nurseries, users and payments split up.
 * Groups compare as ranked bars on one baseline (one colour, largest first, the number at the end),
 * which reads more exactly than a pie; the invoice split is a thin bar over a list of its figures.
 */

const STATUS_COLOR: Record<InvoiceStatus, string> = {
  paid: CHART_STATE.done,
  pending: CHART_STATE.waiting,
  overdue: CHART_STATE.missed,
};
const STATUS_ICON: Record<InvoiceStatus, string> = { paid: 'check_circle', pending: 'schedule', overdue: 'error' };

export function InvoiceStatusPanel({ data }: { data: PlatformDashboard['finance']['by_status'] }) {
  const { t } = useTranslation();
  const f = useDashboardFormat();
  const parts = invoiceStatusParts(data);
  const total = parts.reduce((sum, p) => sum + p.count, 0);

  return (
    <TableCard
      title={t('xoAdmin.dashboard.money.statusTitle')}
      count={t('xoAdmin.dashboard.money.invoiceCount', { count: total, formatted: f.int(total) })}
      description={t('xoAdmin.dashboard.money.statusHint')}
    >
      {total === 0 ? (
        <PanelEmpty>{t('xoAdmin.dashboard.money.statusEmpty')}</PanelEmpty>
      ) : (
        <div className="space-y-4 p-4 sm:p-5">
          <div
            className="flex h-2 gap-0.5 overflow-hidden rounded-full"
            role="img"
            aria-label={parts.map((p) => `${t(`invoice.status.${p.status}`)} ${f.percent(Math.round(p.share * 1000) / 10)}`).join(', ')}
          >
            {parts
              .filter((p) => p.count > 0)
              .map((p) => (
                <span key={p.status} className="h-full" style={{ width: `${p.share * 100}%`, background: STATUS_COLOR[p.status] }} />
              ))}
          </div>
          <ul className="divide-y divide-outline-variant">
            {parts.map((p) => (
              <li key={p.status} className="flex items-center gap-3 py-2.5 first:pt-0 last:pb-0">
                <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: STATUS_COLOR[p.status] }} aria-hidden />
                <span className="flex min-w-0 flex-1 items-center gap-1.5 text-sm text-on-surface">
                  <span className="material-symbols-outlined text-base text-on-surface-variant" aria-hidden>
                    {STATUS_ICON[p.status]}
                  </span>
                  {t(`invoice.status.${p.status}`)}
                  <span className="text-xs text-on-surface-variant">
                    {f.int(p.count)} · {f.percent(Math.round(p.share * 1000) / 10)}
                  </span>
                </span>
                <span className="shrink-0 text-sm font-semibold tabular-nums text-on-surface">{f.money(p.amount)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </TableCard>
  );
}

type RankedRow = { key: string; label: string; value: number; display: string };

/** Ranked bars: one row per group, the bar's length against the biggest group. */
export function RankedBars({ rows, empty }: { rows: RankedRow[]; empty: string }) {
  if (!rows.length) return <PanelEmpty>{empty}</PanelEmpty>;
  const max = Math.max(1, ...rows.map((r) => r.value));
  return (
    <ul className="space-y-3 p-4 sm:p-5">
      {rows.map((row) => (
        <li key={row.key}>
          <div className="mb-1 flex items-center justify-between gap-2 text-sm">
            <span className="truncate text-on-surface">{row.label}</span>
            <span className="shrink-0 font-semibold tabular-nums text-on-surface">{row.display}</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-surface-high">
            <div className="h-full rounded-full bg-primary" style={{ width: `${Math.max(row.value > 0 ? 2 : 0, (row.value / max) * 100)}%` }} />
          </div>
        </li>
      ))}
    </ul>
  );
}

function useKeyRows(rows: KeyCount[], label: (key: string | null) => string): RankedRow[] {
  const f = useDashboardFormat();
  return rows.map((r) => ({ key: r.key ?? '__none', label: label(r.key), value: r.count, display: f.int(r.count) }));
}

export function CitiesPanel({ data }: { data: KeyCount[] }) {
  const { t } = useTranslation();
  const f = useDashboardFormat();
  const rows = useKeyRows(topWithOther(data, 8), (key) =>
    key === '__other' ? t('xoAdmin.dashboard.network.otherCities') : key ?? t('xoAdmin.dashboard.network.cityNotSet'),
  );
  return (
    <TableCard title={t('xoAdmin.dashboard.network.citiesTitle')} count={t('xoAdmin.dashboard.network.cityCount', { count: data.length, formatted: f.int(data.length) })}>
      <RankedBars rows={rows} empty={t('xoAdmin.dashboard.empty')} />
    </TableCard>
  );
}

export function UsersByRolePanel({ data }: { data: PlatformDashboard['users'] }) {
  const { t } = useTranslation();
  const f = useDashboardFormat();
  const rows = useKeyRows(data.by_role, (key) => t(`chatAdmin.roles.${key}`, { defaultValue: key ?? '' }));
  return (
    <TableCard
      title={t('xoAdmin.dashboard.network.usersTitle')}
      count={f.int(data.total)}
      description={t('xoAdmin.dashboard.network.usersNew', { count: data.new_this_month, formatted: f.int(data.new_this_month) })}
    >
      <RankedBars rows={rows} empty={t('xoAdmin.dashboard.empty')} />
    </TableCard>
  );
}

export function SubscriptionsPanel({ data }: { data: PlatformDashboard['nurseries'] }) {
  const { t } = useTranslation();
  const notSet = t('xoAdmin.dashboard.network.notSet');
  const statusRows = useKeyRows(data.by_status, (key) => (key ? t(`nurseries.status.${key}`, { defaultValue: key }) : notSet));
  const planRows = useKeyRows(data.by_plan, (key) => (key ? t(`nurseries.plans.${key}`, { defaultValue: key }) : notSet));
  return (
    <TableCard title={t('xoAdmin.dashboard.network.subscriptionsTitle')} description={t('xoAdmin.dashboard.network.subscriptionsHint')}>
      <div className="divide-y divide-outline-variant">
        <section>
          <h3 className="px-4 pt-4 text-xs font-semibold text-on-surface-variant sm:px-5">{t('xoAdmin.dashboard.network.byStatus')}</h3>
          <RankedBars rows={statusRows} empty={t('xoAdmin.dashboard.empty')} />
        </section>
        <section>
          <h3 className="px-4 pt-4 text-xs font-semibold text-on-surface-variant sm:px-5">{t('xoAdmin.dashboard.network.byPlan')}</h3>
          <RankedBars rows={planRows} empty={t('xoAdmin.dashboard.empty')} />
        </section>
      </div>
    </TableCard>
  );
}

export function PaymentMethodsPanel({ data }: { data: PlatformDashboard['finance']['by_method'] }) {
  const { t } = useTranslation();
  const f = useDashboardFormat();
  const rows: RankedRow[] = data.map((m) => ({
    key: m.key,
    label: t(`xoAdmin.dashboard.money.methods.${m.key}`, { defaultValue: m.key }),
    value: m.amount,
    display: f.money(m.amount),
  }));
  const total = data.reduce((sum, m) => sum + m.count, 0);
  return (
    <TableCard
      title={t('xoAdmin.dashboard.money.methodsTitle')}
      count={total ? t('xoAdmin.dashboard.money.paymentCount', { count: total, formatted: f.int(total) }) : undefined}
      description={t('xoAdmin.dashboard.money.methodsHint')}
    >
      <RankedBars rows={rows} empty={t('xoAdmin.dashboard.money.methodsEmpty')} />
    </TableCard>
  );
}

export function AdmissionsPanel({ data }: { data: PlatformDashboard['admissions'] }) {
  const { t } = useTranslation();
  const f = useDashboardFormat();
  const rows: RankedRow[] = (['inquiries', 'applications', 'approved'] as const).map((key) => ({
    key,
    label: t(`xoAdmin.dashboard.admissions.${key}`),
    value: data[key],
    display: f.int(data[key]),
  }));
  const approvalRate = data.applications > 0 ? Math.round((data.approved / data.applications) * 100) : null;

  return (
    <TableCard
      title={t('xoAdmin.dashboard.admissions.title')}
      count={approvalRate != null ? t('xoAdmin.dashboard.admissions.approvalRate', { rate: f.percent(approvalRate) }) : undefined}
      description={t('xoAdmin.dashboard.admissions.hint')}
    >
      <RankedBars rows={rows} empty={t('xoAdmin.dashboard.empty')} />
      <div className="flex flex-wrap gap-2 border-t border-outline-variant px-4 py-3 sm:px-5">
        <StatusPill tone={data.applications_pending > 0 ? 'warning' : 'neutral'} icon="assignment_ind">
          {t('xoAdmin.dashboard.admissions.waiting', { count: data.applications_pending, formatted: f.int(data.applications_pending) })}
        </StatusPill>
        <StatusPill tone={data.inquiries_new > 0 ? 'warning' : 'neutral'} icon="contact_support">
          {t('xoAdmin.dashboard.admissions.newInquiries', { count: data.inquiries_new, formatted: f.int(data.inquiries_new) })}
        </StatusPill>
      </div>
    </TableCard>
  );
}

export function RecentSignupsPanel({ rows, today, onOpen }: { rows: NurseryRow[]; today: string; onOpen: (id: string) => void }) {
  const { t } = useTranslation();
  const f = useDashboardFormat();
  const latest = [...rows].sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, 5);
  const relative = new Intl.RelativeTimeFormat(f.isAr ? 'ar-EG' : 'en', { numeric: 'auto' });
  const daysAgo = (iso: string) => {
    const created = new Date(iso.slice(0, 10) + 'T12:00:00').getTime();
    const now = new Date(today + 'T12:00:00').getTime();
    return relative.format(-Math.round((now - created) / 86_400_000), 'day');
  };

  return (
    <TableCard
      title={t('xoAdmin.dashboard.recentSignups')}
      actions={
        <Link to="/xo-admin/nurseries" className="text-sm font-medium text-primary hover:underline">
          {t('xoAdmin.dashboard.viewAllNurseries')}
        </Link>
      }
    >
      {latest.length === 0 ? (
        <PanelEmpty>{t('xoAdmin.dashboard.noRecentSignups')}</PanelEmpty>
      ) : (
        <ul className="divide-y divide-outline-variant">
          {latest.map((n) => (
            <li key={n.id}>
              <button
                type="button"
                onClick={() => onOpen(n.id)}
                className="flex w-full items-center gap-3 px-4 py-3 text-start outline-none transition-colors hover:bg-surface-container-lowest focus-visible:bg-surface-container-lowest sm:px-5"
              >
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary" aria-hidden>
                  <span className="material-symbols-outlined text-lg">apartment</span>
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-on-surface">{f.nurseryName(n)}</span>
                  <span className="block truncate text-xs text-on-surface-variant">
                    {[n.city, daysAgo(n.created_at)].filter(Boolean).join(' · ')}
                  </span>
                </span>
                <StatusPill tone={n.subscription_status === 'active' ? 'success' : n.subscription_status === 'trial' ? 'primary' : 'neutral'} className="shrink-0">
                  {n.subscription_status
                    ? t(`nurseries.status.${n.subscription_status}`, { defaultValue: n.subscription_status })
                    : t('xoAdmin.dashboard.network.noSubscription')}
                </StatusPill>
              </button>
            </li>
          ))}
        </ul>
      )}
    </TableCard>
  );
}
