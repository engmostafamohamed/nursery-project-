import { useTranslation } from 'react-i18next';
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts';

const COLORS = ['#0060ac', '#afc8f0', '#68abff', '#001f3f'];

type Row = { method: string; amount: number; count: number; label: string };

export function FinancialDashboardMethodPie({ data }: { data: Row[] }) {
  const { t } = useTranslation();
  if (!data.length) {
    return (
      <section className="rounded-2xl border border-outline-variant bg-surface-container-lowest p-4">
        <h3 className="mb-3 text-sm font-semibold">{t('admin.financialDashboard.charts.revenueByMethod')}</h3>
        <p className="text-sm text-on-surface-variant">{t('admin.financialDashboard.empty.methods')}</p>
      </section>
    );
  }

  return (
    <section className="rounded-2xl border border-outline-variant bg-surface-container-lowest p-4">
      <h3 className="mb-3 text-sm font-semibold">{t('admin.financialDashboard.charts.revenueByMethod')}</h3>
      <p className="mb-2 text-xs text-on-surface-variant">{t('admin.financialDashboard.charts.methodsSixMonthHint')}</p>
      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie data={data} dataKey="amount" nameKey="label" outerRadius={90} label>
              {data.map((_, idx) => (
                <Cell key={`cell-${idx}`} fill={COLORS[idx % COLORS.length]} />
              ))}
            </Pie>
            <Tooltip formatter={(value) => (typeof value === 'number' ? value.toFixed(2) : String(value ?? ''))} />
          </PieChart>
        </ResponsiveContainer>
      </div>
    </section>
  );
}
