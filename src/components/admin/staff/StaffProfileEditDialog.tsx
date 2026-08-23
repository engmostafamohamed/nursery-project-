import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import type { StaffProfileInput, StaffProfileView } from '@/hooks/useStaff';
import { supabase } from '@/lib/supabase';
import type { StaffContractType, StaffDepartment } from '@/types/tables';

type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  profile: StaffProfileView;
  onSave: (payload: StaffProfileInput & { id: string }) => Promise<string>;
};

export function StaffProfileEditDialog({ open, onOpenChange, profile, onSave }: Props) {
  const { t } = useTranslation();
  const u = (profile.user as Record<string, unknown> | null) ?? {};
  const [phone, setPhone] = useState(String(u.phone ?? ''));
  const [position, setPosition] = useState(String(profile.position ?? ''));
  const [department, setDepartment] = useState<StaffDepartment>(profile.department);
  const [contractType, setContractType] = useState<StaffContractType>(profile.contract_type);
  const [hireDate, setHireDate] = useState(String(profile.hire_date ?? '').slice(0, 10));
  const [salary, setSalary] = useState(String(profile.salary_amount ?? ''));
  const [emergencyName, setEmergencyName] = useState(String(profile.emergency_contact_name ?? ''));
  const [emergencyPhone, setEmergencyPhone] = useState(String(profile.emergency_contact_phone ?? ''));
  const [address, setAddress] = useState(String(profile.address ?? ''));
  const [nationalId, setNationalId] = useState(String(profile.national_id ?? ''));
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setPhone(String(u.phone ?? ''));
    setPosition(String(profile.position ?? ''));
    setDepartment(profile.department);
    setContractType(profile.contract_type);
    setHireDate(String(profile.hire_date ?? '').slice(0, 10));
    setSalary(String(profile.salary_amount ?? ''));
    setEmergencyName(String(profile.emergency_contact_name ?? ''));
    setEmergencyPhone(String(profile.emergency_contact_phone ?? ''));
    setAddress(String(profile.address ?? ''));
    setNationalId(String(profile.national_id ?? ''));
  }, [open, profile, u.phone]);

  const submit = async () => {
    if (!profile.hasStaffProfile) return;
    setBusy(true);
    try {
      const raw = profile as unknown as Record<string, unknown>;
      const qualifications_json = Array.isArray(raw.qualifications_json)
        ? (raw.qualifications_json as Record<string, unknown>[])
        : [];
      const documents_json = Array.isArray(raw.documents_json) ? (raw.documents_json as Record<string, unknown>[]) : [];
      const phoneRes = await supabase
        .from('users')
        .update({ phone: phone.trim() || null } as never)
        .eq('id', profile.user_id);
      if (phoneRes.error) throw phoneRes.error;

      await onSave({
        id: String(profile.id),
        user_id: profile.user_id,
        nursery_id: profile.nursery_id,
        employee_id: String(profile.employee_id),
        department,
        position: position.trim(),
        hire_date: hireDate,
        contract_type: contractType,
        salary_amount: salary.trim() === '' ? null : Number(salary),
        emergency_contact_name: emergencyName.trim() || null,
        emergency_contact_phone: emergencyPhone.trim() || null,
        address: address.trim() || null,
        national_id: nationalId.trim() || null,
        qualifications_json,
        documents_json,
      });
      toast.success(`${t('staff.editSaved')}\n${t('staff.editSavedAr')}`);
      onOpenChange(false);
    } catch {
      toast.error(`${t('staff.editError')}\n${t('staff.editErrorAr')}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t('staff.editProfile')}</DialogTitle>
          <DialogDescription>{t('staff.editDescription')}</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3">
          <div className="space-y-1">
            <Label>{t('admin.profile.phone')}</Label>
            <Input value={phone} onChange={(e) => setPhone(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label>{t('staff.position')}</Label>
            <Input value={position} onChange={(e) => setPosition(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label>{t('staff.department')}</Label>
            <Select value={department} onChange={(e) => setDepartment(e.target.value as StaffDepartment)}>
              {(['teaching', 'admin', 'kitchen', 'maintenance', 'security', 'driver'] as const).map((d) => (
                <option key={d} value={d}>
                  {t(`staff.departments.${d}`)}
                </option>
              ))}
            </Select>
          </div>
          <div className="space-y-1">
            <Label>{t('staff.contractType')}</Label>
            <Select value={contractType} onChange={(e) => setContractType(e.target.value as StaffContractType)}>
              {(['full_time', 'part_time', 'contract', 'temporary'] as const).map((c) => (
                <option key={c} value={c}>
                  {t(`staff.contractTypes.${c}`)}
                </option>
              ))}
            </Select>
          </div>
          <div className="space-y-1">
            <Label>{t('staff.hireDate')}</Label>
            <Input type="date" value={hireDate} onChange={(e) => setHireDate(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label>{t('staff.salary')}</Label>
            <Input value={salary} onChange={(e) => setSalary(e.target.value)} inputMode="decimal" />
          </div>
          <div className="space-y-1">
            <Label>{t('staff.emergencyName')}</Label>
            <Input value={emergencyName} onChange={(e) => setEmergencyName(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label>{t('staff.emergencyPhone')}</Label>
            <Input value={emergencyPhone} onChange={(e) => setEmergencyPhone(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label>{t('staff.address')}</Label>
            <Input value={address} onChange={(e) => setAddress(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label>{t('staff.nationalId')}</Label>
            <Input value={nationalId} onChange={(e) => setNationalId(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
            {t('common.cancel')}
          </Button>
          <Button type="button" onClick={() => void submit()} disabled={busy || !profile.hasStaffProfile}>
            {t('admin.profile.save')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
