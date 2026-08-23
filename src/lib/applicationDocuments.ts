import { supabase } from '@/lib/supabase';

function ext(filename: string) {
  const parts = filename.split('.');
  return parts.length > 1 ? parts.at(-1) ?? 'bin' : 'bin';
}

export async function uploadApplicationDocument(params: {
  nurseryId: string;
  applicationId: string;
  documentType: 'birth_certificate' | 'vaccination_card' | 'parent_id' | 'proof_of_address' | 'medical_report' | 'other';
  file: File;
}) {
  const safeName = `${params.documentType}_${Date.now()}.${ext(params.file.name)}`;
  const path = `${params.nurseryId}/${params.applicationId}/${safeName}`;
  const res = await supabase.storage.from('application-documents').upload(path, params.file, {
    upsert: true,
  });
  if (res.error) throw res.error;
  return path;
}

export async function createApplicationDocumentSignedUrl(path: string, expires = 3600) {
  const res = await supabase.storage.from('application-documents').createSignedUrl(path, expires);
  if (res.error) throw res.error;
  return res.data.signedUrl;
}
