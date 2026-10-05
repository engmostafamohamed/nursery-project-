import { useEffect, useMemo, useRef } from 'react';

import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';

type Props = {
  label: string;
  buttonLabel: string;
  file: File | null;
  onFile: (file: File | null) => void;
  error?: string;
  hint?: string;
};

/** One ID image upload (e.g. a card side) with a preview of the chosen file. */
export function IdentityImageField({ label, buttonLabel, file, onFile, error, hint }: Props) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const previewUrl = useMemo(() => (file ? URL.createObjectURL(file) : null), [file]);
  useEffect(() => () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
  }, [previewUrl]);

  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(event) => {
          onFile(event.target.files?.[0] ?? null);
          // Allow choosing the same file again after clearing.
          event.target.value = '';
        }}
      />
      <Button
        type="button"
        variant="outline"
        className={cn('h-11 w-full justify-start rounded-lg', error && 'border-error ring-1 ring-error/30')}
        aria-invalid={Boolean(error)}
        onClick={() => inputRef.current?.click()}
      >
        <span className="material-symbols-outlined me-2 text-base" aria-hidden>upload_file</span>
        <span className="min-w-0 truncate">{file ? file.name : buttonLabel}</span>
      </Button>
      {previewUrl ? (
        <img src={previewUrl} alt="" className="h-32 w-full rounded-xl border border-outline-variant object-cover" />
      ) : null}
      {error ? (
        <p className="text-xs font-medium text-error">{error}</p>
      ) : hint ? (
        <p className="text-xs text-on-surface-variant">{hint}</p>
      ) : null}
    </div>
  );
}
