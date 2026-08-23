import { Film, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { Button } from '@/components/ui/button';

interface Props {
  files: File[];
  progressByFile: Record<string, number>;
  onRemove: (idx: number) => void;
}

export function MediaPreviewGrid({ files, progressByFile, onRemove }: Props) {
  const { t } = useTranslation();
  if (!files.length) return null;
  return (
    <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
      {files.map((file, idx) => {
        const isVideo = file.type.startsWith('video/');
        const preview = URL.createObjectURL(file);
        const progress = progressByFile[file.name] ?? 0;
        return (
          <div key={`${file.name}-${idx}`} className="relative rounded-xl border border-outline-variant bg-surface-container-lowest p-2">
            <div className="aspect-square overflow-hidden rounded-lg bg-surface-container">
              {isVideo ? (
                <div className="flex h-full items-center justify-center text-on-surface-variant">
                  <Film className="h-6 w-6" />
                </div>
              ) : (
                <img src={preview} alt={file.name} className="h-full w-full object-cover" loading="lazy" decoding="async" />
              )}
            </div>
            <p className="mt-1 truncate text-xs text-on-surface">{file.name}</p>
            <p className="text-[10px] text-on-surface-variant">{(file.size / 1024 / 1024).toFixed(1)} MB</p>
            {progress > 0 ? (
              <div className="mt-1 h-1.5 rounded bg-surface-container">
                <div className="h-1.5 rounded bg-secondary" style={{ width: `${progress}%` }} />
              </div>
            ) : null}
            <Button
              type="button"
              size="icon"
              variant="ghost"
              className="absolute end-1 top-1 h-7 w-7"
              onClick={() => onRemove(idx)}
              aria-label={t('media.upload.removeFile')}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        );
      })}
    </div>
  );
}
