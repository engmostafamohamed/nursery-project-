import { useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { supabase } from '@/lib/supabase';

export type GradeLevel = {
  id: string;
  code: string;
  label_en: string;
  label_ar: string;
  sort_order: number;
};
export type ReportItem = { id: string; label_en: string; label_ar: string; sort_order: number };
export type ReportSection = {
  id: string;
  title_en: string;
  title_ar: string;
  sort_order: number;
  items: ReportItem[];
};
export type QuarterlyTemplate = {
  id: string;
  nursery_id: string;
  name: string;
  gradeLevels: GradeLevel[];
  sections: ReportSection[];
};

export type QuarterlyReportRow = {
  id: string;
  child_id: string;
  term_label: string;
  status: 'draft' | 'sent';
  period_from: string | null;
  period_to: string | null;
  sent_at: string | null;
  childNameEn: string;
  childNameAr: string;
};

export const quarterlyTemplateKey = (n: string | null | undefined) =>
  ['quarterly-template', n] as const;
export const quarterlyReportsKey = (n: string | null | undefined) =>
  ['quarterly-reports', n] as const;

async function loadTemplate(nurseryId: string): Promise<QuarterlyTemplate | null> {
  const { data: tpl } = await supabase
    .from('quarterly_report_templates')
    .select('id, nursery_id, name')
    .eq('nursery_id', nurseryId)
    .eq('active', true)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();
  if (!tpl) return null;
  const t = tpl as { id: string; nursery_id: string; name: string };

  const [glRes, secRes, itemRes] = await Promise.all([
    supabase
      .from('quarterly_report_grade_levels')
      .select('id, code, label_en, label_ar, sort_order')
      .eq('template_id', t.id)
      .order('sort_order'),
    supabase
      .from('quarterly_report_sections')
      .select('id, title_en, title_ar, sort_order')
      .eq('template_id', t.id)
      .order('sort_order'),
    supabase
      .from('quarterly_report_items')
      .select('id, section_id, label_en, label_ar, sort_order')
      .eq('template_id', t.id)
      .order('sort_order'),
  ]);
  const items = (itemRes.data ?? []) as (ReportItem & { section_id: string })[];
  const sections = ((secRes.data ?? []) as Omit<ReportSection, 'items'>[]).map((s) => ({
    ...s,
    items: items.filter((i) => i.section_id === s.id),
  }));
  return {
    id: t.id,
    nursery_id: t.nursery_id,
    name: t.name,
    gradeLevels: (glRes.data ?? []) as GradeLevel[],
    sections,
  };
}

export function useQuarterlyTemplate(nurseryId: string | null | undefined) {
  const qc = useQueryClient();
  const key = quarterlyTemplateKey(nurseryId);
  const query = useQuery({
    queryKey: key,
    queryFn: async () => (nurseryId ? loadTemplate(nurseryId) : null),
    enabled: Boolean(nurseryId),
  });

  const ensureTemplate = useMutation({
    mutationFn: async (): Promise<string> => {
      if (!nurseryId) throw new Error('no nursery');
      const existing = query.data;
      if (existing) return existing.id;
      const { data, error } = await supabase
        .from('quarterly_report_templates')
        .insert({ nursery_id: nurseryId, name: 'Term Evaluation', active: true } as never)
        .select('id')
        .single();
      if (error) throw error;
      return (data as { id: string }).id;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: key }),
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: key });

  const addGradeLevel = useMutation({
    mutationFn: async (v: { templateId: string; code: string; label_en: string; label_ar: string; sort_order: number }) => {
      const { error } = await supabase.from('quarterly_report_grade_levels').insert({
        template_id: v.templateId,
        nursery_id: nurseryId,
        code: v.code,
        label_en: v.label_en,
        label_ar: v.label_ar,
        sort_order: v.sort_order,
      } as never);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });
  const deleteGradeLevel = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('quarterly_report_grade_levels').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });
  const addSection = useMutation({
    mutationFn: async (v: { templateId: string; title_en: string; title_ar: string; sort_order: number }) => {
      const { error } = await supabase.from('quarterly_report_sections').insert({
        template_id: v.templateId,
        nursery_id: nurseryId,
        title_en: v.title_en,
        title_ar: v.title_ar,
        sort_order: v.sort_order,
      } as never);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });
  const deleteSection = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('quarterly_report_sections').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });
  const addItem = useMutation({
    mutationFn: async (v: { sectionId: string; templateId: string; label_en: string; label_ar: string; sort_order: number }) => {
      const { error } = await supabase.from('quarterly_report_items').insert({
        section_id: v.sectionId,
        template_id: v.templateId,
        nursery_id: nurseryId,
        label_en: v.label_en,
        label_ar: v.label_ar,
        sort_order: v.sort_order,
      } as never);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });
  const deleteItem = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('quarterly_report_items').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  return {
    query,
    ensureTemplate,
    addGradeLevel,
    deleteGradeLevel,
    addSection,
    deleteSection,
    addItem,
    deleteItem,
  };
}

