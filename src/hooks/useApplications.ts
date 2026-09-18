import { useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { uploadApplicationDocument } from '@/lib/applicationDocuments';
import { activateEnrollment } from '@/lib/enrollmentActivation';
import { getOrCreateConversationId } from '@/lib/chat';
import { supabase } from '@/lib/supabase';

const requiredApplicationDocs = ['birth_certificate', 'vaccination_card', 'parent_id', 'proof_of_address'] as const;
const reusableApplicationDocs = ['parent_id', 'proof_of_address'] as const;

type AdminApplicationView = Record<string, unknown> & {
  parent_user: Record<string, unknown> | null;
  documents_count: number;
};

type JsonRecord = Record<string, unknown>;

function isRecord(value: unknown): value is JsonRecord {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function hasValues(value: unknown): boolean {
  return isRecord(value) && Object.values(value).some((entry) => {
    if (entry === null || entry === undefined) return false;
    if (typeof entry === 'string') return entry.trim().length > 0;
    if (Array.isArray(entry)) return entry.length > 0;
    if (typeof entry === 'object') return hasValues(entry);
    return true;
  });
}

function textFrom(record: JsonRecord, key: string) {
  const value = record[key];
  return typeof value === 'string' && value.trim() ? value.trim() : '';
}

function nextChildSeedFrom(sourceChildInfo: unknown): JsonRecord {
  const source = isRecord(sourceChildInfo) ? sourceChildInfo : {};
  const dailyCare = isRecord(source.daily_care_preferences) ? source.daily_care_preferences : undefined;
  const emergencyContacts = Array.isArray(source.emergency_contacts) ? source.emergency_contacts : undefined;
  const seed: JsonRecord = {
    has_siblings: true,
  };

  for (const key of ['nationality', 'department', 'school_preference', 'school_admissions_plan', 'academic_year', 'home_address']) {
    if (source[key] !== undefined && source[key] !== null && source[key] !== '') seed[key] = source[key];
  }

  if (dailyCare && hasValues(dailyCare)) seed.daily_care_preferences = dailyCare;
  if (emergencyContacts?.length) seed.emergency_contacts = emergencyContacts;

  const siblingAges = textFrom(source, 'sibling_ages');
  const siblingDob = textFrom(source, 'dob');
  if (siblingAges) {
    seed.sibling_ages = siblingAges;
  } else if (siblingDob) {
    seed.sibling_ages = siblingDob;
  }

  return seed;
}

export function useApplications(params: { nurseryId?: string; applicationId?: string; parentId?: string }) {
  const qc = useQueryClient();

  const adminListQuery = useQuery({
    queryKey: ['admin-applications', params.nurseryId],
    queryFn: async () => {
      if (!params.nurseryId) return [];
      const res = await supabase
        .from('applications')
        .select('*')
        .eq('nursery_id', params.nurseryId)
        .order('created_at', { ascending: false });
      if (res.error) throw res.error;
      const rows = (res.data ?? []) as Array<Record<string, unknown>>;
      const parentIds = [...new Set(rows.map((r) => String(r.parent_id ?? '')).filter(Boolean))];
      const usersRes = parentIds.length ? await supabase.from('users').select('id, name_ar, name_en').in('id', parentIds) : { data: [], error: null };
      if (usersRes.error) throw usersRes.error;
      const userMap = new Map(((usersRes.data ?? []) as Array<Record<string, unknown>>).map((u) => [String(u.id), u]));
      const counts = new Map<string, number>();
      const applicationIds = rows.map((r) => String(r.id ?? '')).filter(Boolean);
      if (applicationIds.length) {
        const docsRes = await supabase
          .from('application_documents')
          .select('id, application_id')
          .in('application_id', applicationIds);
        if (docsRes.error) throw docsRes.error;
        ((docsRes.data ?? []) as Array<Record<string, unknown>>).forEach((d) => {
          const id = String(d.application_id);
          counts.set(id, (counts.get(id) ?? 0) + 1);
        });
      }
      return rows.map((r) => ({
        ...r,
        parent_user: userMap.get(String(r.parent_id ?? '')) ?? null,
        documents_count: counts.get(String(r.id)) ?? 0,
      })) as AdminApplicationView[];
    },
    enabled: Boolean(params.nurseryId),
    // Parents submit and pay while admins have this open; always refetch on open/focus.
    staleTime: 0,
    refetchOnWindowFocus: true,
  });

  const detailQuery = useQuery({
    queryKey: ['application-detail', params.applicationId],
    queryFn: async () => {
      if (!params.applicationId) return null;
      const appRes = await supabase.from('applications').select('*').eq('id', params.applicationId).single();
      if (appRes.error) throw appRes.error;
      const app = appRes.data as Record<string, unknown>;
      const docsRes = await supabase.from('application_documents').select('*').eq('application_id', params.applicationId).order('uploaded_at', { ascending: false });
      if (docsRes.error) throw docsRes.error;
      const parentId = typeof app.parent_id === 'string' ? app.parent_id : '';
      let parentUser: Record<string, unknown> | null = null;
      if (parentId) {
        const parentRes = await supabase
          .from('users')
          .select('id, username, name_ar, name_en, email, phone')
          .eq('id', parentId)
          .maybeSingle();
        if (parentRes.error) throw parentRes.error;
        parentUser = (parentRes.data as Record<string, unknown> | null) ?? null;
      }
      return {
        application: app,
        documents: (docsRes.data ?? []) as Array<Record<string, unknown>>,
        parent_user: parentUser,
      };
    },
    enabled: Boolean(params.applicationId),
    staleTime: 0,
    refetchOnWindowFocus: true,
  });

  const parentApplicationsQuery = useQuery({
    queryKey: ['parent-applications', params.parentId, params.nurseryId],
    queryFn: async () => {
      if (!params.parentId) return [];
      let query = supabase
        .from('applications')
        .select('*')
        .eq('parent_id', params.parentId)
        .order('created_at', { ascending: false });
      if (params.nurseryId) query = query.eq('nursery_id', params.nurseryId);
      const res = await query;
      if (res.error) throw res.error;
      return (res.data ?? []) as Array<Record<string, unknown>>;
    },
    enabled: Boolean(params.parentId),
    // Status changes server-side (payment trigger, admin review); never show a stale list.
    staleTime: 0,
    refetchOnWindowFocus: true,
  });

  const createFromInquiry = useMutation({
    mutationFn: async (payload: { inquiryId: string; nurseryId: string }) => {
      const inquiryRes = await supabase.from('inquiries').select('*').eq('id', payload.inquiryId).single();
      if (inquiryRes.error) throw inquiryRes.error;
      const inquiry = inquiryRes.data as Record<string, unknown>;
      let parentId: string | null = null;
      const email = String(inquiry.parent_email ?? '');
      if (email) {
        const userRes = await supabase.from('users').select('id').eq('email', email).maybeSingle();
        if (!userRes.error && userRes.data) parentId = String((userRes.data as { id: string }).id);
      }
      const appRes = await supabase.from('applications').insert({
        inquiry_id: payload.inquiryId,
        nursery_id: payload.nurseryId,
        parent_id: parentId,
        status: 'draft',
        parent_info_json: {
          full_name: inquiry.parent_name,
          email: inquiry.parent_email,
          phone: inquiry.parent_phone,
        },
        child_info_json: {
          full_name: inquiry.child_name,
          dob: inquiry.child_dob,
        },
      } as never).select('id').single();
      if (appRes.error) throw appRes.error;
      const applicationId = (appRes.data as { id: string }).id;

      await supabase.from('inquiries').update({ status: 'scheduled' } as never).eq('id', payload.inquiryId);

      if (email) {
        await supabase.functions.invoke('email-dispatch', {
          body: {
            trigger_type: 'application_invite',
            recipient_email: email,
            language: 'ar',
            nursery_id: payload.nurseryId,
            data: { application_id: applicationId },
          },
        });
      }
      return applicationId;
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['admin-applications'] }),
  });

  const createParentDraft = useMutation({
    mutationFn: async (payload: {
      parentId: string;
      nurseryId: string;
      parentProfile?: {
        name_ar?: string | null;
        name_en?: string | null;
        email?: string | null;
        phone?: string | null;
      } | null;
    }) => {
      const sourceRes = await supabase
        .from('applications')
        .select('id, parent_info_json, child_info_json')
        .eq('parent_id', payload.parentId)
        .eq('nursery_id', payload.nurseryId)
        .order('updated_at', { ascending: false })
        .order('created_at', { ascending: false })
        .limit(20);
      if (sourceRes.error) throw sourceRes.error;

      const sourceRows =
        (sourceRes.data ?? []) as Array<{
          id: string;
          parent_info_json: JsonRecord | null;
          child_info_json: JsonRecord | null;
        }>;
      const source =
        sourceRows.find((row) => hasValues(row.parent_info_json) && hasValues(row.child_info_json)) ??
        sourceRows.find((row) => hasValues(row.parent_info_json)) ??
        sourceRows[0] ??
        null;
      const fallbackParentInfo = {
        full_name: payload.parentProfile?.name_ar || payload.parentProfile?.name_en || '',
        email: payload.parentProfile?.email || '',
        phone: payload.parentProfile?.phone || '',
      };

      const appRes = await supabase
        .from('applications')
        .insert({
          nursery_id: payload.nurseryId,
          parent_id: payload.parentId,
          status: 'draft',
          parent_info_json: source?.parent_info_json ?? fallbackParentInfo,
          child_info_json: source ? nextChildSeedFrom(source.child_info_json) : {},
          terms_accepted: false,
        } as never)
        .select('id')
        .single();
      if (appRes.error) throw appRes.error;
      const applicationId = (appRes.data as { id: string }).id;

      if (source?.id) {
        const docsRes = await supabase
          .from('application_documents')
          .select('document_type, file_url, uploaded_at')
          .eq('application_id', source.id)
          .in('document_type', [...reusableApplicationDocs])
          .order('uploaded_at', { ascending: false });
        if (docsRes.error) throw docsRes.error;
        const docsByType = new Map<string, { document_type: string; file_url: string }>();
        for (const doc of (docsRes.data ?? []) as Array<{ document_type: string; file_url: string }>) {
          if (!docsByType.has(doc.document_type)) docsByType.set(doc.document_type, doc);
        }
        const docs = [...docsByType.values()].map((doc) => ({
          application_id: applicationId,
          document_type: doc.document_type,
          file_url: doc.file_url,
        }));
        if (docs.length) {
          const copyDocsRes = await supabase.from('application_documents').insert(docs as never);
          if (copyDocsRes.error) throw copyDocsRes.error;
        }
      }

      return applicationId;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['parent-applications'] });
      void qc.invalidateQueries({ queryKey: ['application-detail'] });
    },
  });

  const saveApplicationDraft = useMutation({
    mutationFn: async (payload: { id: string; updates: Record<string, unknown> }) => {
      const res = await supabase.from('applications').update(payload.updates as never).eq('id', payload.id);
      if (res.error) throw res.error;
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['application-detail'] }),
  });

  const submitApplication = useMutation({
    mutationFn: async (payload: { id: string; nurseryId: string; parentName: string }) => {
      const currentAppRes = await supabase
        .from('applications')
        .select('id, parent_id, status, reviewed_at')
        .eq('id', payload.id)
        .single();
      if (currentAppRes.error) throw currentAppRes.error;
      const currentApp = currentAppRes.data as {
        id: string;
        parent_id: string | null;
        status: string;
        reviewed_at: string | null;
      };

      const docsRes = await supabase
        .from('application_documents')
        .select('document_type, file_url, uploaded_at')
        .eq('application_id', payload.id)
        .order('uploaded_at', { ascending: false });
      if (docsRes.error) throw docsRes.error;
      const docs = (docsRes.data ?? []) as Array<{ document_type: string; file_url: string | null; uploaded_at: string }>;
      const latestByType = new Map<string, { file_url: string | null; uploaded_at: string }>();
      for (const doc of docs) {
        if (!latestByType.has(doc.document_type)) latestByType.set(doc.document_type, doc);
      }
      const missingRequired = requiredApplicationDocs.filter((type) => {
        const latest = latestByType.get(type);
        return !latest?.file_url;
      });
      if (missingRequired.length > 0) {
        throw new Error('missing_required_documents');
      }
      if (currentApp.status === 'documents_pending' && currentApp.reviewed_at) {
        const reviewTime = new Date(currentApp.reviewed_at).getTime();
        const hasNewUpload = docs.some((doc) => {
          const uploadTime = new Date(doc.uploaded_at).getTime();
          return Number.isFinite(uploadTime) && uploadTime > reviewTime;
        });
        if (!hasNewUpload) throw new Error('requested_documents_not_updated');
      }

      const res = await supabase.from('applications').update({
        status: 'submitted',
        submitted_at: new Date().toISOString(),
      } as never).eq('id', payload.id);
      if (res.error) throw res.error;

      if (currentApp.parent_id) {
        await supabase
          .from('notifications')
          .update({ read: true } as never)
          .eq('user_id', currentApp.parent_id)
          .eq('read', false)
          .eq('action_link', `/parent/applications/${payload.id}`);
      }

      const adminsRes = await supabase
        .from('users')
        .select('id')
        .eq('nursery_id', payload.nurseryId)
        .in('role', ['branch_admin', 'chain_super_admin']);
      if (!adminsRes.error) {
        const adminIds = ((adminsRes.data ?? []) as Array<{ id: string }>).map((a) => a.id);
        if (adminIds.length) {
          await supabase.from('notifications').insert(adminIds.map((id) => ({
            nursery_id: payload.nurseryId,
            user_id: id,
            type: 'application_submitted',
            title_ar: 'طلب تسجيل جديد',
            title_en: 'New application submitted',
            body_ar: `طلب جديد من ${payload.parentName}.`,
            body_en: `New application from ${payload.parentName}.`,
            channel: 'push',
            read: false,
            sent_at: new Date().toISOString(),
          })) as never);
        }
      }
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['application-detail'] });
      void qc.invalidateQueries({ queryKey: ['parent-applications'] });
      void qc.invalidateQueries({ queryKey: ['parent-dashboard-feed'] });
      void qc.invalidateQueries({ queryKey: ['parent-in-app-notifications'] });
      void qc.invalidateQueries({ queryKey: ['notifications-center'] });
    },
  });

  const uploadDocument = useMutation({
    mutationFn: async (payload: {
      nurseryId: string;
      applicationId: string;
      documentType: 'birth_certificate' | 'vaccination_card' | 'parent_id' | 'proof_of_address' | 'medical_report' | 'other';
      file: File;
    }) => {
      const path = await uploadApplicationDocument(payload);
      const res = await supabase.from('application_documents').insert({
        application_id: payload.applicationId,
        document_type: payload.documentType,
        file_url: path,
      } as never);
      if (res.error) throw res.error;
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['application-detail'] }),
  });

  const verifyDocument = useMutation({
    mutationFn: async (payload: { documentId: string; verified: boolean; notes: string; reviewerId?: string }) => {
      const res = await supabase.from('application_documents').update({
        verified: payload.verified,
        notes: payload.notes || null,
        verified_by: payload.verified ? payload.reviewerId ?? null : null,
        verified_at: payload.verified ? new Date().toISOString() : null,
      } as never).eq('id', payload.documentId);
      if (res.error) throw res.error;
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['application-detail'] }),
  });

  const updateApplicationStatus = useMutation({
    mutationFn: async (payload: {
      id: string;
      status: 'under_review' | 'documents_pending' | 'approved' | 'rejected';
      reason?: string;
      reviewedBy?: string;
      parentEmail?: string;
      nurseryId?: string;
      parentId?: string;
      chatMessage?: string;
      openChat?: boolean;
    }) => {
      let resolvedParentId = payload.parentId;

      if (payload.status === 'approved') {
        if (!payload.nurseryId) throw new Error('Cannot approve application without a nursery id');
        const result = await activateEnrollment({
          applicationId: payload.id,
          nurseryId: payload.nurseryId,
          reviewerId: payload.reviewedBy,
          autoGenerateFirstInvoice: true,
        });
        resolvedParentId = result.parentId ?? resolvedParentId;
      } else {
        const updates: Record<string, unknown> = {
          status: payload.status,
          reviewed_by: payload.reviewedBy ?? null,
          reviewed_at: new Date().toISOString(),
        };
        if (payload.status === 'rejected') updates.rejection_reason = payload.reason ?? null;
        const res = await supabase.from('applications').update(updates as never).eq('id', payload.id);
        if (res.error) throw res.error;
      }

      if (resolvedParentId && payload.nurseryId && payload.status !== 'under_review') {
        const actionLink = `/parent/applications/${payload.id}`;
        const titleByStatus = {
          approved: {
            ar: 'تم قبول طلب التسجيل',
            en: 'Application approved',
          },
          documents_pending: {
            ar: 'مستندات إضافية مطلوبة',
            en: 'Additional documents requested',
          },
          rejected: {
            ar: 'تم رفض طلب التسجيل',
            en: 'Application rejected',
          },
        } as const;
        const bodyByStatus = {
          approved: {
            ar: 'تم قبول طلب طفلك وتفعيل ملفه في لوحة ولي الأمر.',
            en: 'Your child application was approved and the child profile is now visible on your dashboard.',
          },
          documents_pending: {
            ar: payload.reason || 'يرجى رفع المستندات الإضافية المطلوبة من الحضانة.',
            en: payload.reason || 'Please upload the additional documents requested by the nursery.',
          },
          rejected: {
            ar: payload.reason || 'راجع رسالة الإدارة لمعرفة سبب الرفض.',
            en: payload.reason || 'Check the admin message for the rejection reason.',
          },
        } as const;
        const notificationCopy = titleByStatus[payload.status];
        const notificationBody = bodyByStatus[payload.status];
        await supabase.from('notifications').insert({
          nursery_id: payload.nurseryId,
          user_id: resolvedParentId,
          type: `application_${payload.status}`,
          title_ar: notificationCopy.ar,
          title_en: notificationCopy.en,
          body_ar: notificationBody.ar,
          body_en: notificationBody.en,
          channel: 'in_app',
          urgency: payload.status === 'approved' ? 'normal' : 'high',
          read: false,
          action_link: actionLink,
          sent_at: new Date().toISOString(),
        } as never);

        if (payload.openChat && payload.reviewedBy && payload.chatMessage?.trim()) {
          const conversationId = getOrCreateConversationId(undefined);
          const chatRes = await supabase.from('messages').insert({
            conversation_id: conversationId,
            sender_id: payload.reviewedBy,
            receiver_id: resolvedParentId,
            content: payload.chatMessage.trim(),
            type: 'text',
          } as never);
          if (chatRes.error) throw chatRes.error;
        }
      }

      if (payload.parentEmail) {
        await supabase.functions.invoke('email-dispatch', {
          body: {
            trigger_type: `application_${payload.status}`,
            recipient_email: payload.parentEmail,
            language: 'ar',
            nursery_id: payload.nurseryId,
            data: { reason: payload.reason ?? '' },
          },
        });
      }
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['application-detail'] });
      void qc.invalidateQueries({ queryKey: ['admin-applications'] });
      void qc.invalidateQueries({ queryKey: ['parent-applications'] });
      void qc.invalidateQueries({ queryKey: ['parent-dashboard-children'] });
      void qc.invalidateQueries({ queryKey: ['parent-dashboard-feed'] });
      void qc.invalidateQueries({ queryKey: ['parent-in-app-notifications'] });
      void qc.invalidateQueries({ queryKey: ['payment-history'] });
      void qc.invalidateQueries({ queryKey: ['admin-children-list'] });
    },
  });

  const activateEnrollmentMutation = useMutation({
    mutationFn: async (payload: { applicationId: string; nurseryId: string; reviewerId?: string; autoGenerateFirstInvoice?: boolean }) => {
      return activateEnrollment(payload);
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['application-detail'] });
      void qc.invalidateQueries({ queryKey: ['admin-applications'] });
      void qc.invalidateQueries({ queryKey: ['parent-applications'] });
      void qc.invalidateQueries({ queryKey: ['parent-dashboard-children'] });
      void qc.invalidateQueries({ queryKey: ['parent-dashboard-feed'] });
      void qc.invalidateQueries({ queryKey: ['parent-invoices'] });
      void qc.invalidateQueries({ queryKey: ['payment-history'] });
      void qc.invalidateQueries({ queryKey: ['admin-children-list'] });
    },
  });

  const stats = useMemo(() => {
    const rows = adminListQuery.data ?? [];
    const pendingReview = rows.filter((r) => ['submitted', 'under_review', 'documents_pending'].includes(String(r.status))).length;
    const approvedThisMonth = rows.filter((r) => {
      if (String(r.status) !== 'approved' || !r.reviewed_at) return false;
      return String(r.reviewed_at).slice(0, 7) === new Date().toISOString().slice(0, 7);
    }).length;
    const reviewDurations = rows
      .filter((r) => r.submitted_at && r.reviewed_at)
      .map((r) => (+new Date(String(r.reviewed_at)) - +new Date(String(r.submitted_at))) / 3600000);
    const avgReviewHours = reviewDurations.length ? reviewDurations.reduce((s, v) => s + v, 0) / reviewDurations.length : 0;
    return { pendingReview, approvedThisMonth, avgReviewHours };
  }, [adminListQuery.data]);

  return {
    adminApplications: adminListQuery.data ?? [],
    parentApplications: parentApplicationsQuery.data ?? [],
    applicationDetail: detailQuery.data,
    isLoading: adminListQuery.isLoading || detailQuery.isLoading || parentApplicationsQuery.isLoading,
    stats,
    createFromInquiry: createFromInquiry.mutateAsync,
    createParentDraft: createParentDraft.mutateAsync,
    saveApplicationDraft: saveApplicationDraft.mutateAsync,
    submitApplication: submitApplication.mutateAsync,
    uploadDocument: uploadDocument.mutateAsync,
    verifyDocument: verifyDocument.mutateAsync,
    updateApplicationStatus: updateApplicationStatus.mutateAsync,
    activateEnrollment: activateEnrollmentMutation.mutateAsync,
  };
}
