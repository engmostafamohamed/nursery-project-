import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { MaterialSymbol } from '@/components/ui/MaterialSymbol';
import { Select } from '@/components/ui/select';
import { useNurserySettings } from '@/hooks/useNurserySettings';
import { formatMoneyAmount } from '@/lib/money';
import { formatQueryError } from '@/lib/utils';

type Props = { nurseryId: string | null };

type Draft = {
  rate: string;
  graceMinutes: string;
  closingTime: string;
  unitMinutes: string;
};

const BILLING_UNITS = ['60', '30', '15'] as const;

/**
 * The default way extra time is paid: per hour, for every child without an extra-hours package
 * (and for hours a package does not cover). Edits the same nursery settings late-pickup billing
 * uses, so the rate parents see when they apply is the rate they are charged.
 */
export function ExtraHoursHourlyRateCard({ nurseryId }: Props) {
  const { t } = useTranslation();
  const { settings, isLoading, updateSettings, isSaving } = useNurserySettings(nurseryId);
  const [draft, setDraft] = useState<Draft | null>(null);

  const rate = Number(settings?.late_pickup_fee_per_hour ?? 0);
  const graceMinutes = Number(settings?.late_pickup_grace_minutes ?? 0);
  const closingTime = settings?.standard_end_time ? String(settings.standard_end_time).slice(0, 5) : '';
  const unitMinutes = String(settings?.late_billing_unit_minutes ?? 60);

  const startEditing = () =>
    setDraft({
      rate: Number.isFinite(rate) ? String(rate) : '',
      graceMinutes: String(Number.isFinite(graceMinutes) ? graceMinutes : 0),
      closingTime,
      unitMinutes,
    });

  const draftRate = Number(draft?.rate);
  const draftGrace = Number(draft?.graceMinutes);
  const draftErrors = draft
    ? {
        rate: !(draft.rate.trim() !== '' && Number.isFinite(draftRate) && draftRate >= 0),
        grace: !(Number.isInteger(draftGrace) && draftGrace >= 0 && draftGrace <= 240),
        closingTime: !/^\d{2}:\d{2}$/.test(draft.closingTime),
      }
    : { rate: false, grace: false, closingTime: false };
  const draftValid = draft !== null && !draftErrors.rate && !draftErrors.grace && !draftErrors.closingTime;

  const save = async () => {
    if (!draft || !draftValid) return;
    try {
      await updateSettings({
        late_pickup_fee_per_hour: Math.round(draftRate * 100) / 100,
        late_pickup_grace_minutes: draftGrace,
        standard_end_time: draft.closingTime,
        late_billing_unit_minutes: Number(draft.unitMinutes),
      } as never);
      toast.success(t('packages.hourly.saved'));
      setDraft(null);
    } catch (error) {
      toast.error(t('packages.saveFailed'), { description: formatQueryError(error) });
    }
  };

  return (
    <section className="overflow-hidden rounded-2xl border border-primary/30 bg-surface shadow-sm">
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-outline-variant bg-primary/5 px-5 py-4">
        <div className="flex min-w-0 items-start gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <MaterialSymbol name="timer" size="text-2xl" />
          </span>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-base font-semibold text-on-surface">{t('packages.hourly.title')}</h3>
              <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-semibold text-primary">
                {t('packages.hourly.defaultBadge')}
              </span>
            </div>
            <p className="mt-0.5 max-w-2xl text-sm leading-5 text-on-surface-variant">{t('packages.hourly.description')}</p>
          </div>
        </div>
        {!draft ? (
          <Button type="button" variant="outline" size="sm" className="gap-1" disabled={isLoading || !settings} onClick={startEditing}>
            <MaterialSymbol name="edit" size="text-base" />
            {t('packages.hourly.edit')}
          </Button>
        ) : null}
      </header>

      {isLoading ? (
        <p className="px-5 py-4 text-sm text-on-surface-variant">{t('common.loading')}</p>
      ) : draft ? (
        <div className="space-y-4 p-5">
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <div className="space-y-1.5">
              <Label htmlFor="hourly-rate">{t('packages.hourly.rate')}</Label>
              <Input
                id="hourly-rate"
                type="number"
                min={0}
                step={0.01}
                value={draft.rate}
                aria-invalid={draftErrors.rate}
                onChange={(event) => setDraft({ ...draft, rate: event.target.value })}
              />
              {draftErrors.rate ? <p className="text-xs text-error">{t('packages.hourly.rateInvalid')}</p> : null}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="hourly-grace">{t('packages.hourly.grace')}</Label>
              <Input
                id="hourly-grace"
                type="number"
                min={0}
                max={240}
                step={1}
                value={draft.graceMinutes}
                aria-invalid={draftErrors.grace}
                onChange={(event) => setDraft({ ...draft, graceMinutes: event.target.value })}
              />
              {draftErrors.grace ? <p className="text-xs text-error">{t('packages.hourly.graceInvalid')}</p> : null}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="hourly-closing">{t('packages.hourly.closingTime')}</Label>
              <Input
                id="hourly-closing"
                type="time"
                value={draft.closingTime}
                aria-invalid={draftErrors.closingTime}
                onChange={(event) => setDraft({ ...draft, closingTime: event.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="hourly-unit">{t('packages.hourly.unit')}</Label>
              <Select
                id="hourly-unit"
                value={draft.unitMinutes}
                onChange={(event) => setDraft({ ...draft, unitMinutes: event.target.value })}
              >
                {BILLING_UNITS.map((unit) => (
                  <option key={unit} value={unit}>{t('packages.hourly.unitOption', { minutes: unit })}</option>
                ))}
              </Select>
            </div>
          </div>
          <div className="flex flex-wrap items-center justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => setDraft(null)} disabled={isSaving}>
              {t('common.cancel')}
            </Button>
            <Button type="button" onClick={() => void save()} disabled={!draftValid || isSaving}>
              {isSaving ? t('common.saving') : t('common.save')}
            </Button>
          </div>
        </div>
      ) : (
        <div className="grid gap-4 p-5 sm:grid-cols-2 xl:grid-cols-4">
          <div>
            <p className="text-xs text-on-surface-variant">{t('packages.hourly.rate')}</p>
            <p className="mt-0.5 text-xl font-bold tracking-tight tabular-nums text-on-surface">
              {t('invoice.egpAmount', { amount: formatMoneyAmount(rate) })}
              <span className="ms-1 text-sm font-normal text-on-surface-variant">{t('applications.extraHoursPackage.perHour')}</span>
            </p>
          </div>
          <div>
            <p className="text-xs text-on-surface-variant">{t('packages.hourly.grace')}</p>
            <p className="mt-0.5 text-sm font-semibold text-on-surface">{t('packages.hourly.minutes', { count: graceMinutes })}</p>
          </div>
          <div>
            <p className="text-xs text-on-surface-variant">{t('packages.hourly.closingTime')}</p>
            <p className="mt-0.5 text-sm font-semibold tabular-nums text-on-surface">{closingTime || '—'}</p>
          </div>
          <div>
            <p className="text-xs text-on-surface-variant">{t('packages.hourly.unit')}</p>
            <p className="mt-0.5 text-sm font-semibold text-on-surface">{t('packages.hourly.unitOption', { minutes: unitMinutes })}</p>
          </div>
          <p className="text-xs leading-5 text-on-surface-variant sm:col-span-2 xl:col-span-4">
            {t('packages.hourly.howItWorks')}{' '}
            <Link to="../settings" relative="path" className="font-semibold text-primary hover:underline">
              {t('packages.hourly.moreOptions')}
            </Link>
          </p>
        </div>
      )}
    </section>
  );
}
