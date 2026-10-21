import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import Papa from 'papaparse';
import { toast } from 'sonner';

import { StaffDirectoryTable } from '@/components/admin/staff/StaffDirectoryTable';
import { StaffImportDialog } from '@/components/admin/staff/StaffImportDialog';
import { Button } from '@/components/ui/button';
import { TableCard, TableEmpty, TableLoading, TablePagination } from '@/components/ui/DataTable';
import { FilterBar, SearchInput } from '@/components/ui/FilterBar';
import { FilterField } from '@/components/ui/FilterField';
import { MaterialSymbol } from '@/components/ui/MaterialSymbol';
import { PageHeader } from '@/components/ui/PageHeader';
import { Select } from '@/components/ui/select';
import { StatTile } from '@/components/ui/StatTile';
import { useAuthSession } from '@/hooks/useAuthSession';
import { usePagination } from '@/hooks/usePagination';
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

  const visibleStaff = useMemo(
    () =>
      staff.staff.filter((s) => {
        const userRole = String(((s.user as Record<string, unknown> | null) ?? {}).role ?? '');
        return !(viewerHidesHighRoles && HIGH_ROLES.has(userRole));
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [staff.staff, viewerHidesHighRoles],
  );

  const rows = useMemo(() => {
    return visibleStaff.filter((s) => {
      const u = (s.user as Record<string, unknown> | null) ?? {};
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
  }, [visibleStaff, dept, statusFilter, search]);

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
    const total = visibleStaff.length;
    const active = visibleStaff.filter((s) => String((s.user as Record<string, unknown> | null)?.status ?? 'active') === 'active').length;
    const teaching = visibleStaff.filter((s) => String(s.department ?? '') === 'teaching').length;
    return { total, active, inactive: total - active, teaching };
  }, [visibleStaff]);

  const filtersActive = dept !== 'all' || statusFilter !== 'all' || Boolean(search.trim());
  const clearFilters = () => {
    setDept('all');
    setStatusFilter('all');
    setSearch('');
  };
  const toggleStatus = (value: 'active' | 'inactive') => setStatusFilter((current) => (current === value ? 'all' : value));

  const loading = (isCrossNursery || Boolean(nurseryId)) && staff.isLoading;
  const pager = usePagination(rows, 10, `${dept}|${statusFilter}|${search.trim().toLowerCase()}`);

  return (
    <div className="space-y-5 pb-8">
      <PageHeader
        icon="groups"
        title={t('staff.directory.title')}
        description={t('staff.directory.subtitle')}
        actions={
          <>
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
          </>
        }
      >
        <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
          <StatTile icon="groups" label={t('staff.totalStaff')} value={stats.total} onClick={clearFilters} active={!filtersActive} />
          <StatTile
            icon="how_to_reg"
            label={t('staff.activeStaff')}
            value={stats.active}
            tone="success"
            onClick={() => toggleStatus('active')}
            active={statusFilter === 'active'}
          />
          <StatTile
            icon="person_off"
            label={t('staff.directory.stats.inactive')}
            value={stats.inactive}
            tone={stats.inactive > 0 ? 'warning' : 'neutral'}
            onClick={() => toggleStatus('inactive')}
            active={statusFilter === 'inactive'}
          />
          <StatTile
            icon="school"
            label={t('staff.directory.stats.teaching')}
            value={stats.teaching}
            onClick={() => setDept((current) => (current === 'teaching' ? 'all' : 'teaching'))}
            active={dept === 'teaching'}
          />
        </div>
      </PageHeader>

      <TableCard
        title={t('staff.directory.title')}
        count={loading ? undefined : t('staff.directory.resultsCount', { count: rows.length })}
        filters={
          <FilterBar onClear={clearFilters} canClear={filtersActive}>
            <FilterField label={t('staff.department')}>
              <Select value={dept} onChange={(e) => setDept(e.target.value)}>
                <option value="all">{t('staff.allDepartments')}</option>
                {(['teaching', 'admin', 'kitchen', 'maintenance', 'security', 'driver'] as const).map((d) => (
                  <option key={d} value={d}>
                    {t(`staff.departments.${d}`)}
                  </option>
                ))}
              </Select>
            </FilterField>
            <FilterField label={t('staff.filterStatus')}>
              <Select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as 'all' | 'active' | 'inactive')}
              >
                <option value="all">{t('staff.filterStatusAll')}</option>
                <option value="active">{t('staff.status.active')}</option>
                <option value="inactive">{t('staff.status.inactive')}</option>
              </Select>
            </FilterField>
            <FilterField label={t('common.search')} className="sm:flex-[2]">
              <SearchInput value={search} onChange={setSearch} placeholder={t('staff.searchPlaceholder')} />
            </FilterField>
          </FilterBar>
        }
        pagination={loading || !rows.length ? null : <TablePagination pager={pager} />}
      >
        {loading ? (
          <TableLoading />
        ) : !rows.length ? (
          <TableEmpty icon="badge" title={t('staff.emptyTitle')} description={t('staff.emptyDescription')} />
        ) : (
          <StaffDirectoryTable
            rows={pager.pageItems as StaffProfileView[]}
            language={i18n.language}
            showNurseryColumn={showNurseryColumn}
            canEdit={canEdit}
          />
        )}
      </TableCard>

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
