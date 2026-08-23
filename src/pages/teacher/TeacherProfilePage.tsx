import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/EmptyState';
import { Skeleton } from '@/components/ui/skeleton';
import { useAuthSession } from '@/hooks/useAuthSession';
import { useStaff } from '@/hooks/useStaff';
import { useStaffSchedules } from '@/hooks/useStaffSchedules';
import { usePayroll } from '@/hooks/usePayroll';
import { useUserProfile } from '@/hooks/useUserProfile';
import { supabase } from '@/lib/supabase';
import { staffAvatarUrl } from '@/lib/staffAvatar';
import { getUserInitials } from '@/lib/utils';
import type { ClassStaffRole } from '@/types/tables';

type TeacherClass = {
  id: string;
  name_ar: string;
  name_en: string;
  role: ClassStaffRole;
  students: Array<{ id: string; name: string }>;
};

const TABS = ['personal', 'classes', 'schedule', 'payslips'] as const;
type TeacherProfileTab = (typeof TABS)[number];

export function TeacherProfilePage() {
  const { t, i18n } = useTranslation();
  const isAr = i18n.language?.startsWith('ar');
  const { user } = useAuthSession();
  const { data: profile } = useUserProfile(user?.id);
  const staff = useStaff(profile?.nursery_id ?? undefined);
  const [tab, setTab] = useState<TeacherProfileTab>('personal');

  const selected = useMemo(
    () => staff.staff.find((s) => String(s.user_id) === String(user?.id)),
    [staff.staff, user?.id],
  );
  const profileId = selected?.hasStaffProfile ? String(selected.id) : undefined;

  const schedules = useStaffSchedules({ nurseryId: profile?.nursery_id ?? undefined, profileId });
  const payroll = usePayroll(undefined, user?.id);

  const classesQuery = useQuery({
    queryKey: ['teacher-profile-classes', user?.id],
    enabled: Boolean(user?.id),
    queryFn: async (): Promise<TeacherClass[]> => {
      if (!user?.id) return [];
      const { data: memberships, error: memErr } = await supabase
        .from('class_staff')
        .select('class_id, role')
        .eq('user_id', user.id);
      if (memErr) throw memErr;
      const memberRows = (memberships ?? []) as Array<{ class_id: string; role: ClassStaffRole }>;
      if (!memberRows.length) return [];
      const ids = memberRows.map((m) => m.class_id);

      const [classesRes, childrenRes] = await Promise.all([
        supabase.from('classes').select('id, name_ar, name_en').in('id', ids).is('deleted_at', null),
        supabase
          .from('children')
          .select('id, full_name_ar, full_name_en, class_id')
          .in('class_id', ids)
          .eq('status', 'active')
          .order('full_name_en', { ascending: true }),
      ]);
      if (classesRes.error) throw classesRes.error;
      if (childrenRes.error) throw childrenRes.error;

      const roleByClass = new Map(memberRows.map((m) => [m.class_id, m.role]));
      const childRows = (childrenRes.data ?? []) as Array<{
        id: string;
        full_name_ar: string | null;
        full_name_en: string | null;
        class_id: string | null;
      }>;

      return ((classesRes.data ?? []) as Array<{ id: string; name_ar: string; name_en: string }>).map((c) => ({
        ...c,
        role: roleByClass.get(c.id) ?? 'assistant',
        students: childRows
          .filter((ch) => ch.class_id === c.id)
          .map((ch) => ({
            id: ch.id,
            name: String((isAr ? ch.full_name_ar : ch.full_name_en) ?? ch.full_name_en ?? ch.full_name_ar ?? '—'),
          })),
      }));
    },
  });

  const nf = useMemo(
    () =>
      new Intl.NumberFormat(isAr ? 'ar-EG' : 'en-GB', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }),
    [isAr],
  );

  const dayLabel = (dow: number) =>
    new Date(2024, 0, 7 + dow).toLocaleDateString(isAr ? 'ar-EG' : 'en-GB', { weekday: 'long' });

  if (staff.isLoading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  const u = (selected?.user as Record<string, unknown> | null) ?? {};
  const name = String(
    (isAr ? u.name_ar : u.name_en) ??
      u.name_en ??
      u.name_ar ??
      (isAr ? profile?.name_ar : profile?.name_en) ??
      t('teacher.home.fallbackName'),
  );
  const email = (u.email as string | null) ?? null;

  const payslipRows = [...payroll.staffRows].sort(
    (a, b) => +new Date(String(b.pay_period_start)) - +new Date(String(a.pay_period_start)),
  );

  return (
    <div className="space-y-6 pb-8">
      <div className="flex items-start gap-3">
        <Avatar className="h-16 w-16">
          <AvatarImage src={staffAvatarUrl(name)} alt="" />
          <AvatarFallback>{getUserInitials(name, email)}</AvatarFallback>
        </Avatar>
        <div>
          <h1 className="text-lg font-semibold text-on-surface">{name}</h1>
          <p className="text-sm text-on-surface-variant">
            {t(`staff.departments.${String(selected?.department ?? 'teaching')}`)}
            {selected?.position && selected.position !== '—' ? ` · ${String(selected.position)}` : ''}
          </p>
        </div>
      </div>

      {!selected?.hasStaffProfile ? (
        <Card>
          <CardContent className="p-4 text-sm text-on-surface-variant">
            {t('teacher.profile.noHrProfile')}
          </CardContent>
        </Card>
      ) : null}

      <div className="flex flex-wrap gap-2">
        {TABS.map((k) => (
          <Button key={k} type="button" size="sm" variant={tab === k ? 'default' : 'outline'} onClick={() => setTab(k)}>
            {t(`teacher.profile.tabs.${k}`)}
          </Button>
        ))}
      </div>

      {tab === 'personal' ? (
        <Card>
          <CardContent className="grid gap-4 p-4 md:grid-cols-2">
            <div>
              <p className="text-xs text-on-surface-variant">{t('teacher.profile.contact')}</p>
              <p className="text-sm">{email ?? '—'}</p>
              <p className="text-sm">{String(u.phone ?? '—')}</p>
            </div>
            <div>
              <p className="text-xs text-on-surface-variant">{t('teacher.profile.contract')}</p>
              <p className="text-sm">{t(`staff.contractTypes.${String(selected?.contract_type ?? 'full_time')}`)}</p>
              <p className="text-sm">
                {t('staff.hireDate')}: {String(selected?.hire_date ?? '—')}
              </p>
            </div>
            <div>
              <p className="text-xs text-on-surface-variant">{t('teacher.profile.employeeId')}</p>
              <p className="text-sm">{String(selected?.employee_id ?? '—')}</p>
            </div>
            <div>
              <p className="text-xs text-on-surface-variant">{t('staff.salary')}</p>
              <p className="text-sm">
                {selected?.salary_amount != null
                  ? t('invoice.egpAmount', { amount: nf.format(Number(selected.salary_amount)) })
                  : '—'}
              </p>
            </div>
            <div className="md:col-span-2">
              <p className="text-xs text-on-surface-variant">{t('staff.address')}</p>
              <p className="text-sm">{String(selected?.address ?? '—')}</p>
            </div>
            <div className="md:col-span-2">
              <p className="text-xs text-on-surface-variant">{t('staff.emergencyName')}</p>
              <p className="text-sm">{String(selected?.emergency_contact_name ?? '—')}</p>
              <p className="text-sm">{String(selected?.emergency_contact_phone ?? '—')}</p>
            </div>
          </CardContent>
        </Card>
      ) : null}

      {tab === 'classes' ? (
        classesQuery.isLoading ? (
          <Skeleton className="h-40 w-full" />
        ) : !(classesQuery.data ?? []).length ? (
          <EmptyState
            icon="school"
            title={t('teacher.classesHub.emptyTitle')}
            description={t('teacher.classesHub.emptyDescription')}
          />
        ) : (
          <div className="space-y-3">
            {(classesQuery.data ?? []).map((c) => (
              <Card key={c.id}>
                <CardContent className="space-y-2 p-4">
                  <div className="flex items-center gap-2">
                    <p className="font-medium text-on-surface">{isAr ? c.name_ar : c.name_en}</p>
                    <Badge variant={c.role === 'lead' ? 'default' : 'secondary'}>
                      {c.role === 'lead' ? t('teacher.classesHub.leadBadge') : t('teacher.classesHub.assistantBadge')}
                    </Badge>
                    <span className="ms-auto text-xs text-on-surface-variant">
                      {t('teacher.home.studentsCount', { count: c.students.length })}
                    </span>
                  </div>
                  {c.students.length ? (
                    <ul className="flex flex-wrap gap-1.5">
                      {c.students.map((s) => (
                        <li
                          key={s.id}
                          className="rounded-full bg-surface-container px-2.5 py-1 text-xs text-on-surface-variant"
                        >
                          {s.name}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-xs text-on-surface-variant">{t('teacher.profile.noStudents')}</p>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        )
      ) : null}

      {tab === 'schedule' ? (
        !profileId ? (
          <p className="text-sm text-on-surface-variant">{t('teacher.profile.noHrProfile')}</p>
        ) : (
          <Card>
            <CardContent className="space-y-2 p-4">
              <p className="text-sm font-semibold">
                {t('staff.totalHoursPerWeek', { hours: schedules.totalHoursPerWeek.toFixed(1) })}
              </p>
              <ul className="divide-y divide-outline-variant">
                {[0, 1, 2, 3, 4, 5, 6].map((dow) => {
                  const row = schedules.schedule.find((r) => Number(r.day_of_week) === dow);
                  const working = Boolean(row?.is_working_day) && row?.start_time && row?.end_time;
                  return (
                    <li key={dow} className="flex items-center justify-between py-2 text-sm">
                      <span>{dayLabel(dow)}</span>
                      <span className="text-on-surface-variant">
                        {working
                          ? `${String(row?.start_time).slice(0, 5)} – ${String(row?.end_time).slice(0, 5)}`
                          : t('teacher.profile.dayOff')}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </CardContent>
          </Card>
        )
      ) : null}

      {tab === 'payslips' ? (
        !payslipRows.length ? (
          <EmptyState
            icon="receipt_long"
            title={t('payroll.emptyStaffTitle')}
            description={t('payroll.emptyStaffDescription')}
          />
        ) : (
          <div className="space-y-2">
            {payslipRows.map((r) => (
              <article
                key={String(r.id)}
                className="flex items-center justify-between rounded-xl border border-outline-variant bg-surface-container-lowest p-3"
              >
                <div>
                  <p className="text-sm font-semibold text-on-surface">
                    {new Date(String(r.pay_period_start)).toLocaleDateString(isAr ? 'ar-EG' : 'en-GB', {
                      month: 'long',
                      year: 'numeric',
                    })}
                  </p>
                  <p className="text-xs text-on-surface-variant">
                    {t('payroll.total')}: {t('invoice.egpAmount', { amount: nf.format(Number(r.total_amount ?? 0)) })}
                  </p>
                </div>
                <Badge variant={String(r.payment_status) === 'paid' ? 'default' : 'secondary'}>
                  {String(r.payment_status) === 'paid' ? t('payroll.status.paid') : t('payroll.status.pending')}
                </Badge>
              </article>
            ))}
          </div>
        )
      ) : null}
    </div>
  );
}
