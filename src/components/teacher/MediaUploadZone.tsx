import { Upload } from 'lucide-react';
import { useRef } from 'react';
import { useTranslation } from 'react-i18next';

import { Button } from '@/components/ui/button';

interface Props {
  onFilesSelected: (files: File[]) => void;
}

export function MediaUploadZone({ onFilesSelected }: Props) {
  const { t } = useTranslation();
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const pickFiles = () => fileInputRef.current?.click();

  return (
    <div
      className="rounded-2xl border-2 border-dashed border-outline-variant bg-surface-container-lowest p-6 text-center"
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault();
        const files = Array.from(e.dataTransfer.files);
        onFilesSelected(files);
      }}
    >
      <Upload className="mx-auto mb-2 h-8 w-8 text-on-surface-variant" />
      <p className="text-sm text-on-surface">{t('media.upload.dragDrop')}</p>
      <p className="mt-1 text-xs text-on-surface-variant">{t('media.upload.fileRules')}</p>
      <Button className="mt-3" variant="outline" type="button" onClick={pickFiles}>
        {t('media.upload.browse')}
      </Button>
      <input
        ref={fileInputRef}
        type="file"
        multiple
        className="hidden"
        accept=".jpg,.jpeg,.png,.heic,.mp4,.mov"
        onChange={(e) => onFilesSelected(Array.from(e.target.files ?? []))}
      />
    </div>
  );
}
