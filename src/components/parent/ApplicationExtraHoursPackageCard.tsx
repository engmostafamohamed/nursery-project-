import { useTranslation } from 'react-i18next';

import { Badge } from '@/components/ui/badge';
import type { ApplicationExtraHoursPackage } from '@/hooks/useApplicationExtraHoursPackage';
import { cn } from '@/lib/utils';

type Props = {
  packages: ApplicationExtraHoursPackage[];
  selectedPackageId: string | null;
  isLoading?: boolean;
  isSelecting?: boolean;
  canChoose: boolean;
  onSelect: (packageId: string | null) => Promise<unknown>;
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

export function ApplicationExtraHoursPackageCard({
  packages,
  selectedPackageId,
  isLoading = false,
  isSelecting = false,
  canChoose,
  onSelect,
}: Props) {
  const { t, i18n } = useTranslation();
  const isAr = i18n.language.startsWith('ar');
  const disabled = !canChoose || isSelecting;

  if (isLoading) {
    return (
      <section className="overflow-hidden rounded-xl border border-outline-variant bg-surface p-5 shadow-sm">
        <p className="text-sm text-on-surface-variant">{t('common.loading')}</p>
      </section>
    );
  }

  if (packages.length === 0) return null;

  return (
    <section className="overflow-hidden rounded-xl border border-outline-variant bg-surface shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-outline-variant bg-surface-container-lowest px-4 py-4 sm:px-5">
        <div className="flex min-w-0 items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
            <span className="material-symbols-outlined text-xl" aria-hidden>schedule</span>
          </span>
          <div className="min-w-0">
            <h2 className="text-base font-semibold text-on-surface">
              {t('applications.extraHoursPackage.title', { defaultValue: 'Extra hours' })}
            </h2>
            <p className="mt-1 max-w-2xl text-xs leading-5 text-on-surface-variant">
              {t('applications.extraHoursPackage.subtitle', {
                defaultValue: 'Optional — cover late-pickup fees ahead of time. You can skip this and add it later.',
              })}
            </p>
          </div>
        </div>
        <Badge variant="secondary">
          {t('applications.extraHoursPackage.optional', { defaultValue: 'Optional' })}
        </Badge>
      </div>

      <div className="grid gap-3 p-4 sm:grid-cols-2 sm:p-5 xl:grid-cols-3">
        <button
          type="button"
          disabled={disabled}
          aria-pressed={selectedPackageId === null}
          onClick={() => void onSelect(null)}
          className={cn(
            'flex min-h-[120px] flex-col justify-center rounded-lg border p-4 text-start text-sm transition-all disabled:cursor-not-allowed disabled:opacity-70',
            selectedPackageId === null
              ? 'border-primary bg-primary/10 shadow-sm ring-2 ring-primary/10'
              : 'border-outline-variant bg-surface-container-lowest hover:border-primary hover:bg-primary/5',
          )}
        >
          <span className="font-semibold text-on-surface">
            {t('applications.extraHoursPackage.none', { defaultValue: "Don't add extra hours" })}
          </span>
          <span className="mt-1 text-xs text-on-surface-variant">
            {t('applications.extraHoursPackage.noneHint', { defaultValue: 'Late-pickup fees apply as usual.' })}
          </span>
        </button>

        {packages.map((pkg) => {
          const active = pkg.id === selectedPackageId;
          return (
            <button
              key={pkg.id}
              type="button"
              disabled={disabled}
              aria-pressed={active}
              onClick={() => void onSelect(pkg.id)}
              className={cn(
                'group flex min-h-[120px] flex-col rounded-lg border p-4 text-start text-sm transition-all disabled:cursor-not-allowed disabled:opacity-70',
                active
                  ? 'border-primary bg-primary/10 shadow-sm ring-2 ring-primary/10'
                  : 'border-outline-variant bg-surface-container-lowest hover:border-primary hover:bg-primary/5',
              )}
            >
              <span className="flex items-start justify-between gap-3">
                <span className="min-w-0">
                  <span className="block font-semibold text-on-surface">{packageName(pkg, isAr)}</span>
                  <span className="mt-1 block text-xs text-on-surface-variant">
                    {pkg.coverageType === 'hours_quota'
                      ? t('packages.typeQuota', { hours: pkg.includedHours ?? 0 })
                      : t('packages.typeUnlimited')}
                  </span>
                </span>
                <span
                  className={cn(
                    'flex h-7 w-7 shrink-0 items-center justify-center rounded-full border',
                    active ? 'border-primary bg-primary text-primary-foreground' : 'border-outline-variant text-on-surface-variant',
                  )}
                >
                  <span className="material-symbols-outlined text-base" aria-hidden>{active ? 'check' : 'add'}</span>
                </span>
              </span>
              <span className="mt-auto pt-3 text-sm font-semibold text-on-surface">
                {t('invoice.egpAmount', { amount: pkg.price.toFixed(2) })}
              </span>
              <span className="mt-1 text-xs text-on-surface-variant">{validityLabel(pkg, t)}</span>
            </button>
          );
        })}
      </div>
    </section>
  );
}
