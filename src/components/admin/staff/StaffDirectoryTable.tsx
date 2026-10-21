import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';

import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { DataTable, IconAction, StatusPill, TBody, THead, Td, Th, Tr } from '@/components/ui/DataTable';
import type { StaffProfileView } from '@/hooks/useStaff';
import { readableCode } from '@/lib/readableCode';
import { supabase } from '@/lib/supabase';
import { getUserInitials } from '@/lib/utils';

type Props = {
  rows: StaffProfileView[];
  language: string;
  /** When true, render a "Nursery" column (for cross-nursery viewers like xo_super_admin). */
  showNurseryColumn?: boolean;
  /** When true, render an Edit button per row. */
  canEdit?: boolean;
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

function formatHireDate(value: string, lang: string): string {
  // A plain day is read at noon so no timezone moves it to the day before.
  const date = new Date(/^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T12:00:00` : value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString(lang.startsWith('ar') ? 'ar-EG' : 'en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

export function StaffDirectoryTable({
  rows,
  language,
  showNurseryColumn = false,
  canEdit = false,
}: Props) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const nurseryNames = useNurseryNameLookup(showNurseryColumn, rows);

  return (
    <DataTable minWidth={880}>
      <THead>
        <Th>{t('staff.directory.col.name')}</Th>
        {showNurseryColumn ? <Th>{t('staff.directory.col.nursery')}</Th> : null}
        <Th>{t('staff.directory.col.position')}</Th>
        <Th>{t('staff.directory.col.department')}</Th>
        <Th>{t('staff.directory.col.hireDate')}</Th>
        <Th>{t('staff.directory.col.status')}</Th>
        <Th>{t('staff.directory.col.role')}</Th>
        {canEdit ? <Th align="end">{t('common.actions')}</Th> : null}
      </THead>
      <TBody>
        {rows.map((s) => {
          const u = (s.user as Record<string, unknown> | null) ?? {};
          const name = displayName(u, language);
          const email = typeof u.email === 'string' ? u.email : '';
          const active = String(u.status ?? 'active') === 'active';
          const hasProfile = Boolean((s as { hasStaffProfile?: boolean }).hasStaffProfile);
          const routeId = String(s.id);
          const nurseryId = String((s as { nursery_id?: string }).nursery_id ?? '');
          const nursery = nurseryNames.data?.get(nurseryId);
          const nurseryLabel = nursery ? (language.startsWith('ar') ? nursery.name_ar : nursery.name_en) : '—';
          // Prefer the custom role name (e.g. "Manager Teacher") over the base auth enum.
          const roleData = (u.role_data as { name_en?: string | null; name_ar?: string | null } | null) ?? null;
          const customRole = ((language.startsWith('ar') ? roleData?.name_ar : roleData?.name_en) ?? '').trim();
          const baseRole = String(u.role ?? '');
          const role = customRole || (baseRole ? t(`chatAdmin.roles.${baseRole}`, { defaultValue: readableCode(baseRole) }) : '—');
          const position = hasProfile && s.position && s.position !== '—' ? readableCode(String(s.position)) : '';
          return (
            <Tr key={routeId} onClick={() => navigate(`/admin/staff/${routeId}`)}>
              <Td>
                <div className="flex min-w-0 items-center gap-3">
                  <Avatar className="h-10 w-10 shrink-0">
                    <AvatarFallback className="bg-primary/10 text-xs font-semibold text-primary">
                      {getUserInitials(name.replace(/[^\p{L}\p{N}\s]/gu, ' '), email || null)}
                    </AvatarFallback>
                  </Avatar>
                  <div className="min-w-0">
                    <p className="truncate font-semibold text-on-surface">{name}</p>
                    {email ? <p className="truncate text-xs text-on-surface-variant" dir="ltr">{email}</p> : null}
                  </div>
                </div>
              </Td>
              {showNurseryColumn ? <Td className="text-on-surface-variant">{nurseryLabel}</Td> : null}
              <Td className="text-on-surface">{position || <span className="text-on-surface-variant">—</span>}</Td>
              <Td>
                {hasProfile && s.department ? (
                  <span className="inline-flex rounded-md bg-surface-high px-2 py-1 text-xs font-medium text-on-surface">
                    {t(`staff.departments.${String(s.department)}`)}
                  </span>
                ) : (
                  <span className="text-on-surface-variant">—</span>
                )}
              </Td>
              <Td className="text-on-surface-variant">
                {hasProfile && s.hire_date ? formatHireDate(String(s.hire_date), language) : '—'}
              </Td>
              <Td>
                <StatusPill tone={active ? 'success' : 'neutral'}>
                  {active ? t('staff.status.active') : t('staff.status.inactive')}
                </StatusPill>
              </Td>
              <Td className="text-on-surface">{role}</Td>
              {canEdit ? (
                <Td align="end">
                  <IconAction icon="edit" label={`${t('common.edit')}: ${name}`} to={`/admin/staff/${routeId}`} />
                </Td>
              ) : null}
            </Tr>
          );
        })}
      </TBody>
    </DataTable>
  );
}
