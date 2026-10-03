import type { ReactNode } from 'react';

import { MaterialSymbol } from '@/components/ui/MaterialSymbol';

/** A bordered, titled card used to group related fields inside a dialog — keeps long forms
 * (package editors, deal editor) scannable instead of one long flat stack of inputs. */
export function FormSection({
  title,
  description,
  icon,
  children,
}: {
  title: string;
  description?: string;
  icon?: string;
  children: ReactNode;
}) {
  return (
    <section className="rounded-xl border border-outline-variant bg-surface p-4">
      <div className="mb-3 flex items-start gap-2">
        {icon ? (
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
            <MaterialSymbol name={icon} size="text-base" />
          </span>
        ) : null}
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-on-surface">{title}</h3>
          {description ? <p className="mt-0.5 text-xs text-on-surface-variant">{description}</p> : null}
        </div>
      </div>
      <div className="space-y-3">{children}</div>
    </section>
  );
}
