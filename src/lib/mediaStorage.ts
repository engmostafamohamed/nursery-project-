import { supabase } from '@/lib/supabase';

export const MAX_FILES_PER_BATCH = 10;
export const PHOTO_MAX_BYTES = 10 * 1024 * 1024;
export const VIDEO_MAX_BYTES = 100 * 1024 * 1024;

const PHOTO_EXTENSIONS = ['jpg', 'jpeg', 'png', 'heic'];
const VIDEO_EXTENSIONS = ['mp4', 'mov'];

export type MediaKind = 'photo' | 'video';

export type FileValidationResult = {
  ok: boolean;
  message?: string;
  kind?: MediaKind;
};

function extensionOf(fileName: string) {
  const parts = fileName.toLowerCase().split('.');
  return parts.length > 1 ? parts[parts.length - 1] : '';
}

export function validateMediaFile(file: File): FileValidationResult {
  const ext = extensionOf(file.name);
  if (PHOTO_EXTENSIONS.includes(ext)) {
    if (file.size > PHOTO_MAX_BYTES) return { ok: false, message: 'media.validation.photoTooLarge' };
    return { ok: true, kind: 'photo' };
  }
  if (VIDEO_EXTENSIONS.includes(ext)) {
    if (file.size > VIDEO_MAX_BYTES) return { ok: false, message: 'media.validation.videoTooLarge' };
    return { ok: true, kind: 'video' };
  }
  return { ok: false, message: 'media.validation.invalidType' };
}

export function buildMediaPath(nurseryId: string, fileName: string, date = new Date()) {
  const year = String(date.getFullYear());
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const safeName = fileName.replace(/\s+/g, '-');
  return `${nurseryId}/${year}/${month}/${Date.now()}-${safeName}`;
}

export async function uploadMediaFile(params: {
  nurseryId: string;
  file: File;
}) {
  const path = buildMediaPath(params.nurseryId, params.file.name);
  const uploadRes = await supabase.storage.from('media').upload(path, params.file);
  if (uploadRes.error) throw uploadRes.error;
  return {
    storagePath: path,
    publicUrl: uploadRes.data.path,
  };
}

export async function createMediaSignedUrl(path: string) {
  const res = await supabase.storage.from('media').createSignedUrl(path, 60 * 60);
  if (res.error) throw res.error;
  return res.data.signedUrl;
}
