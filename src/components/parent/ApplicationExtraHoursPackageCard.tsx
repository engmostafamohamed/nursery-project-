import { useTranslation } from 'react-i18next';

import { Badge } from '@/components/ui/badge';
import { MaterialSymbol } from '@/components/ui/MaterialSymbol';
import { DiscountCountdown } from '@/components/parent/DiscountCountdown';
import { computeExtraHoursDisplayPrice, type ApplicationExtraHoursPackage } from '@/hooks/useApplicationExtraHoursPackage';
import { formatMoneyAmount } from '@/lib/money';
import { cn } from '@/lib/utils';

/** The nursery's pay-per-hour terms: what applies when no extra-hours package is chosen. */
export type ExtraHoursHourlyPlan = {
  /** Late-pickup fee per hour (nursery_settings.late_pickup_fee_per_hour). */
  rate: number;
  graceMinutes: number;
  /** Closing time, "HH:MM". */
  closingTime: string | null;
};

type Props = {
  packages: ApplicationExtraHoursPackage[];
  selectedPackageId: string | null;
  hourlyPlan: ExtraHoursHourlyPlan | null;
  isLoading?: boolean;
  isSelecting?: boolean;
  canChoose: boolean;
  onSelect: (packageId: string | null) => Promise<unknown>;
  /** Only the options, for use inside another card that supplies the heading. */
  embedded?: boolean;
};

function packageName(pkg: ApplicationExtraHoursPackage, isAr: boolean): string {
  return isAr ? pkg.nameAr || pkg.nameEn : pkg.nameEn || pkg.nameAr;
}

function validityLabel(pkg: ApplicationExtraHoursPackage, t: (key: string, opts?: Record<string, unknown>) => string) {
  if (!pkg.validityValue || !pkg.validityUnit) return t('packages.validityNever', { defaultValue: 'never expires' });
  return t('packages.validityLabel', {
    value: pkg.validityValue,
    unit: t(`packages.validityUnit.${pkg.validityUnit}`),
    defaultValue: `valid ${pkg.validityValue} ${pkg.validityUnit}`,
  });
}

function OptionCheck({ active }: { active: boolean }) {
  return (
    <span
      aria-hidden
      className={cn(
        'flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 transition',
        active ? 'border-primary bg-primary text-primary-foreground' : 'border-outline-variant text-transparent',
      )}
    >
      <MaterialSymbol name="check" size="text-sm" />
    </span>
  );
}

const optionClassName = (active: boolean) =>
  cn(
    'group flex min-h-[132px] flex-col rounded-2xl border bg-surface p-4 text-start transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:cursor-not-allowed disabled:opacity-70',
    active
      ? 'border-primary shadow-md ring-1 ring-primary'
      : 'border-outline-variant hover:-translate-y-0.5 hover:border-primary/50 hover:shadow-md',
  );

/**
 * How extra time at the nursery is paid: per hour by default, or with a prepaid package the
 * nursery offers. A package is added to the application invoice as soon as it is picked.
 */
