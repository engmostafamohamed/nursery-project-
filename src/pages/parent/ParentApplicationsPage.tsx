import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/EmptyState';
import { FilterMenu, type FilterMenuOption } from '@/components/ui/FilterMenu';
import { Skeleton } from '@/components/ui/skeleton';
import { useApplications } from '@/hooks/useApplications';
import { useAuthSession } from '@/hooks/useAuthSession';
import { useUserProfile } from '@/hooks/useUserProfile';
import { cn } from '@/lib/utils';

type ApplicationStatusFilter = 'all' | 'draft' | 'submitted' | 'under_review' | 'documents_pending' | 'approved' | 'rejected';

const openStatuses = ['draft', 'submitted', 'under_review', 'documents_pending'] as const;

function readText(source: Record<string, unknown>, key: string): string {
  const value = source[key];
  return typeof value === 'string' ? value.trim() : '';
}

function applicationChildName(row: Record<string, unknown>) {
  const child = (row.child_info_json as Record<string, unknown> | undefined) ?? {};
  return readText(child, 'full_name_en') || readText(child, 'full_name') || readText(child, 'full_name_ar');
}

function statusTone(status: string) {
  if (status === 'approved') return 'border-success/30 bg-success/10 text-success';
  if (status === 'rejected') return 'border-error/30 bg-error/10 text-error';
  if (status === 'documents_pending' || status === 'submitted' || status === 'under_review') {
    return 'border-warning/30 bg-warning/10 text-warning';
  }
  return 'border-outline-variant bg-surface-container text-on-surface-variant';
}

function statusIcon(status: string) {
  if (status === 'approved') return 'verified';
  if (status === 'rejected') return 'cancel';
  if (status === 'documents_pending') return 'upload_file';
  if (status === 'submitted' || status === 'under_review') return 'manage_search';
  return 'edit_document';
}

function formatDate(value: unknown, language: string) {
  if (typeof value !== 'string' || !value) return '-';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '-' : date.toLocaleDateString(language.startsWith('ar') ? 'ar-EG' : undefined);
}

function StatTile({ icon, label, value, tone }: { icon: string; label: string; value: number; tone: 'primary' | 'warning' | 'success' | 'error' }) {
  const toneClass = {
    primary: 'bg-primary/10 text-primary',
    warning: 'bg-warning/10 text-warning',
    success: 'bg-success/10 text-success',
    error: 'bg-error/10 text-error',
  }[tone];
  return (
    <div className="flex items-center gap-3 rounded-xl border border-outline-variant bg-surface p-4 shadow-sm">
      <span className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-md', toneClass)}>
        <span className="material-symbols-outlined text-xl" aria-hidden>{icon}</span>
      </span>
      <div className="min-w-0">
        <p className="truncate text-xs font-semibold uppercase text-on-surface-variant">{label}</p>
        <p className="text-2xl font-semibold text-on-surface">{value}</p>
      </div>
    </div>
  );
}

