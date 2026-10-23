import { useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

import { StatusPill } from '@/components/ui/DataTable';
import { MaterialSymbol } from '@/components/ui/MaterialSymbol';
import { cn } from '@/lib/utils';

/** Long enough that the description is cut to three lines with a "show more" link. */
const LONG_DESCRIPTION = 160;
/** Features listed before "+N more". */
const FEATURES_SHOWN = 6;

type Props = {
  name: string;
  /** Icon on the card's tile: what kind of package it is. */
  icon?: string;
  active: boolean;
  /** "EGP 1,000"; crossed out when a live deal gives `discountedPrice`. */
  price: string;
  discountedPrice?: string | null;
  /** e.g. "/ month". */
  priceSuffix?: string;
  /** The deal on this package, live or not. */
  deal?: { label: string; live: boolean } | null;
  description?: string | null;
  /** What the package includes, as written by the nursery. */
  features?: string[];
  /** Shown when there is neither a description nor features, nudging the admin to add them. */
  emptyHint: string;
  /** Short facts at the bottom: hours, coverage, validity, children. */
  facts: Array<{ icon: string; label: string }>;
  actions: ReactNode;
};

/**
 * A package as the admin manages it: price and deal, the description and features parents read,
 * and the facts and actions underneath. Used for tuition and extra-hours packages alike.
 */
export function AdminPackageCard({
  name,
  icon = 'package_2',
  active,
  price,
  discountedPrice,
  priceSuffix,
  deal,
  description,
  features = [],
  emptyHint,
  facts,
  actions,
}: Props) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(false);
  const longDescription = Boolean(description && description.length > LONG_DESCRIPTION);
  const shownFeatures = expanded ? features : features.slice(0, FEATURES_SHOWN);
  const hiddenFeatures = features.length - shownFeatures.length;
  const toggle = (label: string) => (
    <button
      type="button"
      className="mt-1.5 w-fit text-xs font-semibold text-primary hover:underline"
      aria-expanded={expanded}
      onClick={() => setExpanded((value) => !value)}
    >
      {label}
    </button>
  );

  return (
    <article
      className={cn(
        'flex flex-col rounded-xl border bg-surface p-4 shadow-sm transition hover:border-primary/40 hover:shadow-md sm:p-5',
        active ? 'border-outline-variant' : 'border-dashed border-outline-variant bg-surface-container-lowest',
      )}
    >
      <header className="flex items-start gap-3">
        <span
          className={cn(
            'flex h-10 w-10 shrink-0 items-center justify-center rounded-lg',
            active ? 'bg-primary/10 text-primary' : 'bg-surface-high text-on-surface-variant',
          )}
          aria-hidden
        >
          <MaterialSymbol name={icon} />
        </span>
        <h3 className="min-w-0 flex-1 break-words pt-2 text-base font-semibold leading-6 text-on-surface">{name}</h3>
        <StatusPill tone={active ? 'success' : 'neutral'} className="mt-1.5 shrink-0">
          {active ? t('packageFilters.active') : t('packageFilters.inactive')}
        </StatusPill>
      </header>

      <div className="mt-4 rounded-lg bg-surface-container-lowest px-3 py-2.5">
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
          <span className="text-2xl font-bold tracking-tight tabular-nums text-on-surface">{discountedPrice ?? price}</span>
          {priceSuffix ? <span className="text-sm text-on-surface-variant">{priceSuffix}</span> : null}
          {discountedPrice ? <span className="text-sm tabular-nums text-on-surface-variant line-through">{price}</span> : null}
        </div>
        {deal ? (
          <StatusPill tone={deal.live ? 'warning' : 'neutral'} icon="sell" className="mt-2">
            {deal.label}
          </StatusPill>
        ) : null}
      </div>

      {description ? (
        <p
          className={cn(
            'mt-4 whitespace-pre-line text-sm leading-6 text-on-surface-variant',
            longDescription && !expanded && 'line-clamp-3',
          )}
        >
          {description}
        </p>
      ) : null}
      {longDescription ? toggle(expanded ? t('packageCard.showLess') : t('packageCard.showMore')) : null}

      {features.length ? (
        <div className="mt-4">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-on-surface-variant">{t('packageCard.included')}</p>
          <ul className="grid gap-x-4 gap-y-1.5 sm:grid-cols-2">
            {shownFeatures.map((feature, index) => (
              <li key={index} className="flex items-start gap-2 text-sm text-on-surface">
                <MaterialSymbol name="check_circle" size="text-base" className="mt-0.5 shrink-0 text-success" />
                <span className="min-w-0 break-words">{feature}</span>
              </li>
            ))}
          </ul>
          {/* With a long description, its own toggle already shows every feature. */}
          {!longDescription && features.length > FEATURES_SHOWN
            ? toggle(expanded ? t('packageCard.showLess') : t('packageCard.moreFeatures', { count: hiddenFeatures }))
            : null}
        </div>
      ) : null}

      {!description && !features.length ? (
        <p className="mt-4 flex items-start gap-1.5 rounded-lg border border-dashed border-outline-variant px-3 py-2 text-xs leading-5 text-on-surface-variant">
          <MaterialSymbol name="info" size="text-sm" className="mt-0.5 shrink-0" />
          {emptyHint}
        </p>
      ) : null}

      <div className="mt-auto pt-4">
        <ul className="flex flex-wrap gap-1.5">
          {facts.map((fact) => (
            <li
              key={fact.icon + fact.label}
              className="inline-flex items-center gap-1.5 rounded-full bg-surface-high px-2.5 py-1 text-xs font-medium text-on-surface-variant"
            >
              <MaterialSymbol name={fact.icon} size="text-sm" />
              {fact.label}
            </li>
          ))}
        </ul>
        <div className="mt-3 flex flex-wrap justify-end gap-2 border-t border-outline-variant pt-3">{actions}</div>
      </div>
    </article>
  );
}
