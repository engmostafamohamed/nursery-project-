import { useMemo, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';

import { createImportTemplateCsv, parseImportFile } from '@/lib/csvParser';
import { validateImportRows } from '@/lib/importValidator';
import { supabase } from '@/lib/supabase';

export type FieldMapping = {
  parent_name: string;
  parent_email: string;
  parent_phone: string;
  child_name: string;
  child_dob: string;
  child_gender: string;
  class_name: string;
  medical_conditions: string;
  allergies: string;
  address: string;
};

const emptyMapping: FieldMapping = {
  parent_name: '',
  parent_email: '',
  parent_phone: '',
  child_name: '',
  child_dob: '',
  child_gender: '',
  class_name: '',
  medical_conditions: '',
  allergies: '',
  address: '',
};

function autodetect(headers: string[]): FieldMapping {
  const h = headers.map((x) => x.toLowerCase());
  const pick = (cands: string[]) => h.find((x) => cands.some((c) => x.includes(c))) ?? '';
  return {
    parent_name: pick(['parent_name', 'parent', 'guardian_name']),
    parent_email: pick(['parent_email', 'email']),
    parent_phone: pick(['parent_phone', 'phone', 'mobile']),
    child_name: pick(['child_name', 'student_name', 'child']),
    child_dob: pick(['child_dob', 'dob', 'birth']),
    child_gender: pick(['gender']),
    class_name: pick(['class_name', 'class']),
    medical_conditions: pick(['medical_conditions', 'medical']),
    allergies: pick(['allergies', 'allergy']),
    address: pick(['address']),
  };
}

export function useBulkImport(nurseryId?: string, importedBy?: string) {
  const qc = useQueryClient();
  const [headers, setHeaders] = useState<string[]>([]);
  const [rawRows, setRawRows] = useState<Array<Record<string, string>>>([]);
  const [mapping, setMapping] = useState<FieldMapping>(emptyMapping);

  const parseFile = useMutation({
    mutationFn: async (file: File) => parseImportFile(file),
    onSuccess: (data) => {
      setHeaders(data.headers);
      setRawRows(data.rows);
      setMapping(autodetect(data.headers));
    },
  });

  const mappedRows = useMemo(() => {
    return rawRows.map((r) => ({
      parent_name: r[mapping.parent_name] ?? '',
      parent_email: r[mapping.parent_email] ?? '',
      parent_phone: r[mapping.parent_phone] ?? '',
      child_name: r[mapping.child_name] ?? '',
      child_dob: r[mapping.child_dob] ?? '',
      child_gender: r[mapping.child_gender] ?? '',
      class_name: r[mapping.class_name] ?? '',
      medical_conditions: r[mapping.medical_conditions] ?? '',
      allergies: r[mapping.allergies] ?? '',
      address: r[mapping.address] ?? '',
    }));
  }, [rawRows, mapping]);

  const validation = useMemo(() => validateImportRows(mappedRows), [mappedRows]);

  const importRows = useMutation({
    mutationFn: async (opts: { skipInvalid: boolean }) => {
      if (!nurseryId) throw new Error('Missing nursery');
      const rows = opts.skipInvalid ? validation.validRows : mappedRows;
      const classesRes = await supabase.from('classes').select('id, name_ar, name_en').eq('nursery_id', nurseryId);
      if (classesRes.error) throw classesRes.error;
      const classes = (classesRes.data ?? []) as Array<Record<string, unknown>>;
      const classByName = new Map(classes.map((c) => [`${String(c.name_ar ?? '')} ${String(c.name_en ?? '')}`.trim().toLowerCase(), String(c.id)]));

      let parentsCreated = 0;
      let childrenCreated = 0;
      let skipped = 0;
      const reportRows: string[] = ['row,parent_email,child_name,status,reason'];

      const grouped = new Map<string, typeof rows>();
      rows.forEach((r) => {
        const key = r.parent_email.toLowerCase();
        const arr = grouped.get(key) ?? [];
        arr.push(r);
        grouped.set(key, arr);
      });

      for (const [email, group] of grouped.entries()) {
        let parentId = '';
        const userRes = await supabase.from('users').select('id').eq('email', email).maybeSingle();
        if (userRes.error) throw userRes.error;
        if (userRes.data) parentId = String((userRes.data as { id: string }).id);
        if (!parentId) {
          const first = group[0];
          const insertParent = await supabase.from('users').insert({
            nursery_id: nurseryId,
            role: 'parent',
            name_ar: first.parent_name,
            name_en: first.parent_name,
            email: first.parent_email,
            phone: first.parent_phone,
            status: 'active',
            language_pref: 'ar',
            onboarding_completed: false,
          } as never).select('id').single();
          if (insertParent.error) {
            skipped += group.length;
            group.forEach((g, i) => reportRows.push(`${i + 1},${g.parent_email},${g.child_name},skipped,parent_create_failed`));
            continue;
          }
          parentId = String((insertParent.data as { id: string }).id);
          parentsCreated += 1;
          await supabase.functions.invoke('email-dispatch', {
            body: {
              trigger_type: 'parent_account_invite',
              recipient_email: first.parent_email,
              language: 'ar',
              nursery_id: nurseryId,
            },
          });
        }

        for (let i = 0; i < group.length; i += 1) {
          const row = group[i];
          const classId = classByName.get(String(row.class_name).toLowerCase()) ?? String(classes[0]?.id ?? '');
          const childRes = await supabase.from('children').insert({
            nursery_id: nurseryId,
            full_name_ar: row.child_name,
            full_name_en: row.child_name,
            dob: row.child_dob,
            class_id: classId || null,
            status: 'active',
            enrollment_date: new Date().toISOString().slice(0, 10),
            photo_privacy_restricted: false,
          } as never).select('id').single();
          if (childRes.error) {
            skipped += 1;
            reportRows.push(`${i + 1},${row.parent_email},${row.child_name},skipped,child_create_failed`);
            continue;
          }
          const childId = String((childRes.data as { id: string }).id);
          childrenCreated += 1;
          await supabase.from('parent_children').insert({ parent_id: parentId, child_id: childId } as never);
          reportRows.push(`${i + 1},${row.parent_email},${row.child_name},imported,`);
        }
      }

      const reportCsv = reportRows.join('\n');
      return { parentsCreated, childrenCreated, skipped, reportCsv };
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['children'] });
    },
  });

  const templateCsv = useMemo(() => createImportTemplateCsv(), []);

  return {
    headers,
    rawRows,
    mapping,
    setMapping,
    mappedRows,
    validation,
    templateCsv,
    parseFile: parseFile.mutateAsync,
    importRows: importRows.mutateAsync,
    isParsing: parseFile.isPending,
    isImporting: importRows.isPending,
    importedBy,
  };
}
