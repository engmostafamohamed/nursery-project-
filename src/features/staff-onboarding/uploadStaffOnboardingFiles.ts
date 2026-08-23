import type { TFunction } from 'i18next';
import { toast } from 'sonner';

import { supabase } from '@/lib/supabase';

import type { StaffOnboardingFileBundle } from './staffOnboardingFiles';

function extFromFile(file: File): string {
  const n = file.name.toLowerCase();
  if (n.endsWith('.png')) return 'png';
  if (n.endsWith('.webp')) return 'webp';
  if (n.endsWith('.pdf')) return 'pdf';
  return 'jpg';
}

export type StaffUploadedDocumentPaths = {
  nationalIdPath: string | null;
  educationPath: string | null;
  criminalPath: string | null;
  medicalPath: string | null;
  profilePhotoPath: string | null;
};

export async function uploadStaffOnboardingFiles(
  nurseryId: string,
  staffProfileId: string,
  files: StaffOnboardingFileBundle,
  t: TFunction,
): Promise<StaffUploadedDocumentPaths> {
  const base = `${nurseryId}/staff/${staffProfileId}`;

  async function up(
    bucket: 'staff-documents' | 'staff-photos',
    file: File | null,
    name: string,
  ): Promise<string | null> {
    if (!file) return null;
    const path = `${base}/${name}.${extFromFile(file)}`;
    const { error } = await supabase.storage.from(bucket).upload(path, file, { upsert: true });
    if (error) {
      console.error('Upload failed:', error);
      toast.error(t('staffOnboarding.uploadFailed', { message: error.message }));
      return null;
    }
    return path;
  }

  const nationalIdPath = await up('staff-documents', files.nationalIdDoc, 'national-id');
  const educationPath = await up('staff-documents', files.educationCerts, 'education');
  const criminalPath = await up('staff-documents', files.criminalCheck, 'criminal');
  const medicalPath = await up('staff-documents', files.medicalCert, 'medical');

  let profilePhotoPath: string | null = null;
  if (files.profilePhoto) {
    const path = `${base}/profile.${extFromFile(files.profilePhoto)}`;
    const { error } = await supabase.storage.from('staff-photos').upload(path, files.profilePhoto, { upsert: true });
    if (error) {
      console.error('Upload failed:', error);
      toast.error(t('staffOnboarding.uploadFailed', { message: error.message }));
    } else {
      profilePhotoPath = path;
    }
  }

  return {
    nationalIdPath,
    educationPath,
    criminalPath,
    medicalPath,
    profilePhotoPath,
  };
}
