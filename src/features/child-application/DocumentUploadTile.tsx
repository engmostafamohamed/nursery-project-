import { useTranslation } from 'react-i18next';

import { cn } from '@/lib/utils';

/** One document of the application: required or optional, uploaded or not; upload, replace, remove. */
export function DocumentUploadTile({
  docType,
  required,
  uploaded,
  disabled,
  canUploadDocuments,
  canRemoveDocuments,
  onFile,
  onRemove,
}: {
  docType: string;
  required: boolean;
  uploaded: boolean;
  disabled: boolean;
  canUploadDocuments: boolean;
  canRemoveDocuments: boolean;
  onFile: (file: File) => void;
  onRemove: () => void;
}) {
  const { t } = useTranslation();
  return (
    <div
      className={cn(
        'group flex min-h-36 flex-col justify-between rounded-lg border p-4 text-sm transition',
        uploaded
          ? 'border-success/40 bg-success/5'
          : required
            ? 'border-warning/40 bg-warning/5'
            : 'border-outline-variant bg-surface-container-lowest hover:border-primary hover:bg-primary/5',
        disabled && 'cursor-not-allowed opacity-70',
      )}
    >
      <span className="flex items-start justify-between gap-3">
        <span className="flex min-w-0 items-start gap-3">
          <span className={cn(
            'flex h-10 w-10 shrink-0 items-center justify-center rounded-md',
            uploaded ? 'bg-success text-on-primary' : 'bg-primary/10 text-primary',
          )}>
            <span className="material-symbols-outlined text-xl" aria-hidden>
              {uploaded ? 'check' : 'upload_file'}
            </span>
          </span>
          <span className="min-w-0">
            <span className="block font-semibold text-on-surface">{t(`applications.documentTypes.${docType}`)}</span>
            <span className="mt-1 block text-xs leading-5 text-on-surface-variant">
              {uploaded
                ? canUploadDocuments
                  ? t('applications.replaceDocumentHint', { defaultValue: 'Choose a new file to replace this document.' })
                  : t('applications.documentLockedHint', { defaultValue: 'This document is locked after submission.' })
                : t('applications.documentsHelp', { defaultValue: 'Upload a PDF or image file.' })}
            </span>
          </span>
        </span>
        <span className={cn(
          'shrink-0 rounded-full px-2 py-1 text-[10px] font-semibold',
          uploaded
            ? 'bg-success/10 text-success'
            : required
              ? 'bg-warning/10 text-warning'
              : 'bg-surface-container text-on-surface-variant',
        )}>
          {uploaded
            ? t('applications.documentUploadedBadge', { defaultValue: 'Uploaded' })
            : required
              ? t('applications.requiredBadge', { defaultValue: 'Required' })
              : t('applications.optionalBadge', { defaultValue: 'Optional' })}
        </span>
      </span>
      <div className={cn('mt-4 grid gap-2', uploaded && canRemoveDocuments && 'sm:grid-cols-[minmax(0,1fr)_auto]')}>
        <label
          className={cn(
            'inline-flex h-10 items-center justify-center gap-2 rounded-md border bg-surface px-3 text-sm font-semibold shadow-sm transition',
            disabled ? 'cursor-not-allowed opacity-70' : 'cursor-pointer',
            uploaded
              ? 'border-success/40 text-success hover:bg-success hover:text-white'
              : 'border-primary/30 text-primary hover:bg-primary hover:text-primary-foreground',
          )}
        >
          <span className="material-symbols-outlined text-base" aria-hidden>{uploaded ? 'check_circle' : 'add'}</span>
          {uploaded
            ? t('applications.uploadedReplaceDocument', { defaultValue: 'Uploaded - Replace file' })
            : t('applications.uploadDocument', { defaultValue: 'Upload file' })}
          <input
            className="sr-only"
            type="file"
            accept=".pdf,.jpg,.jpeg,.png,.webp,application/pdf,image/jpeg,image/png,image/webp"
            disabled={disabled}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) onFile(file);
              e.currentTarget.value = '';
            }}
          />
        </label>
        {uploaded && canRemoveDocuments ? (
          <button
            type="button"
            className="inline-flex h-10 items-center justify-center gap-2 rounded-md border border-error/30 bg-surface px-3 text-sm font-semibold text-error shadow-sm transition hover:bg-error hover:text-white"
            onClick={onRemove}
          >
            <span className="material-symbols-outlined text-base" aria-hidden>delete</span>
            {t('applications.removeDocument', { defaultValue: 'Remove' })}
          </button>
        ) : null}
      </div>
    </div>
  );
}
