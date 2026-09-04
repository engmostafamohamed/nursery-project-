import { useMemo, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/EmptyState';
import { Input } from '@/components/ui/input';
import { useActiveNurseryId } from '@/hooks/useActiveNurseryId';
import { useApplications } from '@/hooks/useApplications';

/**
 * Two flows write applications with different shapes: the inquiry flow stores a flat
 * { full_name }, while parent signup stores { father, mother, ... } and the child's
 * name as full_name_en/full_name_ar. Read both so neither renders as a blank row.
 */
function applicantParentName(parentInfo: Record<string, unknown>): string {
  const direct = parentInfo.full_name;
  if (typeof direct === 'string' && direct.trim()) return direct.trim();
  for (const key of ['mother', 'father'] as const) {
    const parent = parentInfo[key] as Record<string, unknown> | null | undefined;
    const name = parent?.full_name;
    if (typeof name === 'string' && name.trim()) return name.trim();
  }
  return '';
}

function applicantChildName(childInfo: Record<string, unknown>): string {
  for (const key of ['full_name', 'full_name_en', 'full_name_ar'] as const) {
    const name = childInfo[key];
    if (typeof name === 'string' && name.trim()) return name.trim();
  }
  return '';
}

function shortApplicationId(id: unknown): string {
  const value = typeof id === 'string' ? id.trim() : '';
  return value ? value.slice(0, 8) : '-';
}

export function AdminApplicationsPage() {
  const { t } = useTranslation();
  const location = useLocation();
  const { activeNurseryId } = useActiveNurseryId();
  const apps = useApplications({ nurseryId: activeNurseryId ?? undefined });
  const [status, setStatus] = useState('all');
  const [search, setSearch] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const admissionsBasePath = location.pathname.startsWith('/xo-admin/')
    ? '/xo-admin/nursery/admissions'
    : '/admin/admissions';

  const rows = useMemo(() => apps.adminApplications.filter((r) => {
    if (status === 'all' && ['approved', 'rejected'].includes(String(r.status))) return false;
    if (status !== 'all' && String(r.status) !== status) return false;
    if (from && String(r.created_at) < `${from}T00:00:00`) return false;
    if (to && String(r.created_at) > `${to}T23:59:59`) return false;
    const q = search.trim().toLowerCase();
    if (!q) return true;
    const parent = (r.parent_info_json as Record<string, unknown> | undefined) ?? {};
    const child = (r.child_info_json as Record<string, unknown> | undefined) ?? {};
    return [
      String(r.id ?? ''),
      shortApplicationId(r.id),
      applicantParentName(parent),
      applicantChildName(child),
    ].join(' ').toLowerCase().includes(q);
  }), [apps.adminApplications, status, search, from, to]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-lg font-semibold text-on-surface">{t('applications.adminListTitle')}</h1>
        <Button asChild variant="outline" size="sm">
          <Link to={`${admissionsBasePath}/inquiries`}>{t('admissions.inquiriesTitle')}</Link>
        </Button>
      </div>
      <div className="grid gap-3 md:grid-cols-3">
        <div className="rounded-xl border border-outline-variant bg-surface-container-lowest p-3"><p className="text-xs">{t('applications.pendingReview')}</p><p className="text-lg font-bold">{apps.stats.pendingReview}</p></div>
        <div className="rounded-xl border border-outline-variant bg-surface-container-lowest p-3"><p className="text-xs">{t('applications.approvedThisMonth')}</p><p className="text-lg font-bold">{apps.stats.approvedThisMonth}</p></div>
        <div className="rounded-xl border border-outline-variant bg-surface-container-lowest p-3"><p className="text-xs">{t('applications.avgReviewTime')}</p><p className="text-lg font-bold">{apps.stats.avgReviewHours.toFixed(1)}h</p></div>
      </div>
      <div className="grid gap-2 rounded-xl border border-outline-variant bg-surface-container-lowest p-3 md:grid-cols-4">
        <select className="h-11 rounded-lg border border-outline-variant bg-surface text-foreground px-3 text-sm" value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="all">{t('common.all')}</option>
          {(['draft', 'submitted', 'under_review', 'documents_pending', 'approved', 'rejected'] as const).map((s) => <option key={s} value={s}>{t(`applications.statuses.${s}`)}</option>)}
        </select>
        <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t('applications.search')} />
      </div>
      {!rows.length ? (
        <EmptyState icon="assignment" title={t('applications.emptyTitle')} description={t('applications.emptyDescription')} />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-outline-variant bg-surface-container-lowest">
          <table className="w-full min-w-[900px] text-sm">
            <thead><tr className="bg-surface-container text-on-surface-variant"><th className="px-3 py-2 text-start">{t('applications.applicationId')}</th><th className="px-3 py-2 text-start">{t('applications.parentName')}</th><th className="px-3 py-2 text-start">{t('applications.childName')}</th><th className="px-3 py-2 text-start">{t('applications.submittedAt')}</th><th className="px-3 py-2 text-start">{t('applications.status')}</th><th className="px-3 py-2 text-start">{t('applications.documentsCount')}</th><th className="px-3 py-2 text-start">{t('common.actions')}</th></tr></thead>
            <tbody>
              {rows.map((r) => {
                const parent = (r.parent_info_json as Record<string, unknown> | undefined) ?? {};
                const child = (r.child_info_json as Record<string, unknown> | undefined) ?? {};
                return (
                  <tr key={String(r.id)} className="border-t border-outline-variant">
                    <td className="px-3 py-2 font-mono text-xs text-on-surface-variant" title={String(r.id)}>
                      {shortApplicationId(r.id)}
                    </td>
                    <td className="px-3 py-2">{applicantParentName(parent) || '-'}</td>
                    <td className="px-3 py-2">{applicantChildName(child) || '-'}</td>
                    <td className="px-3 py-2">{r.submitted_at ? new Date(String(r.submitted_at)).toLocaleDateString() : '-'}</td>
                    <td className="px-3 py-2">{t(`applications.statuses.${String(r.status)}`)}</td>
                    <td className="px-3 py-2">{Number(r.documents_count ?? 0)}</td>
                    <td className="px-3 py-2">
                      <Button asChild size="sm" variant="outline">
                        <Link to={`${admissionsBasePath}/applications/${String(r.id)}`}>
                          {t('invoice.actions.viewDetails')}
                        </Link>
                      </Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
