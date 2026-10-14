import { useTranslation } from 'react-i18next';

import { Button } from '@/components/ui/button';
import { MaterialSymbol } from '@/components/ui/MaterialSymbol';
import { cn } from '@/lib/utils';

export type ApplicationReviewRow = {
  label: string;
  /** Null or empty shows as "Not provided". */
  value: string | null;
  /** Shows the value as a status badge. */
  tone?: 'success' | 'warning' | 'muted';
};

export type ApplicationReviewGroup = {
  title?: string;
  rows?: ApplicationReviewRow[];
  /** A list of selected items, shown as chips. */
  chips?: string[];
  /** Shown when `chips` is empty. */
  emptyText?: string;
};

export type ApplicationReviewSection = {
  step: number;
  title: string;
  icon: string;
  groups: ApplicationReviewGroup[];
};

type Props = {
  sections: ApplicationReviewSection[];
  /** Opens a step from its section; the button reads "Edit" when the parent can still change it. */
  onOpenStep: (step: number) => void;
  editable: boolean;
};

const TONE_STYLES = {
  success: { className: 'bg-success/10 text-success', icon: 'check_circle' },
  warning: { className: 'bg-warning/10 text-warning', icon: 'error' },
  muted: { className: 'bg-surface-container text-on-surface-variant', icon: 'remove' },
} as const;

function ReviewValue({ row }: { row: ApplicationReviewRow }) {
  const { t } = useTranslation();
  const value = row.value?.trim();
  if (!value) {
    return <span className="text-sm text-on-surface-variant/70">{t('applications.review.notProvided')}</span>;
  }
  if (row.tone) {
    const tone = TONE_STYLES[row.tone];
    return (
      <span className={cn('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium', tone.className)}>
        <MaterialSymbol name={tone.icon} size="text-sm" />
        {value}
      </span>
    );
  }
  return <span className="text-sm font-medium text-on-surface">{value}</span>;
}

/** Every answer of the application, grouped by step, for the parent to check before paying. */
export function ApplicationReviewSummary({ sections, onOpenStep, editable }: Props) {
  const { t } = useTranslation();

  return (
    <div className="grid gap-3">
      {sections.map((section) => (
        <section key={section.step} className="overflow-hidden rounded-xl border border-outline-variant bg-surface">
          <header className="flex items-center justify-between gap-3 border-b border-outline-variant bg-surface-container-lowest px-4 py-2.5">
            <div className="flex min-w-0 items-center gap-2.5">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <MaterialSymbol name={section.icon} size="text-base" />
              </span>
              <h3 className="min-w-0 truncate text-sm font-semibold text-on-surface">{section.title}</h3>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="shrink-0 gap-1 text-primary"
              onClick={() => onOpenStep(section.step)}
            >
              <MaterialSymbol name={editable ? 'edit' : 'visibility'} size="text-sm" />
              {t(editable ? 'applications.review.edit' : 'applications.review.view')}
            </Button>
          </header>
          <div className="space-y-4 px-4 py-4">
            {section.groups.map((group, index) => (
              <div key={group.title ?? index}>
                {group.title ? (
                  <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-primary">{group.title}</p>
                ) : null}
                {group.rows ? (
                  <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2 xl:grid-cols-3">
                    {group.rows.map((row) => (
                      <div key={row.label} className="min-w-0">
                        <dt className="text-xs text-on-surface-variant">{row.label}</dt>
                        <dd className="mt-0.5 break-words">
                          <ReviewValue row={row} />
                        </dd>
                      </div>
                    ))}
                  </dl>
                ) : null}
                {group.chips ? (
                  group.chips.length > 0 ? (
                    <ul className="flex flex-wrap gap-1.5 py-1">
                      {group.chips.map((chip) => (
                        <li
                          key={chip}
                          className="inline-flex items-center gap-1 rounded-full border border-primary/20 bg-primary/5 px-2.5 py-1 text-xs font-medium text-on-surface"
                        >
                          <MaterialSymbol name="check" size="text-sm" className="text-primary" />
                          {chip}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="py-1 text-sm text-on-surface-variant/70">{group.emptyText}</p>
                  )
                ) : null}
              </div>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
