import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Label } from '@/components/ui/label';
import { MaterialSymbol } from '@/components/ui/MaterialSymbol';
import { cn } from '@/lib/utils';

const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024;
const ACCEPTED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];

type Props = {
  label: string;
  hint?: string;
  file: File | null;
  onChange: (file: File | null) => void;
  required?: boolean;
  error?: string;
};

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function FileDropzoneWithPreview({ label, hint, file, onChange, required, error }: Props) {
  const { t } = useTranslation();
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!file) {
      setPreviewUrl(null);
      return;
    }
    if (!file.type.startsWith('image/')) {
      setPreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const validateAndSet = useCallback(
    (next: File | null) => {
      setLocalError(null);
      if (!next) {
        onChange(null);
        return;
      }
      if (!ACCEPTED_TYPES.includes(next.type)) {
        setLocalError(t('signup.fileUpload.invalidType'));
        return;
      }
      if (next.size > MAX_FILE_SIZE_BYTES) {
        setLocalError(t('signup.fileUpload.tooLarge'));
        return;
      }
      onChange(next);
    },
    [onChange, t],
  );

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    validateAndSet(e.target.files?.[0] ?? null);
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragOver(false);
    validateAndSet(e.dataTransfer.files?.[0] ?? null);
  };

  const effectiveError = error ?? localError;
  const isPdf = useMemo(() => file && file.type === 'application/pdf', [file]);

  const openPicker = () => inputRef.current?.click();

  return (
    <div className="space-y-1.5">
      <Label>
        {label}
        {required && <span className="text-error ms-0.5">*</span>}
      </Label>

      {file ? (
        <div className="flex items-center gap-3 rounded-xl border border-outline-variant bg-surface-container-lowest p-3">
          {previewUrl ? (
            <img
              src={previewUrl}
              alt={file.name}
              className="h-16 w-16 rounded-lg object-cover"
            />
          ) : (
            <div className="flex h-16 w-16 items-center justify-center rounded-lg bg-surface-container">
              <MaterialSymbol name={isPdf ? 'picture_as_pdf' : 'description'} className="text-3xl text-on-surface-variant" />
            </div>
          )}
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-on-surface">{file.name}</p>
            <p className="text-xs text-on-surface-variant">{formatBytes(file.size)}</p>
          </div>
          <button
            type="button"
            onClick={() => validateAndSet(null)}
            className="rounded-full p-1.5 text-on-surface-variant hover:bg-surface-container hover:text-error"
            aria-label={t('signup.fileUpload.remove')}
          >
            <MaterialSymbol name="close" />
          </button>
        </div>
      ) : (
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
          onClick={openPicker}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              openPicker();
            }
          }}
          role="button"
          tabIndex={0}
          className={cn(
            'flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed p-6 transition-colors',
            dragOver
              ? 'border-primary bg-primary/5'
              : 'border-outline-variant bg-surface-container-lowest hover:border-primary/60 hover:bg-primary/5',
          )}
        >
          <MaterialSymbol name="cloud_upload" className="text-4xl text-on-surface-variant" />
          <p className="text-sm font-medium text-on-surface">{t('signup.fileUpload.dropOrBrowse')}</p>
          <p className="text-xs text-on-surface-variant">{t('signup.fileUpload.accepted')}</p>
        </div>
      )}

      <input
        ref={inputRef}
        type="file"
        accept={ACCEPTED_TYPES.join(',')}
        onChange={handleInputChange}
        className="hidden"
      />

      {hint && !effectiveError && <p className="text-xs text-on-surface-variant">{hint}</p>}
      {effectiveError && <p className="text-xs text-error">{effectiveError}</p>}
    </div>
  );
}
