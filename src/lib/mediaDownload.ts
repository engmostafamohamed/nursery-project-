import { supabase } from '@/lib/supabase';

export async function createMediaDownloadSignedUrl(filePath: string) {
  const res = await supabase.storage.from('media').createSignedUrl(filePath, 60 * 60);
  if (res.error) throw res.error;
  return res.data.signedUrl;
}

export async function createMediaShareSignedUrl(filePath: string) {
  const res = await supabase.storage.from('media').createSignedUrl(filePath, 24 * 60 * 60);
  if (res.error) throw res.error;
  return res.data.signedUrl;
}

export async function incrementMediaDownloadCount(mediaId: string, current: number) {
  const res = await supabase
    .from('media')
    .update({ download_count: current + 1 } as never)
    .eq('id', mediaId);
  if (res.error) throw res.error;
}

export async function incrementMediaViewCount(mediaId: string, current: number) {
  const res = await supabase
    .from('media')
    .update({ view_count: current + 1 } as never)
    .eq('id', mediaId);
  if (res.error) throw res.error;
}
