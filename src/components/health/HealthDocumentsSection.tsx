import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { getSignedUrlForHealthDocument, useChildHealthDocumentsList, useUploadChildHealthDocument } from '@/hooks/useParentHealthActions';

type Props = {
  childId: string;
  nurseryId: string;
  /** Parent portal: show upload form. Admin: list only. */
  allowUpload: boolean;
};

export function HealthDocumentsSection({ childId, nurseryId, allowUpload }: Props) {
  const { t, i18n } = useTranslation();
  const { data: docs = [], isLoading } = useChildHealthDocumentsList(childId);
  const upload = useUploadChildHealthDocument();
  const [labelAr, setLabelAr] = useState('');
  const [labelEn, setLabelEn] = useState('');
  const [file, setFile] = useState<File | null>(null);

  const openDoc = async (path: string) => {
    const url = await getSignedUrlForHealthDocument(path);
    if (url) window.open(url, '_blank', 'noopener,noreferrer');
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('health.sections.documents')}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {allowUpload && (
          <form
            className="space-y-3 rounded-xl border border-outline-variant p-3"
            onSubmit={async (e) => {
              e.preventDefault();
              if (!file || !labelAr.trim() || !labelEn.trim()) return;
              try {
                await upload.mutateAsync({
                  childId,
                  nurseryId,
                  file,
                  labelAr: labelAr.trim(),
                  labelEn: labelEn.trim(),
                });
                setFile(null);
                setLabelAr('');
                setLabelEn('');
                toast.success(t('health.parent.docUploadSuccess'));
              } catch {
                toast.error(t('health.toast.error'));
              }
            }}
          >
            <p className="text-sm font-medium">{t('health.actions.uploadDocument')}</p>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="lar">{t('health.parent.docLabelAr')}</Label>
                <Input id="lar" value={labelAr} onChange={(e) => setLabelAr(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="len">{t('health.parent.docLabelEn')}</Label>
                <Input id="len" value={labelEn} onChange={(e) => setLabelEn(e.target.value)} />
              </div>
            </div>
            <Input type="file" accept="image/jpeg,image/png,image/webp,application/pdf" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
            <Button type="submit" disabled={upload.isPending || !file}>
              {t('health.actions.uploadDocument')}
            </Button>
          </form>
        )}

        {isLoading ? (
          <p className="text-sm text-on-surface-variant">{t('common.loading')}</p>
        ) : docs.length === 0 ? (
          <p className="text-sm text-on-surface-variant">{t('health.empty.documents')}</p>
        ) : (
          <ul className="space-y-2">
            {docs.map((d) => (
              <li key={d.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-outline-variant px-3 py-2 text-sm">
                <span>{i18n.language === 'ar' ? d.label_ar : d.label_en}</span>
                <Button type="button" variant="outline" size="sm" onClick={() => void openDoc(d.storage_path)}>
                  {t('health.parent.openDoc')}
                </Button>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
