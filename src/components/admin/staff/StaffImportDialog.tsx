import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import Papa from 'papaparse';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import type { StaffProfileView, StaffProfileInput } from '@/hooks/useStaff';
import { supabase } from '@/lib/supabase';
import type { StaffContractType, StaffDepartment } from '@/types/tables';

const DEPTS: StaffDepartment[] = ['teaching', 'admin', 'kitchen', 'maintenance', 'security', 'driver'];
const CONTRACTS: StaffContractType[] = ['full_time', 'part_time', 'contract', 'temporary'];
const ROLES = new Set(['teacher', 'branch_admin', 'chain_super_admin']);

type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  nurseryId: string;
  staff: StaffProfileView[];
  onImported: () => void;
  saveStaff: (p: StaffProfileInput & { id?: string }) => Promise<string>;
};

export function StaffImportDialog({ open, onOpenChange, nurseryId, staff, onImported, saveStaff }: Props) {
  const { t } = useTranslation();
  const [busy, setBusy] = useState(false);

  const runImport = async (file: File) => {
    setBusy(true);
    try {
      const parsed = await new Promise<Papa.ParseResult<Record<string, string>>>((resolve, reject) => {
        Papa.parse<Record<string, string>>(file, {
          header: true,
          skipEmptyLines: true,
          complete: resolve,
          error: reject,
        });
      });
      const rows = parsed.data ?? [];
      let ok = 0;
      const errors: string[] = [];
      for (let i = 0; i < rows.length; i += 1) {
        const row = rows[i];
        const email = (row.email ?? row.Email ?? '').trim().toLowerCase();
        const employeeId = (row.employee_id ?? row.employeeId ?? '').trim();
        const position = (row.position ?? '').trim();
        const department = (row.department ?? '').trim() as StaffDepartment;
        const hireDate = (row.hire_date ?? row.hireDate ?? '').trim();
        const contractType = (row.contract_type ?? row.contractType ?? '').trim() as StaffContractType;
        if (!email || !employeeId || !position || !hireDate || !contractType) {
          errors.push(t('staff.directory.importDialog.rowMissing', { row: i + 2 }));
          continue;
        }
        if (!DEPTS.includes(department)) {
          errors.push(t('staff.directory.importDialog.badDept', { row: i + 2 }));
          continue;
        }
        if (!CONTRACTS.includes(contractType)) {
          errors.push(t('staff.directory.importDialog.badContract', { row: i + 2 }));
          continue;
        }
        const userRes = await supabase
          .from('users')
          .select('id, role')
          .eq('nursery_id', nurseryId)
          .ilike('email', email)
          .maybeSingle();
        if (userRes.error) throw userRes.error;
        const u = userRes.data as { id: string; role: string } | null;
        if (!u || !ROLES.has(u.role)) {
          errors.push(t('staff.directory.importDialog.userNotFound', { row: i + 2, email }));
          continue;
        }
        const existingView = staff.find((s) => s.user_id === u.id);
        const salaryRaw = row.salary_amount ?? row.salary;
        const salaryAmount = salaryRaw !== undefined && salaryRaw !== '' ? Number(salaryRaw) : null;
        const payload: StaffProfileInput & { id?: string } = {
          user_id: u.id,
          nursery_id: nurseryId,
          employee_id: employeeId,
          department,
          position,
          hire_date: hireDate.slice(0, 10),
          contract_type: contractType,
          salary_amount: Number.isFinite(salaryAmount as number) ? (salaryAmount as number) : null,
          emergency_contact_name: null,
          emergency_contact_phone: null,
          address: null,
          national_id: null,
          qualifications_json: [],
          documents_json: [],
        };
        if (existingView?.hasStaffProfile) {
          await saveStaff({ ...payload, id: String(existingView.id) });
        } else {
          await saveStaff(payload);
        }
        ok += 1;
      }
      if (ok) toast.success(t('staff.directory.importDialog.done', { count: ok }));
      if (errors.length) toast.error(errors.slice(0, 5).join('\n'));
      onImported();
      onOpenChange(false);
    } catch {
      toast.error(t('staff.directory.importDialog.failed'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{t('staff.directory.importDialog.title')}</DialogTitle>
          <DialogDescription>{t('staff.directory.importDialog.description')}</DialogDescription>
        </DialogHeader>
        <p className="text-xs text-on-surface-variant">{t('staff.directory.importDialog.columns')}</p>
        <Input
          type="file"
          accept=".csv,text/csv"
          disabled={busy}
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = '';
            if (f) void runImport(f);
          }}
        />
        <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
          {t('common.cancel')}
        </Button>
      </DialogContent>
    </Dialog>
  );
}
