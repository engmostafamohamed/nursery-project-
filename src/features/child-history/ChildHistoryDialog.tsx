import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { DataTable, StatusPill, TableEmpty, TableLoading, TBody, Td, Th, THead, Tr, type PillTone } from '@/components/ui/DataTable';
import { MaterialSymbol } from '@/components/ui/MaterialSymbol';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useBilingualNames } from '@/hooks/useBilingualNames';
import { formatDate, formatDateTime } from '@/lib/datetime';
import { cn, getUserInitials } from '@/lib/utils';

import {
  ageInMonths,
  attendanceTimeline,
  HISTORY_PARTS,
  partCounts,
  type HistoryPart,
} from './childHistory';
import { useChildHistory } from './useChildHistory';

const SEVERITY_TONE: Record<string, PillTone> = {
  life_threatening: 'error',
  severe: 'error',
  moderate: 'warning',
  mild: 'neutral',
};

const PART_ICON: Record<HistoryPart, string> = {
  reports: 'description',
  attendance: 'how_to_reg',
  events: 'event',
  milestones: 'military_tech',
  health: 'medical_services',
  messages: 'forum',
  media: 'photo_library',
};

/**
 * One child's whole record, opened from her row in a class: who she is and who to reach, then
 * everything that happened to her in tabs — the reports written about her, the days she came and
 * the days she was away, the events she was asked to, what she reached, her health notes, what the
 * teachers told her family, and her photographs. The server decides who may open it.
 */
