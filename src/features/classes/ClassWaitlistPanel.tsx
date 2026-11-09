import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';

import { Button } from '@/components/ui/button';
import { DataTable, StatusPill, TableCard, TableEmpty, TBody, Td, Th, THead, Tr } from '@/components/ui/DataTable';
import { MaterialSymbol } from '@/components/ui/MaterialSymbol';

import type { ClassProfile, WaitlistEntry } from './classProfile';
import type { ClassFormat } from './useClassFormat';

/** The families waiting for a place in this class, in their order; offers made show as such. */
export function ClassWaitlistPanel({ profile, format, base }: { profile: ClassProfile; format: ClassFormat; base: string }) {
  const { t } = useTranslation();
  const entries = profile.waitlist;

  return (
    <TableCard
      title={t('classProfile.waitlist.title')}
      count={t('classProfile.waitlist.count', { count: entries.length })}
      description={t('classProfile.waitlist.description')}
      actions={
        <Button asChild variant="outline" size="sm" className="gap-1.5">
          <Link to={`${base}/admissions/waitlist`}>
            <MaterialSymbol name="list_alt" size="text-base" />
            {t('classProfile.waitlist.all')}
          </Link>
        </Button>
      }
    >
      {!entries.length ? (
        <TableEmpty icon="hourglass_empty" title={t('classProfile.waitlist.emptyTitle')} description={t('classProfile.waitlist.emptyDescription')} />
      ) : (
        <>
          <ul className="divide-y divide-outline-variant md:hidden">
            {entries.map((entry) => (
              <li key={entry.id} className="flex items-start gap-3 px-4 py-3">
                <Position entry={entry} />
                <div className="min-w-0 flex-1 space-y-1">
                  <p className="font-semibold text-on-surface">{entry.childName || '—'}</p>
                  <p className="text-xs text-on-surface-variant">{format.age(entry.childDob)}</p>
                  <Parent entry={entry} />
                  <WaitStatus entry={entry} />
                </div>
              </li>
            ))}
          </ul>
          <div className="hidden md:block">
            <DataTable minWidth={760}>
              <THead>
                <Th>#</Th>
                <Th>{t('classProfile.waitlist.colChild')}</Th>
                <Th>{t('classProfile.waitlist.colParent')}</Th>
                <Th>{t('classProfile.waitlist.colStart')}</Th>
                <Th>{t('classProfile.waitlist.colAdded')}</Th>
                <Th>{t('classProfile.waitlist.colStatus')}</Th>
              </THead>
              <TBody>
                {entries.map((entry) => (
                  <Tr key={entry.id}>
                    <Td>
                      <Position entry={entry} />
                    </Td>
                    <Td>
                      <p className="font-medium text-on-surface">{entry.childName || '—'}</p>
                      <p className="text-xs text-on-surface-variant">{format.age(entry.childDob)}</p>
                    </Td>
                    <Td>
                      <Parent entry={entry} />
                    </Td>
                    <Td className="whitespace-nowrap text-on-surface-variant">{entry.startDate ? format.day(entry.startDate) : '—'}</Td>
                    <Td className="whitespace-nowrap text-on-surface-variant">{format.day(entry.addedAt)}</Td>
                    <Td>
                      <WaitStatus entry={entry} />
                    </Td>
                  </Tr>
                ))}
              </TBody>
            </DataTable>
          </div>
        </>
      )}
    </TableCard>
  );
}

function Position({ entry }: { entry: WaitlistEntry }) {
  return (
    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-bold tabular-nums text-primary">
      {entry.position}
    </span>
  );
}

function Parent({ entry }: { entry: WaitlistEntry }) {
  return (
    <div className="text-sm">
      <p className="text-on-surface">{entry.parentName || '—'}</p>
      {entry.parentPhone ? (
        <a href={`tel:${entry.parentPhone}`} className="text-xs font-medium text-primary hover:underline" dir="ltr">
          {entry.parentPhone}
        </a>
      ) : null}
    </div>
  );
}

function WaitStatus({ entry }: { entry: WaitlistEntry }) {
  const { t } = useTranslation();
  return entry.status === 'offered' ? (
    <StatusPill tone="success" icon="mark_email_read">{t('classProfile.waitlist.offered')}</StatusPill>
  ) : (
    <StatusPill tone="warning" icon="hourglass_top">{t('classProfile.waitlist.waiting')}</StatusPill>
  );
}
