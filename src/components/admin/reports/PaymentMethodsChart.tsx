import { useTranslation } from 'react-i18next';
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts';

const COLORS = ['#0060ac', '#afc8f0', '#68abff', '#001f3f', '#d4e3ff', '#74777f'];

export function PaymentMethodsChart({ data }: { data: Array<{ method: string; count: number; amount: number }> }) {
  const { t } = useTranslation();
  return (
    <section className="rounded-2xl border border-outline-variant bg-surface-container-lowest p-4">
      <h3 className="mb-3 text-sm font-semibold">{t('reports.financial.charts.paymentMethods')}</h3>
      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie data={data} dataKey="count" nameKey="method" outerRadius={90} label>
              {data.map((_, idx) => <Cell key={`c-${idx}`} fill={COLORS[idx % COLORS.length]} />)}
            </Pie>
            <Tooltip />
          </PieChart>
        </ResponsiveContainer>
      </div>
    </section>
  );
}
