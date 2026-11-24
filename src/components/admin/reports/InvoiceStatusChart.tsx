import { useTranslation } from 'react-i18next';
import { Cell, Pie, PieChart, Tooltip } from 'recharts';

import { ResponsiveChart } from '@/components/ui/ResponsiveChart';

const COLORS = ['#68abff', '#2f9e44', '#ba1a1a', '#74777f'];

export function InvoiceStatusChart({ data }: { data: Array<{ status: string; count: number; amount: number }> }) {
  const { t } = useTranslation();
  return (
    <section className="rounded-2xl border border-outline-variant bg-surface-container-lowest p-4">
      <h3 className="mb-3 text-sm font-semibold">{t('reports.financial.charts.invoiceStatus')}</h3>
      <div className="h-64">
        <ResponsiveChart>
          <PieChart>
            <Pie data={data} dataKey="count" nameKey="status" innerRadius={50} outerRadius={90} label>
              {data.map((_, idx) => <Cell key={`c-${idx}`} fill={COLORS[idx % COLORS.length]} />)}
            </Pie>
            <Tooltip />
          </PieChart>
        </ResponsiveChart>
      </div>
    </section>
  );
}
