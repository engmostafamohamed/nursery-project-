import { supabase } from '@/lib/supabase';

const KNOWN_DOCUMENT_BUCKETS = new Set(['application-documents', 'child-documents']);

function ext(filename: string) {
  const parts = filename.split('.');
  return parts.length > 1 ? parts.at(-1) ?? 'bin' : 'bin';
}

export function applicationDocumentFileName(path: string) {
  const cleanPath = path.includes(':') ? path.split(':').slice(1).join(':') : path;
  return cleanPath.split('/').at(-1) || path;
}

export function isApplicationDocumentImage(path: string) {
  return /\.(avif|gif|jpe?g|png|webp)$/i.test(applicationDocumentFileName(path));
}

export function isApplicationDocumentPdf(path: string) {
  return /\.pdf$/i.test(applicationDocumentFileName(path));
}

function parseDocumentStoragePath(path: string) {
  const [maybeBucket, ...rest] = path.split(':');
  if (rest.length > 0 && KNOWN_DOCUMENT_BUCKETS.has(maybeBucket)) {
    return { bucket: maybeBucket, path: rest.join(':') };
  }
  return { bucket: 'application-documents', path };
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
    contentType: params.file.type || undefined,
    upsert: true,
  });
  if (res.error) throw res.error;
  return path;
}

export async function createApplicationDocumentSignedUrl(path: string, expires = 3600) {
  const parsed = parseDocumentStoragePath(path);
  const res = await supabase.storage.from(parsed.bucket).createSignedUrl(parsed.path, expires);
  if (res.error) throw res.error;
  return res.data.signedUrl;
}
