import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import type { NurserySettingsRow } from '@/types/tables/nursery_settings';

import type { SettingsField } from './settingsConfig';

interface Props {
  fields: SettingsField[];
  values: Partial<NurserySettingsRow>;
  t: (key: string, options?: Record<string, unknown>) => string;
  onChange: (key: keyof NurserySettingsRow, value: unknown) => void;
  onSave: () => Promise<void>;
  onReset: () => void;
  isSaving: boolean;
}

const PAYMENT_METHODS = ['paymob', 'cash', 'bank_transfer'];
const LOYALTY_TIERS = ['silver', 'gold', 'platinum'] as const;

export function SettingsCategoryForm({
  fields,
  values,
  t,
  onChange,
  onSave,
  onReset,
  isSaving,
}: Props) {
  const renderField = (field: SettingsField) => {
    const value = values[field.key] ?? '';
    const labelKey = `settings.fields.${String(field.key)}.label`;
    const helperKey = `settings.fields.${String(field.key)}.helper`;
    const label = t(labelKey);
    const helper = t(helperKey);

    if (field.type === 'boolean') {
      return (
        <label className="flex items-center justify-between rounded-lg border border-outline-variant p-3">
          <div>
            <p className="text-sm font-medium text-on-surface">{label}</p>
            <p className="text-xs text-on-surface-variant">{helper}</p>
          </div>
          <input
            type="checkbox"
            checked={Boolean(value)}
            onChange={(e) => onChange(field.key, e.target.checked)}
          />
        </label>
      );
    }

    if (field.type === 'select') {
      return (
        <div className="space-y-2">
          <Label>{label}</Label>
          <select
            className="h-12 w-full rounded-lg border border-outline-variant bg-surface-container-lowest px-3 text-sm"
            value={String(value ?? '')}
            onChange={(e) => onChange(field.key, e.target.value)}
          >
            {(field.options ?? []).map((option) => (
              <option key={option} value={option}>
                {t(`settings.options.${String(field.key)}.${option}`)}
              </option>
            ))}
          </select>
          <p className="text-xs text-on-surface-variant">{helper}</p>
        </div>
      );
    }

    if (field.type === 'payment_methods') {
      const current = Array.isArray(value) ? value.map(String) : [];
      return (
        <div className="space-y-2">
          <Label>{label}</Label>
          <div className="grid gap-2 sm:grid-cols-3">
            {PAYMENT_METHODS.map((method) => (
              <label key={method} className="flex items-center gap-2 rounded-lg border border-outline-variant p-2 text-sm">
                <input
                  type="checkbox"
                  checked={current.includes(method)}
                  onChange={(e) => {
                    const next = e.target.checked
                      ? [...current, method]
                      : current.filter((item) => item !== method);
                    onChange(field.key, next);
                  }}
                />
                {t(`settings.options.payment_methods_enabled.${method}`)}
              </label>
            ))}
          </div>
          <p className="text-xs text-on-surface-variant">{helper}</p>
        </div>
      );
    }

    if (field.type === 'loyalty_thresholds') {
      const current = (value as Record<string, number> | null) ?? {};
      return (
        <div className="space-y-2">
          <Label>{label}</Label>
          <div className="grid gap-2 sm:grid-cols-3">
            {LOYALTY_TIERS.map((tier) => (
              <Input
                key={tier}
                type="number"
                min={0}
                value={String(current[tier] ?? 0)}
                placeholder={t(`settings.options.loyalty_tier_thresholds.${tier}`)}
                onChange={(e) =>
                  onChange(field.key, {
                    ...current,
                    [tier]: Number(e.target.value || 0),
                  })
                }
              />
            ))}
          </div>
          <p className="text-xs text-on-surface-variant">{helper}</p>
        </div>
      );
    }

    if (field.type === 'color') {
      return (
        <div className="space-y-2">
          <Label>{label}</Label>
          <div className="flex items-center gap-3">
            <input
              type="color"
              value={String(value || '#000000')}
              onChange={(e) => onChange(field.key, e.target.value)}
              className="h-10 w-14 rounded border border-outline-variant"
            />
            <Input
              value={String(value)}
              onChange={(e) => onChange(field.key, e.target.value)}
            />
            <span
              className="h-6 w-6 rounded-full border border-outline-variant"
              style={{ backgroundColor: String(value || '#000000') }}
            />
          </div>
          <p className="text-xs text-on-surface-variant">{helper}</p>
        </div>
      );
    }

    const inputType =
      field.type === 'time'
        ? 'time'
        : field.type === 'date'
          ? 'date'
          : field.type === 'number'
            ? 'number'
            : 'text';

    return (
      <div className="space-y-2">
        <Label>{label}</Label>
        <Input
          type={inputType}
          min={field.min}
          max={field.max}
          step={field.step}
          value={String(value ?? '')}
          onChange={(e) => onChange(field.key, field.type === 'number' ? Number(e.target.value || 0) : e.target.value)}
        />
        <p className="text-xs text-on-surface-variant">{helper}</p>
      </div>
    );
  };

  const visibleFields = fields.filter(
    (field) => !field.showWhen || field.showWhen.in.includes(String(values[field.showWhen.key])),
  );

  return (
    <div className="space-y-4 rounded-2xl border border-outline-variant bg-surface-container-lowest p-4">
      {visibleFields.map((field) => (
        <div key={String(field.key)}>{renderField(field)}</div>
      ))}
      <div className="flex flex-wrap justify-end gap-2 pt-2">
        <Button variant="outline" onClick={onReset}>
          {t('settings.actions.reset')}
        </Button>
        <Button onClick={() => void onSave()} disabled={isSaving}>
          {isSaving ? t('common.loading') : t('settings.actions.save')}
        </Button>
      </div>
    </div>
  );
}
