import { errorTextKey } from '@/lib/errorCode';
import { compressImageForUpload } from '@/lib/imageCompression';
import { supabase } from '@/lib/supabase';

import type { EnrollmentFamily, EnrollmentFiles } from './childEnrollment';

/*
 * The admin's add-child flow on the server: finding the family (enrollment_family_search), the
 * files uploaded into the child's own folder (nursery/child/…, so its photo is the family's to see
 * and a retry overwrites them), and the child saved in one go (staff_enroll_child).
 */

export async function searchFamilies(nurseryId: string, term: string): Promise<EnrollmentFamily[]> {
  const { data, error } = await supabase.rpc('enrollment_family_search' as never, { p_nursery_id: nurseryId, p_term: term } as never);
  if (error) throw error;
  return (Array.isArray(data) ? data : []) as EnrollmentFamily[];
}

const extension = (file: File) => {
  const name = file.name.toLowerCase();
  return name.endsWith('.pdf') ? 'pdf' : name.endsWith('.png') ? 'png' : name.endsWith('.webp') ? 'webp' : 'jpg';
};

/** Uploads the attached documents and photo; returns the documents' paths and the photo's address. */
export async function uploadEnrollmentFiles(nurseryId: string, childId: string, files: EnrollmentFiles) {
  const folder = `${nurseryId}/${childId}`;
  const documents: Record<string, string> = {};
  for (const [type, file] of Object.entries(files)) {
    if (!file || type === 'child_photo') continue;
    const upload = file.type.startsWith('image/') ? await compressImageForUpload(file) : file;
    const path = `${folder}/${type}.${extension(upload)}`;
    const { error } = await supabase.storage.from('child-documents').upload(path, upload, { upsert: true });
    if (error) throw error;
    documents[type] = path;
  }
  let avatarUrl: string | null = null;
  if (files.child_photo) {
    const photo = await compressImageForUpload(files.child_photo);
    const path = `${folder}/avatar.jpg`;
    const { error } = await supabase.storage.from('child-avatars').upload(path, photo, { upsert: true, contentType: photo.type || 'image/jpeg' });
    if (error) throw error;
    avatarUrl = supabase.storage.from('child-avatars').getPublicUrl(path).data.publicUrl;
  }
  return { documents, avatarUrl };
}

export async function enrollChild(args: {
  nurseryId: string;
  parentId: string;
  childId: string;
  parentInfo: Record<string, unknown>;
  childInfo: Record<string, unknown>;
  documents: Record<string, string>;
  classId: string | null;
}): Promise<string> {
  const { data, error } = await supabase.rpc('staff_enroll_child' as never, {
    p_nursery_id: args.nurseryId,
    p_parent_id: args.parentId,
    p_child_id: args.childId,
    p_parent_info: args.parentInfo,
    p_child_info: args.childInfo,
    p_documents: args.documents,
    p_class_id: args.classId,
  } as never);
  if (error) throw error;
  return String(data);
}

export const ENROLLMENT_ERROR_CODES = [
  'enrollment_forbidden',
  'enrollment_family_not_found',
  'enrollment_child_exists',
  'enrollment_class_not_found',
  'enrollment_name_required',
  'enrollment_dob_invalid',
  'enrollment_document_invalid',
] as const;

/** The text for a failed save: childEnrollment.errors.<code without enrollment_>, network or failed. */
export const enrollmentErrorKey = (error: unknown) => errorTextKey(error, ENROLLMENT_ERROR_CODES, 'childEnrollment.errors', 'enrollment_');
