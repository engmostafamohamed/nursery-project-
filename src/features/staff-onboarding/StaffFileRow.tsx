import { useTranslation } from 'react-i18next';

import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';

import { validateStaffFileSize } from './staffOnboardingFiles';

type Props = {
  label: string;
  accept: string;
  file: File | null;
  onPick: (f: File | null) => void;
  onClear: () => void;
  /** i18n key for inline error text. */
  errorKey?: string;
  optional?: boolean;
  /** Helper text under the control. */
  hint?: string;
  /** For data-staff-field attribute so focus helpers can scroll to it. */
  name?: string;
};

/** Single file-upload row reused across the staff onboarding wizard. */
export function StaffFileRow({
  label,
  accept,
  file,
  onPick,
  onClear,
  errorKey,
  optional,
  hint,
  name,
}: Props) {
  const { t } = useTranslation();
  const hasError = Boolean(errorKey);
  return (
    <div className="space-y-1" data-staff-field={name}>
      <Label>
        {label}
        {!optional ? ' *' : ''}
      </Label>
      <div
        className={cn(
          'flex flex-wrap items-center gap-2 rounded-lg border px-2 py-1.5',
          hasError ? 'border-error' : 'border-outline-variant',
        )}
      >
        <input
          type="file"
          accept={accept}
          aria-invalid={hasError}
          className="text-sm file:mr-2 file:rounded-md file:border file:bg-surface-container-lowest file:px-2 file:py-1"
          onChange={(e) => {
            const f = e.target.files?.[0] ?? null;
            if (f && !validateStaffFileSize(f)) {
              e.target.value = '';
              return;
            }
            onPick(f);
          }}
        />
        {file ? (
          <>
            <span className="truncate text-xs text-on-surface-variant">{file.name}</span>
            <Button type="button" variant="outline" size="sm" onClick={onClear}>
              {t('staffOnboarding.step7.removeFile')}
            </Button>
          </>
        ) : null}
      </div>
      {hint && !hasError ? <p className="mt-1 text-xs text-on-surface-variant">{hint}</p> : null}
      {errorKey ? (
        <p className="mt-1 text-sm text-error" role="alert">
          {t(errorKey)}
        </p>
      ) : null}
    </div>
  );
}
