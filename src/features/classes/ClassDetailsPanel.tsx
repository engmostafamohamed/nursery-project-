import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';

import { ActionGate } from '@/components/shared/ActionGate';
import { Button } from '@/components/ui/button';
import { StatusPill, TableCard, TableEmpty } from '@/components/ui/DataTable';
import { Fact, FactList } from '@/components/ui/FactList';
import { MaterialSymbol } from '@/components/ui/MaterialSymbol';
import { NameStack } from '@/components/ui/NameStack';
import type { BilingualNames } from '@/hooks/useBilingualNames';

import { ClassCapacityMeter } from './ClassCapacityMeter';
import type { ClassProfile } from './classProfile';
import type { ClassFormat } from './useClassFormat';

/** The class's own facts (names, age group, room, places, since when) and the cameras in its room. */
export function ClassDetailsPanel({ profile, names, format, base }: { profile: ClassProfile; names: BilingualNames; format: ClassFormat; base: string }) {
  const { t } = useTranslation();
  const { info } = profile;

  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <TableCard
        title={t('classProfile.details.title')}
        actions={
          <ActionGate feature="classes" action="update">
            <Button asChild variant="outline" size="sm" className="gap-1.5">
              <Link to={`${base}/classes/${info.id}/edit`}>
                <MaterialSymbol name="edit" size="text-base" />
                {t('classProfile.actions.edit')}
              </Link>
            </Button>
          </ActionGate>
        }
      >
        <FactList>
          <Fact icon="translate" label={t('admin.classes.fields.nameAr')} value={<span dir="rtl">{info.nameAr || '—'}</span>} />
          <Fact icon="translate" label={t('admin.classes.fields.nameEn')} value={<span dir="ltr">{info.nameEn || '—'}</span>} />
          <Fact icon="child_care" label={t('admin.classes.fields.gradeLevel')} value={info.gradeLevel ?? '—'} />
          <Fact icon="meeting_room" label={t('admin.classes.fields.roomNumber')} value={info.roomNumber ?? '—'} />
          <Fact icon="event_seat" label={t('admin.classes.fields.capacity')} value={<ClassCapacityMeter count={profile.children.length} capacity={info.capacity} />} />
          <Fact icon="calendar_add_on" label={t('classProfile.details.createdAt')} value={format.day(info.createdAt)} />
        </FactList>
      </TableCard>

      <TableCard title={t('classProfile.details.camerasTitle')} count={t('classProfile.details.camerasCount', { count: profile.cameras.length })}>
        {profile.cameras.length ? (
          <ul className="divide-y divide-outline-variant">
            {profile.cameras.map((camera) => (
              <li key={camera.id} className="flex items-center gap-3 px-4 py-3 sm:px-5">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                  <MaterialSymbol name="videocam" size="text-lg" />
                </span>
                <div className="min-w-0 flex-1">
                  <NameStack name={names.lines(camera.nameAr, camera.nameEn)} />
                  {camera.location ? <p className="truncate text-xs text-on-surface-variant">{camera.location}</p> : null}
                </div>
                <StatusPill tone={camera.active ? 'success' : 'neutral'}>
                  {camera.active ? t('classProfile.details.cameraOn') : t('classProfile.details.cameraOff')}
                </StatusPill>
              </li>
            ))}
          </ul>
        ) : (
          <TableEmpty icon="videocam_off" title={t('classProfile.details.noCameras')} />
        )}
      </TableCard>
    </div>
  );
}
