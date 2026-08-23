import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { createApplicationDocumentSignedUrl } from '@/lib/applicationDocuments';

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  document: Record<string, unknown> | null;
  onVerify: (payload: { id: string; verified: boolean; notes: string }) => Promise<void>;
};

export function DocumentVerificationModal({ open, onOpenChange, document, onVerify }: Props) {
  const { t } = useTranslation();
  const [url, setUrl] = useState('');
  const [notes, setNotes] = useState(String(document?.notes ?? ''));

  if (!document) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader><DialogTitle>{t('applications.verifyDocument')}</DialogTitle></DialogHeader>
        <div className="space-y-2">
          <p className="text-sm">{t(`applications.documentTypes.${String(document.document_type ?? 'other')}`)}</p>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => void createApplicationDocumentSignedUrl(String(document.file_url)).then((u) => setUrl(u))}
            >
              {t('applications.preview')}
            </Button>
            {url ? <a className="text-xs text-secondary underline" href={url} target="_blank" rel="noreferrer">{t('applications.openInNewTab')}</a> : null}
          </div>
          <textarea className="min-h-[80px] w-full rounded-lg border border-outline-variant p-2 text-sm" value={notes} onChange={(e) => setNotes(e.target.value)} />
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => void onVerify({ id: String(document.id), verified: false, notes })}>{t('applications.markUnverified')}</Button>
          <Button onClick={() => void onVerify({ id: String(document.id), verified: true, notes })}>{t('applications.markVerified')}</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
