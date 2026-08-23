import { useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { uploadApplicationDocument } from '@/lib/applicationDocuments';
import { activateEnrollment } from '@/lib/enrollmentActivation';
import { supabase } from '@/lib/supabase';

type AdminApplicationView = Record<string, unknown> & {
  parent_user: Record<string, unknown> | null;
  documents_count: number;
};

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
      const docsRes = await supabase.from('application_documents').select('id, application_id');
      if (docsRes.error) throw docsRes.error;
      const counts = new Map<string, number>();
      ((docsRes.data ?? []) as Array<Record<string, unknown>>).forEach((d) => {
        const id = String(d.application_id);
        counts.set(id, (counts.get(id) ?? 0) + 1);
      });
      return rows.map((r) => ({
        ...r,
        parent_user: userMap.get(String(r.parent_id ?? '')) ?? null,
        documents_count: counts.get(String(r.id)) ?? 0,
      })) as AdminApplicationView[];
    },
    enabled: Boolean(params.nurseryId),
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
      return { application: app, documents: (docsRes.data ?? []) as Array<Record<string, unknown>> };
    },
    enabled: Boolean(params.applicationId),
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

  const saveApplicationDraft = useMutation({
    mutationFn: async (payload: { id: string; updates: Record<string, unknown> }) => {
      const res = await supabase.from('applications').update(payload.updates as never).eq('id', payload.id);
      if (res.error) throw res.error;
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['application-detail'] }),
  });

  const submitApplication = useMutation({
    mutationFn: async (payload: { id: string; nurseryId: string; parentName: string }) => {
      const res = await supabase.from('applications').update({
        status: 'submitted',
        submitted_at: new Date().toISOString(),
      } as never).eq('id', payload.id);
      if (res.error) throw res.error;
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
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['application-detail'] }),
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
    mutationFn: async (payload: { id: string; status: 'under_review' | 'documents_pending' | 'approved' | 'rejected'; reason?: string; reviewedBy?: string; parentEmail?: string; nurseryId?: string }) => {
      const updates: Record<string, unknown> = {
        status: payload.status,
        reviewed_by: payload.reviewedBy ?? null,
        reviewed_at: new Date().toISOString(),
      };
      if (payload.status === 'rejected') updates.rejection_reason = payload.reason ?? null;
      const res = await supabase.from('applications').update(updates as never).eq('id', payload.id);
      if (res.error) throw res.error;

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
    },
  });

  const activateEnrollmentMutation = useMutation({
    mutationFn: async (payload: { applicationId: string; nurseryId: string; reviewerId?: string; autoGenerateFirstInvoice?: boolean }) => {
      return activateEnrollment(payload);
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['application-detail'] });
      void qc.invalidateQueries({ queryKey: ['admin-applications'] });
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
    applicationDetail: detailQuery.data,
    isLoading: adminListQuery.isLoading || detailQuery.isLoading,
    stats,
    createFromInquiry: createFromInquiry.mutateAsync,
    saveApplicationDraft: saveApplicationDraft.mutateAsync,
    submitApplication: submitApplication.mutateAsync,
    uploadDocument: uploadDocument.mutateAsync,
    verifyDocument: verifyDocument.mutateAsync,
    updateApplicationStatus: updateApplicationStatus.mutateAsync,
    activateEnrollment: activateEnrollmentMutation.mutateAsync,
  };
}