export function ApplicationExtraHoursPackageCard({
  packages,
  selectedPackageId,
  hourlyPlan,
  isLoading = false,
  isSelecting = false,
  canChoose,
  onSelect,
  embedded = false,
}: Props) {
  const { t, i18n } = useTranslation();
  const isAr = i18n.language.startsWith('ar');
  const disabled = !canChoose || isSelecting;
  const money = (amount: number) => t('invoice.egpAmount', { amount: formatMoneyAmount(amount) });
  const payPerHour = selectedPackageId === null;

  if (isLoading) {
    return (
      <div className="flex items-center gap-3 rounded-2xl border border-outline-variant bg-surface p-5 text-sm text-on-surface-variant">
        <MaterialSymbol name="progress_activity" className="animate-spin text-primary" />
        {t('common.loading')}
      </div>
    );
  }

  const options = (
    <div
      role="radiogroup"
      aria-label={t('applications.extraHoursPackage.title', { defaultValue: 'Extra hours' })}
      className={cn('grid gap-4 sm:grid-cols-2 2xl:grid-cols-3', !embedded && 'p-5')}
    >
      <button
        type="button"
        role="radio"
        aria-checked={payPerHour}
        disabled={disabled}
        onClick={() => void onSelect(null)}
        className={optionClassName(payPerHour)}
      >
        <span className="flex items-start justify-between gap-3">
          <span className="min-w-0">
            <span className="flex flex-wrap items-center gap-2">
              <span className="font-semibold text-on-surface">{t('applications.extraHoursPackage.payPerHour')}</span>
              <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-semibold text-primary">
                {t('applications.extraHoursPackage.defaultBadge')}
              </span>
            </span>
            <span className="mt-1 inline-flex items-center gap-1 text-xs text-on-surface-variant">
              <MaterialSymbol name="timer" size="text-sm" />
              {t('applications.extraHoursPackage.payPerHourType')}
            </span>
          </span>
          <OptionCheck active={payPerHour} />
        </span>
        <span className="mt-auto block pt-4">
          {hourlyPlan ? (
            <span className="flex flex-wrap items-baseline gap-x-1.5">
              <span className="text-xl font-bold tracking-tight tabular-nums text-on-surface">{money(hourlyPlan.rate)}</span>
              <span className="text-sm text-on-surface-variant">{t('applications.extraHoursPackage.perHour')}</span>
            </span>
          ) : null}
          <span className="mt-0.5 block text-xs leading-5 text-on-surface-variant">
            {hourlyPlan
              ? t(hourlyPlan.closingTime ? 'applications.extraHoursPackage.payPerHourHint' : 'applications.extraHoursPackage.payPerHourHintNoTime', {
                  time: hourlyPlan.closingTime,
                  grace: hourlyPlan.graceMinutes,
                })
              : t('applications.extraHoursPackage.noneHint', { defaultValue: 'Late-pickup fees apply as usual.' })}
          </span>
        </span>
      </button>

      {packages.map((pkg) => {
        const active = pkg.id === selectedPackageId;
        const { discountAmount, displayPrice, dealApplied } = computeExtraHoursDisplayPrice(pkg);
        return (
          <button
            key={pkg.id}
            type="button"
            role="radio"
            aria-checked={active}
            disabled={disabled}
            onClick={() => void onSelect(pkg.id)}
            className={optionClassName(active)}
          >
            <span className="flex items-start justify-between gap-3">
              <span className="min-w-0">
                <span className="block truncate font-semibold text-on-surface">{packageName(pkg, isAr)}</span>
                <span className="mt-1 inline-flex items-center gap-1 text-xs text-on-surface-variant">
                  <MaterialSymbol name="schedule" size="text-sm" />
                  {pkg.coverageType === 'hours_quota'
                    ? t('packages.typeQuota', { hours: pkg.includedHours ?? 0 })
                    : t('packages.typeUnlimited')}
                </span>
              </span>
              <OptionCheck active={active} />
            </span>
            {dealApplied ? (
              <span className="mt-3 flex flex-wrap items-center gap-1.5">
                <span className="inline-flex items-center gap-1 rounded-full bg-success/10 px-2 py-0.5 text-xs font-semibold text-success">
                  <MaterialSymbol name="sell" size="text-sm" />
                  {pkg.deal?.discountType === 'percentage'
                    ? t('applications.extraHoursPackage.dealPercentOff', { value: pkg.deal.discountValue, defaultValue: '{{value}}% OFF' })
                    : t('applications.extraHoursPackage.dealAmountOff', {
                        value: formatMoneyAmount(pkg.deal?.discountValue ?? 0),
                        defaultValue: 'EGP {{value}} OFF',
                      })}
                </span>
                <DiscountCountdown endsAt={pkg.deal?.endsAt ?? null} />
              </span>
            ) : null}
            <span className="mt-auto block pt-4">
              <span className="flex flex-wrap items-baseline gap-x-2">
                <span className="text-xl font-bold tracking-tight tabular-nums text-on-surface">{money(displayPrice)}</span>
                {discountAmount > 0 ? (
                  <span className="text-xs tabular-nums text-on-surface-variant line-through">{money(pkg.price)}</span>
                ) : null}
              </span>
              <span className="mt-0.5 block text-xs text-on-surface-variant">{validityLabel(pkg, t)}</span>
            </span>
          </button>
        );
      })}
    </div>
  );

  if (embedded) return options;

  return (
    <section className="overflow-hidden rounded-2xl border border-outline-variant bg-surface shadow-sm">
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-outline-variant px-5 py-4">
        <div className="flex min-w-0 items-start gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <MaterialSymbol name="more_time" size="text-2xl" />
          </span>
          <div className="min-w-0">
            <h2 className="text-lg font-semibold tracking-tight text-on-surface">
              {t('applications.extraHoursPackage.title', { defaultValue: 'Extra hours' })}
            </h2>
            <p className="mt-0.5 max-w-2xl text-sm leading-5 text-on-surface-variant">
              {t('applications.extraHoursPackage.subtitle')}
            </p>
          </div>
        </div>
        <Badge variant="secondary">{t('applications.extraHoursPackage.optional', { defaultValue: 'Optional' })}</Badge>
      </header>
      {options}
    </section>
  );
}
