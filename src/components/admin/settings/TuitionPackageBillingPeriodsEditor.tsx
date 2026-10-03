import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { BILLING_PERIODS, type BillingPeriodKind, type BillingPeriodRowState } from '@/hooks/useAdminTuitionBillingPeriods';

/** Pure, controlled — the parent owns the rows (and persists them together with the package
 * on save), so this is purely presentational. */
export function TuitionPackageBillingPeriodsEditor({
  rows,
  onChange,
  basePrice,
}: {
  rows: Record<BillingPeriodKind, BillingPeriodRowState>;
  onChange: (next: Record<BillingPeriodKind, BillingPeriodRowState>) => void;
  basePrice: number;
}) {
  const updateRow = (key: BillingPeriodKind, patch: Partial<BillingPeriodRowState>) =>
    onChange({ ...rows, [key]: { ...rows[key], ...patch } });

  const updatePrice = (key: BillingPeriodKind, price: number) => updateRow(key, { price, touched: true });

  const updateDuration = (key: BillingPeriodKind, duration_months: number) => {
    const row = rows[key];
    const price = row.touched ? row.price : Number((basePrice * duration_months).toFixed(2));
    updateRow(key, { duration_months, price });
  };

  return (
    <div className="space-y-2">
      <Label>Billing periods</Label>
      <p className="text-xs text-on-surface-variant">
        Which billing periods parents can choose during registration, and the total price for each.
      </p>
      <div className="space-y-2">
        {BILLING_PERIODS.map((period) => {
          const row = rows[period.key];
          return (
            <div
              key={period.key}
              className="flex flex-wrap items-center gap-2 rounded-lg border border-outline-variant p-2.5"
            >
              <label className="flex w-40 shrink-0 items-center gap-2 text-sm text-on-surface">
                <Checkbox
                  checked={row.active}
                  onCheckedChange={(checked) => updateRow(period.key, { active: checked === true })}
                />
                {period.label}
              </label>
              <div className="flex items-center gap-1.5">
                <Input
                  type="number"
                  min={1}
                  className="w-20"
                  value={row.duration_months}
                  disabled={!row.active}
                  onChange={(e) => updateDuration(period.key, Math.max(1, Number(e.target.value) || 1))}
                />
                <span className="text-xs text-on-surface-variant">months</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="text-xs text-on-surface-variant">EGP</span>
                <Input
                  type="number"
                  min={0}
                  step={0.01}
                  className="w-28"
                  value={row.price}
                  disabled={!row.active}
                  onChange={(e) => updatePrice(period.key, Number(e.target.value) || 0)}
                />
                {!row.touched ? (
                  <span
                    className="text-xs text-on-surface-variant"
                    title="Auto-calculated from the package price — edit to override"
                  >
                    auto
                  </span>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
