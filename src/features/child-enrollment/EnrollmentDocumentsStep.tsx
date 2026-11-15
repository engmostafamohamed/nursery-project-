import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';

import { PanelHeader } from '@/features/child-application/ApplicationPanelHeader';
import { applicationDocumentTypes, requiredDocs } from '@/features/child-application/applicationForm';
import { stepCardClassName } from '@/features/child-application/applicationStyles';
import { DocumentUploadTile } from '@/features/child-application/DocumentUploadTile';

import type { EnrollmentFiles } from './childEnrollment';

const MAX_FILE_BYTES = 10 * 1024 * 1024;

/**
 * The application's documents (the same required ones) and the child's photo, attached here and
 * uploaded with the save. Each tile shows whether its file is attached; a file can be replaced or removed.
 */
export function EnrollmentDocumentsStep({ title, files, onChange }: {
  title: string;
  files: EnrollmentFiles;
  onChange: (files: EnrollmentFiles) => void;
}) {
  const { t } = useTranslation();
  const set = (type: keyof EnrollmentFiles, file: File | null) => onChange({ ...files, [type]: file });
  const accept = (type: keyof EnrollmentFiles) => (file: File) => {
    if (file.size > MAX_FILE_BYTES) {
      toast.error(t('childEnrollment.documents.tooLarge'));
      return;
    }
    if (type === 'child_photo' && !file.type.startsWith('image/')) {
      toast.error(t('childEnrollment.documents.photoOnly'));
      return;
    }
    set(type, file);
  };

  return (
    <div className={stepCardClassName()} data-testid="enrollment-documents">
      <PanelHeader icon="upload_file" title={title} body={t('childEnrollment.documents.hint')} />
      <div className="grid gap-3 md:grid-cols-2 2xl:grid-cols-3">
        {(['child_photo', ...applicationDocumentTypes] as const).map((type) => (
          <div key={type} className="space-y-1">
            <DocumentUploadTile
              docType={type}
              required={(requiredDocs as readonly string[]).includes(type)}
              uploaded={Boolean(files[type])}
              disabled={false}
              canUploadDocuments
              canRemoveDocuments
              onFile={accept(type)}
              onRemove={() => set(type, null)}
            />
            {files[type] ? <p className="truncate px-1 text-xs text-on-surface-variant" dir="ltr">{files[type]?.name}</p> : null}
          </div>
        ))}
      </div>
    </div>
  );
}
