import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

type StaffOption = {
  id: string;
  userId: string;
  name: string;
  baseSalary: number;
};

type Props = {
  staffOptions: StaffOption[];
  nurseryId: string;
  createdBy?: string;
  onSubmit: (payload: {
    staff_id: string;
    nursery_id: string;
    pay_period_start: string;
    pay_period_end: string;
    base_salary: number;
    bonuses: number;
    deductions: number;
    payment_method: 'cash' | 'bank_transfer' | 'check';
    notes: string;
    created_by?: string;
  }) => Promise<void>;
};

export function PayslipForm({ staffOptions, nurseryId, createdBy, onSubmit }: Props) {
  const { t } = useTranslation();
  const now = new Date();
  const defaultMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const [staffId, setStaffId] = useState(staffOptions[0]?.id ?? '');
  const [month, setMonth] = useState(defaultMonth);
  const [baseSalary, setBaseSalary] = useState(staffOptions[0]?.baseSalary ?? 0);
  const [bonuses, setBonuses] = useState(0);
  const [deductions, setDeductions] = useState(0);
  const [method, setMethod] = useState<'cash' | 'bank_transfer' | 'check'>('bank_transfer');
  const [notes, setNotes] = useState('');

  const total = useMemo(() => Math.max(0, baseSalary + bonuses - deductions), [baseSalary, bonuses, deductions]);

  return (
    <div className="space-y-3 rounded-2xl border border-outline-variant bg-surface-container-lowest p-4">
      <div className="space-y-2">
        <Label>{t('payroll.staff')}</Label>
        <select
          className="h-11 w-full rounded-lg border border-outline-variant bg-surface text-foreground px-3 text-sm"
          value={staffId}
          onChange={(e) => {
            setStaffId(e.target.value);
            const matched = staffOptions.find((s) => s.id === e.target.value);
            if (matched) setBaseSalary(matched.baseSalary);
          }}
        >
          {staffOptions.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
      </div>
      <div className="grid gap-2 md:grid-cols-2">
        <div className="space-y-2"><Label>{t('payroll.periodMonth')}</Label><Input type="month" value={month} onChange={(e) => setMonth(e.target.value)} /></div>
        <div className="space-y-2">
          <Label>{t('payroll.paymentMethod')}</Label>
          <select className="h-11 w-full rounded-lg border border-outline-variant bg-surface text-foreground px-3 text-sm" value={method} onChange={(e) => setMethod(e.target.value as 'cash' | 'bank_transfer' | 'check')}>
            {(['cash', 'bank_transfer', 'check'] as const).map((m) => <option key={m} value={m}>{t(`payroll.methods.${m}`)}</option>)}
          </select>
        </div>
      </div>
      <div className="grid gap-2 md:grid-cols-3">
        <div className="space-y-2"><Label>{t('payroll.baseSalary')}</Label><Input type="number" min={0} value={baseSalary} onChange={(e) => setBaseSalary(Number(e.target.value || 0))} /></div>
        <div className="space-y-2"><Label>{t('payroll.bonuses')}</Label><Input type="number" min={0} value={bonuses} onChange={(e) => setBonuses(Number(e.target.value || 0))} /></div>
        <div className="space-y-2"><Label>{t('payroll.deductions')}</Label><Input type="number" min={0} value={deductions} onChange={(e) => setDeductions(Number(e.target.value || 0))} /></div>
      </div>
      <div className="space-y-2"><Label>{t('payroll.total')}</Label><Input value={String(total)} readOnly /></div>
      <div className="space-y-2"><Label>{t('invoice.details.notes')}</Label><Input value={notes} onChange={(e) => setNotes(e.target.value)} /></div>
      <Button
        onClick={async () => {
          const start = `${month}-01`;
          const endDate = new Date(`${month}-01T00:00:00`);
          endDate.setMonth(endDate.getMonth() + 1, 0);
          const end = endDate.toISOString().slice(0, 10);
          await onSubmit({
            staff_id: staffId,
            nursery_id: nurseryId,
            pay_period_start: start,
            pay_period_end: end,
            base_salary: baseSalary,
            bonuses,
            deductions,
            payment_method: method,
            notes,
            created_by: createdBy,
          });
        }}
      >
        {t('payroll.createPayslip')}
      </Button>
    </div>
  );
}
