import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { MaterialSymbol } from '@/components/ui/MaterialSymbol';
import type { StaffProfileView } from '@/hooks/useStaff';
import { staffAvatarUrl } from '@/lib/staffAvatar';
import { supabase } from '@/lib/supabase';
import { cn, getUserInitials } from '@/lib/utils';

type Props = {
  rows: StaffProfileView[];
  language: string;
  /** When true, render a "Nursery" column (for cross-nursery viewers like xo_super_admin). */
  showNurseryColumn?: boolean;
  /** When true, render an Edit button per row. */
  canEdit?: boolean;
  /** When true, render a Delete button per row. */
  canDelete?: boolean;
};

interface NurseryName { id: string; name_en: string; name_ar: string }

function useNurseryNameLookup(showNurseryColumn: boolean, rows: StaffProfileView[]) {
  const nurseryIds = Array.from(
    new Set(
      rows.map((r) => String((r as { nursery_id?: string }).nursery_id ?? '')).filter(Boolean),
    ),
  );
  return useQuery<Map<string, NurseryName>>({
    queryKey: ['nursery-names', nurseryIds.sort().join(',')],
    queryFn: async () => {
      const map = new Map<string, NurseryName>();
      if (nurseryIds.length === 0) return map;
      const { data, error } = await supabase
        .from('nurseries')
        .select('id, name_en, name_ar')
        .in('id', nurseryIds);
      if (error) throw error;
      for (const row of (data ?? []) as NurseryName[]) map.set(row.id, row);
      return map;
    },
    enabled: showNurseryColumn && nurseryIds.length > 0,
    staleTime: 1000 * 60 * 5,
  });
}

function displayName(u: Record<string, unknown> | null, lang: string): string {
  if (!u) return '—';
  const ar = String(u.name_ar ?? u.full_name_ar ?? '');
  const en = String(u.name_en ?? u.full_name_en ?? '');
  if (lang.startsWith('ar')) return ar || en || '—';
  return en || ar || '—';
}

export function StaffDirectoryTable({
  rows,
  language,
  showNurseryColumn = false,
  canEdit = false,
  canDelete = false,
}: Props) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const nurseryNames = useNurseryNameLookup(showNurseryColumn, rows);

  return (
    <div className="overflow-x-auto rounded-2xl border border-outline-variant bg-surface-container-lowest">
      <table className="w-full min-w-[900px] text-sm">
        <thead>
          <tr className="border-b border-outline-variant bg-surface-container text-on-surface-variant">
            <th className="px-3 py-2 text-start">{t('staff.directory.col.photo')}</th>
            <th className="px-3 py-2 text-start">{t('staff.directory.col.name')}</th>
            {showNurseryColumn ? (
              <th className="px-3 py-2 text-start">Nursery</th>
            ) : null}
            <th className="px-3 py-2 text-start">{t('staff.directory.col.position')}</th>
            <th className="px-3 py-2 text-start">{t('staff.directory.col.department')}</th>
            <th className="px-3 py-2 text-start">{t('staff.directory.col.hireDate')}</th>
            <th className="px-3 py-2 text-start">{t('staff.directory.col.status')}</th>
            <th className="px-3 py-2 text-start">{t('staff.directory.col.role')}</th>
            {canEdit || canDelete ? (
              <th className="px-3 py-2 text-start">Actions</th>
            ) : null}
          </tr>
        </thead>
        <tbody>
          {rows.map((s) => {
            const u = (s.user as Record<string, unknown> | null) ?? {};
            const name = displayName(u, language);
            const status = String(u.status ?? 'active');
            const avatar = staffAvatarUrl(name);
            const routeId = String(s.id);
            const nurseryId = String((s as { nursery_id?: string }).nursery_id ?? '');
            const nursery = nurseryNames.data?.get(nurseryId);
            const nurseryLabel = nursery
              ? language.startsWith('ar')
                ? nursery.name_ar
                : nursery.name_en
              : '—';
            return (
              <tr
                key={routeId}
                role="button"
                tabIndex={0}
                className={cn(
                  'cursor-pointer border-t border-outline-variant hover:bg-surface-container/60',
                )}
                onClick={() => navigate(`/admin/staff/${routeId}`)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') navigate(`/admin/staff/${routeId}`);
                }}
              >
                <td className="px-3 py-2">
                  <Avatar className="h-10 w-10">
                    <AvatarImage src={avatar} alt="" />
                    <AvatarFallback>{getUserInitials(name, (u.email as string | null | undefined) ?? null)}</AvatarFallback>
                  </Avatar>
                </td>
                <td className="px-3 py-2 font-medium text-on-surface">{name}</td>
                {showNurseryColumn ? (
                  <td className="px-3 py-2 text-on-surface-variant">{nurseryLabel}</td>
                ) : null}
                <td className="px-3 py-2">
                  {(s as { hasStaffProfile?: boolean }).hasStaffProfile && s.position && s.position !== '—'
                    ? String(s.position)
                    : '—'}
                </td>
                <td className="px-3 py-2">
                  {(s as { hasStaffProfile?: boolean }).hasStaffProfile && s.department
                    ? t(`staff.departments.${String(s.department)}`)
                    : '—'}
                </td>
                <td className="px-3 py-2">
                  {(s as { hasStaffProfile?: boolean }).hasStaffProfile && s.hire_date
                    ? String(s.hire_date)
                    : '—'}
                </td>
                <td className="px-3 py-2">
                  <Badge
                    className={cn(
                      status === 'active'
                        ? 'border-success/40 bg-success/10 text-success'
                        : 'border-outline-variant bg-surface-container text-on-surface-variant',
                    )}
                  >
                    {status === 'active' ? t('staff.status.active') : t('staff.status.inactive')}
                  </Badge>
                </td>
                <td className="px-3 py-2">
                  {/* Prefer the custom role name (e.g. "Manager Teacher") over
                      the base auth enum (e.g. "teacher"). Falls back to the
                      enum when the user has no custom role assigned. */}
                  {(() => {
                    const roleData = (u.role_data as { name_en?: string | null; name_ar?: string | null } | null) ?? null;
                    const customName = (language.startsWith('ar') ? roleData?.name_ar : roleData?.name_en) ?? null;
                    return customName?.trim() ? customName.trim() : (
                      <span className="capitalize">{String(u.role ?? '—')}</span>
                    );
                  })()}
                </td>
                {canEdit || canDelete ? (
                  <td
                    className="px-3 py-2"
                    onClick={(e) => e.stopPropagation()}
                    onKeyDown={(e) => e.stopPropagation()}
                  >
                    <div className="flex items-center gap-1">
                      {canEdit ? (
                        <button
                          type="button"
                          aria-label={`Edit ${name}`}
                          className="rounded p-1 text-on-surface hover:bg-surface-container"
                          onClick={() => navigate(`/admin/staff/${routeId}`)}
                        >
                          <MaterialSymbol name="edit" size="text-base" />
                        </button>
                      ) : null}
                      {canDelete ? (
                        <button
                          type="button"
                          aria-label={`Delete ${name}`}
                          className="rounded p-1 text-error hover:bg-error/10"
                          onClick={() => navigate(`/admin/staff/${routeId}`)}
                        >
                          <MaterialSymbol name="delete" size="text-base" />
                        </button>
                      ) : null}
                    </div>
                  </td>
                ) : null}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
