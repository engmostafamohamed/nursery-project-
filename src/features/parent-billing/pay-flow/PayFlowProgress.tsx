import { useTranslation } from 'react-i18next';

import { MaterialSymbol } from '@/components/ui/MaterialSymbol';
import { cn } from '@/lib/utils';

import type { PayStep } from '../parentBilling';

/** Where the parent is in paying: numbered steps, done ones ticked; a done step can be revisited. */
export function PayFlowProgress({ steps, current, onGoTo }: { steps: PayStep[]; current: number; onGoTo: (index: number) => void }) {
  const { t } = useTranslation();
  return (
    <ol className="flex items-center gap-2" aria-label={t('parentBilling.pay.progress', { step: current + 1, total: steps.length })}>
      {steps.map((step, index) => {
        const done = index < current;
        const active = index === current;
        return (
          <li key={step} className="flex min-w-0 flex-1 items-center gap-2">
            <button
              type="button"
              disabled={!done}
              onClick={() => onGoTo(index)}
              aria-current={active ? 'step' : undefined}
              className="flex min-w-0 items-center gap-2 rounded-md text-start outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:cursor-default"
            >
              <span
                className={cn(
                  'flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold',
                  done ? 'bg-success text-white' : active ? 'bg-primary text-primary-foreground' : 'bg-surface-high text-on-surface-variant',
                )}
              >
                {done ? <MaterialSymbol name="check" size="text-base" /> : index + 1}
              </span>
              <span className={cn('hidden truncate text-xs font-medium sm:block', active ? 'text-on-surface' : 'text-on-surface-variant')}>
                {t(`parentBilling.pay.steps.${step}`)}
              </span>
            </button>
            {index < steps.length - 1 ? <span className="h-px flex-1 bg-outline-variant" aria-hidden /> : null}
          </li>
        );
      })}
    </ol>
  );
}
