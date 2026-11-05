import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Label } from '@/components/ui/label';
import { MaterialSymbol } from '@/components/ui/MaterialSymbol';
import {
  MAX_SIGNUP_DOCUMENTS_BYTES,
  prepareSignupFile,
  SIGNUP_FILE_TYPES,
  type SignupFileProblem,
} from '@/features/parent-signup/signupFileLimits';
import { cn } from '@/lib/utils';

type Props = {
  label: string;
  hint?: string;
  file: File | null;
  onChange: (file: File | null) => void;
  /** What this file may take: the room the form's other files leave (see signupFreeBytes). */
  freeBytes: number;
  required?: boolean;
  error?: string;
};

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function FileDropzoneWithPreview({ label, hint, file, onChange, freeBytes, required, error }: Props) {
  const { t } = useTranslation();
  const [preview, setPreview] = useState<{ file: File; url: string } | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [preparing, setPreparing] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!file || !file.type.startsWith('image/')) return;
    const url = URL.createObjectURL(file);
    // The object URL is created here and revoked on cleanup, so it has to live in an effect.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPreview({ file, url });
    return () => URL.revokeObjectURL(url);
  }, [file]);
  // A preview made for an earlier file is never shown.
  const previewUrl = preview && preview.file === file ? preview.url : null;

  const problemMessage = (problem: SignupFileProblem): string => {
    switch (problem.reason) {
      case 'invalid_type':
        return t('signup.fileUpload.invalidType');
      case 'too_large':
        return t('signup.fileUpload.tooLarge', { size: formatBytes(problem.sizeBytes), max: formatBytes(problem.maxBytes) });
      case 'no_room':
        return t('signup.fileUpload.noRoom', {
          size: formatBytes(problem.sizeBytes),
          free: formatBytes(problem.freeBytes),
          total: formatBytes(MAX_SIGNUP_DOCUMENTS_BYTES),
        });
    }
  };

  const choose = async (next: File | undefined) => {
    if (!next) return;
    setLocalError(null);
    setPreparing(true);
    const prepared = await prepareSignupFile(next, freeBytes);
    setPreparing(false);
    if (prepared.problem) {
      setLocalError(problemMessage(prepared.problem));
      return;
    }
    onChange(prepared.file);
  };

  const remove = () => {
    setLocalError(null);
    onChange(null);
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const next = e.target.files?.[0];
    // So choosing the same file again, after making room for it, still reaches here.
    e.target.value = '';
    void choose(next);
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragOver(false);
    if (!preparing) void choose(e.dataTransfer.files?.[0]);
  };

  const effectiveError = error ?? localError;
  const isPdf = useMemo(() => file && file.type === 'application/pdf', [file]);

  const openPicker = () => {
    if (!preparing) inputRef.current?.click();
  };

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
            onClick={remove}
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
          aria-busy={preparing}
          className={cn(
            'flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed p-6 transition-colors',
            preparing ? 'cursor-progress' : 'cursor-pointer',
            dragOver
              ? 'border-primary bg-primary/5'
              : 'border-outline-variant bg-surface-container-lowest hover:border-primary/60 hover:bg-primary/5',
            effectiveError && !dragOver && 'border-error/50',
          )}
        >
          <MaterialSymbol
            name={preparing ? 'progress_activity' : 'cloud_upload'}
            className={cn('text-4xl text-on-surface-variant', preparing && 'animate-spin')}
          />
          <p className="text-sm font-medium text-on-surface">
            {t(preparing ? 'signup.fileUpload.preparing' : 'signup.fileUpload.dropOrBrowse')}
          </p>
          <p className="text-xs text-on-surface-variant">{t('signup.fileUpload.accepted')}</p>
        </div>
      )}

      <input
        ref={inputRef}
        type="file"
        accept={SIGNUP_FILE_TYPES.join(',')}
        onChange={handleInputChange}
        className="hidden"
      />

      {hint && !effectiveError && <p className="text-xs text-on-surface-variant">{hint}</p>}
      {effectiveError && <p role="alert" className="text-xs text-error">{effectiveError}</p>}
    </div>
  );
}
