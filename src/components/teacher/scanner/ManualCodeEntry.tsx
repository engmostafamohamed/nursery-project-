import { useState, type RefObject } from 'react';
import { useTranslation } from 'react-i18next';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { MaterialSymbol } from '@/components/ui/MaterialSymbol';

type Props = {
  inputRef: RefObject<HTMLInputElement | null>;
  /** A code (scanned or typed) is being checked. */
  busy: boolean;
  onSubmit: (text: string) => Promise<unknown>;
};

/** A link that is not a QR link (no ?token=) can never be checked; say so under the field. */
function isLinkWithoutToken(value: string): boolean {
  const text = value.trim();
  return /^https?:\/\//i.test(text) && !/[?&]token=[^&]+/.test(text);
}

/** Paste a QR link or code when there is no camera or the code will not scan. */
export function ManualCodeEntry({ inputRef, busy, onSubmit }: Props) {
  const { t } = useTranslation();
  const [value, setValue] = useState('');
  const invalid = isLinkWithoutToken(value);

  const submit = async () => {
    const text = value.trim();
    if (!text || invalid || busy) return;
    await onSubmit(text);
    setValue('');
  };

  return (
    <section className="rounded-2xl border border-outline-variant bg-surface p-4 shadow-sm">
      <div className="flex items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <MaterialSymbol name="keyboard" size="text-xl" />
        </span>
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-on-surface">{t('teacher.scanner.manualTitle')}</h2>
          <p className="text-xs text-on-surface-variant">{t('teacher.scanner.manualHint')}</p>
        </div>
      </div>
      <form
        className="mt-3 flex flex-wrap gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <Input
          ref={inputRef}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder={t('teacher.scanner.manualPlaceholder')}
          aria-invalid={invalid}
          aria-describedby={invalid ? 'manual-code-error' : undefined}
          autoComplete="off"
          spellCheck={false}
          className="h-11 min-w-0 flex-[1_1_11rem] text-sm"
          disabled={busy}
        />
        <Button type="submit" className="h-11 shrink-0 gap-1.5" disabled={busy || !value.trim() || invalid}>
          {busy ? (
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" aria-hidden />
          ) : (
            <MaterialSymbol name="arrow_forward" size="text-base" className="rtl:rotate-180" />
          )}
          {t('teacher.scanner.manualCheck')}
        </Button>
      </form>
      {invalid ? (
        <p id="manual-code-error" className="mt-1.5 text-xs text-error">
          {t('teacher.scanner.manualInvalidLink')}
        </p>
      ) : null}
    </section>
  );
}
