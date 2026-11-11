import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { confirm } from '@/components/ui/confirm';
import { StatusPill } from '@/components/ui/DataTable';
import { LoadError } from '@/components/ui/LoadError';
import { MaterialSymbol } from '@/components/ui/MaterialSymbol';
import { Skeleton } from '@/components/ui/skeleton';
import { StatTile } from '@/components/ui/StatTile';
import { formatTimeIn } from '@/lib/datetime';
import type { PillTone } from '@/lib/tones';
import { cn } from '@/lib/utils';

import { roundCounts, roundSlots, type RoundSlot, type SlotState } from './medicineRound';
import { roundErrorKey, undoDose } from './medicineRoundApi';
import { RecordDoseDialog } from './RecordDoseDialog';
import { useMedicineRound, useRoundChange } from './useMedicineRound';

const STATE_LOOK: Record<SlotState, { tone: PillTone; icon: string }> = {
  overdue: { tone: 'error', icon: 'alarm_off' },
  due: { tone: 'warning', icon: 'alarm' },
  upcoming: { tone: 'neutral', icon: 'schedule' },
  when_needed: { tone: 'primary', icon: 'healing' },
  not_here: { tone: 'neutral', icon: 'person_off' },
  given: { tone: 'success', icon: 'check_circle' },
  skipped: { tone: 'neutral', icon: 'block' },
};

type Filter = 'todo' | 'all' | 'done';

/**
 * Today's medicine round: each dose with the child, the medicine, how much and how; overdue and due
 * ones first. A dose is recorded as given or not given (the parents are told), and one recorded by
 * mistake can be undone. `nurseryId` is given for admins (the whole nursery); teachers see the
 * children they look after today.
 */
