import { useTranslation } from 'react-i18next';

import { Button } from '@/components/ui/button';
import { MaterialSymbol } from '@/components/ui/MaterialSymbol';
import { cn } from '@/lib/utils';

/**
 * Something on the page could not be loaded: what went wrong, and "Try again" when it can be
 * retried. `inset` when it sits inside a card (in place of the card's content).
 */
export function LoadError({ message, onRetry, inset = false, className }: {
  message: string;
  onRetry?: () => void;
  inset?: boolean;
  className?: string;
}) {
  const { t } = useTranslation();
  return (
    <div
      role="alert"
      className={cn(
        'flex flex-wrap items-center gap-3 rounded-xl border border-error/30 bg-error/5 text-sm text-error',
        inset ? 'm-4 p-3 sm:m-5' : 'p-4',
        className,
      )}
      data-testid="load-error"
    >
      <MaterialSymbol name="error" className="text-xl" />
      <span className="flex-1">{message}</span>
      {onRetry ? (
        <Button type="button" size="sm" variant="outline" onClick={onRetry}>
          {t('common.retry')}
        </Button>
      ) : null}
    </div>
  );
}
