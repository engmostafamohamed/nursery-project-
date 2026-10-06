import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { notifyNurseryAdmins } from '@/lib/healthNotifications';
import { supabase } from '@/lib/supabase';
import type { ChildHealthDocumentsRow } from '@/types/tables/child_health';

const MAX_BYTES = 10 * 1024 * 1024;
const ALLOWED = new Set(['image/jpeg', 'image/png', 'image/webp', 'application/pdf']);

function validateHealthDoc(file: File): { ok: true } | { ok: false; message: string } {
  if (file.size > MAX_BYTES) return { ok: false, message: 'File too large (max 10MB).' };
  if (!ALLOWED.has(file.type)) return { ok: false, message: 'Only JPEG, PNG, WebP, or PDF allowed.' };
  return { ok: true };
}

function extFromFile(file: File): string {
  const n = file.name.toLowerCase();
  if (n.endsWith('.png')) return 'png';
  if (n.endsWith('.webp')) return 'webp';
  if (n.endsWith('.pdf')) return 'pdf';
  return 'jpg';
}

export function useChildHealthDocumentsList(childId: string | undefined) {
  return useQuery({
    queryKey: ['child-health-documents', childId],
    queryFn: async (): Promise<ChildHealthDocumentsRow[]> => {
      if (!childId) return [];
      const res = await supabase
        .from('child_health_documents')
        .select('*')
        .eq('child_id', childId)
        .order('created_at', { ascending: false });
      if (res.error) throw res.error;
      return (res.data ?? []) as ChildHealthDocumentsRow[];
    },
    enabled: Boolean(childId),
  });
}

export function useRequestHealthUpdate() {
  return useMutation({
    mutationFn: async (args: { childId: string; nurseryId: string; notes: string }) => {
      const session = await supabase.auth.getSession();
      const uid = session.data.session?.user?.id;
      if (!uid) throw new Error('Not signed in');
      const { error } = await supabase.from('child_health_update_requests').insert({
        child_id: args.childId,
        nursery_id: args.nurseryId,
        parent_id: uid,
        notes: args.notes,
        status: 'pending',
      } as never);
      if (error) throw error;
      await notifyNurseryAdmins({
        nurseryId: args.nurseryId,
        type: 'child_health_update_request',
        actionLink: `/admin/children/${args.childId}/health`,
      });
    },
  });
}

export function useUploadChildHealthDocument() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: {
      childId: string;
      nurseryId: string;
      file: File;
      labelAr: string;
      labelEn: string;
    }) => {
      const v = validateHealthDoc(args.file);
      if (!v.ok) throw new Error(v.message);
      const session = await supabase.auth.getSession();
      const uid = session.data.session?.user?.id;
      if (!uid) throw new Error('Not signed in');

      const path = `${args.nurseryId}/health/${args.childId}/${crypto.randomUUID()}.${extFromFile(args.file)}`;
      const up = await supabase.storage.from('child-documents').upload(path, args.file, { upsert: false });
      if (up.error) throw up.error;

      const ins = await supabase
        .from('child_health_documents')
        .insert({
          child_id: args.childId,
          nursery_id: args.nurseryId,
          storage_path: path,
          label_ar: args.labelAr,
          label_en: args.labelEn,
          uploaded_by: uid,
        } as never)
        .select('*')
        .single();
      if (ins.error) throw ins.error;

      await notifyNurseryAdmins({
        nurseryId: args.nurseryId,
        type: 'child_health_document_uploaded',
        actionLink: `/admin/children/${args.childId}/health`,
      });

      return ins.data as ChildHealthDocumentsRow;
    },
    onSuccess: (_data, vars) => {
      void qc.invalidateQueries({ queryKey: ['child-health-documents', vars.childId] });
    },
  });
}

export async function getSignedUrlForHealthDocument(storagePath: string): Promise<string | null> {
  const res = await supabase.storage.from('child-documents').createSignedUrl(storagePath, 3600);
  if (res.error) return null;
  return res.data.signedUrl;
}