export function MedicineRoundPanel({ nurseryId = null }: { nurseryId?: string | null }) {
  const { t, i18n } = useTranslation();
  const isArabic = i18n.language.startsWith('ar');
  const query = useMedicineRound(nurseryId);
  const [filter, setFilter] = useState<Filter>('todo');
  const [recording, setRecording] = useState<{ slot: RoundSlot; mode: 'given' | 'skipped' } | null>(null);
  const undo = useRoundChange((id: string) => undoDose(id));
  const slots = useMemo(() => (query.data ? roundSlots(query.data) : []), [query.data]);
  const counts = roundCounts(slots);
  const shown = slots.filter((s) =>
    filter === 'all' ? true : filter === 'done' ? s.state === 'given' || s.state === 'skipped' : s.state !== 'given' && s.state !== 'skipped');
  const name = (ar: string | null, en: string | null) => (isArabic ? ar || en : en || ar) || '—';
  const clock = (iso: string) => formatTimeIn(iso, query.data?.tz);

  const askUndo = async (slot: RoundSlot) => {
    if (!slot.dose) return;
    const ok = await confirm({
      title: t('medicineRound.undoTitle'),
      description: t('medicineRound.undoBody', { medicine: slot.medicine.medicine, child: name(slot.medicine.nameAr, slot.medicine.nameEn) }),
      confirmText: t('medicineRound.undo'),
      variant: 'danger',
    });
    if (!ok) return;
    try {
      await undo.mutateAsync(slot.dose.id);
      toast.success(t('medicineRound.undone'));
    } catch (error) {
      toast.error(t(roundErrorKey(error)));
    }
  };

  if (query.isPending) return <Skeleton className="h-72 rounded-2xl" />;
  if (query.isError) return <LoadError message={t(roundErrorKey(query.error))} onRetry={() => void query.refetch()} />;

  return (
    <div className="space-y-5" data-testid="medicine-round">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile icon="alarm_off" tone={counts.overdue ? 'error' : 'success'} label={t('medicineRound.tiles.overdue')} value={counts.overdue} />
        <StatTile icon="alarm" tone={counts.due ? 'warning' : 'neutral'} label={t('medicineRound.tiles.due')} value={counts.due} />
        <StatTile icon="schedule" tone="neutral" label={t('medicineRound.tiles.upcoming')} value={counts.upcoming} />
        <StatTile icon="task_alt" tone="success" label={t('medicineRound.tiles.done')} value={counts.done} />
      </div>

      <section aria-labelledby="round-title" className="overflow-hidden rounded-2xl border border-outline-variant bg-surface shadow-sm">
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-outline-variant bg-surface-container-lowest px-4 py-3 sm:px-5">
          <div>
            <h2 id="round-title" className="font-semibold text-on-surface">{t('medicineRound.listTitle')}</h2>
            <p className="text-xs text-on-surface-variant">{t('medicineRound.now', { time: query.data.now })}</p>
          </div>
          <div role="tablist" aria-label={t('medicineRound.listTitle')} className="flex gap-1.5">
            {(['todo', 'done', 'all'] as const).map((f) => (
              <button key={f} type="button" role="tab" aria-selected={filter === f} onClick={() => setFilter(f)}
                className={cn('rounded-full border px-3.5 py-1.5 text-sm font-medium transition-colors',
                  filter === f ? 'border-primary bg-primary text-primary-foreground' : 'border-outline-variant text-on-surface-variant hover:bg-surface-high')}>
                {t(`medicineRound.filters.${f}`)}
              </button>
            ))}
          </div>
        </header>

        {!shown.length ? (
          <div className="flex flex-col items-center gap-2 px-4 py-10 text-center">
            <span className="flex h-12 w-12 items-center justify-center rounded-full bg-success/10 text-success" aria-hidden>
              <MaterialSymbol name="medication" size="text-2xl" />
            </span>
            <p className="text-sm text-on-surface-variant">{t(slots.length ? `medicineRound.empty.${filter}` : `medicineRound.empty.none_${query.data.scope}`)}</p>
          </div>
        ) : (
          <ul className="divide-y divide-outline-variant">
            {shown.map((slot) => {
              const m = slot.medicine;
              const look = STATE_LOOK[slot.state];
              const by = slot.dose ? name(slot.dose.byAr, slot.dose.byEn) : '';
              const open = slot.state === 'overdue' || slot.state === 'due' || slot.state === 'upcoming' || slot.state === 'when_needed';
              return (
                <li key={slot.key} className={cn('flex flex-col gap-3 px-4 py-3.5 sm:flex-row sm:items-center sm:px-5', slot.state === 'overdue' && 'bg-error/5')} data-testid="round-slot">
                  <div className="flex min-w-0 flex-1 items-start gap-3">
                    <span className={cn('flex h-12 w-16 shrink-0 flex-col items-center justify-center rounded-xl text-center',
                      slot.state === 'overdue' ? 'bg-error/10 text-error' : slot.state === 'due' ? 'bg-warning/10 text-warning' : 'bg-surface-high text-on-surface')}>
                      {slot.time ? <span className="text-base font-bold tabular-nums" dir="ltr">{slot.time}</span> : <MaterialSymbol name="healing" size="text-xl" />}
                    </span>
                    <div className="min-w-0">
                      <p className="text-sm text-on-surface">
                        <span className="font-semibold">{name(m.nameAr, m.nameEn)}</span>
                        <span className="text-on-surface-variant"> · {name(m.classAr, m.classEn)}</span>
                      </p>
                      <p className="text-sm text-on-surface">
                        <MaterialSymbol name="medication" size="text-base" className="me-1 text-primary" />
                        <span className="font-medium">{m.medicine}</span>
                        {m.dosage ? <span> · {m.dosage}</span> : null}
                        <span className="text-on-surface-variant"> · {t(`health.method.${m.method}`, { defaultValue: m.method })}</span>
                      </p>
                      {m.instructions ? <p className="text-xs text-on-surface-variant">{m.instructions}</p> : null}
                      <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                        <StatusPill tone={look.tone} icon={look.icon}>{t(`medicineRound.states.${slot.state}`)}</StatusPill>
                        {slot.dose ? (
                          <span className="text-xs text-on-surface-variant">
                            {slot.dose.status === 'given'
                              ? t('medicineRound.givenBy', { time: clock(slot.dose.recordedAt), by })
                              : t('medicineRound.skippedBy', { reason: t(`medicineRound.reasons.${slot.dose.skipReason ?? 'other'}`), by })}
                            {slot.dose.note ? ` · ${slot.dose.note}` : ''}
                          </span>
                        ) : null}
                      </div>
                    </div>
                  </div>
                  <div className="flex shrink-0 flex-wrap gap-2 sm:justify-end">
                    {open && m.here ? (
                      <>
                        <Button type="button" size="sm" onClick={() => setRecording({ slot, mode: 'given' })} data-testid="dose-given">
                          <MaterialSymbol name="check" size="text-base" className="me-1" />
                          {t('medicineRound.given')}
                        </Button>
                        {slot.time ? (
                          <Button type="button" size="sm" variant="outline" onClick={() => setRecording({ slot, mode: 'skipped' })} data-testid="dose-skipped">
                            {t('medicineRound.notGiven')}
                          </Button>
                        ) : null}
                      </>
                    ) : slot.state === 'not_here' && slot.time ? (
                      <Button type="button" size="sm" variant="outline" onClick={() => setRecording({ slot, mode: 'skipped' })}>
                        {t('medicineRound.notGiven')}
                      </Button>
                    ) : slot.dose ? (
                      <Button type="button" size="sm" variant="ghost" onClick={() => void askUndo(slot)} disabled={undo.isPending}>
                        <MaterialSymbol name="undo" size="text-base" className="me-1" />
                        {t('medicineRound.undo')}
                      </Button>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>
      {recording ? <RecordDoseDialog slot={recording.slot} mode={recording.mode} onClose={() => setRecording(null)} /> : null}
    </div>
  );
}
