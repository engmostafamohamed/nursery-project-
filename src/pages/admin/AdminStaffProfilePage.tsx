import { useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';

import { StaffAttendanceCalendar } from '@/components/admin/staff/StaffAttendanceCalendar';
import { StaffDocumentsSection } from '@/components/admin/staff/StaffDocumentsSection';
import { StaffPayrollHistorySection } from '@/components/admin/staff/StaffPayrollHistorySection';
import { StaffProfileEditDialog } from '@/components/admin/staff/StaffProfileEditDialog';
import { StaffAttendanceHistory } from '@/components/admin/StaffAttendanceHistory';
import { StaffScheduleEditor } from '@/components/admin/StaffScheduleEditor';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { MaterialSymbol } from '@/components/ui/MaterialSymbol';
import { useAuthSession } from '@/hooks/useAuthSession';
import { useStaff } from '@/hooks/useStaff';
import { useStaffAttendanceMonth } from '@/hooks/useStaffAttendanceMonth';
import { useStaffPayrollRecords } from '@/hooks/useStaffPayrollRecords';
import { useStaffSchedules } from '@/hooks/useStaffSchedules';
import { useUserProfile } from '@/hooks/useUserProfile';
import { staffAvatarUrl } from '@/lib/staffAvatar';
import { getUserInitials } from '@/lib/utils';

export function AdminStaffProfilePage() {
  const { staffId } = useParams<{ staffId: string }>();
  const { t, i18n } = useTranslation();
  const { user } = useAuthSession();
  const { data: profile } = useUserProfile(user?.id);
  const staff = useStaff(profile?.nursery_id ?? undefined);
  const selected = useMemo(
    () => staff.staff.find((s) => String(s.id) === staffId || String(s.user_id) === staffId),
    [staff.staff, staffId],
  );
  const [tab, setTab] = useState<'personal' | 'schedule' | 'attendance' | 'documents' | 'payroll'>('personal');
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [deactivateOpen, setDeactivateOpen] = useState(false);
  const [attMonth, setAttMonth] = useState(() => new Date().toISOString().slice(0, 7));

  const profileId = selected?.hasStaffProfile ? String(selected.id) : undefined;
  const schedules = useStaffSchedules({
    nurseryId: profile?.nursery_id ?? undefined,
    profileId,
  });
  const attQ = useStaffAttendanceMonth(profileId, attMonth);
  const payrollRec = useStaffPayrollRecords(profile?.nursery_id ?? undefined, profileId);

  const u = (selected?.user as Record<string, unknown> | null) ?? {};
  const name = String(u.name_ar ?? u.name_en ?? u.full_name_ar ?? u.full_name_en ?? 'Staff');
  const avatar = staffAvatarUrl(name);
  const raw = selected as unknown as Record<string, unknown>;

  if (!selected) {
    return <p className="text-sm text-on-surface-variant">{t('staff.notFound')}</p>;
  }

  const nf = new Intl.NumberFormat(i18n.language?.startsWith('ar') ? 'ar-EG' : 'en-GB', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

  return (
    <div className="space-y-6 pb-8">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex gap-3">
          <Avatar className="h-16 w-16">
            <AvatarImage src={avatar} alt="" />
            <AvatarFallback>{getUserInitials(name, (u.email as string | null) ?? null)}</AvatarFallback>
          </Avatar>
          <div>
            <h1 className="text-lg font-semibold text-on-surface">{name}</h1>
            <p className="text-sm text-on-surface-variant">
              {t(`staff.departments.${String(selected.department ?? 'teaching')}`)} · {String(selected.position ?? '—')}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" className="gap-1" onClick={() => setEditOpen(true)} disabled={!selected.hasStaffProfile}>
            <MaterialSymbol name="edit" size="text-lg" />
            {t('staff.editProfile')}
          </Button>
          <Button
            type="button"
            variant="outline"
            className="gap-1"
            onClick={() =>
              toast.message(`${t('staff.profile.certificateToast')}\n${t('staff.profile.certificateToastAr')}`)
            }
          >
            <MaterialSymbol name="badge" size="text-lg" />
            {t('staff.profile.certificate')}
          </Button>
          <Button type="button" variant="outline" className="gap-1 text-error" onClick={() => setDeactivateOpen(true)}>
            <MaterialSymbol name="person_off" size="text-lg" />
            {t('staff.deactivate')}
          </Button>
        </div>
      </div>

      {!selected.hasStaffProfile ? (
        <Card>
          <CardContent className="p-4 text-sm text-on-surface-variant">{t('staff.profile.onboardingBanner')}</CardContent>
        </Card>
      ) : null}

      <div className="flex flex-wrap gap-2">
        {(['personal', 'schedule', 'attendance', 'documents', 'payroll'] as const).map((k) => (
          <Button
            key={k}
            type="button"
            size="sm"
            variant={tab === k ? 'default' : 'outline'}
            onClick={() => setTab(k)}
          >
            {t(`staff.tabs.${k}`)}
          </Button>
        ))}
      </div>

      {tab === 'personal' ? (
        <Card>
          <CardContent className="grid gap-4 p-4 md:grid-cols-2">
            <div>
              <p className="text-xs text-on-surface-variant">{t('staff.profile.contact')}</p>
              <p className="text-sm">{String(u.email ?? '—')}</p>
              <p className="text-sm">{String(u.phone ?? '—')}</p>
            </div>
            <div>
              <p className="text-xs text-on-surface-variant">{t('staff.profile.contract')}</p>
              <p className="text-sm">{t(`staff.contractTypes.${String(selected.contract_type)}`)}</p>
              <p className="text-sm">
                {t('staff.hireDate')}: {String(selected.hire_date ?? '—')}
              </p>
            </div>
            <div className="md:col-span-2">
              <p className="text-xs text-on-surface-variant">{t('staff.address')}</p>
              <p className="text-sm">{String(selected.address ?? '—')}</p>
            </div>
            <div>
              <p className="text-xs text-on-surface-variant">{t('staff.nationalId')}</p>
              <p className="text-sm">{String(selected.national_id ?? '—')}</p>
            </div>
            <div>
              <p className="text-xs text-on-surface-variant">{t('staff.salary')}</p>
              <p className="text-sm">
                {selected.salary_amount != null
                  ? t('invoice.egpAmount', { amount: nf.format(Number(selected.salary_amount)) })
                  : '—'}
              </p>
            </div>
            <div className="md:col-span-2">
              <p className="text-xs text-on-surface-variant">{t('staff.emergencyName')}</p>
              <p className="text-sm">{String(selected.emergency_contact_name ?? '—')}</p>
              <p className="text-sm">{String(selected.emergency_contact_phone ?? '—')}</p>
            </div>
          </CardContent>
        </Card>
      ) : null}

      {tab === 'schedule' ? (
        <section className="space-y-2 rounded-2xl border border-outline-variant bg-surface-container-lowest p-4">
          <p className="text-sm">{t('staff.totalHoursPerWeek', { hours: schedules.totalHoursPerWeek.toFixed(1) })}</p>
          <Button type="button" onClick={() => setScheduleOpen(true)} disabled={!profileId}>
            {t('staff.updateSchedule')}
          </Button>
        </section>
      ) : null}

      {tab === 'attendance' && profileId ? (
        <div className="space-y-4">
          <StaffAttendanceCalendar month={attMonth} onMonthChange={setAttMonth} rows={attQ.data ?? []} />
          <StaffAttendanceHistory rows={(attQ.data ?? []) as Array<Record<string, unknown>>} />
        </div>
      ) : null}
      {tab === 'attendance' && !profileId ? (
        <p className="text-sm text-on-surface-variant">{t('staff.profile.onboardingBanner')}</p>
      ) : null}

      {tab === 'documents' && profileId && profile?.nursery_id ? (
        <StaffDocumentsSection
          nurseryId={profile.nursery_id}
          staffProfileId={profileId}
          documents={raw.documents_json}
        />
      ) : null}
      {tab === 'documents' && !profileId ? (
        <p className="text-sm text-on-surface-variant">{t('staff.profile.onboardingBanner')}</p>
      ) : null}

      {tab === 'payroll' && profileId ? (
        <StaffPayrollHistorySection rows={payrollRec.data ?? []} loading={payrollRec.isPending} staffName={name} />
      ) : null}
      {tab === 'payroll' && !profileId ? (
        <p className="text-sm text-on-surface-variant">{t('staff.profile.onboardingBanner')}</p>
      ) : null}

      <StaffScheduleEditor
        open={scheduleOpen}
        onOpenChange={setScheduleOpen}
        initialRows={schedules.schedule.map((s) => ({
          day_of_week: Number(s.day_of_week),
          start_time: s.start_time ? String(s.start_time).slice(0, 5) : null,
          end_time: s.end_time ? String(s.end_time).slice(0, 5) : null,
          is_working_day: Boolean(s.is_working_day),
        }))}
        onSave={schedules.saveSchedule}
      />

      {selected.hasStaffProfile ? (
        <StaffProfileEditDialog
          open={editOpen}
          onOpenChange={setEditOpen}
          profile={selected}
          onSave={staff.saveStaff}
        />
      ) : null}

      <Dialog open={deactivateOpen} onOpenChange={setDeactivateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('staff.deactivateConfirmTitle')}</DialogTitle>
            <DialogDescription>{t('staff.deactivateConfirmDescription')}</DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button type="button" variant="outline" onClick={() => setDeactivateOpen(false)}>
              {t('common.cancel')}
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={() => {
                void staff.deactivateStaff({
                  profileId: String(selected.id),
                  userId: String(selected.user_id),
                  hasStaffProfile: selected.hasStaffProfile,
                });
                setDeactivateOpen(false);
                toast.success(`${t('staff.deactivatedToast')}\n${t('staff.deactivatedToastAr')}`);
              }}
            >
              {t('staff.deactivateConfirm')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