export function ParentApplicationsPage() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const { user } = useAuthSession();
  const { data: profile } = useUserProfile(user?.id);
  const nurseryId = profile?.nursery_id ?? undefined;
  const applications = useApplications({ parentId: user?.id, nurseryId });
  const [statusFilter, setStatusFilter] = useState<ApplicationStatusFilter>('all');
  const [addingChild, setAddingChild] = useState(false);

  const rows = applications.parentApplications;
  const filteredRows = useMemo(
    () => (statusFilter === 'all' ? rows : rows.filter((row) => String(row.status ?? 'draft') === statusFilter)),
    [rows, statusFilter],
  );
  const counts = useMemo(() => {
    const byStatus = (status: string) => rows.filter((row) => String(row.status ?? 'draft') === status).length;
    return {
      open: rows.filter((row) => (openStatuses as readonly string[]).includes(String(row.status ?? 'draft'))).length,
      draft: byStatus('draft'),
      approved: byStatus('approved'),
      rejected: byStatus('rejected'),
    };
  }, [rows]);

  const statusOptions: FilterMenuOption<ApplicationStatusFilter>[] = [
    { value: 'all', label: t('common.all', { defaultValue: 'All' }), icon: 'filter_list' },
    { value: 'draft', label: t('applications.statuses.draft', { defaultValue: 'Draft' }), icon: 'edit_note' },
    { value: 'submitted', label: t('applications.statuses.submitted', { defaultValue: 'Submitted' }), icon: 'outbox' },
    { value: 'under_review', label: t('applications.statuses.under_review', { defaultValue: 'Under Review' }), icon: 'rate_review' },
    { value: 'documents_pending', label: t('applications.statuses.documents_pending', { defaultValue: 'Documents Pending' }), icon: 'folder_open' },
    { value: 'approved', label: t('applications.statuses.approved', { defaultValue: 'Approved' }), icon: 'check_circle' },
    { value: 'rejected', label: t('applications.statuses.rejected', { defaultValue: 'Rejected' }), icon: 'cancel' },
  ];

  const nextStepFor = (status: string) => {
    if (status === 'approved') return t('parent.applications.nextApproved', { defaultValue: 'Accepted. The child profile is active on your Children page.' });
    if (status === 'rejected') return t('parent.applications.nextRejected', { defaultValue: 'Not accepted. Check nursery messages for details.' });
    if (status === 'documents_pending') return t('parent.applications.nextDocuments', { defaultValue: 'The nursery requested documents. Upload them and submit again.' });
    if (status === 'submitted' || status === 'under_review') return t('parent.applications.nextReview', { defaultValue: 'With nursery admissions. You will be notified when it is reviewed.' });
    return t('parent.applications.nextDraft', { defaultValue: 'Complete the information, choose a package, and pay all or part of it. It is sent for review as soon as a payment is submitted.' });
  };

  const addChild = async () => {
    if (!user?.id || !nurseryId) {
      toast.error(t('applications.notFound'));
      return;
    }
    setAddingChild(true);
    try {
      const applicationId = await applications.createParentDraft({
        parentId: user.id,
        nurseryId,
        parentProfile: profile,
      });
      navigate(`/parent/applications/${applicationId}?newChild=1`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t('payment.errors.actionFailed'));
    } finally {
      setAddingChild(false);
    }
  };

  return (
    <div className="w-full max-w-none space-y-5 pb-6">
      <section className="overflow-hidden rounded-xl border border-outline-variant bg-surface shadow-sm">
        <div className="flex flex-col gap-4 border-b border-outline-variant bg-surface-container-lowest px-4 py-5 lg:flex-row lg:items-center lg:justify-between">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase text-primary">
              {t('parent.applications.eyebrow', { defaultValue: 'Admissions' })}
            </p>
            <h1 className="mt-1 text-2xl font-semibold text-on-surface">
              {t('parent.nav.applications', { defaultValue: 'Applications' })}
            </h1>
            <p className="mt-1 max-w-3xl text-sm leading-6 text-on-surface-variant">
              {t('parent.applications.subtitle', {
                defaultValue: 'Registration applications for your children. Open a draft to complete information, package, documents, and payment, then submit it for review.',
              })}
            </p>
          </div>
          <Button type="button" className="h-11 rounded-md" disabled={addingChild} onClick={() => void addChild()}>
            <span className="material-symbols-outlined me-2 text-base" aria-hidden>person_add</span>
            {addingChild ? t('common.loading') : t('applications.createApplication', { defaultValue: 'Add child' })}
          </Button>
        </div>
        <div className="grid gap-3 p-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatTile icon="pending_actions" label={t('parent.applications.openCount', { defaultValue: 'In progress' })} value={counts.open} tone="warning" />
          <StatTile icon="edit_document" label={t('applications.statuses.draft', { defaultValue: 'Draft' })} value={counts.draft} tone="primary" />
          <StatTile icon="verified" label={t('applications.statuses.approved', { defaultValue: 'Approved' })} value={counts.approved} tone="success" />
          <StatTile icon="cancel" label={t('applications.statuses.rejected', { defaultValue: 'Rejected' })} value={counts.rejected} tone="error" />
        </div>
      </section>

      <section className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-outline-variant bg-surface px-4 py-3 shadow-sm">
        <p className="text-xs text-on-surface-variant">
          {filteredRows.length} / {rows.length}
        </p>
        <FilterMenu value={statusFilter} options={statusOptions} onChange={setStatusFilter} />
      </section>

      {applications.isLoading ? (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          <Skeleton className="h-40 rounded-xl" />
          <Skeleton className="h-40 rounded-xl" />
          <Skeleton className="h-40 rounded-xl" />
        </div>
      ) : !rows.length ? (
        <EmptyState
          icon="assignment"
          title={t('applications.emptyTitle')}
          description={t('parent.applications.emptyBody', { defaultValue: 'Press "Add child" to start a registration application.' })}
        />
      ) : !filteredRows.length ? (
        <div className="rounded-xl border border-outline-variant bg-surface p-8 text-center text-sm text-on-surface-variant shadow-sm">
          {t('parent.applications.noResults', { defaultValue: 'No applications match this filter.' })}
        </div>
      ) : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {filteredRows.map((row) => {
            const id = String(row.id);
            const status = String(row.status ?? 'draft');
            const name = applicationChildName(row) || t('applications.newChildRegistration', { defaultValue: 'New child registration' });
            const canComplete = status === 'draft' || status === 'documents_pending';
            return (
              <Link
                key={id}
                to={`/parent/applications/${id}`}
                className="group flex flex-col rounded-xl border border-outline-variant bg-surface p-4 shadow-sm transition hover:border-primary hover:shadow-md"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex min-w-0 items-start gap-3">
                    <span className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-md border', statusTone(status))}>
                      <span className="material-symbols-outlined text-xl" aria-hidden>{statusIcon(status)}</span>
                    </span>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-on-surface">{name}</p>
                      <p className="mt-1 text-xs text-on-surface-variant">
                        {status === 'draft'
                          ? `${t('common.created', { defaultValue: 'Created' })}: ${formatDate(row.created_at, i18n.language)}`
                          : `${t('applications.submittedAt')}: ${formatDate(row.submitted_at, i18n.language)}`}
                      </p>
                    </div>
                  </div>
                  <span className={cn('shrink-0 rounded-full border px-2.5 py-1 text-xs font-semibold', statusTone(status))}>
                    {t(`applications.statuses.${status}`, { defaultValue: status })}
                  </span>
                </div>
                <p className="mt-3 text-xs leading-5 text-on-surface-variant">{nextStepFor(status)}</p>
                <div className="mt-auto flex items-center justify-between gap-3 pt-4 text-xs">
                  <span className="font-mono text-on-surface-variant">{id.slice(0, 8)}</span>
                  <span className="inline-flex items-center gap-1 font-semibold text-primary">
                    {canComplete
                      ? t('parent.children.completeApplication', { defaultValue: 'Complete application' })
                      : t('parent.children.openApplication', { defaultValue: 'Open application' })}
                    <span className="material-symbols-outlined text-sm transition group-hover:translate-x-0.5" aria-hidden>
                      arrow_forward
                    </span>
                  </span>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
