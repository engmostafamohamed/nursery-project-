import { useTranslation } from 'react-i18next';

import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import type { FinancialDashboardPreset, IsoRange } from '@/lib/financialDashboardHelpers';
import type { PaymentMethodFilter, PaymentStatusFilter } from '@/hooks/useAdminFinancialDashboard';

type Props = {
  preset: FinancialDashboardPreset;
  onPreset: (v: FinancialDashboardPreset) => void;
  customFrom: string;
  onCustomFrom: (v: string) => void;
  customTo: string;
  onCustomTo: (v: string) => void;
  paymentStatus: PaymentStatusFilter;
  onPaymentStatus: (v: PaymentStatusFilter) => void;
  paymentMethod: PaymentMethodFilter;
  onPaymentMethod: (v: PaymentMethodFilter) => void;
  customReady: boolean;
  filterRange: IsoRange | null | undefined;
};

export function FinancialDashboardFilters({
  preset,
  onPreset,
  customFrom,
  onCustomFrom,
  customTo,
  onCustomTo,
  paymentStatus,
  onPaymentStatus,
  paymentMethod,
  onPaymentMethod,
  customReady,
  filterRange,
}: Props) {
  const { t } = useTranslation();

  return (
    <Card>
      <CardContent className="space-y-4 p-4">
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
          <div className="space-y-1">
            <Label className="text-xs text-on-surface-variant">{t('admin.financialDashboard.filters.period')}</Label>
            <Select value={preset} onChange={(e) => onPreset(e.target.value as FinancialDashboardPreset)}>
              <option value="this_month">{t('admin.financialDashboard.presets.this_month')}</option>
              <option value="last_month">{t('admin.financialDashboard.presets.last_month')}</option>
              <option value="custom">{t('admin.financialDashboard.presets.custom')}</option>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-on-surface-variant">{t('admin.financialDashboard.filters.paymentStatus')}</Label>
            <Select
              value={paymentStatus}
              onChange={(e) => onPaymentStatus(e.target.value as PaymentStatusFilter)}
            >
              <option value="all">{t('admin.financialDashboard.paymentStatus.all')}</option>
              <option value="completed">{t('admin.financialDashboard.paymentStatus.completed')}</option>
              <option value="pending">{t('admin.financialDashboard.paymentStatus.pending')}</option>
              <option value="failed">{t('admin.financialDashboard.paymentStatus.failed')}</option>
              <option value="refunded">{t('admin.financialDashboard.paymentStatus.refunded')}</option>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-on-surface-variant">{t('admin.financialDashboard.filters.paymentMethod')}</Label>
            <Select
              value={paymentMethod}
              onChange={(e) => onPaymentMethod(e.target.value as PaymentMethodFilter)}
            >
              <option value="all">{t('admin.financialDashboard.methodFilter.all')}</option>
              <option value="cash">{t('admin.financialDashboard.methods.cash')}</option>
              <option value="bank_transfer">{t('admin.financialDashboard.methods.bank_transfer')}</option>
              <option value="paymob">{t('admin.financialDashboard.methods.paymob')}</option>
            </Select>
          </div>
        </div>
        {preset === 'custom' ? (
          <div className="flex flex-wrap gap-3">
            <div className="space-y-1">
              <Label className="text-xs text-on-surface-variant">{t('admin.financialDashboard.filters.from')}</Label>
              <Input type="date" value={customFrom} onChange={(e) => onCustomFrom(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-on-surface-variant">{t('admin.financialDashboard.filters.to')}</Label>
              <Input type="date" value={customTo} onChange={(e) => onCustomTo(e.target.value)} />
            </div>
          </div>
        ) : null}
        {!customReady ? (
          <p className="text-sm text-on-surface-variant">{t('admin.financialDashboard.customHint')}</p>
        ) : filterRange ? (
          <p className="text-sm text-on-surface-variant">
            {t('admin.financialDashboard.rangeLabel', {
              from: filterRange.from.slice(0, 10),
              to: filterRange.to.slice(0, 10),
            })}
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}