export function useAdminQuarterlyReports(nurseryId: string | null | undefined) {
  const qc = useQueryClient();
  const key = quarterlyReportsKey(nurseryId);

  const query = useQuery({
    queryKey: key,
    queryFn: async (): Promise<QuarterlyReportRow[]> => {
      if (!nurseryId) return [];
      const { data, error } = await supabase
        .from('quarterly_reports')
        .select('id, child_id, term_label, status, period_from, period_to, sent_at, children (full_name_en, full_name_ar)')
        .eq('nursery_id', nurseryId)
        .order('created_at', { ascending: false });
      if (error) throw error;
      type Row = Omit<QuarterlyReportRow, 'childNameEn' | 'childNameAr'> & {
        children: { full_name_en: string; full_name_ar: string } | { full_name_en: string; full_name_ar: string }[] | null;
      };
      return ((data ?? []) as Row[]).map((r) => {
        const c = Array.isArray(r.children) ? r.children[0] : r.children;
        return { ...r, childNameEn: c?.full_name_en ?? '', childNameAr: c?.full_name_ar ?? '' };
      });
    },
    enabled: Boolean(nurseryId),
  });

  const saveReport = useMutation({
    mutationFn: async (v: {
      reportId?: string;
      templateId: string;
      childId: string;
      termLabel: string;
      periodFrom: string | null;
      periodTo: string | null;
      attendancePresent: number | null;
      attendanceTotal: number | null;
      comment: string;
      grades: Record<string, string>;
      send: boolean;
    }) => {
      if (!nurseryId) throw new Error('no nursery');
      const base = {
        nursery_id: nurseryId,
        template_id: v.templateId,
        child_id: v.childId,
        term_label: v.termLabel,
        period_from: v.periodFrom,
        period_to: v.periodTo,
        attendance_present: v.attendancePresent,
        attendance_total: v.attendanceTotal,
        comment: v.comment,
        status: v.send ? 'sent' : 'draft',
        sent_at: v.send ? new Date().toISOString() : null,
      };
      const up = await supabase
        .from('quarterly_reports')
        .upsert((v.reportId ? { id: v.reportId, ...base } : base) as never, {
          onConflict: 'child_id,template_id,term_label',
        })
        .select('id')
        .single();
      if (up.error) throw up.error;
      const reportId = (up.data as { id: string }).id;

      const rows = Object.entries(v.grades)
        .filter(([, code]) => code)
        .map(([itemId, code]) => ({
          report_id: reportId,
          nursery_id: nurseryId,
          item_id: itemId,
          grade_code: code,
        }));
      if (rows.length) {
        const g = await supabase
          .from('quarterly_report_grades')
          .upsert(rows as never, { onConflict: 'report_id,item_id' });
        if (g.error) throw g.error;
      }
      return reportId;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: key }),
  });

  const deleteReport = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('quarterly_reports').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: key }),
  });

  useEffect(() => {
    if (!nurseryId) return;
    const ch = supabase
      .channel(`quarterly-reports-${nurseryId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'quarterly_reports' }, () =>
        void qc.invalidateQueries({ queryKey: key }),
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(ch);
    };
  }, [nurseryId, qc, key]);

  return { query, saveReport, deleteReport };
}

export async function fetchReportGrades(reportId: string): Promise<Record<string, string>> {
  const { data } = await supabase
    .from('quarterly_report_grades')
    .select('item_id, grade_code')
    .eq('report_id', reportId);
  const map: Record<string, string> = {};
  for (const r of (data ?? []) as { item_id: string; grade_code: string | null }[]) {
    if (r.grade_code) map[r.item_id] = r.grade_code;
  }
  return map;
}

export type ParentQuarterlyReport = {
  report: {
    id: string;
    term_label: string;
    period_from: string | null;
    period_to: string | null;
    attendance_present: number | null;
    attendance_total: number | null;
    comment: string | null;
    sent_at: string | null;
    childNameEn: string;
    childNameAr: string;
  };
  template: QuarterlyTemplate;
  grades: Record<string, string>;
};

export function useParentQuarterlyReports(parentId: string | undefined) {
  return useQuery({
    queryKey: ['parent-quarterly-reports', parentId],
    queryFn: async (): Promise<ParentQuarterlyReport[]> => {
      if (!parentId) return [];
      const links = await supabase
        .from('parent_children')
        .select('child_id')
        .eq('parent_id', parentId);
      const childIds = ((links.data ?? []) as { child_id: string }[]).map((r) => r.child_id);
      if (!childIds.length) return [];

      const { data: reps } = await supabase
        .from('quarterly_reports')
        .select(
          'id, template_id, term_label, period_from, period_to, attendance_present, attendance_total, comment, sent_at, children (full_name_en, full_name_ar)',
        )
        .in('child_id', childIds)
        .eq('status', 'sent')
        .order('sent_at', { ascending: false });
      const reports = (reps ?? []) as Array<{
        id: string;
        template_id: string;
        term_label: string;
        period_from: string | null;
        period_to: string | null;
        attendance_present: number | null;
        attendance_total: number | null;
        comment: string | null;
        sent_at: string | null;
        children: { full_name_en: string; full_name_ar: string } | { full_name_en: string; full_name_ar: string }[] | null;
      }>;
      if (!reports.length) return [];

      const out: ParentQuarterlyReport[] = [];
      const templateCache = new Map<string, QuarterlyTemplate | null>();
      for (const r of reports) {
        let tpl = templateCache.get(r.template_id);
        if (tpl === undefined) {
          tpl = await loadTemplateById(r.template_id);
          templateCache.set(r.template_id, tpl);
        }
        if (!tpl) continue;
        const c = Array.isArray(r.children) ? r.children[0] : r.children;
        out.push({
          report: {
            id: r.id,
            term_label: r.term_label,
            period_from: r.period_from,
            period_to: r.period_to,
            attendance_present: r.attendance_present,
            attendance_total: r.attendance_total,
            comment: r.comment,
            sent_at: r.sent_at,
            childNameEn: c?.full_name_en ?? '',
            childNameAr: c?.full_name_ar ?? '',
          },
          template: tpl,
          grades: await fetchReportGrades(r.id),
        });
      }
      return out;
    },
    enabled: Boolean(parentId),
  });
}

async function loadTemplateById(templateId: string): Promise<QuarterlyTemplate | null> {
  const { data: tpl } = await supabase
    .from('quarterly_report_templates')
    .select('id, nursery_id, name')
    .eq('id', templateId)
    .maybeSingle();
  if (!tpl) return null;
  const t = tpl as { id: string; nursery_id: string; name: string };
  const [glRes, secRes, itemRes] = await Promise.all([
    supabase.from('quarterly_report_grade_levels').select('id, code, label_en, label_ar, sort_order').eq('template_id', t.id).order('sort_order'),
    supabase.from('quarterly_report_sections').select('id, title_en, title_ar, sort_order').eq('template_id', t.id).order('sort_order'),
    supabase.from('quarterly_report_items').select('id, section_id, label_en, label_ar, sort_order').eq('template_id', t.id).order('sort_order'),
  ]);
  const items = (itemRes.data ?? []) as (ReportItem & { section_id: string })[];
  return {
    id: t.id,
    nursery_id: t.nursery_id,
    name: t.name,
    gradeLevels: (glRes.data ?? []) as GradeLevel[],
    sections: ((secRes.data ?? []) as Omit<ReportSection, 'items'>[]).map((s) => ({
      ...s,
      items: items.filter((i) => i.section_id === s.id),
    })),
  };
}
