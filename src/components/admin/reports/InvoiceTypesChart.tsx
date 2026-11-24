import { useTranslation } from 'react-i18next';
import { Bar, BarChart, CartesianGrid, Tooltip, XAxis, YAxis } from 'recharts';

import { ResponsiveChart } from '@/components/ui/ResponsiveChart';

export function InvoiceTypesChart({ data }: { data: Array<{ type: string; amount: number }> }) {
  const { t } = useTranslation();
  return (
    <section className="rounded-2xl border border-outline-variant bg-surface-container-lowest p-4">
      <h3 className="mb-3 text-sm font-semibold">{t('reports.financial.charts.invoiceTypes')}</h3>
      <div className="h-64">
        <ResponsiveChart>
          <BarChart data={data}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="type" />
            <YAxis />
            <Tooltip />
            <Bar dataKey="amount" fill="#0060ac" />
          </BarChart>
        </ResponsiveChart>
      </div>
    </section>
  );
}
