import { useEffect, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

import { Button } from '@/components/ui/button';
import { MaterialSymbol } from '@/components/ui/MaterialSymbol';
import {
  applicationDocumentFileName,
  createApplicationDocumentSignedUrl,
  isApplicationDocumentImage,
  isApplicationDocumentPdf,
} from '@/lib/applicationDocuments';

type Props = {
  document: Record<string, unknown>;
  actions?: ReactNode;
};

export function ApplicationDocumentPreview({ document, actions }: Props) {
  const { t } = useTranslation();
  const [preview, setPreview] = useState<{ path: string; url: string; failed: boolean } | null>(null);
  const path = String(document.file_url ?? '');
  const url = preview?.path === path ? preview.url : '';
  const failed = preview?.path === path ? preview.failed : false;
  const fileName = applicationDocumentFileName(path);
  const isImage = isApplicationDocumentImage(path);
  const isPdf = isApplicationDocumentPdf(path);
  const verified = Boolean(document.verified);

  useEffect(() => {
    let cancelled = false;
    if (!path) return;
    void createApplicationDocumentSignedUrl(path)
      .then((signedUrl) => {
        if (!cancelled) setPreview({ path, url: signedUrl, failed: false });
      })
      .catch(() => {
        if (!cancelled) setPreview({ path, url: '', failed: true });
      });
    return () => {
      cancelled = true;
    };
  }, [path]);

  return (
    <article className="flex flex-wrap items-center gap-3 rounded-lg border border-outline-variant bg-surface p-2 text-sm text-foreground">
      <div className="flex h-20 w-28 shrink-0 items-center justify-center overflow-hidden rounded-md border border-outline-variant bg-surface-container">
        {isImage && url ? (
          <img src={url} alt="" className="h-full w-full object-cover" />
        ) : (
          <MaterialSymbol name={isPdf ? 'picture_as_pdf' : failed ? 'broken_image' : 'description'} size="text-3xl" />
        )}
      </div>
      <div className="min-w-0 flex-1">
        <p className="font-medium text-on-surface">{t(`applications.documentTypes.${String(document.document_type ?? 'other')}`)}</p>
        <p className="truncate text-xs text-on-surface-variant">{fileName}</p>
        <p className="text-xs text-on-surface-variant">{verified ? t('applications.verified') : t('applications.notVerified')}</p>
        {failed ? <p className="text-xs text-error">{t('applications.previewUnavailable')}</p> : null}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {url ? (
          <Button asChild size="sm" variant="outline">
            <a href={url} target="_blank" rel="noreferrer">{t('applications.openInNewTab')}</a>
          </Button>
        ) : null}
        {actions}
      </div>
    </article>
  );
}
