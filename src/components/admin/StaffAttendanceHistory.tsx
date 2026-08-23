import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';

type Props = {
  rows: Array<Record<string, unknown>>;
};

export function StaffAttendanceHistory({ rows }: Props) {
  const { t } = useTranslation();
  return (
    <section className="space-y-2">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-on-surface">{t('staff.attendanceHistory')}</h3>
        <Button variant="outline" size="sm" onClick={() => toast.message(t('common.comingSoon'))}>
          {t('reports.financial.export.excel')}
        </Button>
      </div>
      <div className="overflow-x-auto rounded-xl border border-outline-variant">
        <table className="w-full min-w-[700px] text-sm">
          <thead>
            <tr className="bg-surface-container text-on-surface-variant">
              <th className="px-2 py-2 text-start">{t('staff.workDate')}</th>
              <th className="px-2 py-2 text-start">{t('staff.checkIn')}</th>
              <th className="px-2 py-2 text-start">{t('staff.checkOut')}</th>
              <th className="px-2 py-2 text-start">{t('staff.workHours')}</th>
              <th className="px-2 py-2 text-start">{t('invoice.details.notes')}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const cin = r.check_in_at ?? r.clock_in;
              const cout = r.check_out_at ?? r.clock_out;
              return (
              <tr key={String(r.id)} className="border-t border-outline-variant">
                <td className="px-2 py-2">{r.work_date ? String(r.work_date) : '-'}</td>
                <td className="px-2 py-2">{cin ? new Date(String(cin)).toLocaleString() : '-'}</td>
                <td className="px-2 py-2">{cout ? new Date(String(cout)).toLocaleString() : '-'}</td>
                <td className="px-2 py-2">{String(r.work_hours ?? '-')}</td>
                <td className="px-2 py-2">{String(r.notes ?? '-')}</td>
              </tr>
            );})}
          </tbody>
        </table>
      </div>
    </section>
  );
}
