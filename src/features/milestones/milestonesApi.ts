import type { MilestoneCategory } from '@/hooks/useMilestones';
import { errorTextKey } from '@/lib/errorCode';
import { compressImageForUpload } from '@/lib/imageCompression';
import { supabase } from '@/lib/supabase';

/** What the record form sends. A new photo is a path in the child's milestones folder. */
export type MilestoneDraft = {
  childId: string;
  category: MilestoneCategory;
  milestoneText: string;
  achievedAt: string;
  notes: string;
  photoPath: string | null;
  sharedWithParent: boolean;
};

/** Records a milestone (no id) or changes one; the server tells the family when it is first shared. */
export async function saveMilestone(id: string | null, draft: MilestoneDraft): Promise<string> {
  const { data, error } = await supabase.rpc('milestone_save' as never, {
    p_milestone_id: id,
    p_milestone: {
      child_id: draft.childId,
      category: draft.category,
      milestone_text: draft.milestoneText,
      achieved_at: draft.achievedAt,
      notes: draft.notes,
      photo_path: draft.photoPath,
      shared_with_parent: draft.sharedWithParent,
    },
  } as never);
  if (error) throw error;
  return data as unknown as string;
}

/** Sets a milestone aside (kept, hidden from the staff and the family). */
export async function removeMilestone(id: string): Promise<void> {
  const { error } = await supabase.rpc('milestone_remove' as never, { p_milestone_id: id } as never);
  if (error) throw error;
}

/** Uploads a milestone photo to the child's folder in the media bucket; returns its path. */
export async function uploadMilestonePhoto(nurseryId: string, childId: string, file: File): Promise<string> {
  const photo = await compressImageForUpload(file, 1);
  const ext = photo.type === 'image/png' ? 'png' : photo.type === 'image/webp' ? 'webp' : 'jpg';
  const path = `${nurseryId}/milestones/${childId}/${Date.now()}.${ext}`;
  const { error } = await supabase.storage.from('media').upload(path, photo, { contentType: photo.type || 'image/jpeg' });
  if (error) throw error;
  return path;
}

/** A photo to show: an old pasted link as it is, an uploaded one through a signed link. */
export async function milestonePhotoUrl(photo: string): Promise<string> {
  if (/^https?:\/\//i.test(photo)) return photo;
  const { data, error } = await supabase.storage.from('media').createSignedUrl(photo, 3600);
  if (error) throw error;
  return data.signedUrl;
}

/** Why the server refused. */
export const MILESTONE_ERROR_CODES = [
  'milestone_forbidden',
  'milestone_not_found',
  'milestone_child_required',
  'milestone_text_required',
  'milestone_too_long',
  'milestone_category_invalid',
  'milestone_date_invalid',
  'milestone_photo_invalid',
] as const;

export const milestoneErrorKey = (error: unknown): string => errorTextKey(error, MILESTONE_ERROR_CODES, 'milestones.errors', 'milestone_');
