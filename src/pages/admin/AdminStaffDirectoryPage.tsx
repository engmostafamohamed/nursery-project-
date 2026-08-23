import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import Papa from 'papaparse';
import { toast } from 'sonner';

import { StaffDirectoryTable } from '@/components/admin/staff/StaffDirectoryTable';
import { StaffImportDialog } from '@/components/admin/staff/StaffImportDialog';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/EmptyState';
import { Input } from '@/components/ui/input';
import { MaterialSymbol } from '@/components/ui/MaterialSymbol';
import { Select } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { useAuthSession } from '@/hooks/useAuthSession';
import { useAllStaff, useStaff, type StaffProfileView } from '@/hooks/useStaff';
import { useCanAction } from '@/hooks/usePermissions';
import { useUserProfile } from '@/hooks/useUserProfile';

export function AdminStaffDirectoryPage() {
  const { t, i18n } = useTranslation();
  const qc = useQueryClient();
  const { user } = useAuthSession();
  const { data: profile } = useUserProfile(user?.id);
  const nurseryId = profile?.nursery_id ?? undefined;
  // Cross-nursery roles get the unfiltered query (RLS limits visibility).
  // Single-nursery roles use the nursery-scoped query.
  const isCrossNursery =
    profile?.role === 'xo_super_admin' || profile?.role === 'chain_super_admin';
  const scopedStaff = useStaff(isCrossNursery ? undefined : nurseryId);
  const allStaff = useAllStaff();
  const staff = isCrossNursery ? allStaff : scopedStaff;
  const showNurseryColumn = isCrossNursery;
  const canEdit = useCanAction('staff', 'update');
  const canDelete = useCanAction('staff', 'delete');
  const [dept, setDept] = useState('all');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('all');
  const [search, setSearch] = useState('');
  const [importOpen, setImportOpen] = useState(false);

  // Authority filter: managers see peers (other managers) and teachers, but
  // never branch_admin / chain_super_admin / xo_super_admin. Branch_admin and
  // above see everyone in their scope. This keeps the org hierarchy: you never
  // see roles that out-rank yours in the staff list.
  const viewerHidesHighRoles = profile?.role === 'manager';
  const HIGH_ROLES = new Set(['branch_admin', 'chain_super_admin', 'xo_super_admin']);

  const rows = useMemo(() => {
    return staff.staff.filter((s) => {
      const u = (s.user as Record<string, unknown> | null) ?? {};
      const userRole = String(u.role ?? '');
      if (viewerHidesHighRoles && HIGH_ROLES.has(userRole)) return false;
      const department = String(s.department ?? '');
      const name = String(u.name_ar ?? u.name_en ?? u.full_name_ar ?? u.full_name_en ?? '');
      const employeeId = String(s.employee_id ?? '');
      const userStatus = String(u.status ?? 'active');
      if (dept !== 'all' && department !== dept) return false;
      if (statusFilter === 'active' && userStatus !== 'active') return false;
      if (statusFilter === 'inactive' && userStatus === 'active') return false;
      if (search && !(`${name} ${employeeId}`.toLowerCase().includes(search.toLowerCase()))) return false;
      return true;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [staff.staff, dept, statusFilter, search, viewerHidesHighRoles]);

  const exportCsv = () => {
    try {
      const data = rows.map((s) => {
        const u = (s.user as Record<string, unknown> | null) ?? {};
        return {
          employee_id: s.employee_id,
          name_ar: u.name_ar,
          name_en: u.name_en,
          email: u.email,
          phone: u.phone,
          department: s.department,
          position: s.position,
          hire_date: s.hire_date,
          contract_type: s.contract_type,
          status: u.status,
          role: u.role,
        };
      });
      const csv = Papa.unparse(data);
      const bom = '\uFEFF';
      const blob = new Blob([bom + csv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'staff-directory.csv';
      a.click();
      URL.revokeObjectURL(url);
      toast.success(`${t('staff.directory.exportDone')}\n${t('staff.directory.exportDoneAr')}`);
    } catch {
      toast.error(`${t('staff.directory.exportError')}\n${t('staff.directory.exportErrorAr')}`);
    }
  };

  const stats = useMemo(() => {
    const total = staff.staff.length;
    const active = staff.staff.filter((s) => String((s.user as Record<string, unknown> | null)?.status ?? 'active') === 'active').length;
    return { total, active };
  }, [staff.staff]);

  const loading = (isCrossNursery || Boolean(nurseryId)) && staff.isLoading;

  return (
    <div className="space-y-6 pb-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-lg font-semibold text-on-surface">
            <MaterialSymbol name="groups" className="text-primary" size="text-2xl" />
            {t('staff.directory.title')}
          </h1>
          <p className="text-sm text-on-surface-variant">{t('staff.directory.subtitle')}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" className="gap-1" onClick={exportCsv} disabled={!rows.length}>
            <MaterialSymbol name="download" size="text-lg" />
            {t('staff.directory.exportCsv')}
          </Button>
          <Button type="button" variant="outline" className="gap-1" onClick={() => setImportOpen(true)}>
            <MaterialSymbol name="upload_file" size="text-lg" />
            {t('staff.directory.importCsv')}
          </Button>
          <Button asChild>
            <Link to="/admin/staff/onboarding" className="gap-1">
              <MaterialSymbol name="person_add" size="text-lg" />
              {t('staff.addNew')}
            </Link>
          </Button>
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <div className="rounded-2xl border border-outline-variant bg-surface-container-lowest p-3">
          <p className="text-xs text-on-surface-variant">{t('staff.totalStaff')}</p>
          <p className="text-lg font-bold">{stats.total}</p>
        </div>
        <div className="rounded-2xl border border-outline-variant bg-surface-container-lowest p-3">
          <p className="text-xs text-on-surface-variant">{t('staff.activeStaff')}</p>
          <p className="text-lg font-bold">{stats.active}</p>
        </div>
      </div>

      <div className="grid gap-2 rounded-2xl border border-outline-variant bg-surface-container-lowest p-3 md:grid-cols-4">
        <Select value={dept} onChange={(e) => setDept(e.target.value)}>
          <option value="all">{t('staff.allDepartments')}</option>
          {(['teaching', 'admin', 'kitchen', 'maintenance', 'security', 'driver'] as const).map((d) => (
            <option key={d} value={d}>
              {t(`staff.departments.${d}`)}
            </option>
          ))}
        </Select>
        <Select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as 'all' | 'active' | 'inactive')}
        >
          <option value="all">{t('staff.filterStatusAll')}</option>
          <option value="active">{t('staff.status.active')}</option>
          <option value="inactive">{t('staff.status.inactive')}</option>
        </Select>
        <Input
          className="md:col-span-2"
          placeholder={t('staff.searchPlaceholder')}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {loading ? (
        <div className="space-y-2">
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-48 w-full" />
        </div>
      ) : !rows.length ? (
        <EmptyState icon="badge" title={t('staff.emptyTitle')} description={t('staff.emptyDescription')} />
      ) : (
        <StaffDirectoryTable
          rows={rows as StaffProfileView[]}
          language={i18n.language}
          showNurseryColumn={showNurseryColumn}
          canEdit={canEdit}
          canDelete={canDelete}
        />
      )}

      {nurseryId ? (
        <StaffImportDialog
          open={importOpen}
          onOpenChange={setImportOpen}
          nurseryId={nurseryId}
          staff={scopedStaff.staff as StaffProfileView[]}
          onImported={() => void qc.invalidateQueries({ queryKey: ['staff-profiles'] })}
          saveStaff={scopedStaff.saveStaff}
        />
      ) : null}
    </div>
  );
}
