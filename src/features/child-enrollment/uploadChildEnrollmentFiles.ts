import { compressImageForUpload } from '@/lib/imageCompression';
import { supabase } from '@/lib/supabase';

import type { ChildEnrollmentFileBundle } from './childEnrollmentFiles';

function extFromFile(file: File): string {
  const n = file.name.toLowerCase();
  if (n.endsWith('.png')) return 'png';
  if (n.endsWith('.webp')) return 'webp';
  if (n.endsWith('.pdf')) return 'pdf';
  return 'jpg';
}

export type UploadedPaths = {
  avatarPublicUrl: string | null;
  birthCertPath: string | null;
  marriageCertPath: string | null;
  courtOrderPath: string | null;
  vaccinationCardPath: string | null;
  pickupPhotoPaths: (string | null)[];
};

export async function uploadChildEnrollmentFiles(
  nurseryId: string,
  sessionId: string,
  files: ChildEnrollmentFileBundle,
): Promise<UploadedPaths> {
  const pickupPhotoPaths: (string | null)[] = [];

  let avatarPublicUrl: string | null = null;
  if (files.childPhoto) {
    const compressed = await compressImageForUpload(files.childPhoto);
    const path = `${nurseryId}/enrollment/${sessionId}/avatar.${extFromFile(compressed)}`;
    const { error } = await supabase.storage.from('child-avatars').upload(path, compressed, { upsert: true });
    if (!error) {
      const { data } = supabase.storage.from('child-avatars').getPublicUrl(path);
      avatarPublicUrl = data.publicUrl;
    }
  }

  async function uploadDoc(bucket: 'child-documents', file: File | null, name: string): Promise<string | null> {
    if (!file) return null;
    const path = `${nurseryId}/enrollment/${sessionId}/${name}.${extFromFile(file)}`;
    const { error } = await supabase.storage.from(bucket).upload(path, file, { upsert: true });
    return error ? null : path;
  }

  const birthCertPath = await uploadDoc('child-documents', files.birthCertificate, 'birth-cert');
  const marriageCertPath = await uploadDoc('child-documents', files.marriageCertificate, 'marriage-cert');
  const courtOrderPath = await uploadDoc('child-documents', files.courtOrder, 'court-order');
  const vaccinationCardPath = await uploadDoc('child-documents', files.vaccinationCard, 'vaccination-card');

  for (let i = 0; i < files.pickupPhotos.length; i++) {
    const f = files.pickupPhotos[i];
    if (!f) {
      pickupPhotoPaths.push(null);
      continue;
    }
    const compressed = await compressImageForUpload(f);
    const path = `${nurseryId}/enrollment/${sessionId}/pickup-${i}.${extFromFile(compressed)}`;
    const { error } = await supabase.storage.from('authorized-pickup-photos').upload(path, compressed, { upsert: true });
    pickupPhotoPaths.push(error ? null : path);
  }

  return {
    avatarPublicUrl,
    birthCertPath,
    marriageCertPath,
    courtOrderPath,
    vaccinationCardPath,
    pickupPhotoPaths,
  };
}
