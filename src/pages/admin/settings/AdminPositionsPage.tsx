import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';

import { confirm } from '@/components/ui/confirm';

import { Button } from '@/components/ui/button';
import {
  DataTable,
  IconAction,
  StatusPill,
  TableCard,
  TableEmpty,
  TableLoading,
  TablePagination,
  TBody,
  THead,
  Td,
  Th,
  Tr,
} from '@/components/ui/DataTable';
import { FilterBar, SearchInput } from '@/components/ui/FilterBar';
import { FilterField } from '@/components/ui/FilterField';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { PageHeader } from '@/components/ui/PageHeader';
import { Select } from '@/components/ui/select';
import { MaterialSymbol } from '@/components/ui/MaterialSymbol';
import { useAuthSession } from '@/hooks/useAuthSession';
import { usePagination } from '@/hooks/usePagination';
import { useUserProfile } from '@/hooks/useUserProfile';
import { usePositions, useCreatePosition, useDeletePosition } from '@/hooks/usePositions';
import { useRoles } from '@/hooks/useRoles';

export function AdminPositionsPage() {
  const { t, i18n } = useTranslation();
  const lang = i18n.language === 'ar' ? 'ar' : 'en';
  const { user } = useAuthSession();
  const { data: profile } = useUserProfile(user?.id);
  const nurseryId = profile?.nursery_id ?? null;

  const positions = usePositions();
  // Positions are platform-wide, so they point at the platform role templates; each nursery's
  // staff get that nursery's copy of the role.
  const roles = useRoles({ nurseryId: null });
  const createPos = useCreatePosition();
  const deletePos = useDeletePosition();

  const [keyVal, setKeyVal] = useState('');
  const [nameEn, setNameEn] = useState('');
  const [nameAr, setNameAr] = useState('');
  const [roleId, setRoleId] = useState('');
  const [scope, setScope] = useState<'nursery' | 'platform'>('nursery');

  const isXo = profile?.role === 'xo_super_admin';

  const [search, setSearch] = useState('');
  const [scopeFilter, setScopeFilter] = useState<'all' | 'nursery' | 'platform'>('all');
  const [typeFilter, setTypeFilter] = useState<'all' | 'seed' | 'custom'>('all');
  const allPositions = useMemo(() => positions.data ?? [], [positions.data]);
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return allPositions.filter((p) => {
      if (scopeFilter === 'nursery' && !p.nursery_id) return false;
      if (scopeFilter === 'platform' && p.nursery_id) return false;
      if (typeFilter === 'seed' && !p.is_seed) return false;
      if (typeFilter === 'custom' && p.is_seed) return false;
      return !q || `${p.name_en} ${p.name_ar} ${p.key}`.toLowerCase().includes(q);
    });
  }, [allPositions, search, scopeFilter, typeFilter]);
  const filtersActive = scopeFilter !== 'all' || typeFilter !== 'all' || Boolean(search.trim());
  const clearFilters = () => {
    setSearch('');
    setScopeFilter('all');
    setTypeFilter('all');
  };
  const pager = usePagination(filtered, 10, `${search}|${scopeFilter}|${typeFilter}`);

  const handleCreate = async () => {
    if (!keyVal || !nameEn || !nameAr || !roleId) {
      toast.error('All fields are required');
      return;
    }
    try {
      await createPos.mutateAsync({
        key: keyVal,
        name_en: nameEn,
        name_ar: nameAr,
        role_id: roleId,
        nursery_id: scope === 'platform' ? null : nurseryId,
      });
      toast.success('Position created');
      setKeyVal('');
      setNameEn('');
      setNameAr('');
      setRoleId('');
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Failed to create position';
      toast.error(msg);
    }
  };

  const handleDelete = async (id: string, isSeed: boolean) => {
    if (isSeed && !isXo) {
      toast.error('Only xo_super_admin can delete seed positions');
      return;
    }
    if (!(await confirm({ description: 'Delete this position?', variant: 'danger' }))) return;
    try {
      await deletePos.mutateAsync(id);
      toast.success('Position deleted');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to delete');
    }
  };

  if (!isXo) {
    return (
      <div className="mx-auto max-w-lg space-y-3 px-4 py-16 text-center">
        <MaterialSymbol name="lock" className="text-error" size="text-2xl" />
        <h1 className="text-lg font-semibold text-on-surface">Super Admin only</h1>
        <p className="text-sm text-on-surface-variant">
          Position management is restricted to Super Admin. Branch admins can still
          assign positions to staff via the Staff Onboarding form using the positions
          that Super Admin has configured.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-5 pb-8">
      <PageHeader
        icon="work"
        title="Positions"
        description="Define staff positions. Each position links to one role, which determines the features that staff in that position can access."
      />

      <section className="space-y-3 rounded-xl border border-outline-variant bg-surface p-4 shadow-sm sm:p-5">
        <h2 className="text-base font-semibold text-on-surface">Create new position</h2>
        <div className="grid gap-3 md:grid-cols-2">
          <div>
            <Label htmlFor="pos-key">Key (machine name, e.g. lead_teacher)</Label>
            <Input
              id="pos-key"
              value={keyVal}
              onChange={(e) => setKeyVal(e.target.value)}
              placeholder="lead_teacher"
            />
          </div>
          <div>
            <Label htmlFor="pos-role">Role</Label>
            <Select id="pos-role" value={roleId} onChange={(e) => setRoleId(e.target.value)}>
              <option value="">-- pick a role --</option>
              {/* Super Admin intentionally excluded — would auto-grant platform
                  powers to whoever holds the position. */}
              {(roles.data ?? [])
                .filter((r) => r.base_role !== 'xo_super_admin')
                .map((r) => (
                  <option key={r.id} value={r.id}>
                    {lang === 'ar' ? r.name_ar : r.name_en} ({r.base_role}
                    {r.base_department ? ` / ${r.base_department}` : ''})
                  </option>
                ))}
            </Select>
          </div>
          <div>
            <Label htmlFor="pos-name-en">Name (English)</Label>
            <Input id="pos-name-en" value={nameEn} onChange={(e) => setNameEn(e.target.value)} placeholder="Lead Teacher" />
          </div>
          <div>
            <Label htmlFor="pos-name-ar">Name (Arabic)</Label>
            <Input id="pos-name-ar" value={nameAr} onChange={(e) => setNameAr(e.target.value)} placeholder="معلمة قائدة" />
          </div>
          {isXo ? (
            <div>
              <Label htmlFor="pos-scope">Scope</Label>
              <Select id="pos-scope" value={scope} onChange={(e) => setScope(e.target.value as typeof scope)}>
                <option value="nursery">This nursery only</option>
                <option value="platform">Platform-wide</option>
              </Select>
            </div>
          ) : null}
        </div>
        <Button onClick={handleCreate} disabled={createPos.isPending}>
          {createPos.isPending ? 'Creating…' : 'Create position'}
        </Button>
      </section>

      <TableCard
        title="Existing positions"
        count={positions.isLoading ? undefined : `${filtered.length} / ${allPositions.length}`}
        filters={
          <FilterBar onClear={clearFilters} canClear={filtersActive}>
            <FilterField label={t('common.search')} className="sm:flex-[2]">
              <SearchInput value={search} onChange={setSearch} placeholder="Name or key" />
            </FilterField>
            <FilterField label="Scope">
              <Select value={scopeFilter} onChange={(e) => setScopeFilter(e.target.value as typeof scopeFilter)}>
                <option value="all">{t('common.all')}</option>
                <option value="nursery">Nursery</option>
                <option value="platform">Platform</option>
              </Select>
            </FilterField>
            <FilterField label="Type">
              <Select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value as typeof typeFilter)}>
                <option value="all">{t('common.all')}</option>
                <option value="seed">Seed</option>
                <option value="custom">Custom</option>
              </Select>
            </FilterField>
          </FilterBar>
        }
        pagination={positions.isLoading || !filtered.length ? null : <TablePagination pager={pager} />}
      >
        {positions.isLoading ? (
          <TableLoading />
        ) : !filtered.length ? (
          <TableEmpty icon="work" title={allPositions.length ? 'No positions match these filters.' : 'No positions yet.'} />
        ) : (
          <DataTable minWidth={760}>
            <THead>
              <Th>Name</Th>
              <Th>Key</Th>
              <Th>Role</Th>
              <Th>Scope</Th>
              <Th>Type</Th>
              <Th align="end">{t('common.actions')}</Th>
            </THead>
            <TBody>
              {pager.pageItems.map((p) => (
                <Tr key={p.id}>
                  <Td className="font-semibold text-on-surface">{lang === 'ar' ? p.name_ar : p.name_en}</Td>
                  <Td>
                    <span className="rounded-md bg-surface-high px-2 py-1 font-mono text-xs text-on-surface-variant">{p.key}</span>
                  </Td>
                  <Td>
                    {p.role ? (
                      <span>
                        {lang === 'ar' ? p.role.name_ar : p.role.name_en}
                        <span className="ms-1 text-xs text-on-surface-variant">
                          ({p.role.base_role}
                          {p.role.base_department ? ` / ${p.role.base_department}` : ''})
                        </span>
                      </span>
                    ) : (
                      <span className="text-on-surface-variant">—</span>
                    )}
                  </Td>
                  <Td className="text-on-surface-variant">{p.nursery_id ? 'Nursery' : 'Platform'}</Td>
                  <Td>
                    <StatusPill tone={p.is_seed ? 'primary' : 'success'}>{p.is_seed ? 'Seed' : 'Custom'}</StatusPill>
                  </Td>
                  <Td align="end">
                    {!p.is_seed || isXo ? (
                      <IconAction
                        icon="delete"
                        label={`${t('common.delete')}: ${lang === 'ar' ? p.name_ar : p.name_en}`}
                        onClick={() => void handleDelete(p.id, p.is_seed)}
                        disabled={deletePos.isPending}
                        danger
                      />
                    ) : null}
                  </Td>
                </Tr>
              ))}
            </TBody>
          </DataTable>
        )}
      </TableCard>
    </div>
  );
}
