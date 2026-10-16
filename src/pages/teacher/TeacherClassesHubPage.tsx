import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/EmptyState';
import { MaterialSymbol } from '@/components/ui/MaterialSymbol';
import { Skeleton } from '@/components/ui/skeleton';
import { useAuthSession } from '@/hooks/useAuthSession';
import { useNurseryLanguagePref, type NurseryLanguagePref } from '@/hooks/useNurseryLanguagePref';
import { useUserProfile } from '@/hooks/useUserProfile';
import { classStaffBadgeVariant, classStaffRoleKey, groupClassStaff } from '@/lib/classStaff';
import { supabase } from '@/lib/supabase';
import type { ClassStaffRole } from '@/types/tables';

type StaffName = { id: string; name_ar: string | null; name_en: string | null };

type HubClass = {
  id: string;
  name_ar: string;
  name_en: string;
  /** This teacher's role in the class. */
  role: ClassStaffRole;
  lead: StaffName | null;
  backup: StaffName | null;
  childCount: number;
};

function localized(ar: string | null | undefined, en: string | null | undefined, pref: NurseryLanguagePref): string {
  const a = (ar ?? '').trim();
  const e = (en ?? '').trim();
  if (pref === 'ar') return a || e || '—';
  if (pref === 'en') return e || a || '—';
  if (a && e) return `${a} / ${e}`;
  return a || e || '—';
}

export function TeacherClassesHubPage() {
  const { t } = useTranslation();
  const { user } = useAuthSession();
  const { data: profile } = useUserProfile(user?.id);
  const { data: languagePref = 'both' } = useNurseryLanguagePref(profile?.nursery_id);

  const classesQuery = useQuery({
    queryKey: ['teacher-classes', user?.id],
    queryFn: async (): Promise<HubClass[]> => {
      if (!user?.id) return [];
      const { data: memberships, error: memErr } = await supabase
        .from('class_staff')
        .select('class_id, role')
        .eq('user_id', user.id);
      if (memErr) throw memErr;
      const memberRows = (memberships ?? []) as Array<{ class_id: string; role: ClassStaffRole }>;
      if (memberRows.length === 0) return [];
      const ids = memberRows.map((m) => m.class_id);

      const [classRes, childRes, staffRes] = await Promise.all([
        supabase.from('classes').select('id, name_ar, name_en').in('id', ids).is('deleted_at', null),
        supabase.from('children').select('class_id').in('class_id', ids).eq('status', 'active'),
        supabase.rpc('my_class_staff' as never),
      ]);
      if (classRes.error) throw classRes.error;
      if (childRes.error) throw childRes.error;
      // Co-teacher names are a bonus: the page still lists the classes without them.
      const staffRows = staffRes.error
        ? []
        : ((staffRes.data ?? []) as Array<{ class_id: string; user_id: string; role: ClassStaffRole } & StaffName>);

      const roleByClass = new Map(memberRows.map((m) => [m.class_id, m.role]));
      const people = new Map(staffRows.map((s) => [s.user_id, { id: s.user_id, name_ar: s.name_ar, name_en: s.name_en }]));
      const childCount = new Map<string, number>();
      for (const row of (childRes.data ?? []) as Array<{ class_id: string | null }>) {
        if (row.class_id) childCount.set(row.class_id, (childCount.get(row.class_id) ?? 0) + 1);
      }

      return ((classRes.data ?? []) as Array<{ id: string; name_ar: string; name_en: string }>).map((c) => {
        const staff = groupClassStaff(
          staffRows.filter((s) => s.class_id === c.id),
          people,
        );
        return {
          ...c,
          role: roleByClass.get(c.id) ?? 'assistant',
          lead: staff.lead,
          backup: staff.substitute,
          childCount: childCount.get(c.id) ?? 0,
        };
      });
    },
    enabled: Boolean(user?.id),
  });

  if (classesQuery.isLoading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-20 w-full" />
      </div>
    );
  }

  const rows = classesQuery.data ?? [];
  const nameOf = (person: StaffName | null) => (person ? localized(person.name_ar, person.name_en, languagePref) : '—');

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-semibold text-on-surface">{t('teacher.classesHub.title')}</h1>
        <p className="text-sm text-on-surface-variant">{t('teacher.classesHub.subtitle')}</p>
      </div>

      {rows.length === 0 ? (
        <EmptyState
          icon="school"
          title={t('teacher.classesHub.emptyTitle')}
          description={t('teacher.classesHub.emptyDescription')}
        />
      ) : (
        <ul className="space-y-3">
          {rows.map((row) => (
            <li key={row.id} id={`class-${row.id}`}>
              <Card>
                <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0 space-y-1.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-medium text-on-surface">{localized(row.name_ar, row.name_en, languagePref)}</p>
                      <Badge variant={classStaffBadgeVariant(row.role)}>{t(classStaffRoleKey(row.role))}</Badge>
                    </div>
                    <dl className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-on-surface-variant">
                      <div className="flex items-center gap-1">
                        <dt>{t('teacher.classesHub.leadLabel')}:</dt>
                        <dd className="font-medium text-on-surface">{nameOf(row.lead)}</dd>
                      </div>
                      <div className="flex items-center gap-1">
                        <dt>{t('teacher.classesHub.backupLabel')}:</dt>
                        <dd className="font-medium text-on-surface">{nameOf(row.backup)}</dd>
                      </div>
                      <div className="flex items-center gap-1">
                        <MaterialSymbol name="child_care" size="text-sm" />
                        <dd>{t('teacher.home.studentsCount', { count: row.childCount })}</dd>
                      </div>
                    </dl>
                    {row.role === 'substitute' ? (
                      <p className="text-xs text-on-surface-variant">
                        {row.lead
                          ? t('teacher.classesHub.backupNote', { lead: nameOf(row.lead) })
                          : t('teacher.classesHub.backupNoteNoLead')}
                      </p>
                    ) : null}
                  </div>
                  <Button type="button" variant="secondary" size="sm" asChild>
                    <Link to={`/teacher/classes/${row.id}/announcements`}>
                      <span className="material-symbols-outlined me-1 text-base" aria-hidden>
                        campaign
                      </span>
                      {t('teacher.classesHub.announcementsCta')}
                    </Link>
                  </Button>
                </CardContent>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
