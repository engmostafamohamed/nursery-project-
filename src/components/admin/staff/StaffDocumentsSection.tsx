import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { MaterialSymbol } from '@/components/ui/MaterialSymbol';
import { supabase } from '@/lib/supabase';

export type StaffDocMeta = {
  id: string;
  label_ar: string;
  label_en: string;
  path: string;
  created_at: string;
};

type Props = {
  nurseryId: string;
  staffProfileId: string;
  documents: unknown;
};

function parseDocs(raw: unknown): StaffDocMeta[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((x) => x as Record<string, unknown>)
    .filter((x) => typeof x.path === 'string' && typeof x.id === 'string')
    .map((x) => ({
      id: String(x.id),
      label_ar: String(x.label_ar ?? ''),
      label_en: String(x.label_en ?? ''),
      path: String(x.path),
      created_at: String(x.created_at ?? ''),
    }));
}

export function StaffDocumentsSection({ nurseryId, staffProfileId, documents: rawDocs }: Props) {
  const { t, i18n } = useTranslation();
  const qc = useQueryClient();
  const documents: StaffDocMeta[] = parseDocs(rawDocs);
  const [labelAr, setLabelAr] = useState('');
  const [labelEn, setLabelEn] = useState('');
  const [removeId, setRemoveId] = useState<string | null>(null);

  const upload = useMutation({
    mutationFn: async (file: File) => {
      if (!labelAr.trim() || !labelEn.trim()) {
        throw new Error('labels');
      }
      if (file.size > 10 * 1024 * 1024) throw new Error('size');
      const docId = crypto.randomUUID();
      const ext = file.name.split('.').pop() ?? 'bin';
      const path = `${nurseryId}/${staffProfileId}/${docId}.${ext}`;
      const up = await supabase.storage.from('staff-documents').upload(path, file, {
        contentType: file.type || 'application/octet-stream',
        upsert: false,
      });
      if (up.error) throw up.error;
      const doc: StaffDocMeta = {
        id: docId,
        label_ar: labelAr.trim(),
        label_en: labelEn.trim(),
        path,
        created_at: new Date().toISOString(),
      };
      const next = [...documents, doc];
      const res = await supabase
        .from('staff_profiles')
        .update({ documents_json: next } as never)
        .eq('id', staffProfileId);
      if (res.error) throw res.error;
      return doc;
    },
    onSuccess: () => {
      setLabelAr('');
      setLabelEn('');
      void qc.invalidateQueries({ queryKey: ['staff-profiles'] });
      toast.success(`${t('staff.documents.uploaded')}\n${t('staff.documents.uploadedAr')}`);
    },
    onError: (e) => {
      if (e instanceof Error && e.message === 'labels') {
        toast.error(`${t('staff.documents.labelsRequired')}\n${t('staff.documents.labelsRequiredAr')}`);
        return;
      }
      if (e instanceof Error && e.message === 'size') {
        toast.error(`${t('staff.documents.tooLarge')}\n${t('staff.documents.tooLargeAr')}`);
        return;
      }
      toast.error(`${t('staff.documents.uploadFailed')}\n${t('staff.documents.uploadFailedAr')}`);
    },
  });

  const removeDoc = useMutation({
    mutationFn: async (id: string) => {
      const doc = documents.find((d) => d.id === id);
      if (!doc) return;
      await supabase.storage.from('staff-documents').remove([doc.path]);
      const next = documents.filter((d) => d.id !== id);
      const res = await supabase
        .from('staff_profiles')
        .update({ documents_json: next } as never)
        .eq('id', staffProfileId);
      if (res.error) throw res.error;
    },
    onSuccess: () => {
      setRemoveId(null);
      void qc.invalidateQueries({ queryKey: ['staff-profiles'] });
      toast.success(`${t('staff.documents.removed')}\n${t('staff.documents.removedAr')}`);
    },
    onError: () => {
      toast.error(`${t('staff.documents.removeFailed')}\n${t('staff.documents.removeFailedAr')}`);
    },
  });

  const openDoc = async (path: string) => {
    const signed = await supabase.storage.from('staff-documents').createSignedUrl(path, 3600);
    if (signed.error || !signed.data?.signedUrl) {
      toast.error(`${t('staff.documents.openFailed')}\n${t('staff.documents.openFailedAr')}`);
      return;
    }
    window.open(signed.data.signedUrl, '_blank', 'noopener,noreferrer');
  };

  return (
    <div className="space-y-4">
      <div className="grid gap-3 rounded-2xl border border-outline-variant bg-surface-container-lowest p-4 md:grid-cols-2">
        <div className="space-y-1">
          <Label>{t('staff.documents.labelAr')}</Label>
          <Input value={labelAr} onChange={(e) => setLabelAr(e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label>{t('staff.documents.labelEn')}</Label>
          <Input value={labelEn} onChange={(e) => setLabelEn(e.target.value)} />
        </div>
        <div className="md:col-span-2">
          <Input
            type="file"
            accept="image/jpeg,image/png,image/webp,application/pdf"
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = '';
              if (f) void upload.mutateAsync(f);
            }}
          />
          <p className="mt-1 text-xs text-on-surface-variant">{t('staff.documents.hint')}</p>
        </div>
      </div>

      <ul className="space-y-2">
        {documents.map((d) => (
          <li
            key={d.id}
            className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-outline-variant bg-surface-container-lowest px-3 py-2"
          >
            <span className="text-sm">
              {i18n.language?.startsWith('ar') ? d.label_ar || d.label_en : d.label_en || d.label_ar}
            </span>
            <div className="flex gap-2">
              <Button type="button" variant="outline" size="sm" className="gap-1" onClick={() => void openDoc(d.path)}>
                <MaterialSymbol name="open_in_new" size="text-base" />
                {t('staff.documents.open')}
              </Button>
              <Button type="button" variant="outline" size="sm" onClick={() => setRemoveId(d.id)}>
                {t('staff.documents.remove')}
              </Button>
            </div>
          </li>
        ))}
      </ul>

      <Dialog open={Boolean(removeId)} onOpenChange={() => setRemoveId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('staff.documents.deleteTitle')}</DialogTitle>
            <DialogDescription>{t('staff.documents.deleteDescription')}</DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button type="button" variant="outline" onClick={() => setRemoveId(null)}>
              {t('common.cancel')}
            </Button>
            <Button type="button" variant="destructive" onClick={() => removeId && void removeDoc.mutateAsync(removeId)}>
              {t('staff.documents.remove')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
