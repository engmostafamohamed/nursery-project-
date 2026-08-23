import { useMemo, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';

import { uploadMediaFile, validateMediaFile, MAX_FILES_PER_BATCH } from '@/lib/mediaStorage';
import { supabase } from '@/lib/supabase';

export type TeacherUploadVisibility = 'all_class' | 'tagged_only';

export type MediaUploadMetadata = {
  capturedAt: string;
  classId: string;
  childIds: string[];
  activityType: string | null;
  caption: string;
  visibility: TeacherUploadVisibility;
  consentConfirmed: boolean;
};

type TeacherClass = { id: string; name_ar: string; name_en: string };
type ChildOption = { id: string; full_name_ar: string; full_name_en: string; photo_privacy_restricted: boolean; class_id: string | null };

export type MediaUploadMode = 'teacher' | 'admin';

export function useMediaUpload(params: { userId?: string; nurseryId?: string; mode?: MediaUploadMode }) {
  const mode: MediaUploadMode = params.mode ?? 'teacher';
  const [progressByFile, setProgressByFile] = useState<Record<string, number>>({});

  const classesQuery = useQuery({
    queryKey: ['media-upload-classes', mode, params.userId, params.nurseryId],
    queryFn: async (): Promise<TeacherClass[]> => {
      if (!params.userId || !params.nurseryId) return [];
      // Admins post directly without going through the approval queue and need
      // access to every class in the nursery, not just classes they staff.
      if (mode === 'admin') {
        const res = await supabase
          .from('classes')
          .select('id, name_ar, name_en')
          .eq('nursery_id', params.nurseryId)
          .order('name_en', { ascending: true });
        if (res.error) throw res.error;
        return (res.data ?? []) as TeacherClass[];
      }
      const staffRes = await supabase
        .from('class_staff')
        .select('class_id')
        .eq('user_id', params.userId);
      if (staffRes.error) throw staffRes.error;
      const classIds = Array.from(
        new Set(((staffRes.data ?? []) as { class_id: string }[]).map((r) => r.class_id)),
      );
      if (!classIds.length) return [];
      const res = await supabase
        .from('classes')
        .select('id, name_ar, name_en')
        .eq('nursery_id', params.nurseryId)
        .in('id', classIds);
      if (res.error) throw res.error;
      return (res.data ?? []) as TeacherClass[];
    },
    enabled: Boolean(params.userId && params.nurseryId),
  });

  const childrenQuery = useQuery({
    queryKey: ['teacher-media-children', classesQuery.data],
    queryFn: async (): Promise<ChildOption[]> => {
      const classIds = (classesQuery.data ?? []).map((c) => c.id);
      if (!classIds.length) return [];
      const res = await supabase
        .from('children')
        .select('id, full_name_ar, full_name_en, photo_privacy_restricted, class_id')
        .in('class_id', classIds)
        .eq('status', 'active');
      if (res.error) throw res.error;
      return (res.data ?? []) as ChildOption[];
    },
    enabled: Boolean(classesQuery.data?.length),
  });

  const privacyRestrictedCount = useMemo(
    () => (childrenQuery.data ?? []).filter((c) => c.photo_privacy_restricted).length,
    [childrenQuery.data],
  );
  const restrictedChildIdSet = useMemo(
    () => new Set((childrenQuery.data ?? []).filter((c) => c.photo_privacy_restricted).map((c) => c.id)),
    [childrenQuery.data],
  );

  const uploadMutation = useMutation({
    mutationFn: async (args: { files: File[]; metadata: MediaUploadMetadata }) => {
      if (!params.userId || !params.nurseryId) throw new Error('Missing user/nursery');
      if (args.files.length === 0) throw new Error('No files selected');
      if (args.files.length > MAX_FILES_PER_BATCH) throw new Error('Too many files');
      if (!args.metadata.classId) throw new Error('Class required');
      const hasRestrictedTaggedChild = args.metadata.childIds.some((id) => restrictedChildIdSet.has(id));
      if (hasRestrictedTaggedChild && !args.metadata.consentConfirmed) {
        throw new Error('Consent confirmation required');
      }

      const invalid = args.files.map(validateMediaFile).find((r) => !r.ok);
      if (invalid) throw new Error(invalid.message ?? 'Invalid file');

      const uploadedMediaIds: string[] = [];
      for (const file of args.files) {
        setProgressByFile((prev) => ({ ...prev, [file.name]: 10 }));
        const result = validateMediaFile(file);
        if (!result.ok || !result.kind) throw new Error(result.message ?? 'Invalid file');
        const upload = await uploadMediaFile({ nurseryId: params.nurseryId, file });
        setProgressByFile((prev) => ({ ...prev, [file.name]: 70 }));

        const isAdmin = mode === 'admin';
        const insertRes = await supabase
          .from('media')
          .insert({
            nursery_id: params.nurseryId,
            uploaded_by: params.userId,
            file_url: upload.storagePath,
            thumbnail_url: result.kind === 'photo' ? upload.storagePath : null,
            file_type: result.kind,
            captured_at: args.metadata.capturedAt,
            // Admin uploads bypass the approval queue (admins are the approvers).
            status: isAdmin ? 'approved' : 'pending_approval',
            approved_by: isAdmin ? params.userId : null,
            approved_at: isAdmin ? new Date().toISOString() : null,
            class_id: args.metadata.classId,
            activity_type: args.metadata.activityType,
            caption: args.metadata.caption || null,
            visibility: args.metadata.visibility,
          } as never)
          .select('id')
          .single();
        if (insertRes.error) throw insertRes.error;
        const mediaId = (insertRes.data as { id: string }).id;
        uploadedMediaIds.push(mediaId);

        if (args.metadata.childIds.length) {
          const tags = args.metadata.childIds.map((childId) => ({ media_id: mediaId, child_id: childId }));
          const tagRes = await supabase.from('media_children').insert(tags as never);
          if (tagRes.error) throw tagRes.error;
        }
        setProgressByFile((prev) => ({ ...prev, [file.name]: 100 }));
      }

      // Only notify admins for teacher uploads that need approval; admin uploads
      // are auto-approved so there's nothing to queue.
      if (mode === 'teacher') {
        const adminUsers = await supabase
          .from('users')
          .select('id')
          .eq('nursery_id', params.nurseryId)
          .in('role', ['branch_admin', 'chain_super_admin']);
        if (!adminUsers.error) {
          const notifications = ((adminUsers.data ?? []) as { id: string }[]).map((admin) => ({
            nursery_id: params.nurseryId,
            user_id: admin.id,
            type: 'media_pending_approval',
            title_ar: 'وسائط جديدة تحتاج موافقة',
            title_en: 'New media uploaded - needs approval',
            body_ar: `تم رفع ${args.files.length} ملف جديد ويحتاج مراجعة.`,
            body_en: `${args.files.length} new media file(s) uploaded and awaiting approval.`,
            channel: 'push',
            read: false,
            sent_at: new Date().toISOString(),
          }));
          if (notifications.length) await supabase.from('notifications').insert(notifications as never);
        }
      }

      return uploadedMediaIds;
    },
  });

  return {
    classes: classesQuery.data ?? [],
    children: childrenQuery.data ?? [],
    privacyRestrictedCount,
    isLoadingMeta: classesQuery.isLoading || childrenQuery.isLoading,
    progressByFile,
    uploadBatch: uploadMutation.mutateAsync,
    isUploading: uploadMutation.isPending,
  };
}