export function ChildHistoryDialog({
  childId,
  nurseryId,
  onClose,
}: {
  childId: string | null;
  nurseryId: string | null | undefined;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const names = useBilingualNames(nurseryId);
  const [part, setPart] = useState<HistoryPart>('reports');
  const query = useChildHistory(childId);
  const history = query.data ?? null;
  const counts = useMemo(() => partCounts(history), [history]);
  const timeline = useMemo(() => attendanceTimeline(history), [history]);

  if (!childId) return null;

  const pick = (n: { ar: string | null; en: string | null } | null | undefined) =>
    (n ? names.lines(n.ar, n.en).primary : '') || '—';

  const months = ageInMonths(history?.child.dob);

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[92vh] w-[96vw] max-w-4xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="sr-only">{t('childHistory.title')}</DialogTitle>
        </DialogHeader>

        {query.isPending ? (
          <TableLoading rows={5} />
        ) : query.isError || !history ? (
          <TableEmpty icon="error" title={t('childHistory.loadError')} />
        ) : (
          <div className="space-y-4" data-testid="child-history">
            {/* Who she is, and who to reach. */}
            <div className="flex flex-wrap items-start gap-3 rounded-xl border border-outline-variant bg-surface-container-lowest p-4">
              <Avatar className="h-14 w-14 shrink-0">
                {history.child.avatarUrl ? <AvatarImage src={history.child.avatarUrl} alt="" /> : null}
                <AvatarFallback className="bg-primary/10 text-sm font-semibold text-primary">
                  {getUserInitials(pick(history.child.name), null)}
                </AvatarFallback>
              </Avatar>
              <div className="min-w-0 flex-1">
                <p className="text-lg font-semibold text-on-surface">{pick(history.child.name)}</p>
                <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-on-surface-variant">
                  {history.child.code ? <span>{history.child.code}</span> : null}
                  {history.child.className ? <span>{pick(history.child.className)}</span> : null}
                  {months != null ? <span>{t('childHistory.ageMonths', { count: months })}</span> : null}
                  {history.child.enrolledOn ? (
                    <span>{t('childHistory.enrolledOn', { date: formatDate(history.child.enrolledOn) })}</span>
                  ) : null}
                </p>
                {history.parents.length ? (
                  <p className="mt-2 flex flex-wrap gap-2 text-xs">
                    {history.parents.map((parent) => (
                      <span key={parent.id} className="inline-flex items-center gap-1 rounded-full bg-surface-high px-2.5 py-1">
                        <MaterialSymbol name="person" size="text-sm" className="text-on-surface-variant" />
                        <span className="font-medium text-on-surface">{pick(parent.name)}</span>
                        {parent.phone ? <span className="tabular-nums text-on-surface-variant" dir="ltr">{parent.phone}</span> : null}
                      </span>
                    ))}
                  </p>
                ) : null}
              </div>
            </div>

            {/* What she must not eat comes before anything else. */}
            {history.allergies.length ? (
              <ul className="flex flex-wrap gap-2" data-testid="child-allergies">
                {history.allergies.map((allergy) => (
                  <li key={allergy.name}>
                    <StatusPill tone={SEVERITY_TONE[allergy.severity ?? ''] ?? 'warning'} icon="warning">
                      {allergy.name}
                      {allergy.severity ? ` · ${t(`fnb.severity.${allergy.severity}`, { defaultValue: allergy.severity })}` : ''}
                    </StatusPill>
                  </li>
                ))}
              </ul>
            ) : null}

            <Tabs value={part} onValueChange={(v) => setPart(v as HistoryPart)}>
              <div className="max-w-full overflow-x-auto">
                <TabsList className="h-11">
                  {HISTORY_PARTS.map((key) => (
                    <TabsTrigger key={key} value={key} className="gap-1.5 whitespace-nowrap px-3 py-2 text-sm">
                      <MaterialSymbol name={PART_ICON[key]} size="text-base" />
                      {t(`childHistory.parts.${key}`)}
                      {counts[key] ? (
                        <span className="rounded-full bg-surface-high px-1.5 text-[11px] font-semibold tabular-nums text-on-surface-variant">
                          {counts[key]}
                        </span>
                      ) : null}
                    </TabsTrigger>
                  ))}
                </TabsList>
              </div>

              <TabsContent value="reports" className="mt-3">
                <Part empty={!history.reports.length} emptyKey="reports">
                  <DataTable minWidth={560}>
                    <THead>
                      <Th>{t('childHistory.table.date')}</Th>
                      <Th>{t('childHistory.table.mood')}</Th>
                      <Th>{t('childHistory.table.note')}</Th>
                      <Th>{t('childHistory.table.by')}</Th>
                    </THead>
                    <TBody>
                      {history.reports.map((report) => (
                        <Tr key={report.id}>
                          <Td className="whitespace-nowrap font-medium text-on-surface">{formatDate(report.date)}</Td>
                          <Td>{report.mood ? t(`dailyReport.moods.${report.mood}`, { defaultValue: report.mood }) : '—'}</Td>
                          <Td className="max-w-[20rem] text-on-surface-variant">{report.note || '—'}</Td>
                          <Td className="whitespace-nowrap text-on-surface-variant">{pick(report.by)}</Td>
                        </Tr>
                      ))}
                    </TBody>
                  </DataTable>
                </Part>
              </TabsContent>

              <TabsContent value="attendance" className="mt-3">
                <Part empty={!timeline.length} emptyKey="attendance">
                  <DataTable minWidth={520}>
                    <THead>
                      <Th>{t('childHistory.table.date')}</Th>
                      <Th>{t('childHistory.table.day')}</Th>
                      <Th>{t('childHistory.table.times')}</Th>
                    </THead>
                    <TBody>
                      {timeline.map((entry) => (
                        <Tr key={`${entry.kind}-${entry.date}`}>
                          <Td className="whitespace-nowrap font-medium text-on-surface">{formatDate(entry.date)}</Td>
                          <Td>
                            {entry.kind === 'present' ? (
                              <StatusPill tone="success">{t('childHistory.came')}</StatusPill>
                            ) : (
                              <StatusPill tone="neutral">
                                {entry.absence.reason
                                  ? t(`attendance.absence.reasons.${entry.absence.reason}`, { defaultValue: entry.absence.reason })
                                  : t('childHistory.away')}
                              </StatusPill>
                            )}
                          </Td>
                          <Td className="whitespace-nowrap tabular-nums text-on-surface-variant">
                            {entry.kind === 'present'
                              ? [entry.day.checkIn, entry.day.checkOut].filter(Boolean).map((v) => formatDateTime(v as string)).join(' → ') || '—'
                              : entry.absence.note || '—'}
                          </Td>
                        </Tr>
                      ))}
                    </TBody>
                  </DataTable>
                </Part>
              </TabsContent>

              <TabsContent value="events" className="mt-3">
                <Part empty={!history.events.length} emptyKey="events">
                  <DataTable minWidth={560}>
                    <THead>
                      <Th>{t('childHistory.table.event')}</Th>
                      <Th>{t('childHistory.table.date')}</Th>
                      <Th>{t('childHistory.table.permission')}</Th>
                      <Th>{t('childHistory.table.went')}</Th>
                    </THead>
                    <TBody>
                      {history.events.map((event) => (
                        <Tr key={event.id}>
                          <Td className="min-w-[11rem] font-medium text-on-surface">{pick(event.name)}</Td>
                          <Td className="whitespace-nowrap text-on-surface-variant">{formatDate(event.startsAt)}</Td>
                          <Td>
                            {event.permission ? (
                              <StatusPill tone={event.permission === 'granted' ? 'success' : event.permission === 'denied' ? 'error' : 'warning'}>
                                {t(`admin.events.details.permissionStatus.${event.permission}`, { defaultValue: event.permission })}
                              </StatusPill>
                            ) : (
                              '—'
                            )}
                          </Td>
                          <Td>{event.attended ? t('common.yes') : t('common.no')}</Td>
                        </Tr>
                      ))}
                    </TBody>
                  </DataTable>
                </Part>
              </TabsContent>

              <TabsContent value="milestones" className="mt-3">
                <Part empty={!history.milestones.length} emptyKey="milestones">
                  <ul className="space-y-2">
                    {history.milestones.map((milestone) => (
                      <li key={milestone.id} className="rounded-lg border border-outline-variant bg-surface p-3">
                        <p className="flex flex-wrap items-center gap-2 text-sm font-medium text-on-surface">
                          <MaterialSymbol name="military_tech" size="text-base" className="text-primary" />
                          {pick(milestone.name)}
                          <span className="text-xs font-normal text-on-surface-variant">{formatDate(milestone.at)}</span>
                        </p>
                        {milestone.note ? <p className="mt-1 text-xs text-on-surface-variant">{milestone.note}</p> : null}
                        <p className="mt-1 text-xs text-on-surface-variant">{t('childHistory.recordedBy', { name: pick(milestone.by) })}</p>
                      </li>
                    ))}
                  </ul>
                </Part>
              </TabsContent>

              <TabsContent value="health" className="mt-3">
                <Part empty={!history.health.length} emptyKey="health">
                  <DataTable minWidth={460}>
                    <THead>
                      <Th>{t('childHistory.table.date')}</Th>
                      <Th>{t('childHistory.table.kind')}</Th>
                      <Th>{t('childHistory.table.note')}</Th>
                    </THead>
                    <TBody>
                      {history.health.map((note) => (
                        <Tr key={note.id}>
                          <Td className="whitespace-nowrap text-on-surface">{note.date ? formatDate(note.date) : '—'}</Td>
                          <Td className="text-on-surface-variant">
                            {note.type ? t(`health.recordTypes.${note.type}`, { defaultValue: note.type }) : '—'}
                          </Td>
                          <Td className="max-w-[22rem] text-on-surface-variant">{note.note || '—'}</Td>
                        </Tr>
                      ))}
                    </TBody>
                  </DataTable>
                </Part>
              </TabsContent>

              <TabsContent value="messages" className="mt-3">
                <Part empty={!history.messages.length} emptyKey="messages">
                  <ul className="space-y-2">
                    {history.messages.map((message) => (
                      <li key={message.id} className="rounded-lg border border-outline-variant bg-surface p-3">
                        <p className="flex flex-wrap items-center justify-between gap-2 text-xs text-on-surface-variant">
                          <span className="font-medium text-on-surface">{pick(message.by)}</span>
                          <span>{formatDateTime(message.at)}</span>
                        </p>
                        <p className="mt-1 whitespace-pre-line text-sm text-on-surface">{message.body}</p>
                      </li>
                    ))}
                  </ul>
                </Part>
              </TabsContent>

              <TabsContent value="media" className="mt-3">
                <Part empty={!history.media.length} emptyKey="media">
                  <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4">
                    {history.media.map((photo) => (
                      <li key={photo.id} className={cn('overflow-hidden rounded-lg border border-outline-variant bg-surface')}>
                        {photo.url ? (
                          <img src={photo.url} alt={photo.caption ?? ''} loading="lazy" className="h-28 w-full object-cover" />
                        ) : (
                          <div className="flex h-28 items-center justify-center text-on-surface-variant">
                            <MaterialSymbol name="image" size="text-2xl" />
                          </div>
                        )}
                        <p className="px-2 py-1 text-[11px] text-on-surface-variant">{formatDate(photo.at)}</p>
                      </li>
                    ))}
                  </ul>
                </Part>
              </TabsContent>
            </Tabs>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

/** A tab's contents, or the line that says this part of her record is empty. */
function Part({ empty, emptyKey, children }: { empty: boolean; emptyKey: HistoryPart; children: React.ReactNode }) {
  const { t } = useTranslation();
  if (empty) {
    return (
      <div className="overflow-hidden rounded-lg border border-outline-variant">
        <TableEmpty icon={PART_ICON[emptyKey]} title={t(`childHistory.empty.${emptyKey}`)} />
      </div>
    );
  }
  return <div className="overflow-hidden rounded-lg border border-outline-variant">{children}</div>;
}
