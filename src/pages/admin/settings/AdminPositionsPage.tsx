import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';

import { confirm } from '@/components/ui/confirm';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { MaterialSymbol } from '@/components/ui/MaterialSymbol';
import { useAuthSession } from '@/hooks/useAuthSession';
import { useUserProfile } from '@/hooks/useUserProfile';
import { usePositions, useCreatePosition, useDeletePosition } from '@/hooks/usePositions';
import { useRoles } from '@/hooks/useRoles';

export function AdminPositionsPage() {
  const { i18n } = useTranslation();
  const lang = i18n.language === 'ar' ? 'ar' : 'en';
  const { user } = useAuthSession();
  const { data: profile } = useUserProfile(user?.id);
  const nurseryId = profile?.nursery_id ?? null;

  const positions = usePositions();
  const roles = useRoles();
  const createPos = useCreatePosition();
  const deletePos = useDeletePosition();

  const [keyVal, setKeyVal] = useState('');
  const [nameEn, setNameEn] = useState('');
  const [nameAr, setNameAr] = useState('');
  const [roleId, setRoleId] = useState('');
  const [scope, setScope] = useState<'nursery' | 'platform'>('nursery');

  const isXo = profile?.role === 'xo_super_admin';

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
    <div className="space-y-6 pb-8">
      <div>
        <h1 className="flex items-center gap-2 text-lg font-semibold text-on-surface">
          <MaterialSymbol name="work" className="text-primary" size="text-2xl" />
          Positions
        </h1>
        <p className="text-sm text-on-surface-variant">
          Define staff positions. Each position links to one role, which determines the
          features that staff in that position can access.
        </p>
      </div>

      <div className="rounded-2xl border border-outline-variant bg-surface-container-lowest p-4 space-y-3">
        <h2 className="text-sm font-semibold">Create new position</h2>
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
      </div>

      <div>
        <h2 className="mb-3 text-sm font-semibold">Existing positions ({positions.data?.length ?? 0})</h2>
        {positions.isLoading ? (
          <Skeleton className="h-48 w-full" />
        ) : (
          <div className="overflow-x-auto rounded-2xl border border-outline-variant">
            <table className="w-full text-sm">
              <thead className="bg-surface-container">
                <tr className="text-left">
                  <th className="px-3 py-2">Name</th>
                  <th className="px-3 py-2">Key</th>
                  <th className="px-3 py-2">Role</th>
                  <th className="px-3 py-2">Scope</th>
                  <th className="px-3 py-2">Type</th>
                  <th className="px-3 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {(positions.data ?? []).map((p) => (
                  <tr key={p.id} className="border-t border-outline-variant">
                    <td className="px-3 py-2 font-medium">
                      {lang === 'ar' ? p.name_ar : p.name_en}
                    </td>
                    <td className="px-3 py-2 text-on-surface-variant font-mono text-xs">{p.key}</td>
                    <td className="px-3 py-2">
                      {p.role ? (
                        <span>
                          {lang === 'ar' ? p.role.name_ar : p.role.name_en}
                          <span className="ml-1 text-xs text-on-surface-variant">
                            ({p.role.base_role}
                            {p.role.base_department ? ` / ${p.role.base_department}` : ''})
                          </span>
                        </span>
                      ) : (
                        <span className="text-on-surface-variant">—</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-on-surface-variant">
                      {p.nursery_id ? 'Nursery' : 'Platform'}
                    </td>
                    <td className="px-3 py-2">
                      {p.is_seed ? (
                        <span className="rounded bg-info/10 px-2 py-0.5 text-xs text-info">Seed</span>
                      ) : (
                        <span className="rounded bg-success/10 px-2 py-0.5 text-xs text-success">Custom</span>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      {!p.is_seed || isXo ? (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => void handleDelete(p.id, p.is_seed)}
                        >
                          <MaterialSymbol name="delete" size="text-base" />
                        </Button>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
