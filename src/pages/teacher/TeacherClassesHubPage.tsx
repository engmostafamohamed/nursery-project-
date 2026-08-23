import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/EmptyState';
import { Skeleton } from '@/components/ui/skeleton';
import { useAuthSession } from '@/hooks/useAuthSession';
import { useNurseryLanguagePref } from '@/hooks/useNurseryLanguagePref';
import { useUserProfile } from '@/hooks/useUserProfile';
import { supabase } from '@/lib/supabase';
import type { ClassStaffRole } from '@/types/tables';

type ClassRow = { id: string; name_ar: string; name_en: string; role: ClassStaffRole };

export function TeacherClassesHubPage() {
  const { t } = useTranslation();
  const { user } = useAuthSession();
  const { data: profile } = useUserProfile(user?.id);
  const { data: languagePref = 'both' } = useNurseryLanguagePref(profile?.nursery_id);

  const classesQuery = useQuery({
    queryKey: ['teacher-classes', user?.id],
    queryFn: async (): Promise<ClassRow[]> => {
      if (!user?.id) return [];
      const { data: memberships, error: memErr } = await supabase
        .from('class_staff')
        .select('class_id, role')
        .eq('user_id', user.id);
      if (memErr) throw memErr;
      const memberRows = (memberships ?? []) as Array<{ class_id: string; role: ClassStaffRole }>;
      if (memberRows.length === 0) return [];
      const ids = memberRows.map((m) => m.class_id);
      const { data: classRows, error: classErr } = await supabase
        .from('classes')
        .select('id, name_ar, name_en')
        .in('id', ids);
      if (classErr) throw classErr;
      const roleByClass = new Map(memberRows.map((m) => [m.class_id, m.role]));
      return ((classRows ?? []) as Array<{ id: string; name_ar: string; name_en: string }>).map((c) => ({
        ...c,
        role: roleByClass.get(c.id) ?? 'assistant',
      }));
    },
    enabled: Boolean(user?.id),
  });

  const label = (row: ClassRow) =>
    languagePref === 'ar'
      ? row.name_ar
      : languagePref === 'en'
        ? row.name_en
        : `${row.name_ar} / ${row.name_en}`;

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
            <li key={row.id}>
              <Card>
                <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex items-center gap-2">
                    <p className="font-medium text-on-surface">{label(row)}</p>
                    <Badge variant={row.role === 'lead' ? 'default' : 'secondary'}>
                      {row.role === 'lead'
                        ? t('teacher.classesHub.leadBadge')
                        : t('teacher.classesHub.assistantBadge')}
                    </Badge>
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
