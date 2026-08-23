import { startTransition, useEffect, useState } from 'react';
import { Controller, useFormContext, useFormState, type ControllerRenderProps } from 'react-hook-form';
import { useTranslation } from 'react-i18next';

import { Label } from '@/components/ui/label';
import { staffDateOfBirthBounds } from '@/lib/onboardingDateBounds';
import { cn } from '@/lib/utils';

import { translateStaffFieldErrorMessage } from './staffFieldErrorMessage';
import type { StaffOnboardingFormValues } from './staffOnboardingTypes';

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

function parseIso(iso: string | undefined): { y: number; m: number; d: number } | null {
  if (!iso?.trim() || iso.length < 10) return null;
  const y = Number(iso.slice(0, 4));
  const m = Number(iso.slice(5, 7));
  const d = Number(iso.slice(8, 10));
  if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) return null;
  return { y, m, d };
}

function daysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}

type PickState = { y: number; m: number; d: number };

function DateOfBirthPickers({
  field,
  err,
}: {
  field: ControllerRenderProps<StaffOnboardingFormValues, 'dateOfBirth'>;
  err: string | undefined;
}) {
  const { t, i18n } = useTranslation();
  const bounds = staffDateOfBirthBounds();
  const yMin = Number(bounds.min.slice(0, 4));
  const yMax = Number(bounds.max.slice(0, 4));
  const years: number[] = [];
  for (let y = yMax; y >= yMin; y -= 1) years.push(y);

  const monthFmt = new Intl.DateTimeFormat(i18n.language, { month: 'long' });
  const months = Array.from({ length: 12 }, (_, i) => ({
    value: i + 1,
    label: monthFmt.format(new Date(2000, i, 1)),
  }));

  const [pick, setPick] = useState<PickState>(() => {
    const p = parseIso(field.value);
    return { y: p?.y ?? 0, m: p?.m ?? 0, d: p?.d ?? 0 };
  });

  useEffect(() => {
    const p = parseIso(field.value);
    if (p) {
      startTransition(() => {
        setPick({ y: p.y, m: p.m, d: p.d });
      });
    }
  }, [field.value]);

  const selY = pick.y;
  const selM = pick.m;
  const selD = pick.d;

  const maxDay = selY > 0 && selM > 0 ? daysInMonth(selY, selM) : 31;
  const days = Array.from({ length: maxDay }, (_, i) => i + 1);

  const commitIso = (y: number, m: number, d: number) => {
    const dim = daysInMonth(y, m);
    const dd = Math.min(d, dim);
    field.onChange(`${y}-${pad2(m)}-${pad2(dd)}`);
  };

  return (
    <div className="space-y-1" data-staff-field="dateOfBirth">
      <Label htmlFor="staff-dob-year">{t('staffOnboarding.step5.dob')} *</Label>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        <select
          id="staff-dob-year"
          aria-invalid={Boolean(err)}
          aria-describedby={err ? 'dateOfBirth-err' : undefined}
          className={cn(
            'h-11 w-full rounded-lg border border-outline-variant bg-surface px-2 text-sm text-foreground',
            err && 'field-error',
          )}
          value={selY || ''}
          onBlur={field.onBlur}
          onChange={(e) => {
            const y = Number(e.target.value);
            if (!y) {
              setPick({ y: 0, m: 0, d: 0 });
              field.onChange('');
              return;
            }
            setPick({ y, m: 0, d: 0 });
            field.onChange('');
          }}
        >
          <option value="">{t('staffOnboarding.step5.dobYear')}</option>
          {years.map((y) => (
            <option key={y} value={y}>
              {y}
            </option>
          ))}
        </select>
        <select
          id="staff-dob-month"
          aria-invalid={Boolean(err)}
          aria-describedby={err ? 'dateOfBirth-err' : undefined}
          disabled={!selY}
          className={cn(
            'h-11 w-full rounded-lg border border-outline-variant bg-surface px-2 text-sm text-foreground',
            err && 'field-error',
            !selY && 'opacity-60',
          )}
          value={selM || ''}
          onBlur={field.onBlur}
          onChange={(e) => {
            const m = Number(e.target.value);
            if (!selY || !m) {
              setPick((p) => ({ ...p, m: 0, d: 0 }));
              field.onChange('');
              return;
            }
            const d = selD > 0 ? Math.min(selD, daysInMonth(selY, m)) : 1;
            setPick({ y: selY, m, d });
            commitIso(selY, m, d);
          }}
        >
          <option value="">{t('staffOnboarding.step5.dobMonth')}</option>
          {months.map((mo) => (
            <option key={mo.value} value={mo.value}>
              {mo.label}
            </option>
          ))}
        </select>
        <select
          id="staff-dob-day"
          aria-invalid={Boolean(err)}
          aria-describedby={err ? 'dateOfBirth-err' : undefined}
          disabled={!selY || !selM}
          className={cn(
            'h-11 w-full rounded-lg border border-outline-variant bg-surface px-2 text-sm text-foreground',
            err && 'field-error',
            (!selY || !selM) && 'opacity-60',
          )}
          value={selD || ''}
          onBlur={field.onBlur}
          onChange={(e) => {
            const d = Number(e.target.value);
            if (!selY || !selM || !d) {
              setPick((p) => ({ ...p, d: 0 }));
              field.onChange('');
              return;
            }
            setPick({ y: selY, m: selM, d });
            commitIso(selY, selM, d);
          }}
        >
          <option value="">{t('staffOnboarding.step5.dobDay')}</option>
          {days.map((d) => (
            <option key={d} value={d}>
              {d}
            </option>
          ))}
        </select>
      </div>
      {err ? (
        <p id="dateOfBirth-err" className="mt-1 text-sm text-error" role="alert">
          {translateStaffFieldErrorMessage(t, err)}
        </p>
      ) : null}
    </div>
  );
}

export function StaffOnboardingDateOfBirthField() {
  const { control } = useFormContext<StaffOnboardingFormValues>();
  const { errors } = useFormState({ control });
  const err = errors.dateOfBirth?.message as string | undefined;

  return (
    <Controller
      name="dateOfBirth"
      control={control}
      render={({ field }) => <DateOfBirthPickers field={field} err={err} />}
    />
  );
}
