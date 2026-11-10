import { useMemo, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';

import { StaffAttendanceCalendar } from '@/components/admin/staff/StaffAttendanceCalendar';
import { StaffClassesTable } from '@/components/admin/staff/StaffClassesTable';
import { StaffDocumentsSection } from '@/components/admin/staff/StaffDocumentsSection';
import { StaffPayrollHistorySection } from '@/components/admin/staff/StaffPayrollHistorySection';
import { StaffProfileEditDialog } from '@/components/admin/staff/StaffProfileEditDialog';
import { StaffProfileHero } from '@/components/admin/staff/StaffProfileHero';
import { StaffAttendanceHistory } from '@/components/admin/StaffAttendanceHistory';
import { StaffScheduleEditor } from '@/components/admin/StaffScheduleEditor';
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
import { TableCard } from '@/components/ui/DataTable';
import { Fact, FactList } from '@/components/ui/FactList';
import { MaterialSymbol } from '@/components/ui/MaterialSymbol';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { StaffAbsencesPanel } from '@/features/staff-absence/StaffAbsencesPanel';
import { usePersonAbsences } from '@/features/staff-absence/usePersonAbsences';
import { useAdminBasePath } from '@/hooks/useAdminBasePath';
import { useBilingualNames } from '@/hooks/useBilingualNames';
import { useClassTeams } from '@/hooks/useClassTeams';
import { useAuthSession } from '@/hooks/useAuthSession';
import { useStaff } from '@/hooks/useStaff';
import { useStaffAttendanceMonth } from '@/hooks/useStaffAttendanceMonth';
import { useStaffPayrollRecords } from '@/hooks/useStaffPayrollRecords';
import { useStaffSchedules } from '@/hooks/useStaffSchedules';
import { useUserProfile } from '@/hooks/useUserProfile';
import { formatDay } from '@/lib/datetime';
import { getNurseryCalendarDateString } from '@/lib/nurseryDay';

const TABS = ['personal', 'classes', 'schedule', 'attendance', 'absences', 'documents', 'payroll'] as const;
type Tab = (typeof TABS)[number];
const TAB_ICON: Record<Tab, string> = {
  personal: 'person',
  classes: 'school',
  schedule: 'calendar_month',
  attendance: 'how_to_reg',
  absences: 'event_busy',
  documents: 'description',
  payroll: 'payments',
};
const tabFrom = (value: string | null): Tab => (TABS as readonly string[]).includes(value ?? '') ? (value as Tab) : 'personal';

/**
 * A member of staff: who they are and where they stand today (the header: away, in since when, their
 * classes), then their details, classes, schedule, attendance, absences, documents and pay in tabs. The
 * open tab is kept in the address (?tab=absences), so a link from another page lands on it.
 */
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
  const [params, setParams] = useSearchParams();
  const tab = tabFrom(params.get('tab'));
  const setTab = (next: Tab) =>
    setParams(
      (current) => {
        const updated = new URLSearchParams(current);
        if (next === 'personal') updated.delete('tab');
        else updated.set('tab', next);
        return updated;
      },
      { replace: true },
    );
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [deactivateOpen, setDeactivateOpen] = useState(false);
  const [attMonth, setAttMonth] = useState(() => new Date().toISOString().slice(0, 7));

  const profileId = selected?.hasStaffProfile ? String(selected.id) : undefined;
  const schedules = useStaffSchedules({
    nurseryId: profile?.nursery_id ?? undefined,
    profileId,
  });
  const payrollRec = useStaffPayrollRecords(profile?.nursery_id ?? undefined, profileId);
  const nurseryId = profile?.nursery_id ?? null;
  const base = useAdminBasePath();
  const names = useBilingualNames(nurseryId);
  const teams = useClassTeams(nurseryId);
  const today = getNurseryCalendarDateString();
  // Days are read by the person's account: staff without an HR record clock in too.
  const userId = selected ? String(selected.user_id) : null;
  const attQ = useStaffAttendanceMonth(userId, attMonth);
  const todayAttendance = useStaffAttendanceMonth(userId, today.slice(0, 7));
  const absences = usePersonAbsences(userId);

  const u = (selected?.user as Record<string, unknown> | null) ?? {};
  const raw = selected as unknown as Record<string, unknown>;

  if (!selected) {
    return <p className="text-sm text-on-surface-variant">{t('staff.notFound')}</p>;
  }

  const isArabic = i18n.language.startsWith('ar');
  const nameLines = names.lines(u.name_ar as string | null, u.name_en as string | null);
  const name = nameLines.primary || t('staff.profile.fallbackName');
  const roleData = u.role_data as { name_ar?: string | null; name_en?: string | null } | null;
  const roleLabel =
    (isArabic ? roleData?.name_ar || roleData?.name_en : roleData?.name_en || roleData?.name_ar) ||
    t(`staff.departments.${String(selected.department ?? 'teaching')}`);
  const position = selected.position && selected.position !== '—' && selected.position !== roleLabel ? selected.position : null;
  // Their place in each class shows in the header already, in the reader's language.
  const teamPerson = teams.data?.staff.find((s) => s.id === userId);
  const teamClasses = (teamPerson?.classes ?? []).flatMap((c) => {
    const cls = teams.data?.classes.find((k) => k.id === c.class_id);
    return cls ? [{ cls, role: c.role }] : [];
  });
  const todayClock = (todayAttendance.data?.days ?? []).find((r) => r.work_date === (todayAttendance.data?.today || today)) ?? null;
  const classHref = (classId: string) => `${base}/classes/${classId}?tab=team`;

  const nf = new Intl.NumberFormat(isArabic ? 'ar-EG' : 'en-GB', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

  return (
    <div className="space-y-5 pb-8">
      <StaffProfileHero
        name={{ ...nameLines, primary: name }}
        email={(u.email as string | null) ?? null}
        roleLabel={roleLabel}
        position={teamClasses.length ? null : position}
        active={String(u.status ?? 'active') === 'active'}
        awayToday={absences.summary.awayToday}
        todayClock={todayClock}
        teamClasses={teamClasses}
        classHref={classHref}
        actions={
          <>
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
          </>
        }
      />

      {!selected.hasStaffProfile ? (
        <Card>
          <CardContent className="p-4 text-sm text-on-surface-variant">{t('staff.profile.onboardingBanner')}</CardContent>
        </Card>
      ) : null}

      <Tabs value={tab} onValueChange={(value) => setTab(tabFrom(value))}>
        <div className="max-w-full overflow-x-auto">
          <TabsList className="h-11">
            {TABS.map((k) => (
              <TabsTrigger key={k} value={k} className="gap-1.5 px-3.5 py-2 text-sm">
                <MaterialSymbol name={TAB_ICON[k]} size="text-base" />
                {t(`staff.tabs.${k}`)}
                {k === 'classes' && teamClasses.length ? (
                  <span className="rounded-full bg-surface-high px-1.5 text-[11px] font-semibold tabular-nums text-on-surface-variant">{teamClasses.length}</span>
                ) : null}
                {k === 'absences' && absences.summary.awayToday ? <span className="h-2 w-2 rounded-full bg-warning" aria-hidden /> : null}
              </TabsTrigger>
            ))}
          </TabsList>
        </div>
      </Tabs>

      {tab === 'classes' ? (
        <StaffClassesTable personName={name} teamClasses={teamClasses} staff={teams.data?.staff ?? []} classHref={classHref} teamsHref={`${base}/classes/teams`} />
      ) : null}

      {tab === 'personal' ? (
        <div className="grid gap-5 lg:grid-cols-2" data-testid="staff-personal">
          <TableCard title={t('staff.profile.contact')}>
            <FactList>
              <Fact icon="call" label={t('staff.profile.phone')} ltr value={u.phone ? <a href={`tel:${String(u.phone)}`} className="hover:text-primary">{String(u.phone)}</a> : null} />
              <Fact icon="mail" label={t('staff.profile.email')} ltr value={u.email ? <a href={`mailto:${String(u.email)}`} className="break-all hover:text-primary">{String(u.email)}</a> : null} />
              <Fact icon="home" label={t('staff.address')} value={selected.address} />
              <Fact icon="contact_emergency" label={t('staff.emergencyName')} value={selected.emergency_contact_name} />
              <Fact icon="phone_in_talk" label={t('staff.emergencyPhone')} ltr value={selected.emergency_contact_phone} />
            </FactList>
          </TableCard>
          <TableCard title={t('staff.profile.workTitle')}>
            <FactList>
              <Fact icon="apartment" label={t('staff.department')} value={t(`staff.departments.${String(selected.department ?? 'teaching')}`)} />
              <Fact icon="work" label={t('staff.position')} value={selected.position && selected.position !== '—' ? selected.position : null} />
              <Fact icon="contract" label={t('staff.contractType')} value={t(`staff.contractTypes.${String(selected.contract_type)}`)} />
              <Fact icon="event" label={t('staff.hireDate')} value={selected.hire_date ? formatDay(String(selected.hire_date)) : null} />
              <Fact icon="id_card" label={t('staff.nationalId')} ltr value={selected.national_id} />
              <Fact
                icon="payments"
                label={t('staff.salary')}
                value={selected.salary_amount != null ? t('invoice.egpAmount', { amount: nf.format(Number(selected.salary_amount)) }) : null}
              />
            </FactList>
          </TableCard>
        </div>
      ) : null}

      {tab === 'schedule' ? (
        <section className="space-y-2 rounded-2xl border border-outline-variant bg-surface-container-lowest p-4">
          <p className="text-sm">{t('staff.totalHoursPerWeek', { hours: schedules.totalHoursPerWeek.toFixed(1) })}</p>
          <Button type="button" onClick={() => setScheduleOpen(true)} disabled={!profileId}>
            {t('staff.updateSchedule')}
          </Button>
        </section>
      ) : null}

      {tab === 'attendance' ? (
        <div className="space-y-4">
          <StaffAttendanceCalendar month={attMonth} onMonthChange={setAttMonth} data={attQ.data} absences={absences.absences} />
          <StaffAttendanceHistory rows={attQ.data?.days ?? []} month={attMonth} />
        </div>
      ) : null}

      {tab === 'absences' && selected.user_id ? <StaffAbsencesPanel userId={String(selected.user_id)} name={name} /> : null}

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
