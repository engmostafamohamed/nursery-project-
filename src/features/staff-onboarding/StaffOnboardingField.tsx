import { useFormContext, useFormState } from 'react-hook-form';
import { useTranslation } from 'react-i18next';

import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';

import { translateStaffFieldErrorMessage } from './staffFieldErrorMessage';
import type { StaffOnboardingFormValues } from './staffOnboardingTypes';

export function StaffOnboardingField({
  name,
  label,
  type = 'text',
  placeholder,
  required,
  ariaRequired,
  min,
  max,
}: {
  name: keyof StaffOnboardingFormValues;
  label: string;
  type?: string;
  placeholder?: string;
  required?: boolean;
  ariaRequired?: boolean;
  min?: string;
  max?: string;
}) {
  const { t } = useTranslation();
  const { register, control } = useFormContext<StaffOnboardingFormValues>();
  const { errors } = useFormState({ control });
  const err = errors[name]?.message as string | undefined;
  const isRequired = ariaRequired ?? required;
  return (
    <div className="space-y-1" data-staff-field={String(name)}>
      <Label htmlFor={String(name)}>
        {label}
        {required ? ' *' : ''}
      </Label>
      <Input
        id={String(name)}
        type={type}
        placeholder={placeholder}
        min={min}
        max={max}
        autoComplete={type === 'tel' ? 'tel' : undefined}
        inputMode={type === 'tel' ? 'tel' : undefined}
        aria-required={isRequired}
        aria-invalid={Boolean(err)}
        aria-describedby={err ? `${String(name)}-err` : undefined}
        className={cn(err && 'field-error')}
        {...register(name)}
      />
      {err ? (
        <p id={`${String(name)}-err`} className="mt-1 text-sm text-error" role="alert">
          {translateStaffFieldErrorMessage(t, err)}
        </p>
      ) : null}
    </div>
  );
}
