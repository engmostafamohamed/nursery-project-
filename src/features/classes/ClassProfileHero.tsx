import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';

import { ActionGate } from '@/components/shared/ActionGate';
import { Button } from '@/components/ui/button';
import { StatusPill } from '@/components/ui/DataTable';
import { MaterialSymbol } from '@/components/ui/MaterialSymbol';
import { PageHeader } from '@/components/ui/PageHeader';
import { COVER_LOOK } from '@/features/staff-absence/absenceLook';
import { coverStatus } from '@/features/staff-absence/staffAbsence';
import type { BilingualNames } from '@/hooks/useBilingualNames';

import { ClassCapacityMeter } from './ClassCapacityMeter';
import { classCover, type ClassProfile } from './classProfile';

/**
 * The class at a glance: its names, age group and room, how its team stands today (the absences
 * screen's cover status), how full it is, and the ways to change it. `children` are the bands under
 * it (today's numbers).
 */
export function ClassProfileHero({
  profile,
  names,
  base,
  children,
}: {
  profile: ClassProfile;
  names: BilingualNames;
  base: string;
  children?: ReactNode;
}) {
  const { t } = useTranslation();
  const { info } = profile;
  const name = names.lines(info.nameAr, info.nameEn);
  const cover = coverStatus(classCover(profile));
  const coverLook = COVER_LOOK[cover];

  return (
    <PageHeader
      icon="school"
      eyebrow={t('classProfile.eyebrow')}
      title={name.primary}
      description={
        <div className="space-y-2">
          {name.secondary ? <p>{name.secondary}</p> : null}
          <div className="flex flex-wrap items-center gap-2">
            {info.gradeLevel ? <StatusPill tone="primary" icon="child_care">{info.gradeLevel}</StatusPill> : null}
            {info.roomNumber ? (
              <StatusPill tone="neutral" icon="meeting_room">
                {t('classProfile.room', { room: info.roomNumber })}
              </StatusPill>
            ) : null}
            <StatusPill tone={coverLook.tone} icon={coverLook.icon}>{t(`staffAbsence.board.status.${cover}`)}</StatusPill>
            {!profile.schoolDay ? <StatusPill tone="neutral" icon="weekend">{t('classProfile.closedToday')}</StatusPill> : null}
          </div>
        </div>
      }
      actions={
        <>
          <div className="me-2 flex min-w-[10rem] flex-col justify-center">
            <span className="text-xs font-medium text-on-surface-variant">{t('classProfile.capacity')}</span>
            <ClassCapacityMeter count={profile.children.length} capacity={info.capacity} />
          </div>
          <Button asChild variant="outline" className="gap-2">
            <Link to={`${base}/classes/${info.id}/announcements`}>
              <MaterialSymbol name="campaign" size="text-base" />
              {t('classProfile.actions.announce')}
            </Link>
          </Button>
          <ActionGate feature="classes" action="update">
            <Button asChild className="gap-2">
              <Link to={`${base}/classes/${info.id}/edit`}>
                <MaterialSymbol name="edit" size="text-base" />
                {t('classProfile.actions.edit')}
              </Link>
            </Button>
          </ActionGate>
        </>
      }
    >
      {children}
    </PageHeader>
  );
}
