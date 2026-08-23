import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';

import { InquiryDetailModal } from '@/components/admin/InquiryDetailModal';
import { InquiryKanban } from '@/components/admin/InquiryKanban';
import { EmptyState } from '@/components/ui/EmptyState';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { useAuthSession } from '@/hooks/useAuthSession';
import { useInquiries } from '@/hooks/useInquiries';
import { useUserProfile } from '@/hooks/useUserProfile';
import { useWaitlist } from '@/hooks/useWaitlist';
import { useApplications } from '@/hooks/useApplications';

export function AdminInquiriesPage() {
  const { t } = useTranslation();
  const { user } = useAuthSession();
  const { data: profile } = useUserProfile(user?.id);
  const [view, setView] = useState<'kanban' | 'list'>('kanban');
  const [status, setStatus] = useState('all');
  const [source, setSource] = useState('all');
  const [assignedTo, setAssignedTo] = useState('all');
  const [search, setSearch] = useState('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [selected, setSelected] = useState<Record<string, unknown> | null>(null);
  const inquiries = useInquiries(profile?.nursery_id ?? undefined, { status, source, assignedTo, search, fromDate, toDate });
  const waitlist = useWaitlist(profile?.nursery_id ?? undefined);
  const apps = useApplications({ nurseryId: profile?.nursery_id ?? undefined });

  const waitlistCount = useMemo(() => inquiries.inquiries.filter((i) => String(i.status) === 'waitlisted').length, [inquiries.inquiries]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold text-on-surface">{t('admissions.inquiriesTitle')}</h1>
        <div className="flex gap-2">
          <Button variant={view === 'kanban' ? 'default' : 'outline'} size="sm" onClick={() => setView('kanban')}>{t('admissions.kanban')}</Button>
          <Button variant={view === 'list' ? 'default' : 'outline'} size="sm" onClick={() => setView('list')}>{t('admissions.list')}</Button>
          <Button asChild variant="outline" size="sm"><Link to="/admin/admissions/applications">{t('applications.adminListTitle')}</Link></Button>
          <Button asChild variant="outline" size="sm"><Link to="/admin/admissions/waitlist">{t('admissions.waitlistTitle')}</Link></Button>
          <Button asChild variant="outline" size="sm"><Link to="/admin/admissions/import">{t('import.title')}</Link></Button>
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-4">
        <div className="rounded-xl border border-outline-variant bg-surface-container-lowest p-3"><p className="text-xs">{t('admissions.newThisWeek')}</p><p className="text-lg font-bold">{inquiries.stats.newThisWeek}</p></div>
        <div className="rounded-xl border border-outline-variant bg-surface-container-lowest p-3"><p className="text-xs">{t('admissions.conversionRate')}</p><p className="text-lg font-bold">{inquiries.stats.conversionRate.toFixed(1)}%</p></div>
        <div className="rounded-xl border border-outline-variant bg-surface-container-lowest p-3"><p className="text-xs">{t('admissions.avgResponseTime')}</p><p className="text-lg font-bold">{inquiries.stats.avgResponseHours.toFixed(1)}h</p></div>
        <div className="rounded-xl border border-outline-variant bg-surface-container-lowest p-3"><p className="text-xs">{t('admissions.waitlistCount')}</p><p className="text-lg font-bold">{waitlistCount}</p></div>
      </div>

      <div className="grid gap-2 rounded-xl border border-outline-variant bg-surface-container-lowest p-3 md:grid-cols-6">
        <select className="h-11 rounded-lg border border-outline-variant bg-surface text-foreground px-3 text-sm" value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="all">{t('common.all')}</option>
          {(['new', 'contacted', 'scheduled', 'waitlisted', 'enrolled', 'declined'] as const).map((s) => <option key={s} value={s}>{t(`admissions.statuses.${s}`)}</option>)}
        </select>
        <select className="h-11 rounded-lg border border-outline-variant bg-surface text-foreground px-3 text-sm" value={source} onChange={(e) => setSource(e.target.value)}>
          <option value="all">{t('common.all')}</option>
          {(['website', 'referral', 'walk_in', 'social_media', 'other'] as const).map((s) => <option key={s} value={s}>{t(`admissions.sources.${s}`)}</option>)}
        </select>
        <select className="h-11 rounded-lg border border-outline-variant bg-surface text-foreground px-3 text-sm" value={assignedTo} onChange={(e) => setAssignedTo(e.target.value)}>
          <option value="all">{t('common.all')}</option>
          <option value={user?.id ?? 'all'}>{t('admissions.assignedToMe')}</option>
        </select>
        <Input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} />
        <Input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} />
        <Input placeholder={t('admissions.searchPlaceholder')} value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>

      {!inquiries.inquiries.length ? (
        <EmptyState icon="person_search" title={t('admissions.emptyTitle')} description={t('admissions.emptyDescription')} />
      ) : view === 'kanban' ? (
        <InquiryKanban
          inquiries={inquiries.inquiries}
          onOpen={setSelected}
          onAssignToMe={(id) => void inquiries.updateInquiry({ id, updates: { assigned_to: user?.id } })}
          onStatusChange={(id, next) => void inquiries.updateInquiry({ id, updates: { status: next } })}
        />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-outline-variant bg-surface-container-lowest">
          <table className="w-full min-w-[900px] text-sm">
            <thead><tr className="bg-surface-container text-on-surface-variant"><th className="px-3 py-2 text-start">{t('admissions.parentName')}</th><th className="px-3 py-2 text-start">{t('admissions.childName')}</th><th className="px-3 py-2 text-start">{t('admissions.source')}</th><th className="px-3 py-2 text-start">{t('admissions.status')}</th><th className="px-3 py-2 text-start">{t('common.actions')}</th></tr></thead>
            <tbody>
              {inquiries.inquiries.map((r) => (
                <tr key={String(r.id)} className="border-t border-outline-variant">
                  <td className="px-3 py-2">{String(r.parent_name)}</td>
                  <td className="px-3 py-2">{String(r.child_name)}</td>
                  <td className="px-3 py-2">{t(`admissions.sources.${String(r.source)}`)}</td>
                  <td className="px-3 py-2">{t(`admissions.statuses.${String(r.status)}`)}</td>
                  <td className="px-3 py-2"><Button size="sm" variant="outline" onClick={() => setSelected(r)}>{t('invoice.actions.viewDetails')}</Button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <InquiryDetailModal
        open={Boolean(selected)}
        onOpenChange={(o) => !o && setSelected(null)}
        inquiry={selected}
        classes={inquiries.classes}
        onUpdate={inquiries.updateInquiry}
        onScheduleInterview={(id) => {
          void inquiries.updateInquiry({ id, updates: { status: 'scheduled' } });
          toast.success(t('admissions.interviewScheduled'));
        }}
        onMoveToWaitlist={(id, classId) => {
          if (!profile?.nursery_id) return;
          void waitlist.addToWaitlist({ inquiryId: id, classId, nurseryId: profile.nursery_id });
          toast.success(t('admissions.movedToWaitlist'));
        }}
        onCreateApplication={(inquiryId) => {
          if (!profile?.nursery_id) return;
          void apps.createFromInquiry({ inquiryId, nurseryId: profile.nursery_id }).then(() => toast.success(t('applications.createdFromInquiry')));
        }}
      />
    </div>
  );
}
