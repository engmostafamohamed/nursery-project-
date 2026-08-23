import { Controller, useFormContext, useFormState } from 'react-hook-form';
import { useTranslation } from 'react-i18next';

import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { formatMobileDisplayForInput, stripMobileInputDisplay } from '@/lib/mobileDisplayFormat';
import { cn } from '@/lib/utils';

import { translateStaffFieldErrorMessage } from './staffFieldErrorMessage';
import type { StaffOnboardingFormValues } from './staffOnboardingTypes';

export function StaffMobileControlledField() {
  const { t } = useTranslation();
  const { control } = useFormContext<StaffOnboardingFormValues>();
  const { errors } = useFormState({ control });
  const err = errors.newMobile?.message as string | undefined;

  return (
    <div className="space-y-1" data-staff-field="newMobile">
      <Label htmlFor="newMobile">
        {t('staffOnboarding.step1.mobile')} {t('staffOnboarding.step1.labelRequired')} *
      </Label>
      <Controller
        name="newMobile"
        control={control}
        render={({ field }) => (
          <Input
            id="newMobile"
            type="tel"
            autoComplete="tel"
            inputMode="tel"
            placeholder="+20 101 234 5678"
            aria-required
            aria-invalid={Boolean(err)}
            aria-describedby={err ? 'newMobile-err' : undefined}
            className={cn(err && 'field-error')}
            value={formatMobileDisplayForInput(field.value ?? '')}
            onChange={(e) => field.onChange(stripMobileInputDisplay(e.target.value))}
            onBlur={field.onBlur}
            name={field.name}
            ref={field.ref}
          />
        )}
      />
      {err ? (
        <p id="newMobile-err" className="mt-1 text-sm text-error" role="alert">
          {translateStaffFieldErrorMessage(t, err)}
        </p>
      ) : null}
    </div>
  );
}
