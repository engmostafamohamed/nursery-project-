import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

type Row = { monthKey: string; amount: number };

export function FinancialMonthlyRevenueChart({ data }: { data: Row[] }) {
  const { i18n } = useTranslation();

  const chartData = useMemo(
    () =>
      data.map((row) => ({
        ...row,
        label: new Date(`${row.monthKey}-01T12:00:00`).toLocaleDateString(
          i18n.language?.startsWith('ar') ? 'ar-EG' : 'en-GB',
          { month: 'short', year: '2-digit' },
        ),
      })),
    [data, i18n.language],
  );

  const { t } = useTranslation();

  return (
    <section className="rounded-2xl border border-outline-variant bg-surface-container-lowest p-4">
      <h3 className="mb-3 text-sm font-semibold">{t('admin.financialDashboard.charts.monthlyRevenue')}</h3>
      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="label" tick={{ fontSize: 11 }} />
            <YAxis tick={{ fontSize: 11 }} />
            <Tooltip />
            <Bar dataKey="amount" fill="#0060ac" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </section>
  );
}
