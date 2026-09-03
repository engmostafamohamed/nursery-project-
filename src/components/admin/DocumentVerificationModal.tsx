import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
  createApplicationDocumentSignedUrl,
  isApplicationDocumentImage,
  isApplicationDocumentPdf,
} from '@/lib/applicationDocuments';

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  document: Record<string, unknown> | null;
  onVerify: (payload: { id: string; verified: boolean; notes: string }) => Promise<void>;
};

export function DocumentVerificationModal({ open, onOpenChange, document, onVerify }: Props) {
  const { t } = useTranslation();
  const [preview, setPreview] = useState<{ path: string; url: string } | null>(null);
  const [notesDraft, setNotesDraft] = useState<{ documentId: string; notes: string } | null>(null);
  const documentId = String(document?.id ?? '');
  const path = String(document?.file_url ?? '');
  const url = preview?.path === path ? preview.url : '';
  const notes = notesDraft?.documentId === documentId ? notesDraft.notes : String(document?.notes ?? '');
  const isImage = isApplicationDocumentImage(path);
  const isPdf = isApplicationDocumentPdf(path);

  useEffect(() => {
    if (!open || !document || !path) return;
    let cancelled = false;
    void createApplicationDocumentSignedUrl(path).then((signedUrl) => {
      if (!cancelled) setPreview({ path, url: signedUrl });
    });
    return () => {
      cancelled = true;
    };
  }, [document, open, path]);

  if (!document) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader><DialogTitle>{t('applications.verifyDocument')}</DialogTitle></DialogHeader>
        <div className="space-y-2">
          <p className="text-sm">{t(`applications.documentTypes.${String(document.document_type ?? 'other')}`)}</p>
          <div className="flex gap-2">
            {url ? <a className="text-xs text-secondary underline" href={url} target="_blank" rel="noreferrer">{t('applications.openInNewTab')}</a> : null}
          </div>
          <div className="min-h-[280px] overflow-hidden rounded-lg border border-outline-variant bg-surface-container">
            {isImage && url ? (
              <img src={url} alt="" className="max-h-[480px] w-full object-contain" />
            ) : isPdf && url ? (
              <iframe title={t('applications.preview')} src={url} className="h-[480px] w-full" />
            ) : (
              <div className="flex min-h-[280px] items-center justify-center text-sm text-on-surface-variant">
                {t('applications.previewUnavailable')}
              </div>
            )}
          </div>
          <textarea
            className="min-h-[80px] w-full rounded-lg border border-outline-variant p-2 text-sm"
            value={notes}
            onChange={(e) => setNotesDraft({ documentId, notes: e.target.value })}
          />
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => void onVerify({ id: String(document.id), verified: false, notes })}>{t('applications.markUnverified')}</Button>
          <Button onClick={() => void onVerify({ id: String(document.id), verified: true, notes })}>{t('applications.markVerified')}</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
